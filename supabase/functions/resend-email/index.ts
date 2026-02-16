// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { to, subject, html, type, message, link, title } = await req.json()

        if (!RESEND_API_KEY) {
            throw new Error('Missing RESEND_API_KEY environment variable')
        }

        let emailHtml = html;
        const emailSubject = subject || title || 'New Notification';

        // Generate HTML template for standard notifications
        if (type === 'notification' && !emailHtml) {
            const isRTL = true; // Default to RTL for Mutqan
            emailHtml = `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; direction: ${isRTL ? 'rtl' : 'ltr'};">
                    <!-- Header -->
                    <div style="background: linear-gradient(135deg, #0d466c 0%, #1e7a3e 100%); padding: 30px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">متقن</h1>
                    </div>
                    
                    <!-- Content -->
                    <div style="padding: 30px; background-color: #f8f9fa;">
                        <h2 style="color: #0d466c; margin-top: 0; font-size: 20px; font-weight: bold;">${title || subject}</h2>
                        
                        <div style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 20px 0;">
                            ${message}
                        </div>

                        ${link ? `
                        <div style="text-align: center; margin-top: 30px;">
                            <a href="https://facility-management.space${link}" style="background-color: #1e7a3e; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px -1px rgba(30, 122, 62, 0.2);">
                                عرض التفاصيل
                            </a>
                        </div>
                        ` : ''}
                    </div>

                    <!-- Footer -->
                    <div style="background-color: #ffffff; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="color: #a0aec0; font-size: 12px; margin: 0;">
                            © ${new Date().getFullYear()} Mutqan Platform. جميع الحقوق محفوظة.
                        </p>
                        <p style="color: #a0aec0; font-size: 12px; margin: 5px 0 0 0;">
                            هذا بريد تلقائي، يرجى عدم الرد عليه.
                        </p>
                    </div>
                </div>
            `;
        }

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
                from: 'Mutqan <noreply@facility-management.space>',
                to,
                subject: emailSubject,
                html: emailHtml,
            }),
        })

        const data = await res.json()

        if (!res.ok) {
            console.error('Resend API Error:', data)
            return new Response(JSON.stringify({ error: data }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    } catch (error) {
        console.error('Edge Function Error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
