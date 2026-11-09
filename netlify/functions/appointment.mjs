export default async (req) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  };
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let supabaseUrl = "";
  try { supabaseUrl = new URL(process.env.SUPABASE_URL || "").origin; } catch {}
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) return json({ error: "Appointment service is not configured." }, 503);

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid JSON request body." }, 400);
    if (typeof body.website === "string" && body.website.trim()) {
      return json({ success: true, message: "Your appointment request was received." }, 201);
    }
    const patientName = typeof body.patient_name === "string" ? body.patient_name.trim() : "";
    const patientPhone = typeof body.patient_phone === "string" ? body.patient_phone.trim() : "";
    const service = typeof body.service === "string" ? body.service.trim() : "";
    const preferredDate = typeof body.preferred_date === "string" ? body.preferred_date.trim() : "";
    const preferredTime = typeof body.preferred_time === "string" ? body.preferred_time.trim() : "";
    const language = ["en", "ru"].includes(body.language) ? body.language : "en";
    const clinicSlug = typeof body.clinic_slug === "string" ? body.clinic_slug.trim().toLowerCase() : "";
    const validDate = (() => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) return false;
      const parsed = new Date(preferredDate + "T00:00:00Z");
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === preferredDate;
    })();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clinicSlug) || clinicSlug.length > 60) {
      return json({ error: "This clinic link is invalid." }, 400);
    }
    if (!patientName || patientName.length > 100 ||
        !/^[+0-9()\s.-]{6,30}$/.test(patientPhone) ||
        !service || service.length > 120 || !validDate ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(preferredTime)) {
      return json({ error: "Please provide your name, a valid phone number, service, date and preferred time." }, 400);
    }

    const auth = { "apikey": key, "Authorization": "Bearer " + key };
    const clinicUrl = new URL("/rest/v1/clinics", supabaseUrl);
    clinicUrl.searchParams.set("select", "id,name,slug,is_active,notification_email");
    clinicUrl.searchParams.set("slug", "eq." + clinicSlug);
    clinicUrl.searchParams.set("is_active", "eq.true");
    clinicUrl.searchParams.set("limit", "1");
    const clinicResponse = await fetch(clinicUrl, { headers: auth, signal: AbortSignal.timeout(12000) });
    const clinics = await clinicResponse.json().catch(() => []);
    if (!clinicResponse.ok || !Array.isArray(clinics)) return json({ error: "Could not verify this clinic. Please try again later." }, 502);
    const clinic = clinics[0];
    if (!clinic) return json({ error: "This clinic link is unavailable or inactive." }, 404);

    const settingsUrl = new URL("/rest/v1/clinic_settings", supabaseUrl);
    settingsUrl.searchParams.set("select", "services");
    settingsUrl.searchParams.set("clinic_id", "eq." + clinic.id);
    settingsUrl.searchParams.set("limit", "1");
    const settingsResponse = await fetch(settingsUrl, { headers: auth, signal: AbortSignal.timeout(12000) });
    const settingsRows = await settingsResponse.json().catch(() => []);
    if (!settingsResponse.ok || !Array.isArray(settingsRows)) return json({ error: "Could not verify the selected service. Please try again later." }, 502);
    const services = Array.isArray(settingsRows[0]?.services) ? settingsRows[0].services : [];
    const selected = services.find(item => typeof item?.name === "string" && item.name.trim().toLowerCase() === service.toLowerCase());
    if (!selected) return json({ error: "Please select a service currently offered by this clinic." }, 400);

    const insertResponse = await fetch(new URL("/rest/v1/appointment_requests", supabaseUrl), {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify({
        clinic_id: clinic.id, patient_name: patientName, patient_phone: patientPhone,
        service, preferred_date: preferredDate, preferred_time: preferredTime,
        language, status: "new"
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (!insertResponse.ok) {
      const detail = await insertResponse.text();
      let code = "unknown";
      try { code = JSON.parse(detail).code || code; } catch {}
      console.error("Appointment insert failed:", insertResponse.status, detail.slice(0, 400));
      return json({ error: "Database could not save the appointment request (" + code + ")." }, 502);
    }

    const recipient = process.env.RESEND_TO_EMAIL;
    if (process.env.RESEND_API_KEY && recipient) {
      try {
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "CliniBot AI <onboarding@resend.dev>",
            to: [recipient],
            subject: "New CliniBot appointment request — " + clinic.name,
            text: "A new appointment request was received for " + clinic.name +
              ".\nPatient: " + patientName + "\nPhone: " + patientPhone +
              "\nService: " + service + "\nPreferred date: " + preferredDate +
              "\nPreferred time: " + preferredTime + "\nLanguage: " + language +
              "\nStatus: new\nPlease review it in your CliniBot dashboard."
          }),
          signal: AbortSignal.timeout(10000)
        });
        if (!emailResponse.ok) console.error("Appointment email notification failed:", emailResponse.status, (await emailResponse.text()).slice(0, 300));
      } catch (error) {
        console.error("Appointment email notification error:", error?.message);
      }
    }
    return json({ success: true, clinic: clinic.name, message: "Your appointment request was received. The clinic team must confirm availability." }, 201);
  } catch (error) {
    console.error("Appointment request error:", error?.message);
    return json({ error: "The appointment service is temporarily unavailable." }, 500);
  }
};
