// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // 1. Handle CORS preflight requests (Crucial for mobile apps)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    
    // 2. SAFELY EXTRACT VARIABLES
    const plan_type = payload?.plan_type || '';
    const user_id = payload?.user_id || '';
    const listing_id = payload?.listing_id || '';

    if (!user_id) {
      throw new Error("Missing user_id in the request payload.");
    }

    // 3. SECURELY LOAD API KEYS
    const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID');
    const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET');

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error("Missing Razorpay API Keys in Supabase Secrets!");
    }

    // 4. PRICING LOGIC
    let amount = 0;
    if (plan_type === 'pro_yearly') {
      amount = 299 * 100; // ✨ FIXED: Now correctly charges ₹299
    } else if (plan_type === 'single_ad') {
      amount = 249 * 100;
    } else {
      throw new Error(`Invalid plan type requested: ${plan_type}`);
    }

    // 5. CALL RAZORPAY
    const basicAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amount,
        currency: 'INR',
        receipt: `boltzy_receipt_${Date.now()}`,
        notes: {
          user_id: user_id,
          plan_type: plan_type,
          listing_id: listing_id
        }
      })
    });

    const orderData = await razorpayRes.json();

    if (!razorpayRes.ok) {
      throw new Error(`Razorpay API Error: ${orderData.error?.description || 'Unknown Error'}`);
    }

    // 6. RETURN SUCCESS TO MOBILE APP
    return new Response(JSON.stringify({ 
      order_id: orderData.id,
      amount: orderData.amount,
      currency: orderData.currency
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    // 7. GRACEFUL ERROR HANDLING
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
