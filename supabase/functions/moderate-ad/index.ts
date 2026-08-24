// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PHONE_REGEX = /(\+91[\-\s]?)?[0-9]{10}/;
const BANNED_WORDS = [
  'scam', 'fraud', 'fake', 'fuck', 'shit', 'bitch', 'asshole', 
  'prostitute', 'escort', 'drugs', 'weed', 'cocaine', 'guns', 'weapons'
];

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const listing = payload.record;

    if (!listing || listing.approval_status !== 'pending') {
      return new Response("Not a pending listing", { status: 200 });
    }

    const textToAnalyze = `${listing.title} ${listing.description || ''}`.toLowerCase();
    let isFlagged = false;
    let moderationNote = null;

    // 1. Phone number check
    if (PHONE_REGEX.test(textToAnalyze)) {
      isFlagged = true;
      moderationNote = "Phone numbers are not allowed in titles or descriptions. Please use the built-in Chat to communicate securely.";
    }

    // 2. PurgoMalum API check
    if (!isFlagged) {
      try {
        const apiRes = await fetch(`https://www.purgomalum.com/service/containsprofanity?text=${encodeURIComponent(textToAnalyze)}`);
        
        if (apiRes.ok) {
          const result = await apiRes.text();
          if (result === 'true') {
            isFlagged = true;
            moderationNote = "Your ad was flagged for inappropriate language. Please revise it to comply with guidelines.";
          }
        } else {
          throw new Error("PurgoMalum API Failed");
        }
      } catch (_err) {
        // Fallback to local dictionary
        const containsBannedWord = BANNED_WORDS.some((word) => textToAnalyze.includes(word));
        if (containsBannedWord) {
          isFlagged = true;
          moderationNote = "Your ad contains prohibited words. Please revise it to comply with our community guidelines.";
        }
      }
    }

    // 3. Connect to Supabase using Service Role Key
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const finalStatus = isFlagged ? 'action_required' : 'approved';
    
    // 4. Update status
    await supabase
      .from('listings')
      .update({ approval_status: finalStatus, moderation_note: moderationNote })
      .eq('id', listing.id);

    // 5. Send Real-Time Notification
    if (isFlagged) {
      await supabase.from('notifications').insert({
        user_id: listing.seller_id,
        title: 'Action Required',
        message: 'Modify your ad to make it live. It may violate community guidelines.',
        icon: 'alert-circle',
        color: '#F5A623'
      });
    } else {
      await supabase.from('notifications').insert({
        user_id: listing.seller_id,
        title: 'Ad is Live! 🎉',
        message: 'Your ad went live successfully.',
        icon: 'checkmark-circle',
        color: '#34C759'
      });
    }

    return new Response(JSON.stringify({ success: true, status: finalStatus }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500 });
  }
});