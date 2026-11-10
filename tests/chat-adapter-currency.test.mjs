import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const pagesSource = await readFile(new URL("../functions/api/chat.js", import.meta.url), "utf8");
const pagesModule = await import("data:text/javascript;base64," + Buffer.from(pagesSource).toString("base64"));
const netlifyModule = await import(pathToFileURL(new URL("../netlify/functions/chat.mjs", import.meta.url).pathname).href);

const config = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role"
};

async function withMockFetch(run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = new URL(String(url));
    if (target.pathname.endsWith("/rest/v1/clinics")) {
      assert.equal(target.searchParams.get("slug"), "eq.north-clinic");
      return Response.json([{ id: "clinic-1", name: "North Clinic", is_active: true }]);
    }
    if (target.pathname.endsWith("/rest/v1/clinic_settings")) {
      assert.equal(target.searchParams.get("select"), "description,services,opening_hours,default_language,currency_code");
      return Response.json([{
        description: "A dermatology clinic",
        services: [{ name: "Laser consultation", price: 50 }],
        opening_hours: {},
        default_language: "en",
        currency_code: "USD"
      }]);
    }
    throw new Error("Unexpected upstream request: " + target.pathname);
  };
  try { await run(); } finally { globalThis.fetch = originalFetch; }
}

async function invokePages() {
  return pagesModule.onRequestPost({
    request: new Request("https://example.test/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "What services and prices do you offer?", clinic_slug: "north-clinic" })
    }),
    env: config
  });
}

async function invokeNetlify() {
  const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) process.env[key] = config[key];
  try {
    return await netlifyModule.default(new Request("https://example.test/.netlify/functions/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "What services and prices do you offer?", clinic_slug: "north-clinic" })
    }));
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

for (const [label, invoke] of [["Cloudflare Pages", invokePages], ["Netlify", invokeNetlify]]) {
  test(`${label}: formats clinic service prices using the clinic currency`, async () => {
    await withMockFetch(async () => {
      const response = await invoke();
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.match(data.reply, /\\$50\\.00/);
    });
  });
}
