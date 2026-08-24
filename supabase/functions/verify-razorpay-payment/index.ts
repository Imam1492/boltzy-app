// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    
    // ✨ Extract all required data from the request payload
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan_type, user_id, listing_id } = payload;

    if (!razorpay_order_id || !razorpay_payment_id || !user_id) {
      throw new Error("Missing required payment verification data.");
    }

    // ✨ 2. Check if they provided the signature
    if (!razorpay_signature) {
      throw new Error("Missing cryptographic signature. Payment rejected.");
    }

    // ✨ 3. Cryptographically verify the signature matches the order + payment ID
    const RAZORPAY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') || '';
    
    // Razorpay signature is an HMAC SHA256 of "order_id|payment_id"
    const textToHash = `${razorpay_order_id}|${razorpay_payment_id}`;
    
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(RAZORPAY_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(textToHash)
    );

    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const expectedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (expectedSignature !== razorpay_signature) {
      throw new Error("Payment signature forgery detected. Payment rejected.");
    }

    // 4. Initialize Supabase Admin Client (Bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 5. Upgrade the User's Profile or Ad based on the plan type
    if (plan_type === 'pro_yearly') {
       const expiry = new Date();
       expiry.setFullYear(expiry.getFullYear() + 1); // 1 year from now
       
       const goldExpiry = new Date();
       goldExpiry.setMonth(goldExpiry.getMonth() + 3); // 3 months from now

       const { error: dbError } = await supabaseAdmin
         .from('profiles')
         .update({
           subscription_tier: 'pro_yearly',
           subscription_expiry: expiry.toISOString(),
           gold_tokens: 1,
           gold_token_expiry: goldExpiry.toISOString()
         })
         .eq('id', user_id);

       if (dbError) throw dbError;
       
    } else if (plan_type === 'single_ad' && listing_id) {
       // ✨ Handle the 30-day single ad promotion
       const oneMonthFromNow = new Date();
       oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

       const { error: adError } = await supabaseAdmin
         .from('listings')
         .update({
           is_premium: true,
           premium_until: oneMonthFromNow.toISOString()
         })
         .eq('id', listing_id);
         
       if (adError) throw adError;
    }

    // 6. Return Success to Mobile App
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("❌ VERIFY CRASH:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});