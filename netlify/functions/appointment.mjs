export default async (req) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers }
    );
  }

  let supabaseUrl = "";
  try {
    // Use only the project origin; this prevents accidental /rest/v1 or other
    // path fragments in the Netlify environment variable from duplicating API paths.
    supabaseUrl = new URL(process.env.SUPABASE_URL || "").origin;
  } catch {
    supabaseUrl = "";
  }
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: "Appointment service is not configured." }),
      { status: 503, headers }
    );
  }

  try {
    const body = await req.json();

    const service = typeof body.service === "string" ? body.service.trim() : "";
    const preferredDate = typeof body.preferred_date === "string" ? body.preferred_date.trim() : "";
    const preferredTime = typeof body.preferred_time === "string" ? body.preferred_time.trim() : "";
    const language = typeof body.language === "string" ? body.language.trim() : "en";

    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(preferredDate)
      && !Number.isNaN(Date.parse(preferredDate + "T00:00:00Z"));

    if (
      !service || service.length > 120 ||
      !validDate ||
      !preferredTime || preferredTime.length > 40 ||
      language.length > 20
    ) {
      return new Response(
        JSON.stringify({ error: "Please provide a service, a valid date and a preferred time." }),
        { status: 400, headers }
      );
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/appointment_requests`,
      {
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
      }
    );

    if (!response.ok) {
      const details = await response.text();
      let dbCode = "unknown";
      try { dbCode = JSON.parse(details).code || dbCode; } catch {}
      console.error("Supabase insert failed:", response.status, details);
      return new Response(
        JSON.stringify({ error: `Database rejected the request (HTTP ${response.status}, code ${dbCode}).` }),
        { status: 502, headers }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Your appointment request was received. The clinic team must confirm availability."
      }),
      { status: 201, headers }
    );
  } catch (error) {
    console.error("Appointment request error:", error.message);
    return new Response(
      JSON.stringify({ error: "The appointment service is temporarily unavailable." }),
      { status: 500, headers }
    );
  }
};
