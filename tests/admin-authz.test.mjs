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
const managerId = "11111111-1111-4111-8111-111111111111";
const clinicId = "22222222-2222-4222-8222-222222222222";

function request(path, { method = "GET", token = "valid-token", body } = {}) {
  return new Request("https://example.test" + path, {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

async function invoke(path, options, mock) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await worker.default.fetch(request(path, options), env); }
  finally { globalThis.fetch = originalFetch; }
}

function json(data, status = 200) { return Response.json(data, { status }); }

test("admin appointment API rejects missing bearer token", async () => {
  const response = await invoke("/api/admin/appointments", { token: null }, async () => {
    throw new Error("No upstream request expected");
  });
  assert.equal(response.status, 401);
});

test("admin appointment API rejects invalid Supabase sessions", async () => {
  const response = await invoke("/api/admin/appointments", {}, async url => {
    assert.match(String(url), /\/auth\/v1\/user/);
    return json({ message: "invalid token" }, 401);
  });
  assert.equal(response.status, 401);
});

test("admin appointment API denies authenticated users without clinic membership", async () => {
  let authChecks = 0;
  const response = await invoke("/api/admin/appointments", {}, async url => {
    const target = new URL(String(url));
    if (target.pathname.endsWith("/auth/v1/user")) {
      authChecks++;
      return json({ id: managerId });
    }
    if (target.pathname.endsWith("/rest/v1/clinic_members")) return json([]);
    throw new Error("Unexpected upstream call: " + target.pathname);
  });
  assert.equal(response.status, 403);
  assert.equal(authChecks, 2);
});

test("admin appointment API rejects ambiguous multi-clinic manager membership", async () => {
  const response = await invoke("/api/admin/appointments", {}, async url => {
    const target = new URL(String(url));
    if (target.pathname.endsWith("/auth/v1/user")) return json({ id: managerId });
    if (target.pathname.endsWith("/rest/v1/clinic_members")) {
      return json([{ clinic_id: clinicId }, { clinic_id: "33333333-3333-4333-8333-333333333333" }]);
    }
    throw new Error("Appointment data must not be queried for ambiguous membership");
  });
  assert.equal(response.status, 409);
});

test("admin appointment API scopes reads to the manager's assigned clinic", async () => {
  let appointmentQuery;
  let appointmentAuth;
  const response = await invoke("/api/admin/appointments", {}, async (url, options = {}) => {
    const target = new URL(String(url));
    if (target.pathname.endsWith("/auth/v1/user")) return json({ id: managerId });
    if (target.pathname.endsWith("/rest/v1/clinic_members")) return json([{ clinic_id: clinicId }]);
    if (target.pathname.endsWith("/rest/v1/appointment_requests")) {
      appointmentQuery = target.searchParams.get("clinic_id");
      appointmentAuth = options.headers.Authorization;
      return json([{ id: 7, clinic_id: clinicId, status: "new" }]);
    }
    throw new Error("Unexpected upstream call: " + target.pathname);
  });
  assert.equal(response.status, 200);
  assert.equal(appointmentQuery, "eq." + clinicId);
  assert.equal(appointmentAuth, "Bearer valid-token");
  assert.equal((await response.json()).appointments.length, 1);
});

test("admin appointment status rejects unsupported states before update", async () => {
  const response = await invoke("/api/admin/appointment-status", {
    method: "POST",
    body: { id: 1, status: "deleted" }
  }, async url => {
    const target = new URL(String(url));
    if (target.pathname.endsWith("/auth/v1/user")) return json({ id: managerId });
    if (target.pathname.endsWith("/rest/v1/clinic_members")) return json([{ clinic_id: clinicId }]);
    throw new Error("Invalid status must not reach database update");
  });
  assert.equal(response.status, 400);
});

test("admin appointment status scopes updates to the assigned clinic", async () => {
  let updateUrl;
  let updateBody;
  const response = await invoke("/api/admin/appointment-status", {
    method: "POST",
    body: { id: 17, status: "confirmed" }
  }, async (url, options = {}) => {
    const target = new URL(String(url));
    if (target.pathname.endsWith("/auth/v1/user")) return json({ id: managerId });
    if (target.pathname.endsWith("/rest/v1/clinic_members")) return json([{ clinic_id: clinicId }]);
    if (target.pathname.endsWith("/rest/v1/appointment_requests")) {
      updateUrl = target;
      updateBody = JSON.parse(options.body);
      assert.equal(options.method, "PATCH");
      return json([{ id: 17 }]);
    }
    throw new Error("Unexpected upstream call: " + target.pathname);
  });
  assert.equal(response.status, 200);
  assert.equal(updateUrl.searchParams.get("id"), "eq.17");
  assert.equal(updateUrl.searchParams.get("clinic_id"), "eq." + clinicId);
  assert.deepEqual(updateBody, { status: "confirmed" });
});

test("clinic settings rejects invalid service data without saving", async () => {
  const response = await invoke("/api/admin/settings", {
    method: "PUT",
    body: { description: "Clinic", default_language: "en", services: [{ name: "", price: -10 }], opening_hours: {} }
  }, async url => {
    const target = new URL(String(url));
    if (target.pathname.endsWith("/auth/v1/user")) return json({ id: managerId });
    if (target.pathname.endsWith("/rest/v1/clinic_members")) return json([{ clinic_id: clinicId }]);
    if (target.pathname.endsWith("/rest/v1/clinics")) return json([{ id: clinicId, name: "North Clinic", slug: "north-clinic" }]);
    throw new Error("Invalid settings must not be saved");
  });
  assert.equal(response.status, 400);
});

test("Super Admin overview rejects users not present in the super_admins allowlist", async () => {
  const response = await invoke("/api/superadmin/overview", {}, async url => {
    const target = new URL(String(url));
    if (target.pathname.endsWith("/auth/v1/user")) return json({ id: managerId });
    if (target.pathname.endsWith("/rest/v1/super_admins")) return json([]);
    throw new Error("Non-admin must not read platform-wide data");
  });
  assert.equal(response.status, 403);
});

test("Super Admin clinic creation validates input before database write", async () => {
  const response = await invoke("/api/superadmin/clinics", {
    method: "POST",
    body: { name: "X", slug: "bad slug", plan: "enterprise" }
  }, async url => {
    const target = new URL(String(url));
    if (target.pathname.endsWith("/auth/v1/user")) return json({ id: managerId });
    if (target.pathname.endsWith("/rest/v1/super_admins")) return json([{ user_id: managerId }]);
    throw new Error("Invalid clinic data must not be inserted");
  });
  assert.equal(response.status, 400);
});


test("Super Admin write endpoints reject malformed JSON with 400", async () => {
  const paths = [
    ["/api/superadmin/demo-request-status", "POST"],
    ["/api/superadmin/demo-request-delete", "POST"],
    ["/api/superadmin/clinics", "POST"],
    ["/api/superadmin/members", "POST"]
  ];
  for (const [path, method] of paths) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async url => {
      const target = new URL(String(url));
      if (target.pathname.endsWith("/auth/v1/user")) return json({ id: managerId });
      if (target.pathname.endsWith("/rest/v1/super_admins")) return json([{ user_id: managerId }]);
      throw new Error("Malformed JSON must not reach a database write");
    };
    try {
      const malformed = new Request("https://example.test" + path, {
        method, headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" }, body: "{"
      });
      const response = await worker.default.fetch(malformed, env);
      assert.equal(response.status, 400, path);
    } finally { globalThis.fetch = originalFetch; }
  }
});

test("Super Admin demo leads and write endpoints deny users outside the allowlist", async () => {
  const paths = [
    ["/api/superadmin/demo-requests", "GET"],
    ["/api/superadmin/demo-request-status", "POST"],
    ["/api/superadmin/demo-request-delete", "POST"],
    ["/api/superadmin/clinics", "POST"],
    ["/api/superadmin/members", "POST"]
  ];
  for (const [path, method] of paths) {
    const response = await invoke(path, { method, body: method === "POST" ? { id: 1, status: "closed", name: "Clinic", slug: "clinic", clinic_id: clinicId, user_id: managerId } : undefined }, async url => {
      const target = new URL(String(url));
      if (target.pathname.endsWith("/auth/v1/user")) return json({ id: managerId });
      if (target.pathname.endsWith("/rest/v1/super_admins")) return json([]);
      throw new Error("Non-admin must not reach privileged data or writes");
    });
    assert.equal(response.status, 403, path);
  }
});
