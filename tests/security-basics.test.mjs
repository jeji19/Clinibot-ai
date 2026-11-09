import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("demo request table enables RLS and grants no direct client policy", async () => {
  const sql = await read("supabase/migrations/20261108_demo_requests.sql");
  assert.match(sql, /alter\s+table\s+public\.demo_requests\s+enable\s+row\s+level\s+security/i);
  assert.doesNotMatch(sql, /create\s+policy[\s\S]*?on\s+public\.demo_requests/i);
});

test("service-role credentials are not embedded in public pages", async () => {
  for (const path of ["public/index.html", "public/landing.html", "public/admin.html", "public/settings.html", "public/superadmin.html"]) {
    const html = await read(path);
    assert.doesNotMatch(html, /SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|GEMINI_API_KEY/);
  }
});

test("dashboard pages avoid known unsafe HTML injection sinks", async () => {
  for (const path of ["public/admin.html", "public/settings.html", "public/superadmin.html"]) {
    const html = await read(path);
    assert.doesNotMatch(html, /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(|eval\s*\(/);
  }
});

test("Worker applies baseline security headers to assets and JSON responses", async () => {
  const worker = await read("src/index.js");
  for (const header of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]) {
    assert.ok(worker.includes(header), `Missing security header: ${header}`);
  }
  assert.match(worker, /function secureAssetResponse/);
  assert.match(worker, /const json\s*=\s*\(data, status = 200\)/);
});


function functionSource(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `Missing function: ${name}`);
  const next = source.indexOf("\nasync function ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test("clinic manager endpoints authenticate and scope all access to the user's clinic", async () => {
  const worker = await read("src/index.js");
  const appointments = functionSource(worker, "handleAdminAppointments");
  const status = functionSource(worker, "handleAdminStatus");
  const settings = functionSource(worker, "handleAdminSettings");
  const membershipResolver = functionSource(worker, "resolveAdminClinicId");

  for (const [name, source] of [["appointments", appointments], ["status", status], ["settings", settings]]) {
    assert.ok(source.includes("authorizedAdmin(request, env)"), name + " must authenticate the manager");
    assert.ok(!source.includes("SUPABASE_SERVICE_ROLE_KEY"), name + " must not bypass row-level access with the service role");
  }

  assert.ok(appointments.includes("resolveAdminClinicId(token, env)"));
  assert.ok(status.includes("resolveAdminClinicId(token, env)"));
  for (const source of [membershipResolver, settings]) {
    assert.ok(source.includes("clinic_members"));
    assert.ok(source.includes("user_id"));
    assert.ok(source.includes("memberships.length > 1"), "ambiguous multi-clinic membership must be rejected");
  }

  assert.ok(appointments.includes('url.searchParams.set("clinic_id", "eq." + access.clinicId)'));
  assert.ok(status.includes('url.searchParams.set("clinic_id", "eq." + access.clinicId)'), "status updates must be scoped to the manager's clinic");
  assert.ok(settings.includes('settingsUrl.searchParams.set("clinic_id", "eq." + clinicId)'), "settings reads must be scoped to the manager's clinic");
  assert.ok(settings.includes("clinic_id: clinicId"), "settings writes must use the membership-derived clinic ID");
});

test("every Super Admin route verifies the Super Admin allowlist before privileged work", async () => {
  const worker = await read("src/index.js");
  const overview = functionSource(worker, "handleSuperAdminOverview");
  assert.match(overview, /\/rest\/v1\/super_admins/);
  assert.match(overview, /user_id/);

  for (const name of [
    "handleSuperAdminDemoRequests",
    "handleSuperAdminDemoRequestStatus",
    "handleSuperAdminDemoRequestDelete",
    "handleSuperAdminCreateClinic",
    "handleSuperAdminAddMember"
  ]) {
    const source = functionSource(worker, name);
    const verifyAt = source.indexOf("verifySuperAdmin(request, env)");
    assert.notEqual(verifyAt, -1, `${name} must verify Super Admin authorization`);
    const privilegedAt = source.search(/SUPABASE_SERVICE_ROLE_KEY|\/rest\/v1\/(?:clinics|clinic_members)/);
    assert.ok(privilegedAt === -1 || verifyAt < privilegedAt, `${name} must authorize before privileged database access`);
  }

  for (const name of ["handleSuperAdminDemoRequests", "handleSuperAdminDemoRequestStatus", "handleSuperAdminDemoRequestDelete"]) {
    assert.match(functionSource(worker, name), /SUPABASE_SERVICE_ROLE_KEY/);
  }
  for (const name of ["handleSuperAdminCreateClinic", "handleSuperAdminAddMember"]) {
    assert.doesNotMatch(functionSource(worker, name), /SUPABASE_SERVICE_ROLE_KEY/);
  }
});
