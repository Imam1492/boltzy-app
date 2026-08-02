// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { razorpay_order_id, razorpay_payment_id, plan_type, user_id } = payload;

    if (!razorpay_order_id || !razorpay_payment_id || !user_id) {
      throw new Error("Missing required payment verification data.");
    }

    // 2. Initialize Supabase Admin Client (Bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Upgrade the User's Profile
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
    }

    // 4. Return Success to Mobile App
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