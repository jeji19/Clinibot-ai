import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const worker = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const pagesSource = await readFile(new URL("../functions/api/chat.js", import.meta.url), "utf8");
const pagesModule = await import("data:text/javascript;base64," + Buffer.from(pagesSource).toString("base64"));
const netlifyModule = await import(pathToFileURL(new URL("../netlify/functions/chat.mjs", import.meta.url).pathname).href);

async function invokePagesChat(message, defaultLanguage) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = new URL(String(url));
    if (target.pathname.endsWith("/rest/v1/clinics")) return Response.json([{ id: "clinic-1", name: "North Clinic", slug: "north-clinic", is_active: true }]);
    if (target.pathname.endsWith("/rest/v1/clinic_settings")) return Response.json([{ description: "A dermatology clinic", services: [], opening_hours: {}, default_language: defaultLanguage }]);
    throw new Error("Unexpected Pages chat upstream request: " + target.pathname);
  };
  try {
    const response = await pagesModule.onRequestPost({
      request: new Request("https://example.test/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, clinic_slug: "north-clinic" }) }),
      env: { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY }
    });
    return { response, data: await response.json() };
  } finally { globalThis.fetch = originalFetch; }
}

async function invokeNetlifyChat(message, defaultLanguage) {
  const originalFetch = globalThis.fetch;
  const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) {
    if (key === "SUPABASE_URL") process.env[key] = env.SUPABASE_URL;
    else if (key === "SUPABASE_SERVICE_ROLE_KEY") process.env[key] = env.SUPABASE_SERVICE_ROLE_KEY;
    else delete process.env[key];
  }
  globalThis.fetch = async url => {
    const target = new URL(String(url));
    if (target.pathname.endsWith("/rest/v1/clinics")) return Response.json([{ id: "clinic-1", name: "North Clinic", slug: "north-clinic", is_active: true }]);
    if (target.pathname.endsWith("/rest/v1/clinic_settings")) return Response.json([{ description: "A dermatology clinic", services: [], opening_hours: {}, default_language: defaultLanguage }]);
    throw new Error("Unexpected Netlify chat upstream request: " + target.pathname);
  };
  try {
    const response = await netlifyModule.default(new Request("https://example.test/.netlify/functions/chat", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, clinic_slug: "north-clinic" })
    }));
    return { response, data: await response.json() };
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

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


async function invokeWithoutUpstream(message) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Medical safety replies must not call external services"); };
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

test("English emergency messages receive an urgent-care response without calling external services", async () => {
  const { response, data } = await invokeWithoutUpstream("I have chest pain and cannot breathe");
  assert.equal(response.status, 200);
  assert.match(data.reply, /emergency services/i);
  assert.equal(data.handled_without_ai, true);
});

test("Russian emergency messages receive an urgent-care response without calling external services", async () => {
  const { response, data } = await invokeWithoutUpstream("У меня сильная боль в груди, не могу дышать");
  assert.equal(response.status, 200);
  assert.match(data.reply, /экстренной помощи/);
  assert.equal(data.handled_without_ai, true);
});

test("medical procedure recommendations are redirected to qualified clinic staff", async () => {
  const { response, data } = await invokeWithoutUpstream("I have acne. What procedure do you recommend for me?");
  assert.equal(response.status, 200);
  assert.match(data.reply, /qualified clinic professional/i);
  assert.equal(data.handled_without_ai, true);
});

test("appointment intent directs patients to the request form without claiming a confirmed booking", async () => {
  const { response, data } = await invokeChat("I'd like to book an appointment", "en");
  assert.equal(response.status, 200);
  assert.match(data.reply, /Request an appointment/);
  assert.match(data.reply, /confirm availability/);
  assert.equal(data.handled_without_ai, true);
});


async function invokeRawChat(raw) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Malformed chat payload must not call upstream services"); };
  try {
    const response = await worker.default.fetch(new Request("https://example.test/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw
    }), env);
    return response;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("chat rejects malformed, null, and array JSON payloads with 400", async () => {
  for (const raw of ["{", "null", "[]"]) {
    const response = await invokeRawChat(raw);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /invalid json/i);
  }
});


test("Cloudflare Pages and Netlify chat adapters reject malformed JSON payloads", async () => {
  const originalFetch = globalThis.fetch;
  const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  globalThis.fetch = async () => { throw new Error("Malformed payload must not call upstream services"); };
  try {
    for (const raw of ["{", "null", "[]"]) {
      const request = new Request("https://example.test/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: raw
      });
      const pagesResponse = await pagesModule.onRequestPost({
        request,
        env: { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY }
      });
      assert.equal(pagesResponse.status, 400);
      assert.match((await pagesResponse.json()).error, /invalid json/i);

      process.env.SUPABASE_URL = env.SUPABASE_URL;
      process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
      const netlifyResponse = await netlifyModule.default(new Request("https://example.test/.netlify/functions/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: raw
      }));
      assert.equal(netlifyResponse.status, 400);
      assert.match((await netlifyResponse.json()).error, /invalid json/i);
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});


test("zero-priced services are labeled in the patient's detected language", async () => {
  const english = await invokeChat("What services and prices do you offer?", "ru");
  assert.equal(english.response.status, 200);
  assert.match(english.data.reply, /Free/);
  assert.doesNotMatch(english.data.reply, /Бесплатно/);

  const russian = await invokeChat("Какие услуги и цены?", "en");
  assert.equal(russian.response.status, 200);
  assert.match(russian.data.reply, /Бесплатно/);
  assert.doesNotMatch(russian.data.reply, /Free/);
});


for (const [label, invoke] of [["Cloudflare Pages", invokePagesChat], ["Netlify", invokeNetlifyChat]]) {
  test(`${label}: honors clinic default language and explicit patient language`, async () => {
    const russianDefault = await invoke("???", "ru");
    assert.equal(russianDefault.response.status, 200);
    assert.match(russianDefault.data.reply, /Я могу помочь/);

    const englishDefault = await invoke("???", "en");
    assert.equal(englishDefault.response.status, 200);
    assert.match(englishDefault.data.reply, /I can help/);

    const explicitEnglish = await invoke("hello", "ru");
    assert.match(explicitEnglish.data.reply, /Welcome to/);

    const explicitRussian = await invoke("привет", "en");
    assert.match(explicitRussian.data.reply, /Добро пожаловать/);
  });
}


test("all chat deployment adapters target the current stable Gemini Flash model", async () => {
  for (const path of ["../src/index.js", "../functions/api/chat.js", "../netlify/functions/chat.mjs"]) {
    const adapter = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(adapter, /gemini-3\\.8-flash:generateContent/);
    assert.doesNotMatch(adapter, /gemini-3\\.6-flash:generateContent/);
  }
});
