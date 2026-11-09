import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const pagesSource = await readFile(new URL("../functions/api/public/clinic-info.js", import.meta.url), "utf8");
const pagesModule = await import("data:text/javascript;base64," + Buffer.from(pagesSource).toString("base64"));
const workerSource = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const workerModule = await import("data:text/javascript;base64," + Buffer.from(workerSource).toString("base64"));
const netlifyModule = await import(pathToFileURL(new URL("../netlify/functions/clinic-info.mjs", import.meta.url).pathname).href);

const env = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-service-role" };

async function withMockFetch(mock, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try { await run(); } finally { globalThis.fetch = originalFetch; }
}

async function invokeWorker(config = env, method = "GET", slug = "north-clinic") {
  return workerModule.default.fetch(new Request("https://example.test/api/public/clinic-info?clinic=" + encodeURIComponent(slug), { method }), {
    ...config,
    ASSETS: { fetch: async () => new Response("not found", { status: 404 }) }
  });
}

async function invokePages(config = env, method = "GET", slug = "north-clinic") {
  return pagesModule.onRequestGet({
    request: new Request("https://example.test/api/public/clinic-info?clinic=" + encodeURIComponent(slug), { method }),
    env: config
  });
}

async function invokeNetlify(config = env, method = "GET", slug = "north-clinic") {
  const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) {
    if (config[key] === undefined) delete process.env[key];
    else process.env[key] = config[key];
  }
  try {
    return await netlifyModule.default(new Request("https://example.test/.netlify/functions/clinic-info?clinic=" + encodeURIComponent(slug), { method }));
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

const adapters = [
  ["Cloudflare Worker", invokeWorker],
  ["Cloudflare Pages", invokePages],
  ["Netlify", invokeNetlify]
];

for (const [label, invoke] of adapters) {
  test(`${label}: requires server-side clinic database configuration`, async () => {
    const response = await invoke({});
    assert.equal(response.status, 503);
  });

  test(`${label}: rejects invalid clinic slugs before database access`, async () => {
    await withMockFetch(async () => { throw new Error("database must not be called"); }, async () => {
      const response = await invoke(env, "GET", "../private");
      assert.equal(response.status, 400);
    });
  });

  test(`${label}: returns only the active clinic name and normalized public services`, async () => {
    let calls = 0;
    await withMockFetch(async url => {
      calls++;
      const target = new URL(String(url));
      if (target.pathname.endsWith("/rest/v1/clinics")) {
        assert.equal(target.searchParams.get("slug"), "eq.north-clinic");
        assert.equal(target.searchParams.get("is_active"), "eq.true");
        return Response.json([{ id: "clinic-1", name: "North Clinic", is_active: true }]);
      }
      if (target.pathname.endsWith("/rest/v1/clinic_settings")) {
        assert.equal(target.searchParams.get("clinic_id"), "eq.clinic-1");
        return Response.json([{ services: [
          { name: " Laser consultation ", price: "50" },
          { name: "Skin consultation", price: 0 },
          { name: "Unknown price", price: null },
          { name: "", price: 5 },
          null
        ] }]);
      }
      throw new Error("Unexpected request: " + target.pathname);
    }, async () => {
      const response = await invoke();
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        clinic: { name: "North Clinic" },
        services: [
          { name: "Laser consultation", price: 50 },
          { name: "Skin consultation", price: 0 },
          { name: "Unknown price", price: null }
        ]
      });
    });
    assert.equal(calls, 2);
  });

  test(`${label}: returns 404 for an inactive or unknown clinic`, async () => {
    await withMockFetch(async () => Response.json([]), async () => {
      const response = await invoke();
      assert.equal(response.status, 404);
    });
  });

  test(`${label}: does not expose clinic data when the database fails`, async () => {
    await withMockFetch(async () => new Response("database unavailable", { status: 503 }), async () => {
      const response = await invoke();
      assert.equal(response.status, 502);
    });
  });
}
