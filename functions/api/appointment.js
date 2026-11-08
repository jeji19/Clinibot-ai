export async function onRequestPost({ request, env }) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };

  let supabaseUrl = "";
  try {
    supabaseUrl = new URL(env.SUPABASE_URL || "").origin;
  } catch {
    supabaseUrl = "";
  }
  const supabaseKey = env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: "Appointment service is not configured." }), { status: 503, headers });
  }

  try {
    const body = await request.json();
    const service = typeof body.service === "string" ? body.service.trim() : "";
    const preferredDate = typeof body.preferred_date === "string" ? body.preferred_date.trim() : "";
    const preferredTime = typeof body.preferred_time === "string" ? body.preferred_time.trim() : "";
    const requestedLanguage = typeof body.language === "string" ? body.language.trim() : "en";
    const language = ["en", "ru"].includes(requestedLanguage) ? requestedLanguage : "en";

    const validDate = /^\\d{4}-\\d{2}-\\d{2}$/.test(preferredDate)
      && !Number.isNaN(Date.parse(preferredDate + "T00:00:00Z"));

    if (!service || service.length > 120 || !validDate || !preferredTime || preferredTime.length > 40 || !["en", "ru"].includes(language)) {
      return new Response(JSON.stringify({ error: "Please provide a service, a valid date and a preferred time." }), { status: 400, headers });
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/appointment_requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        service,
        preferred_date: preferredDate,
        preferred_time: preferredTime,
        language,
        status: "new"
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const details = await response.text();
      let dbCode = "unknown";
      try { dbCode = JSON.parse(details).code || dbCode; } catch {}
      console.error("Supabase insert failed:", response.status, details);
      return new Response(JSON.stringify({ error: `Database rejected the request (HTTP ${response.status}, code ${dbCode}).` }), { status: 502, headers });
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Your appointment request was received. The clinic team must confirm availability."
    }), { status: 201, headers });
  } catch (error) {
    console.error("Appointment request error:", error.message);
    return new Response(JSON.stringify({ error: "The appointment service is temporarily unavailable." }), { status: 500, headers });
  }
}
