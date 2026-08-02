// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  try {
    const bodyText = await req.text();
    const signature = req.headers.get('x-razorpay-signature');
    const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');

    if (!signature || !webhookSecret) {
      return new Response('Missing signature or secret', { status: 400 });
    }

    // 1. Cryptographically Verify the Webhook Signature
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(bodyText)
    );

    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const expectedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (expectedSignature !== signature) {
      return new Response('Invalid signature', { status: 400 });
    }

    // 2. Parse the Verified Event
    const event = JSON.parse(bodyText);
    
    // We only care about payments that were successfully captured
    if (event.event !== 'payment.captured') {
      return new Response('Event ignored', { status: 200 });
    }

    const payment = event.payload.payment.entity;
    const razorpay_order_id = payment.order_id;
    const razorpay_payment_id = payment.id;
    
    // Extract the embedded metadata we added in Step 1
    const { plan_type, user_id, listing_id } = payment.notes || {};

    if (!user_id) {
      return new Response('No user data attached to payment', { status: 200 });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // 🛑 3. REPLAY CHECK (The Race Condition)
    // If the mobile app already processed this successfully, this insert will fail.
    const { error: paymentLogError } = await supabaseAdmin.from('payments').insert({
      user_id,
      razorpay_payment_id,
      razorpay_order_id,
      plan_type,
      listing_id: listing_id || null,
    });

    if (paymentLogError) {
      if (paymentLogError.code === '23505') {
        // The mobile app beat the webhook. We can safely ignore this!
        return new Response('Payment already processed by client', { status: 200 });
      }
      throw paymentLogError;
    }

    // 4. Update the Database (Because the mobile app failed to do it!)
    if (plan_type === 'pro_yearly') {
      const expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 1);
      const tokenExpiry = new Date();
      tokenExpiry.setMonth(tokenExpiry.getMonth() + 3);

      await supabaseAdmin.from('profiles').update({
        subscription_tier: 'pro_yearly',
        subscription_expiry: expiry.toISOString(),
        gold_tokens: 1,
        gold_token_expiry: tokenExpiry.toISOString()
      }).eq('id', user_id);

    } else if (plan_type === 'single_ad' && listing_id) {
      const oneMonthFromNow = new Date();
      oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

      await supabaseAdmin.from('listings').update({
        is_premium: true,
        premium_until: oneMonthFromNow.toISOString()
      }).eq('id', listing_id);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }
});