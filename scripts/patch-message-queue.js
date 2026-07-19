/**
 * Rewrites RN MessageQueue.js to ES5 via Babel (loose classes, no classCallCheck),
 * fixing Hermes: Property 'MessageQueue' doesn't exist.
 */
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const MARKER = '/* boltzy-es5-message-queue */';
const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native',
  'Libraries',
  'BatchedBridge',
  'MessageQueue.js',
);

const pristineCandidates = [
  path.join(process.env.TEMP || '/tmp', 'package', 'Libraries', 'BatchedBridge', 'MessageQueue.js'),
  path.join(__dirname, '..', 'node_modules', 'react-native', 'Libraries', 'BatchedBridge', 'MessageQueue.js.orig'),
];

function loadSource() {
  for (const p of pristineCandidates) {
    if (fs.existsSync(p)) {
      const s = fs.readFileSync(p, 'utf8');
      if (s.includes('class MessageQueue') && !s.includes(MARKER)) return s;
    }
  }
  if (fs.existsSync(target)) {
    let s = fs.readFileSync(target, 'utf8');
    if (s.includes(MARKER)) return null; // already patched
    s = s.replace(/class RNBatchedMessageQueue/g, 'class MessageQueue').replace(/RNBatchedMessageQueue/g, 'MessageQueue');
    if (s.includes('class MessageQueue')) return s;
  }
  return null;
}

function convert() {
  if (!fs.existsSync(target)) {
    console.warn('[patch-message-queue] missing target');
    return;
  }

  if (fs.readFileSync(target, 'utf8').includes(MARKER) && !process.argv.includes('--force')) {
    console.log('[patch-message-queue] already ES5-patched');
    return;
  }

  let src = loadSource();
  if (!src) {
    console.warn('[patch-message-queue] could not load pristine MessageQueue source');
    return;
  }

  src = src.replace(/catch\s*\(\s*([A-Za-z_][\w]*)\s*:\s*[^)]+\)/g, 'catch ($1)');
  src = src.replace(/export type SpyData = \{[\s\S]*?\};/m, '');

  const result = babel.transformSync(src, {
    filename: 'MessageQueue.js',
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ['flow', 'classProperties'] },
    plugins: [
      ['@babel/plugin-transform-flow-strip-types', { all: true }],
      ['@babel/plugin-transform-classes', { loose: true }],
    ],
  });

  let code = result.code || '';
  // Strip classCallCheck — Hermes TDZ bug triggers on it
  code = code.replace(/\(0,\s*[^)]*classCallCheck[^)]*\)\([^;]*;/g, '');
  code = code.replace(/var _classCallCheck[^\n]*\n/g, '');
  code = code.replace(/require\(["']@babel\/runtime\/helpers\/classCallCheck["']\);?/g, '');

  // Flatten `let MessageQueue = function () { function MessageQueue() { ... }`
  // into a single function declaration — avoids Hermes TDZ on the binding.
  code = code.replace(
    /let MessageQueue = \/\*#__PURE__\*\/function \(\) \{\s*function MessageQueue\(/,
    'function MessageQueue(',
  );
  // Remove trailing `return MessageQueue; }();` / `return MessageQueue;\n}();`
  code = code.replace(/\n\s*return MessageQueue;\s*\}\(\);/, '');

  // Also handle _createClass helper wrappers if present — keep prototype assigns
  code = code.replace(/return (?:\(0,\s*)?_createClass(?:\.default)?\(MessageQueue,\s*\[/, 'void ([');
  // If createClass left the file broken, fall back is rare with loose:true (uses prototype assigns)

  fs.writeFileSync(target, `${MARKER}\n${code}\n`);
  console.log('[patch-message-queue] wrote Babel loose ES5 MessageQueue');
  console.log('[patch-message-queue] classCallCheck left?', /classCallCheck/.test(code));
  console.log('[patch-message-queue] nested IIFE left?', /let MessageQueue =/.test(code));
}

convert();
