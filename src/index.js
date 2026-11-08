export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/chat") return handleChat(request, env);
    if (url.pathname === "/api/appointment") return handleAppointment(request, env);
    if (url.pathname === "/api/admin/login") return handleAdminLogin(request, env);
    if (url.pathname === "/api/admin/appointments") return handleAdminAppointments(request, env);
    if (url.pathname === "/api/admin/appointment-status") return handleAdminStatus(request, env);
    if (url.pathname === "/api/superadmin/overview") return handleSuperAdminOverview(request, env);
    return env.ASSETS.fetch(request);
  }
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

async function handleChat(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env.GEMINI_API_KEY) return json({ error: "AI service is not configured." }, 503);
  try {
    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 1200) return json({ error: "Please enter a valid message." }, 400);

    const instructions = `
You are CliniBot AI, a professional virtual receptionist for beauty, dermatology and dental clinics worldwide.
Be friendly, natural, welcoming and professional. Always reply in the same language as the user's latest message. Support Arabic, English, Russian, German and French.
Explain clinic services only when verified information exists. No specific clinic database is connected: never invent services, prices, doctors, opening hours or availability.
You may collect appointment preferences, but cannot access a real clinic calendar. Never claim an appointment is confirmed; the clinic team must confirm availability.
Never diagnose, prescribe medication, or recommend a medical procedure as personally suitable. Refer medical questions to qualified clinic staff. For emergencies, advise contacting local emergency services.
Do not request passwords, payment details, medical records, symptoms or other sensitive information. Keep answers concise and helpful.
`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: instructions }] },
        contents: [{ role: "user", parts: [{ text: message }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 500 }
      }),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      console.error("Gemini error", response.status, (await response.text()).slice(0, 500));
      return json({ error: `AI service error (${response.status}). Please try again.` }, 502);
    }
    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();
    if (!reply) return json({ error: "The AI returned an empty response. Please try again." }, 502);
    return json({ reply });
  } catch (error) {
    console.error("Chat error", error?.message);
    return json({ error: "Sorry, the service is temporarily unavailable. Please try again." }, 500);
  }
}

async function handleAppointment(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let base;
  try { base = new URL(env.SUPABASE_URL || "").origin; } catch { base = ""; }
  if (!base || !env.SUPABASE_ANON_KEY) return json({ error: "Appointment service is not configured." }, 503);
  try {
    const body = await request.json();
    const service = typeof body.service === "string" ? body.service.trim() : "";
    const preferred_date = typeof body.preferred_date === "string" ? body.preferred_date.trim() : "";
    const preferred_time = typeof body.preferred_time === "string" ? body.preferred_time.trim() : "";
    const language = typeof body.language === "string" ? body.language.trim() : "en";
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(preferred_date) && !Number.isNaN(Date.parse(preferred_date + "T00:00:00Z"));
    if (!service || service.length > 120 || !validDate || !preferred_time || preferred_time.length > 40 || language.length > 20) {
      return json({ error: "Please provide a service, a valid date and a preferred time." }, 400);
    }
    const response = await fetch(base + "/rest/v1/appointment_requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": env.SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + env.SUPABASE_ANON_KEY,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ service, preferred_date, preferred_time, language, status: "new" }),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      const detail = await response.text();
      let code = "unknown";
      try { code = JSON.parse(detail).code || code; } catch {}
      console.error("Supabase insert failed", response.status, detail.slice(0, 500));
      return json({ error: `Database rejected the request (HTTP ${response.status}, code ${code}).` }, 502);
    }
    // Send a manager notification when email settings are configured. Email failure must not undo a saved booking request.
    if (env.RESEND_API_KEY && env.RESEND_TO_EMAIL) {
      try {
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "CliniBot AI <onboarding@resend.dev>",
            to: [env.RESEND_TO_EMAIL],
            subject: "New CliniBot appointment request",
            text: `A new appointment request was received.\\nService: ${service}\\nPreferred date: ${preferred_date}\\nPreferred time: ${preferred_time}\\nLanguage: ${language}\\nStatus: new\\nPlease review it in your CliniBot dashboard.`
          }),
          signal: AbortSignal.timeout(10000)
        });
        if (!emailResponse.ok) console.error("Resend notification failed", emailResponse.status, (await emailResponse.text()).slice(0, 400));
      } catch (emailError) {
        console.error("Resend notification error", emailError?.message);
      }
    }
    return json({ success: true, message: "Your appointment request was received. The clinic team must confirm availability." }, 201);
  } catch (error) {
    console.error("Appointment error", error?.message);
    return json({ error: "The appointment service is temporarily unavailable." }, 500);
  }
}

async function handleAdminLogin(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const { email, password } = await request.json();
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) return json({ error: "Enter your email and password." }, 400);
    const response = await fetch(new URL("/auth/v1/token?grant_type=password", env.SUPABASE_URL).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": env.SUPABASE_ANON_KEY },
      body: JSON.stringify({ email: email.trim(), password }),
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) return json({ error: "Sign-in failed. Check your email and password." }, 401);
    return json({ access_token: data.access_token, expires_in: data.expires_in });
  } catch (error) {
    console.error("Admin login error", error?.message);
    return json({ error: "Sign-in service is temporarily unavailable." }, 500);
  }
}

