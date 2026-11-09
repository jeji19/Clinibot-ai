import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const worker = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

const env = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
  ASSETS: { fetch: async () => new Response("not found", { status: 404 }) }
};

async function invokeChat(message, defaultLanguage) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = new URL(String(url));
    if (target.pathname.endsWith("/rest/v1/clinics")) {
      return Response.json([{ id: "clinic-1", name: "North Clinic", slug: "north-clinic", is_active: true }]);
    }
    if (target.pathname.endsWith("/rest/v1/clinic_settings")) {
      return Response.json([{
        description: "A dermatology clinic",
        services: [{ name: "Skin consultation", price: 0 }],
        opening_hours: {},
        default_language: defaultLanguage
      }]);
    }
    throw new Error("Unexpected upstream request: " + target.pathname);
  };
  try {
    const response = await worker.default.fetch(new Request("https://example.test/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, clinic_slug: "north-clinic" })
    }), env);
    return { response, data: await response.json() };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("chat uses the clinic's Russian default for language-neutral messages", async () => {
  const { response, data } = await invokeChat("???", "ru");
  assert.equal(response.status, 200);
  assert.match(data.reply, /Я могу помочь/);
});

test("chat uses the clinic's English default for language-neutral messages", async () => {
  const { response, data } = await invokeChat("???", "en");
  assert.equal(response.status, 200);
  assert.match(data.reply, /I can help/);
});

test("an explicit English message overrides a Russian clinic default", async () => {
  const { response, data } = await invokeChat("hello", "ru");
  assert.equal(response.status, 200);
  assert.match(data.reply, /Welcome to \*\*North Clinic\*\*/);
});

test("an explicit Russian message overrides an English clinic default", async () => {
  const { response, data } = await invokeChat("привет", "en");
  assert.equal(response.status, 200);
  assert.match(data.reply, /Добро пожаловать в \*\*North Clinic\*\*/);
});
