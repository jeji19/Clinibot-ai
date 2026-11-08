export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/chat") return handleChat(request, env);
    if (url.pathname === "/api/appointment") return handleAppointment(request, env);
    if (url.pathname === "/api/admin/login") return handleAdminLogin(request, env);
    if (url.pathname === "/api/admin/appointments") return handleAdminAppointments(request, env);
    if (url.pathname === "/api/admin/appointment-status") return handleAdminStatus(request, env);
    if (url.pathname === "/api/superadmin/overview") return handleSuperAdminOverview(request, env);
    if (url.pathname === "/api/superadmin/clinics") return handleSuperAdminCreateClinic(request, env);
    if (url.pathname === "/api/superadmin/members") return handleSuperAdminAddMember(request, env);
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
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Appointment service is not configured." }, 503);
  }
  try {
    const body = await request.json();
    const service = typeof body.service === "string" ? body.service.trim() : "";
    const preferred_date = typeof body.preferred_date === "string" ? body.preferred_date.trim() : "";
    const preferred_time = typeof body.preferred_time === "string" ? body.preferred_time.trim() : "";
    const language = typeof body.language === "string" ? body.language.trim() : "en";
    const clinic_slug = typeof body.clinic_slug === "string" ? body.clinic_slug.trim().toLowerCase() : "";
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(preferred_date) && !Number.isNaN(Date.parse(preferred_date + "T00:00:00Z"));
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clinic_slug) || clinic_slug.length > 60) {
      return json({ error: "This clinic link is invalid. Please open the clinic's correct booking link." }, 400);
    }
    if (!service || service.length > 120 || !validDate || !preferred_time || preferred_time.length > 40 || language.length > 20) {
      return json({ error: "Please provide a service, a valid date and a preferred time." }, 400);
    }

    // Resolve the clinic on the server. Never trust a clinic_id supplied by the browser.
    const clinicUrl = new URL("/rest/v1/clinics", env.SUPABASE_URL);
    clinicUrl.searchParams.set("select", "id,name,slug,is_active,notification_email");
    clinicUrl.searchParams.set("slug", "eq." + clinic_slug);
    clinicUrl.searchParams.set("is_active", "eq.true");
    clinicUrl.searchParams.set("limit", "1");
    const serviceHeaders = {
      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY
    };
    const clinicResponse = await fetch(clinicUrl, { headers: serviceHeaders, signal: AbortSignal.timeout(12000) });
    const clinics = await clinicResponse.json().catch(() => []);
    if (!clinicResponse.ok || !Array.isArray(clinics)) {
      console.error("Clinic lookup failed", clinicResponse.status, JSON.stringify(clinics).slice(0, 300));
      return json({ error: "Could not verify this clinic. Please try again later." }, 502);
    }
    const clinic = clinics[0];
    if (!clinic) return json({ error: "This clinic link is unavailable or inactive." }, 404);

    const insertResponse = await fetch(new URL("/rest/v1/appointment_requests", env.SUPABASE_URL), {
      method: "POST",
      headers: {
        ...serviceHeaders,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ clinic_id: clinic.id, service, preferred_date, preferred_time, language, status: "new" }),
      signal: AbortSignal.timeout(15000)
    });
    if (!insertResponse.ok) {
      const detail = await insertResponse.text();
      let code = "unknown";
      try { code = JSON.parse(detail).code || code; } catch {}
      console.error("Supabase insert failed", insertResponse.status, detail.slice(0, 500));
      return json({ error: `Database rejected the request (HTTP ${insertResponse.status}, code ${code}).` }, 502);
    }

    const recipient = clinic.notification_email || env.RESEND_TO_EMAIL;
    if (env.RESEND_API_KEY && recipient) {
      try {
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "CliniBot AI <onboarding@resend.dev>",
            to: [recipient],
            subject: `New CliniBot appointment request — ${clinic.name}`,
            text: `A new appointment request was received for ${clinic.name}.\\nService: ${service}\\nPreferred date: ${preferred_date}\\nPreferred time: ${preferred_time}\\nLanguage: ${language}\\nStatus: new\\nPlease review it in your CliniBot dashboard.`
          }),
          signal: AbortSignal.timeout(10000)
        });
        if (!emailResponse.ok) console.error("Resend notification failed", emailResponse.status, (await emailResponse.text()).slice(0, 400));
      } catch (emailError) {
        console.error("Resend notification error", emailError?.message);
      }
    }
    return json({ success: true, clinic: clinic.name, message: "Your appointment request was received. The clinic team must confirm availability." }, 201);
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
      new URL("/rest/v1/clinics?select=id,name,slug,plan,is_active,notification_email&order=name.asc", env.SUPABASE_URL),
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
        slug: clinic.slug,
        plan: clinic.plan,
        is_active: clinic.is_active,
        notification_email: clinic.notification_email,
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


