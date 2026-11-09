import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const pagesSource = await readFile(new URL("../functions/api/demo-request.js", import.meta.url), "utf8");
const pagesModule = await import("data:text/javascript;base64," + Buffer.from(pagesSource).toString("base64"));
const netlifyModule = await import(pathToFileURL(new URL("../netlify/functions/demo-request.mjs", import.meta.url).pathname).href);

const validBody = {
  clinic_name: "North Clinic",
  contact_name: "Alex Smith",
  email: "alex@example.com",
  phone: "+1 555 0100",
  specialty: "Dermatology",
  website: ""
};

async function withMockFetch(mock, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try { await run(); } finally { globalThis.fetch = originalFetch; }
}

async function invokePages(body, env = {}) {
  return pagesModule.onRequestPost({
    request: new Request("https://example.test/api/demo-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }),
    env
  });
}

async function invokeNetlify(body, env = {}) {
  const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "RESEND_TO_EMAIL"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    return await netlifyModule.default(new Request("https://example.test/.netlify/functions/demo-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }));
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

const adapters = [
  ["Cloudflare Pages", invokePages],
  ["Netlify", invokeNetlify]
];

for (const [label, invoke] of adapters) {
  test(`${label}: rejects requests when storage configuration is missing`, async () => {
    const response = await invoke(validBody);
    assert.equal(response.status, 503);
  });

  test(`${label}: validates required clinic and contact fields`, async () => {
    const response = await invoke({ ...validBody, clinic_name: "x" }, {
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key"
    });
    assert.equal(response.status, 400);
  });

  test(`${label}: honeypot submissions are accepted without database writes`, async () => {
    await withMockFetch(async () => { throw new Error("fetch should not be called"); }, async () => {
      const response = await invoke({ ...validBody, website: "spam" }, {
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "test-key"
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { success: true });
    });
  });

  test(`${label}: saves valid demo leads with the expected database fields`, async () => {
    let saved;
    await withMockFetch(async (url, options) => {
      assert.match(String(url), /\/rest\/v1\/demo_requests$/);
      saved = JSON.parse(options.body);
      return new Response(null, { status: 201 });
    }, async () => {
      const response = await invoke(validBody, {
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "test-key"
      });
      assert.equal(response.status, 201);
      assert.equal(saved.clinic_name, validBody.clinic_name);
      assert.equal(saved.contact_name, validBody.contact_name);
      assert.equal(saved.email, validBody.email);
      assert.equal(saved.status, "new");
    });
  });

  test(`${label}: reports database failures instead of false success`, async () => {
    await withMockFetch(async () => new Response("database unavailable", { status: 500 }), async () => {
      const response = await invoke(validBody, {
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "test-key"
      });
      assert.equal(response.status, 502);
    });
  });

  test(`${label}: keeps a saved lead successful when email notification fails`, async () => {
    let calls = 0;
    await withMockFetch(async (url) => {
      calls++;
      if (String(url).includes("api.resend.com")) return new Response("mail unavailable", { status: 503 });
      return new Response(null, { status: 201 });
    }, async () => {
      const response = await invoke(validBody, {
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "test-key",
        RESEND_API_KEY: "test-resend-key",
        RESEND_TO_EMAIL: "ops@example.com"
      });
      assert.equal(response.status, 201);
      assert.equal(calls, 2);
    });
  });
}
