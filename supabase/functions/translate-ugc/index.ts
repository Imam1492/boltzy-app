// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2';

type SupportedLanguage = 'hi' | 'ur' | 'bn' | 'mr' | 'te';
type ListingField = 'title' | 'description' | 'location';

type SourceFields = Partial<Record<ListingField, string>>;
type TranslationMap = Partial<Record<SupportedLanguage, SourceFields>>;

type ListingRecord = {
  id: string;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  condition?: string | null;
  translations?: TranslationMap | null;
};

type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: ListingRecord | null;
  old_record: ListingRecord | null;
};

const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  'hi',
  'ur',
  'bn',
  'mr',
  'te',
];
const LISTING_FIELDS: ListingField[] = ['title', 'description', 'location', 'condition'];

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Edge Function secrets.');
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const pickSourceFields = (record: ListingRecord): SourceFields => {
  const fields: SourceFields = {};
  for (const key of LISTING_FIELDS) {
    const value = record[key as keyof ListingRecord];
    if (typeof value === 'string' && value.trim()) {
      fields[key] = value.trim();
    }
  }
  return fields;
};

const getExistingTranslations = (translations: TranslationMap | null | undefined, language: SupportedLanguage): SourceFields => {
  if (!isRecord(translations)) return {};
  const value = translations[language];
  return isRecord(value) ? (value as SourceFields) : {};
};

const getMissingFields = (sourceFields: SourceFields, existingFields: SourceFields): SourceFields => {
  const missing: SourceFields = {};
  for (const key of LISTING_FIELDS) {
    if (sourceFields[key] && !existingFields[key]?.trim()) {
      missing[key] = sourceFields[key];
    }
  }
  return missing;
};

// ✨ THE MAGIC FREE TRANSLATOR HACK ✨
const translateWithFreeGoogle = async (fields: SourceFields, target: SupportedLanguage): Promise<SourceFields> => {
  const translatedEntries = await Promise.all(
    (Object.keys(fields) as ListingField[]).map(async (key) => {
      const text = fields[key];
      if (!text) return [key, text] as const;
      
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Google API returned ${response.status}`);
        
        const data = await response.json();
        const translatedText = data[0].map((item: any) => item[0]).join("");
        return [key, translatedText] as const;
      } catch (err) {
        console.error(`Failed to translate ${key}:`, err);
        return [key, text] as const; // Fallback to english if it fails
      }
    })
  );
  return Object.fromEntries(translatedEntries) as SourceFields;
};

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

    const payload = (await req.json()) as WebhookPayload;

    if (payload.type !== 'INSERT' || payload.table !== 'listings' || !payload.record) {
      return json({ skipped: true, reason: 'Only processes INSERT webhooks for public.listings.' });
    }

    const listing = payload.record;
    const sourceFields = pickSourceFields(listing);

    if (!Object.keys(sourceFields).length) {
      return json({ skipped: true, listingId: listing.id, reason: 'No source text found.' });
    }

    const existingTranslations = isRecord(listing.translations) ? (listing.translations as TranslationMap) : {};
    const nextTranslations: TranslationMap = { ...existingTranslations };
    let translatedAnything = false;

    // Loop through Urdu and Hindi
    for (const language of SUPPORTED_LANGUAGES) {
      const existingLanguageFields = getExistingTranslations(existingTranslations, language);
      const missingFields = getMissingFields(sourceFields, existingLanguageFields);

      if (!Object.keys(missingFields).length) {
        nextTranslations[language] = existingLanguageFields;
        continue;
      }

      const translatedFields = await translateWithFreeGoogle(missingFields, language);
      nextTranslations[language] = { ...existingLanguageFields, ...translatedFields };
      translatedAnything = true;
    }

    if (!translatedAnything) return json({ success: true, message: 'Translations already existed.' });

    // Save to Database
    const { error } = await supabaseAdmin
      .from('listings')
      .update({ translations: nextTranslations })
      .eq('id', listing.id);

    if (error) throw error;

    return json({ success: true, listingId: listing.id, translations: nextTranslations });
  } catch (error) {
    console.error('translate-ugc failed.', error);
    return json({ error: 'translate-ugc failed.', details: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});