async function verifySuperAdmin(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  const headers = { "apikey": env.SUPABASE_ANON_KEY, "Authorization": "Bearer " + token };
  const userResponse = await fetch(new URL("/auth/v1/user", env.SUPABASE_URL), { headers, signal: AbortSignal.timeout(12000) });
  if (!userResponse.ok) return null;
  const user = await userResponse.json().catch(() => null);
  if (!user?.id) return null;
  const checkUrl = new URL("/rest/v1/super_admins", env.SUPABASE_URL);
  checkUrl.searchParams.set("select", "user_id");
  checkUrl.searchParams.set("user_id", "eq." + user.id);
  const checkResponse = await fetch(checkUrl, { headers, signal: AbortSignal.timeout(12000) });
  const checkRows = await checkResponse.json().catch(() => []);
  if (!checkResponse.ok || !Array.isArray(checkRows) || checkRows.length === 0) return null;
  return { user, token };
}

async function handleSuperAdminCreateClinic(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const admin = await verifySuperAdmin(request, env);
    if (!admin) return json({ error: "Super Admin authorization required." }, 403);
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
    const plan = typeof body.plan === "string" ? body.plan : "basic";
    const notification_email = typeof body.notification_email === "string" ? body.notification_email.trim() : "";
    if (name.length < 2 || name.length > 100) return json({ error: "Clinic name must be 2–100 characters." }, 400);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return json({ error: "Use lowercase letters, numbers and hyphens for the clinic URL." }, 400);
    if (!["basic", "pro", "premium"].includes(plan)) return json({ error: "Invalid plan." }, 400);
    if (notification_email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(notification_email)) return json({ error: "Enter a valid notification email." }, 400);
    const response = await fetch(new URL("/rest/v1/clinics", env.SUPABASE_URL), {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": env.SUPABASE_ANON_KEY, "Authorization": "Bearer " + admin.token, "Prefer": "return=representation" },
      body: JSON.stringify({ name, slug, plan, notification_email: notification_email || null, is_active: true }),
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = JSON.stringify(data);
      if (detail.includes("clinics_slug_unique")) return json({ error: "This clinic URL is already used. Choose another." }, 409);
      if (detail.includes("duplicate key")) {
        const constraint = data.code || "unique_constraint";
        console.error("Create clinic duplicate conflict", response.status, detail.slice(0, 400));
        return json({ error: "Database duplicate conflict (" + constraint + "). This is not necessarily the clinic URL; the database ID/default may need fixing." }, 409);
      }
      console.error("Create clinic failed", response.status, detail.slice(0, 400));
      return json({ error: "Could not create clinic. Check the database policies and columns." }, 502);
    }
    return json({ success: true, clinic: Array.isArray(data) ? data[0] : data }, 201);
  } catch (error) {
    console.error("Create clinic error", error?.message);
    return json({ error: "Clinic creation service is temporarily unavailable." }, 500);
  }
}

async function handleSuperAdminAddMember(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const admin = await verifySuperAdmin(request, env);
    if (!admin) return json({ error: "Super Admin authorization required." }, 403);
    const body = await request.json();
    const clinic_id = typeof body.clinic_id === "string" ? body.clinic_id.trim() : "";
    const user_id = typeof body.user_id === "string" ? body.user_id.trim() : "";
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid.test(clinic_id) || !uuid.test(user_id)) return json({ error: "Enter a valid clinic ID and manager user ID." }, 400);
    const headers = { "Content-Type": "application/json", "apikey": env.SUPABASE_ANON_KEY, "Authorization": "Bearer " + admin.token, "Prefer": "return=minimal" };
    const response = await fetch(new URL("/rest/v1/clinic_members", env.SUPABASE_URL), {
      method: "POST", headers, body: JSON.stringify({ clinic_id, user_id }), signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      const detail = await response.text();
      if (detail.includes("duplicate key")) return json({ error: "This manager is already assigned to that clinic." }, 409);
      console.error("Add clinic manager failed", response.status, detail.slice(0, 400));
      return json({ error: "Could not assign manager. Confirm that the user exists and database permissions are correct." }, 502);
    }
    return json({ success: true, message: "Manager assigned to clinic." }, 201);
  } catch (error) {
    console.error("Assign manager error", error?.message);
    return json({ error: "Manager assignment service is temporarily unavailable." }, 500);
  }
}