async function authorizedAdmin(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  const verify = await fetch(new URL("/auth/v1/user", env.SUPABASE_URL).toString(), {
    headers: { "apikey": env.SUPABASE_ANON_KEY, "Authorization": "Bearer " + token },
    signal: AbortSignal.timeout(12000)
  });
  if (!verify.ok) return null;
  const user = await verify.json().catch(() => null);
  return user?.id ? token : null;
}

async function handleAdminAppointments(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  try {
    const token = await authorizedAdmin(request, env);
    if (!token) return json({ error: "Please sign in again." }, 401);
    const url = new URL("/rest/v1/appointment_requests?select=id,created_at,service,preferred_date,preferred_time,language,status&order=created_at.desc&limit=100", env.SUPABASE_URL);
    const response = await fetch(url, { headers: { "apikey": env.SUPABASE_ANON_KEY, "Authorization": "Bearer " + token }, signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Admin list failed", response.status, JSON.stringify(data).slice(0, 400));
      return json({ error: "Could not load requests. Check the clinic access policy." }, 502);
    }
    return json({ appointments: data });
  } catch (error) {
    console.error("Admin list error", error?.message);
    return json({ error: "Dashboard service is temporarily unavailable." }, 500);
  }
}

async function handleAdminStatus(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const token = await authorizedAdmin(request, env);
    if (!token) return json({ error: "Please sign in again." }, 401);
    const body = await request.json();
    const id = body.id;
    const status = body.status;
    if ((typeof id !== "number" && typeof id !== "string") || !["new", "confirmed", "rejected", "completed"].includes(status)) return json({ error: "Invalid request or status." }, 400);
    const url = new URL("/rest/v1/appointment_requests?id=eq." + encodeURIComponent(String(id)), env.SUPABASE_URL);
    const response = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "apikey": env.SUPABASE_ANON_KEY, "Authorization": "Bearer " + token, "Prefer": "return=minimal" },
      body: JSON.stringify({ status }),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("Admin update failed", response.status, detail.slice(0, 400));
      return json({ error: "Could not update this request." }, 502);
    }
    return json({ success: true });
  } catch (error) {
    console.error("Admin update error", error?.message);
    return json({ error: "Dashboard service is temporarily unavailable." }, 500);
  }
}


async function handleSuperAdminOverview(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  try {
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Please sign in." }, 401);
    const token = authorization.slice(7);
    const headers = { "apikey": env.SUPABASE_ANON_KEY, "Authorization": "Bearer " + token };
    const userResponse = await fetch(new URL("/auth/v1/user", env.SUPABASE_URL), { headers, signal: AbortSignal.timeout(12000) });
    if (!userResponse.ok) return json({ error: "Please sign in again." }, 401);
    const user = await userResponse.json().catch(() => null);
    if (!user?.id) return json({ error: "Please sign in again." }, 401);

    const checkUrl = new URL("/rest/v1/super_admins", env.SUPABASE_URL);
    checkUrl.searchParams.set("select", "user_id");
    checkUrl.searchParams.set("user_id", "eq." + user.id);
    const checkResponse = await fetch(checkUrl, { headers, signal: AbortSignal.timeout(12000) });
    const checkRows = await checkResponse.json().catch(() => []);
    if (!checkResponse.ok || !Array.isArray(checkRows) || checkRows.length === 0) {
      return json({ error: "This account is not authorized as a Super Admin." }, 403);
    }

    const urls = [
      new URL("/rest/v1/clinics?select=id,name&order=name.asc", env.SUPABASE_URL),
      new URL("/rest/v1/clinic_members?select=clinic_id,user_id", env.SUPABASE_URL),
      new URL("/rest/v1/appointment_requests?select=id,clinic_id,status,created_at&order=created_at.desc&limit=1000", env.SUPABASE_URL)
    ];
    const results = await Promise.all(urls.map(url => fetch(url, { headers, signal: AbortSignal.timeout(15000) })));
    const payloads = await Promise.all(results.map(r => r.json().catch(() => [])));
    if (results.some(r => !r.ok) || payloads.some(x => !Array.isArray(x))) {
      console.error("Super Admin overview query failed", results.map(r => r.status));
      return json({ error: "Could not load Super Admin data. Check the database policies." }, 502);
    }
    const [clinics, members, appointments] = payloads;
    const overview = clinics.map(clinic => {
      const clinicMembers = members.filter(member => member.clinic_id === clinic.id);
      const clinicAppointments = appointments.filter(item => item.clinic_id === clinic.id);
      return {
        id: clinic.id,
        name: clinic.name,
        manager_count: clinicMembers.length,
        request_count: clinicAppointments.length,
        new_count: clinicAppointments.filter(item => item.status === "new").length
      };
    });
    return json({ clinics: overview, total_requests: appointments.length });
  } catch (error) {
    console.error("Super Admin overview error", error?.message);
    return json({ error: "Super Admin service is temporarily unavailable." }, 500);
  }
}
