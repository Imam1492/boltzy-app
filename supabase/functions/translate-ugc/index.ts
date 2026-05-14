// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2';

type SupportedLanguage = 'hi' | 'ur';
type ListingField = 'title' | 'description' | 'location';

type SourceFields = Partial<Record<ListingField, string>>;
type TranslationMap = Partial<Record<SupportedLanguage, SourceFields>>;

type ListingRecord = {
  id: string;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  translations?: TranslationMap | null;
};

type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: ListingRecord | null;
  old_record: ListingRecord | null;
};

const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['hi', 'ur'];
const LISTING_FIELDS: ListingField[] = ['title', 'description', 'location'];

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const GOOGLE_TRANSLATE_API_KEY = Deno.env.get('GOOGLE_TRANSLATE_API_KEY');
const LIBRETRANSLATE_URL =
  Deno.env.get('LIBRETRANSLATE_URL') ?? 'https://libretranslate.com/translate';
const LIBRETRANSLATE_API_KEY = Deno.env.get('LIBRETRANSLATE_API_KEY');
const WEBHOOK_SECRET = Deno.env.get('TRANSLATE_UGC_WEBHOOK_SECRET');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Edge Function secrets.'
  );
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    )
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const pickSourceFields = (record: ListingRecord): SourceFields => {
  const fields: SourceFields = {};

  for (const key of LISTING_FIELDS) {
    const value = record[key];

    if (typeof value === 'string' && value.trim()) {
      fields[key] = value.trim();
    }
  }

  return fields;
};

const getExistingTranslations = (
  translations: TranslationMap | null | undefined,
  language: SupportedLanguage
): SourceFields => {
  if (!isRecord(translations)) {
    return {};
  }

  const value = translations[language];
  return isRecord(value) ? (value as SourceFields) : {};
};

const getMissingFields = (
  sourceFields: SourceFields,
  existingFields: SourceFields
): SourceFields => {
  const missing: SourceFields = {};

  for (const key of LISTING_FIELDS) {
    if (sourceFields[key] && !existingFields[key]?.trim()) {
      missing[key] = sourceFields[key];
    }
  }

  return missing;
};

const translateWithGoogle = async (
  fields: SourceFields,
  target: SupportedLanguage
): Promise<SourceFields> => {
  if (!GOOGLE_TRANSLATE_API_KEY) {
    throw new Error('Google Translate API key is not configured.');
  }

  const keys = Object.keys(fields) as ListingField[];
  const texts = keys.map((key) => fields[key] ?? '');

  const response = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: texts,
        source: 'en',
        target,
        format: 'text',
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Google Translate API failed with ${response.status}.`);
  }

  const data = await response.json();
  const translated = data?.data?.translations;

  if (!Array.isArray(translated) || translated.length !== keys.length) {
    throw new Error('Google Translate API returned an unexpected payload.');
  }

  return keys.reduce<SourceFields>((acc, key, index) => {
    acc[key] = decodeHtmlEntities(String(translated[index]?.translatedText ?? fields[key]));
    return acc;
  }, {});
};

const translateWithLibre = async (
  fields: SourceFields,
  target: SupportedLanguage
): Promise<SourceFields> => {
  const translatedEntries = await Promise.all(
    (Object.keys(fields) as ListingField[]).map(async (key) => {
      const response = await fetch(LIBRETRANSLATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: fields[key],
          source: 'en',
          target,
          format: 'text',
          ...(LIBRETRANSLATE_API_KEY ? { api_key: LIBRETRANSLATE_API_KEY } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(`LibreTranslate failed with ${response.status}.`);
      }

      const data = await response.json();
      return [key, String(data?.translatedText ?? fields[key])] as const;
    })
  );

  return Object.fromEntries(translatedEntries) as SourceFields;
};

const translateFields = async (
  fields: SourceFields,
  target: SupportedLanguage
): Promise<SourceFields> => {
  if (!Object.keys(fields).length) {
    return {};
  }

  if (GOOGLE_TRANSLATE_API_KEY) {
    try {
      return await translateWithGoogle(fields, target);
    } catch (error) {
      console.error(`Google translation failed for ${target}, falling back.`, error);
    }
  }

  return translateWithLibre(fields, target);
};

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed.' }, 405);
    }

    if (WEBHOOK_SECRET) {
      const providedSecret = req.headers.get('x-translate-webhook-secret');

      if (providedSecret !== WEBHOOK_SECRET) {
        return json({ error: 'Unauthorized webhook request.' }, 401);
      }
    }

    const payload = (await req.json()) as WebhookPayload;

    if (payload.type !== 'INSERT' || payload.table !== 'listings' || !payload.record) {
      return json({
        skipped: true,
        reason: 'This function only processes INSERT webhooks for public.listings.',
      });
    }

    const listing = payload.record;
    const sourceFields = pickSourceFields(listing);

    if (!Object.keys(sourceFields).length) {
      return json({
        skipped: true,
        listingId: listing.id,
        reason: 'No source text found to translate.',
      });
    }

    const existingTranslations = isRecord(listing.translations)
      ? (listing.translations as TranslationMap)
      : {};

    const nextTranslations: TranslationMap = { ...existingTranslations };
    let translatedAnything = false;

    for (const language of SUPPORTED_LANGUAGES) {
      const existingLanguageFields = getExistingTranslations(existingTranslations, language);
      const missingFields = getMissingFields(sourceFields, existingLanguageFields);

      if (!Object.keys(missingFields).length) {
        nextTranslations[language] = existingLanguageFields;
        continue;
      }

      const translatedFields = await translateFields(missingFields, language);
      nextTranslations[language] = {
        ...existingLanguageFields,
        ...translatedFields,
      };
      translatedAnything = true;
    }

    if (!translatedAnything) {
      return json({
        success: true,
        listingId: listing.id,
        message: 'Translations already existed; no update needed.',
      });
    }

    const { error } = await supabaseAdmin
      .from('listings')
      .update({ translations: nextTranslations })
      .eq('id', listing.id);

    if (error) {
      console.error('Supabase update failed.', error);
      return json(
        { error: 'Failed to update listing translations.', details: error.message },
        500
      );
    }

    return json({
      success: true,
      listingId: listing.id,
      translator: GOOGLE_TRANSLATE_API_KEY ? 'google-or-libre-fallback' : 'libretranslate',
      translations: nextTranslations,
    });
  } catch (error) {
    console.error('translate-ugc failed.', error);
    return json(
      {
        error: 'translate-ugc failed.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
