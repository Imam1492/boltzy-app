// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();

    // 1. Ensure this is an INSERT trigger from the notifications table
    if (payload.type !== 'INSERT' || payload.table !== 'notifications') {
      return new Response('Ignored: Not a new notification', { status: 200 });
    }

    const { user_id, title, message } = payload.record;

    // 2. Connect to Supabase to fetch the user's Push Token
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('push_token')
      .eq('id', user_id)
      .single();

    if (error || !profile?.push_token) {
      return new Response('User has no push token registered.', { status: 200 });
    }

    // 3. Send the notification to Expo's Push Servers
    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: profile.push_token,
        sound: 'default',
        title: title,
        body: message,
        data: { route: 'notifications' }, 
      }),
    });

    const expoData = await expoResponse.json();

    return new Response(JSON.stringify({ success: true, receipt: expoData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("Push Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});