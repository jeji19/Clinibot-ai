export default async (req) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  };
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  let supabaseUrl = "";
  try { supabaseUrl = new URL(process.env.SUPABASE_URL || "").origin; } catch {}
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) return json({ error: "Clinic information service is not configured." }, 503);
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get("clinic") || "my-clinic").trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return json({ error: "This clinic link is invalid." }, 400);
    const auth = { "apikey": key, "Authorization": "Bearer " + key };
    const clinicUrl = new URL("/rest/v1/clinics", supabaseUrl);
    clinicUrl.searchParams.set("select", "id,name,slug,is_active");
    clinicUrl.searchParams.set("slug", "eq." + slug);
    clinicUrl.searchParams.set("is_active", "eq.true");
    clinicUrl.searchParams.set("limit", "1");
    const clinicResponse = await fetch(clinicUrl, { headers: auth, signal: AbortSignal.timeout(12000) });
    const clinics = await clinicResponse.json().catch(() => []);
    if (!clinicResponse.ok || !Array.isArray(clinics)) return json({ error: "Could not load clinic information." }, 502);
    if (!clinics[0]) return json({ error: "This clinic link is unavailable or inactive." }, 404);
    const settingsUrl = new URL("/rest/v1/clinic_settings", supabaseUrl);
    settingsUrl.searchParams.set("select", "services,country_code,currency_code");
    settingsUrl.searchParams.set("clinic_id", "eq." + clinics[0].id);
    settingsUrl.searchParams.set("limit", "1");
    const settingsResponse = await fetch(settingsUrl, { headers: auth, signal: AbortSignal.timeout(12000) });
    const rows = await settingsResponse.json().catch(() => []);
    if (!settingsResponse.ok || !Array.isArray(rows)) return json({ error: "Could not load clinic services." }, 502);
    const services = Array.isArray(rows[0]?.services) ? rows[0].services
      .filter(item => item && typeof item.name === "string" && item.name.trim())
      .map(item => ({ name: item.name.trim().slice(0, 120), price: item.price === 0 ? 0 :
        (item.price === null || item.price === undefined || item.price === "" ? null :
          (Number.isFinite(Number(item.price)) && Number(item.price) >= 0 ? Number(item.price) : null)) }))
      .slice(0, 50) : [];
    return json({ clinic: { name: clinics[0].name }, country_code: rows[0]?.country_code || null, currency_code: rows[0]?.currency_code || null, services });
  } catch (error) {
    console.error("Public clinic info error:", error?.message);
    return json({ error: "Clinic information is temporarily unavailable." }, 500);
  }
};
