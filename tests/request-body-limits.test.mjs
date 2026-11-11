import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

async function importPagesModule(path) {
  const source = await readFile(new URL("../" + path, import.meta.url), "utf8");
  return import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
}

const pagesChat = await importPagesModule("functions/api/chat.js");
const pagesAppointment = await importPagesModule("functions/api/appointment.js");
const pagesDemo = await importPagesModule("functions/api/demo-request.js");
const netlifyChat = await import(pathToFileURL(new URL("../netlify/functions/chat.mjs", import.meta.url).pathname).href);
const netlifyAppointment = await import(pathToFileURL(new URL("../netlify/functions/appointment.mjs", import.meta.url).pathname).href);
const netlifyDemo = await import(pathToFileURL(new URL("../netlify/functions/demo-request.mjs", import.meta.url).pathname).href);

const env = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role-key"
};
const adapters = [
  { name: "Cloudflare Pages chat", module: pagesChat, path: "/api/chat", body: { message: "hello", clinic_slug: "test-clinic" }, pages: true },
  { name: "Cloudflare Pages appointment", module: pagesAppointment, path: "/api/appointment", body: { patient_name: "Test Patient", patient_phone: "+10000000000", service: "Consultation", preferred_date: "2026-12-01", preferred_time: "10:00", clinic_slug: "test-clinic" }, pages: true },
  { name: "Cloudflare Pages demo request", module: pagesDemo, path: "/api/demo-request", body: { clinic_name: "Test Clinic", contact_name: "Test Owner", email: "owner@example.com" }, pages: true },
  { name: "Netlify chat", module: netlifyChat, path: "/.netlify/functions/chat", body: { message: "hello", clinic_slug: "test-clinic" } },
  { name: "Netlify appointment", module: netlifyAppointment, path: "/.netlify/functions/appointment", body: { patient_name: "Test Patient", patient_phone: "+10000000000", service: "Consultation", preferred_date: "2026-12-01", preferred_time: "10:00", clinic_slug: "test-clinic" } },
  { name: "Netlify demo request", module: netlifyDemo, path: "/.netlify/functions/demo-request", body: { clinic_name: "Test Clinic", contact_name: "Test Owner", email: "owner@example.com" } }
];

async function withNetlifyEnv(callback) {
  const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "RESEND_TO_EMAIL", "GEMINI_API_KEY", "CLOUDRU_API_KEY"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.SUPABASE_URL = env.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  for (const key of keys) if (!["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].includes(key)) delete process.env[key];
  try { return await callback(); }
  finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

async function invoke(adapter, request) {
  if (adapter.pages) return adapter.module.onRequestPost({ request, env });
  return adapter.module.default(request);
}

for (const adapter of adapters) {
  test(adapter.name + " rejects JSON bodies larger than 64 KiB before upstream access", async () => {
    const payload = { ...adapter.body, padding: "x".repeat(70 * 1024) };
    const request = new Request("https://example.test" + adapter.path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const originalFetch = globalThis.fetch;
    let upstreamCalls = 0;
    globalThis.fetch = async () => {
      upstreamCalls++;
      throw new Error("Oversized request must be rejected before any upstream call");
    };
    try {
      const run = () => invoke(adapter, request);
      const response = adapter.pages ? await run() : await withNetlifyEnv(run);
      assert.equal(response.status, 400);
      assert.equal(upstreamCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

test("Cloudflare Pages and Netlify reject oversized declared Content-Length before reading JSON", async () => {
  for (const adapter of [adapters[0], adapters[3]]) {
    const request = new Request("https://example.test" + adapter.path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": String(70 * 1024) },
      body: JSON.stringify(adapter.body)
    });
    const originalFetch = globalThis.fetch;
    let upstreamCalls = 0;
    globalThis.fetch = async () => {
      upstreamCalls++;
      throw new Error("Declared oversized request must be rejected before upstream access");
    };
    try {
      const run = () => invoke(adapter, request);
      const response = adapter.pages ? await run() : await withNetlifyEnv(run);
      assert.equal(response.status, 400);
      assert.equal(upstreamCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});
