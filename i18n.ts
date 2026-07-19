import i18n from 'i18next';
import { getLocales } from 'expo-localization';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import hi from './locales/hi.json';
import ur from './locales/ur.json';
import bn from './locales/bn.json'; // Or wherever your translation files live
import mr from './locales/mr.json';
import te from './locales/te.json';

export const supportedLanguages = [
  'en',
  'hi',
  'ur',
  'bn',
  'mr',
  'te',
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];

const resources = {
  en: { translation: en },
  hi: { translation: hi },
  ur: { translation: ur },
  bn: { translation: bn },
  mr: { translation: mr },
  te: { translation: te },
} as const;

export const normalizeLanguage = (language?: string | null): SupportedLanguage => {
  const baseLanguage = language?.toLowerCase().split(/[-_]/)[0];

  return supportedLanguages.includes(baseLanguage as SupportedLanguage)
    ? (baseLanguage as SupportedLanguage)
    : 'en';
};

const deviceLanguage = normalizeLanguage(
  getLocales()[0]?.languageCode ?? getLocales()[0]?.languageTag
);

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: deviceLanguage,
    fallbackLng: 'en',
    supportedLngs: supportedLanguages,
    defaultNS: 'translation',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
    returnNull: false,
    keySeparator: false,
    nsSeparator: false,
  });
}

export default i18n;
