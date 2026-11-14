const MAX_JSON_BODY_BYTES = 64 * 1024;

async function readJsonObject(request) {
  try {
    const declaredLength = Number(request.headers.get("Content-Length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) return null;
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_JSON_BODY_BYTES) return null;
    const body = JSON.parse(raw);
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...securityHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

async function handleDemoRequest(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Demo request storage is temporarily unavailable." }, 503);
  }
  try {
    const body = await readJsonObject(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid JSON request body." }, 400);
    if (typeof body.website === "string" && body.website.trim()) return json({ success: true }, 200);
    const clinic = typeof body.clinic_name === "string" ? body.clinic_name.trim() : "";
    const contact = typeof body.contact_name === "string" ? body.contact_name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const specialty = typeof body.specialty === "string" ? body.specialty.trim() : "";
    const at = email.indexOf("@");
    const dot = email.lastIndexOf(".");
    const validEmail = at > 0 && dot > at + 1 && dot < email.length - 1 && !/\s/.test(email);
    if (clinic.length < 2 || clinic.length > 100) return json({ error: "Please enter a clinic name (2–100 characters)." }, 400);
    if (contact.length < 2 || contact.length > 100) return json({ error: "Please enter your name (2–100 characters)." }, 400);
    if (!validEmail || email.length > 160) return json({ error: "Please enter a valid email address, for example name@example.com." }, 400);
    if (phone.length > 30 || specialty.length > 80) return json({ error: "Please check the phone number or specialty field." }, 400);

    const serviceHeaders = { "apikey": env.SUPABASE_SERVICE_ROLE_KEY, "Authorization": "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY };
    const saveResponse = await fetch(new URL("/rest/v1/demo_requests", env.SUPABASE_URL), {
      method: "POST",
      headers: { ...serviceHeaders, "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify({ clinic_name: clinic, contact_name: contact, email, phone: phone || null, specialty: specialty || null, status: "new" }),
      signal: AbortSignal.timeout(12000)
    });
    if (!saveResponse.ok) {
      const detail = (await saveResponse.text()).slice(0, 400);
      console.error("Demo request database insert failed", saveResponse.status, detail);
      return json({ error: "We couldn't save your request right now. Please try again later." }, 502);
    }
    if (env.RESEND_API_KEY && env.RESEND_TO_EMAIL) {
      try {
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "CliniBot AI <onboarding@resend.dev>",
            to: [env.RESEND_TO_EMAIL],
            reply_to: email,
            subject: "New CliniBot demo request — " + clinic,
            text: "A new CliniBot AI demo request was submitted.\n\nClinic: " + clinic +
              "\nContact: " + contact + "\nEmail: " + email + "\nPhone / WhatsApp: " + (phone || "Not provided") +
              "\nSpecialty: " + (specialty || "Not provided") + "\n\nPlease contact this clinic to arrange a product demo."
          }),
          signal: AbortSignal.timeout(12000)
        });
        if (!emailResponse.ok) console.error("Demo request email failed", emailResponse.status, (await emailResponse.text()).slice(0, 300));
      } catch (emailError) { console.error("Demo request email error", emailError?.message); }
    } else {
      console.error("Demo request saved but email notification config is missing");
    }
    return json({ success: true, message: "Your demo request has been received." }, 201);
  } catch (error) {
    console.error("Demo request error", error?.message);
    return json({ error: "The demo request service is temporarily unavailable." }, 500);
  }
}

export default async (req) => {
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_TO_EMAIL: process.env.RESEND_TO_EMAIL
  };
  return handleDemoRequest(req, env);
};
