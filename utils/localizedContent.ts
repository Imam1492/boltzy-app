import type { SupportedLanguage } from '../i18n';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getLocalizedField = (
  translations: unknown,
  language: SupportedLanguage,
  field: string,
  fallback?: string | null
) => {
  if (language !== 'en' && isRecord(translations)) {
    const languageBucket = translations[language];

    if (isRecord(languageBucket)) {
      const translatedValue = languageBucket[field];

      if (typeof translatedValue === 'string' && translatedValue.trim()) {
        return translatedValue;
      }
    }
  }

  return fallback ?? '';
};

export const getLocalizedListingField = (
  listing: { translations?: unknown; [key: string]: unknown } | null | undefined,
  field: 'title' | 'description' | 'location',
  language: SupportedLanguage
) => getLocalizedField(listing?.translations, language, field, listing?.[field] as string | null | undefined);

export const getLocalizedMessageContent = (
  message: { translations?: unknown; content?: string | null } | null | undefined,
  language: SupportedLanguage
) => getLocalizedField(message?.translations, language, 'content', message?.content);
