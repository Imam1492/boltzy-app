// @ts-nocheck

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ✨ FIX 1: We now extract all the new fields sent from post.tsx
    const { title, category, price, condition, highlights } = await req.json()
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

    if (!title || !category) throw new Error('Title and Category are required')

    // ✨ FIX 2: The ultra-strict "Grounded" Prompt
    const prompt = `You are a strict, highly professional copywriter for a classifieds marketplace. 
    Write a highly-converting but strictly realistic description for this item based ONLY on the provided facts.

    FACTS:
    - Title: ${title}
    - Category: ${category}
    - Price: ${price}
    - Condition: ${condition}
    - User's Key Highlights: ${highlights ? highlights.join(', ') : 'None provided'}

    RULES:
    1. Write a friendly, professional description under 80 words.
    2. DO NOT use hyperbole, extreme definitions, or overly dramatic sales pitches (e.g., avoid "The greatest phone ever created!").
    3. DO NOT invent or assume features that are not explicitly stated in the facts. Stick strictly to the facts provided.
    4. Provide exactly 5 short, punchy highlights (max 3 words each) about this item. Incorporate the user's highlights if they provided any.
    
    Respond ONLY with a valid JSON object in this exact format, with no markdown formatting:
    {"description": "your awesome factual description here", "highlights": ["Highlight 1", "Highlight 2", "Highlight 3", "Highlight 4", "Highlight 5"]}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await response.json();

    if (!response.ok || data.error) {
        console.error("Gemini API Error:", data);
        throw new Error(data.error?.message || "Gemini API rejected the request.");
    }

    const textResponse = data.candidates[0].content.parts[0].text;
    
    const cleanJsonString = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanJsonString);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error("Function Crash:", error.message);
    
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, 
    })
  }
})