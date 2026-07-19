import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { title, category } = await req.json()
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

    if (!title || !category) throw new Error('Title and Category are required')

    const prompt = `You are an expert copywriter for a classifieds marketplace. 
    Write a highly-converting, professional description for a ${category} titled "${title}". 
    Keep the description friendly, realistic, and under 80 words. 
    Also, provide exactly 5 short, punchy highlights (max 3 words each) about this item.
    Respond ONLY with a valid JSON object in this exact format, with no markdown formatting:
    {"description": "your awesome description here", "highlights": ["Highlight 1", "Highlight 2", "Highlight 3", "Highlight 4", "Highlight 5"]}`;

   const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await response.json();

    // ✨ NEW: Catch exact Gemini API errors and log them to your dashboard
    if (!response.ok || data.error) {
        console.error("Gemini API Error:", data);
        throw new Error(data.error?.message || "Gemini API rejected the request.");
    }

    const textResponse = data.candidates[0].content.parts[0].text;
    
    // Clean JSON parsing in case Gemini adds markdown tags
    const cleanJsonString = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanJsonString);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    // ✨ NEW: Log the exact error to the dashboard
    console.error("Function Crash:", error.message);
    
    // ✨ MAGIC FIX: Return a 200 status code but send the error as text so the app doesn't throw the generic "non-2xx" error!
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, 
    })
  }
})