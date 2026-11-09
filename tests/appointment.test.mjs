import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const pagesSource = await readFile(new URL("../functions/api/appointment.js", import.meta.url), "utf8");
const pagesModule = await import("data:text/javascript;base64," + Buffer.from(pagesSource).toString("base64"));
const netlifyModule = await import(pathToFileURL(new URL("../netlify/functions/appointment.mjs", import.meta.url).pathname).href);

const validBody = {
  clinic_slug: "north-clinic",
  patient_name: "Alex Smith",
  patient_phone: "+1 555 0100",
  service: "Laser consultation",
  preferred_date: "2030-01-15",
  preferred_time: "14:30",
  language: "en",
  website: ""
};
const env = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role"
};

async function withMockFetch(mock, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try { await run(); } finally { globalThis.fetch = originalFetch; }
}

async function invokePages(body, config = env, method = "POST") {
  return pagesModule.onRequestPost({
    request: new Request("https://example.test/api/appointment", {
      method,
      headers: { "Content-Type": "application/json" },
      ...(method === "GET" ? {} : { body: JSON.stringify(body) })
    }),
    env: config
  });
}

async function invokeNetlify(body, config = env, method = "POST") {
  const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "RESEND_TO_EMAIL"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) {
    if (config[key] === undefined) delete process.env[key];
    else process.env[key] = config[key];
  }
  try {
    return await netlifyModule.default(new Request("https://example.test/.netlify/functions/appointment", {
      method,
      headers: { "Content-Type": "application/json" },
      ...(method === "GET" ? {} : { body: JSON.stringify(body) })
    }));
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

const adapters = [["Cloudflare Pages", invokePages], ["Netlify", invokeNetlify]];

for (const [label, invoke] of adapters) {
  test(`${label}: requires server-side Supabase configuration`, async () => {
    const response = await invoke(validBody, {});
    assert.equal(response.status, 503);
  });

  test(`${label}: rejects malformed booking fields before database access`, async () => {
    await withMockFetch(async () => { throw new Error("database must not be called"); }, async () => {
      const response = await invoke({ ...validBody, preferred_time: "25:90" });
      assert.equal(response.status, 400);
    });
  });

  test(`${label}: rejects invalid clinic slugs before database access`, async () => {
    await withMockFetch(async () => { throw new Error("database must not be called"); }, async () => {
      const response = await invoke({ ...validBody, clinic_slug: "../other-clinic" });
      assert.equal(response.status, 400);
    });
  });

  test(`${label}: honeypot submissions do not write to the database`, async () => {
    await withMockFetch(async () => { throw new Error("fetch must not be called"); }, async () => {
      const response = await invoke({ ...validBody, website: "automated-spam" });
      assert.equal(response.status, 201);
      assert.equal((await response.json()).success, true);
    });
  });

  test(`${label}: saves only a service published by the resolved active clinic`, async () => {
    let insert;
    let calls = 0;
    await withMockFetch(async (url, options = {}) => {
      calls++;
      const target = new URL(String(url));
      if (target.pathname.endsWith("/rest/v1/clinics")) {
        assert.equal(target.searchParams.get("slug"), "eq.north-clinic");
        assert.equal(target.searchParams.get("is_active"), "eq.true");
        return Response.json([{ id: "clinic-1", name: "North Clinic", slug: "north-clinic", is_active: true }]);
      }
      if (target.pathname.endsWith("/rest/v1/clinic_settings")) {
        return Response.json([{ services: [{ name: "Laser consultation", price: 50 }] }]);
      }
      if (target.pathname.endsWith("/rest/v1/appointment_requests")) {
        insert = JSON.parse(options.body);
        assert.equal(options.method, "POST");
        assert.match(options.headers.Authorization, /^Bearer test-service-role$/);
        return new Response(null, { status: 201 });
      }
      throw new Error("Unexpected request: " + target.pathname);
    }, async () => {
      const response = await invoke(validBody);
      assert.equal(response.status, 201);
      assert.equal((await response.json()).success, true);
    });
    assert.equal(calls, 3);
    assert.equal(insert.clinic_id, "clinic-1");
    assert.equal(insert.patient_name, validBody.patient_name);
    assert.equal(insert.patient_phone, validBody.patient_phone);
    assert.equal(insert.service, validBody.service);
    assert.equal(insert.status, "new");
    assert.equal(insert.language, "en");
  });

  test(`${label}: refuses services not published by the clinic`, async () => {
    let insertAttempted = false;
    await withMockFetch(async url => {
      const target = new URL(String(url));
      if (target.pathname.endsWith("/rest/v1/clinics")) {
        return Response.json([{ id: "clinic-1", name: "North Clinic", is_active: true }]);
      }
      if (target.pathname.endsWith("/rest/v1/clinic_settings")) {
        return Response.json([{ services: [{ name: "Skin consultation", price: 0 }] }]);
      }
      if (target.pathname.endsWith("/rest/v1/appointment_requests")) insertAttempted = true;
      throw new Error("Unexpected request: " + target.pathname);
    }, async () => {
      const response = await invoke(validBody);
      assert.equal(response.status, 400);
    });
    assert.equal(insertAttempted, false);
  });

  test(`${label}: refuses inactive or unknown clinics`, async () => {
    await withMockFetch(async url => {
      assert.match(String(url), /\/rest\/v1\/clinics/);
      return Response.json([]);
    }, async () => {
      const response = await invoke(validBody);
      assert.equal(response.status, 404);
    });
  });

  test(`${label}: does not report success when the database insert fails`, async () => {
    await withMockFetch(async url => {
      const target = new URL(String(url));
      if (target.pathname.endsWith("/rest/v1/clinics")) {
        return Response.json([{ id: "clinic-1", name: "North Clinic", is_active: true }]);
      }
      if (target.pathname.endsWith("/rest/v1/clinic_settings")) {
        return Response.json([{ services: [{ name: "Laser consultation", price: 50 }] }]);
      }
      if (target.pathname.endsWith("/rest/v1/appointment_requests")) {
        return new Response(JSON.stringify({ code: "DB_ERROR" }), { status: 500 });
      }
      throw new Error("Unexpected request: " + target.pathname);
    }, async () => {
      const response = await invoke(validBody);
      assert.equal(response.status, 502);
    });
  });

  test(`${label}: keeps a saved booking successful if email notification fails`, async () => {
    await withMockFetch(async url => {
      if (String(url).includes("api.resend.com")) return new Response("mail unavailable", { status: 503 });
      const target = new URL(String(url));
      if (target.pathname.endsWith("/rest/v1/clinics")) {
        return Response.json([{ id: "clinic-1", name: "North Clinic", is_active: true }]);
      }
      if (target.pathname.endsWith("/rest/v1/clinic_settings")) {
        return Response.json([{ services: [{ name: "Laser consultation", price: 50 }] }]);
      }
      if (target.pathname.endsWith("/rest/v1/appointment_requests")) return new Response(null, { status: 201 });
      throw new Error("Unexpected request: " + target.pathname);
    }, async () => {
      const response = await invoke(validBody, {
        ...env,
        RESEND_API_KEY: "test-resend-key",
        RESEND_TO_EMAIL: "ops@example.com"
      });
      assert.equal(response.status, 201);
    });
  });
}
