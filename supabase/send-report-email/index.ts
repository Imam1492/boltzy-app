// @ts-ignore - VS Code doesn't recognize Deno globally by default, but Supabase does!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';

// @ts-ignore
Deno.serve(async (req: Request) => {
  try {
    const payload = await req.json();
    const report = payload.record; 

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'reports@yourdomain.com', // Update with your verified Resend domain
        to: 'imam@your-admin-email.com', 
        subject: `🚨 New App Report: ${report?.reason || 'Unknown'}`,
        html: `
          <h3>New Report Submitted</h3>
          <p><strong>Reason:</strong> ${report?.reason || 'N/A'}</p>
          <p><strong>Reporter ID:</strong> ${report?.reporter_id || 'N/A'}</p>
          <p><strong>Reported Item/User:</strong> ${report?.listing_id || report?.reported_user_id || 'N/A'}</p>
        `
      })
    });

    const data = await res.json();
    
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});