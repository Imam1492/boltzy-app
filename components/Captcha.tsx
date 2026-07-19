import React, { forwardRef, useImperativeHandle } from 'react';
import { Platform, View } from 'react-native';

type CaptchaHandle = { show: () => void; hide: () => void };

const WebCaptchaStub = forwardRef<CaptchaHandle, any>(function WebCaptchaStub(_props, ref) {
  useImperativeHandle(ref, () => ({
    show: () => {},
    hide: () => {},
  }));
  return <View />;
});

let ConfirmHcaptcha: any = WebCaptchaStub;

if (Platform.OS !== 'web') {
  // Native hCaptcha — keep require() so web never loads the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ConfirmHcaptcha = require('@hcaptcha/react-native-hcaptcha').default;
}

export default ConfirmHcaptcha;
