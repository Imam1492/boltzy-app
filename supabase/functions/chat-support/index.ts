// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// @ts-ignore
serve(async (req: Request) => {
  // Handle CORS for React Native
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query } = await req.json()
    
    // @ts-ignore
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')

    if (!geminiApiKey) {
      throw new Error("Missing Gemini API Key")
    }

    // Call Google Gemini directly
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ 
          parts: [{ 
            text: `You are the friendly, helpful AI support bot for Boltzy, an Indian classifieds marketplace app. Keep your answers very short, concise, and helpful (max 2-3 sentences). Do not format with heavy markdown. The user says: "${query}"` 
          }] 
        }]
      })
    })

    const data = await response.json()
    const reply = data.candidates[0].content.parts[0].text

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})