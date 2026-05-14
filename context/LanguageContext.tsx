import React, { createContext, useContext } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';

import i18n, { normalizeLanguage, type SupportedLanguage } from '../i18n';

type LanguageContextValue = {
  lang: SupportedLanguage;
  setLang: (language: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  translateUGC: (text: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

const LanguageContextBridge = ({ children }: { children: React.ReactNode }) => {
  const { i18n: i18nInstance } = useTranslation();

  const lang = normalizeLanguage(i18nInstance.resolvedLanguage ?? i18nInstance.language);

  const t = (key: string, options?: Record<string, unknown>) =>
    String(i18nInstance.t(key, { defaultValue: key, ...(options ?? {}) }));

  const translateUGC = (text: string) => {
    if (!text) {
      return text;
    }

    return String(i18nInstance.t(text, { defaultValue: text }));
  };

  const setLang = (language: string) => {
    void i18nInstance.changeLanguage(normalizeLanguage(language));
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, translateUGC }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>
    <LanguageContextBridge>{children}</LanguageContextBridge>
  </I18nextProvider>
);

export const useLanguage = () => {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }

  return context;
};
