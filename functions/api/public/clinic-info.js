const securityHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin"
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: securityHeaders });

export async function onRequestGet({ request, env }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Clinic information service is not configured." }, 503);
  try {
    const slug = new URL(request.url).searchParams.get("clinic")?.trim().toLowerCase() || "my-clinic";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return json({ error: "This clinic link is invalid." }, 400);
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    const headers = { "apikey": key, "Authorization": "Bearer " + key };
    const clinicUrl = new URL("/rest/v1/clinics", env.SUPABASE_URL);
    clinicUrl.searchParams.set("select", "id,name,slug,is_active");
    clinicUrl.searchParams.set("slug", "eq." + slug);
    clinicUrl.searchParams.set("is_active", "eq.true");
    clinicUrl.searchParams.set("limit", "1");
    const clinicResponse = await fetch(clinicUrl, { headers, signal: AbortSignal.timeout(12000) });
    const clinics = await clinicResponse.json().catch(() => []);
    if (!clinicResponse.ok || !Array.isArray(clinics)) return json({ error: "Could not load clinic information." }, 502);
    if (!clinics[0]) return json({ error: "This clinic link is unavailable or inactive." }, 404);
    const settingsUrl = new URL("/rest/v1/clinic_settings", env.SUPABASE_URL);
    settingsUrl.searchParams.set("select", "services");
    settingsUrl.searchParams.set("clinic_id", "eq." + clinics[0].id);
    settingsUrl.searchParams.set("limit", "1");
    const settingsResponse = await fetch(settingsUrl, { headers, signal: AbortSignal.timeout(12000) });
    const rows = await settingsResponse.json().catch(() => []);
    if (!settingsResponse.ok || !Array.isArray(rows)) return json({ error: "Could not load clinic services." }, 502);
    const services = Array.isArray(rows[0]?.services) ? rows[0].services
      .filter(item => item && typeof item.name === "string" && item.name.trim())
      .map(item => ({ name: item.name.trim().slice(0, 120), price: item.price === 0 ? 0 :
        (item.price === null || item.price === undefined || item.price === "" ? null :
          (Number.isFinite(Number(item.price)) && Number(item.price) >= 0 ? Number(item.price) : null)) }))
      .slice(0, 50) : [];
    return json({ clinic: { name: clinics[0].name }, services });
  } catch (error) {
    console.error("Public clinic info error:", error?.message);
    return json({ error: "Clinic information is temporarily unavailable." }, 500);
  }
}
