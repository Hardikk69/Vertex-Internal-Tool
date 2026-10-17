// Direct Resend email dispatcher for local development & production without Edge Functions.

export async function sendOnboardingEmail({
  to,
  clientName,
  companyName,
  inviteLink,
  resendApiKey,
  fromEmail = "onboarding@resend.dev", // Default test sender allowed by Resend without custom domain!
}: {
  to: string;
  clientName: string;
  companyName: string;
  inviteLink: string;
  resendApiKey: string;
  fromEmail?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f7f9; margin: 0; padding: 40px 20px; }
            .card { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
            .header { background: #121214; padding: 32px; text-align: center; }
            .brand { color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
            .brand span { color: #FF4B33; }
            .content { padding: 32px; color: #1f2937; line-height: 1.6; font-size: 15px; }
            .badge { display: inline-block; background: #fff1f0; color: #FF4B33; font-weight: 600; font-size: 12px; padding: 4px 12px; border-radius: 9999px; margin-bottom: 16px; border: 1px solid rgba(255, 75, 51, 0.2); }
            .btn { display: inline-block; background: linear-gradient(135deg, #FF4B33 0%, #FF7A59 100%); color: #ffffff !important; text-decoration: none; font-weight: 600; font-size: 15px; padding: 14px 28px; border-radius: 12px; margin: 24px 0; text-align: center; }
            .footer { padding: 20px 32px; background: #fafafa; border-top: 1px solid #f0f0f0; font-size: 12px; color: #6b7280; text-align: center; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <div class="brand">VERTEX <span>MEDIA HOUSE</span></div>
            </div>
            <div class="content">
              <div class="badge">Client Workspace Invitation</div>
              <h2 style="margin-top: 0; font-size: 20px; color: #111827;">Hello ${clientName || "there"},</h2>
              <p>You have been invited to join the <strong>${companyName}</strong> project workspace on Vertex Media House.</p>
              <p>In your dedicated portal, you can:</p>
              <ul style="padding-left: 20px; color: #4b5563;">
                <li>Fill out your creative brief and brand specifications</li>
                <li>Exchange video reels, raw footage, and brand assets</li>
                <li>Track scheduled shoot dates, meetings, and delivery deadlines</li>
                <li>Chat directly with the director and editing team</li>
              </ul>
              <div style="text-align: center;">
                <a href="${inviteLink}" class="btn">Set Up Your Account &amp; Brief &rarr;</a>
              </div>
              <p style="font-size: 13px; color: #6b7280;">If the button above does not work, copy and paste this link into your browser:<br>
                <a href="${inviteLink}" style="color: #FF4B33; word-break: break-all;">${inviteLink}</a>
              </p>
            </div>
            <div class="footer">
              &copy; ${new Date().getFullYear()} Vertex Media House. All rights reserved.
            </div>
          </div>
        </body>
      </html>
    `;

    // Use Vite proxy (/api/resend/emails) on localhost to bypass browser CORS preflight blocks completely
    const endpoint = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "/api/resend/emails"
      : "https://api.resend.com/emails";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to.trim()],
        subject: `Welcome to Vertex Media House · ${companyName} Project Portal`,
        html: htmlContent,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = data?.message || data?.error?.message || `HTTP ${res.status}: Failed to send email`;
      return { ok: false, error: errMsg };
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Network error while connecting to Resend API" };
  }
}
