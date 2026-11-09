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

test("Supabase RLS audit is read-only and covers all application tables", async () => {
  const audit = await read("supabase/audits/20261109_rls_audit.sql");
  for (const table of ["clinics", "clinic_settings", "clinic_members", "super_admins", "appointment_requests", "demo_requests"]) {
    assert.ok(audit.includes(`'${table}'`), `RLS audit must include ${table}`);
  }
  assert.match(audit, /from\s+pg_policies/i);
  assert.match(audit, /information_schema\.role_table_grants/i);
  assert.doesNotMatch(audit, /\b(?:alter|create|drop|insert|update|delete|truncate|grant|revoke)\s+(?:table|policy|index|into|set|from|on|all|select|public)/i);
});


test("Supabase public table grants follow the least-privilege application access model", async () => {
  const grants = await read("supabase/migrations/20261109065207_tighten_public_table_grants.sql");
  const defaults = await read("supabase/migrations/20261109065210_revoke_default_public_grants.sql");
  assert.match(grants, /revoke\s+all\s+privileges[\s\S]*?from\s+anon,\s*authenticated/i);
  assert.match(grants, /grant\s+select,\s*insert,\s*update\s+on\s+table\s+public\.clinics\s+to\s+authenticated/i);
  assert.match(grants, /grant\s+select,\s*insert,\s*update\s+on\s+table\s+public\.clinic_settings\s+to\s+authenticated/i);
  assert.match(grants, /grant\s+select,\s*insert,\s*delete\s+on\s+table\s+public\.clinic_members\s+to\s+authenticated/i);
  assert.match(grants, /grant\s+select\s+on\s+table\s+public\.super_admins\s+to\s+authenticated/i);
  assert.match(grants, /grant\s+select,\s*update\s+on\s+table\s+public\.appointment_requests\s+to\s+authenticated/i);
  assert.doesNotMatch(grants, /grant\s+[^;]*\s+on\s+table\s+public\.demo_requests\s+to\s+(?:anon|authenticated)/i);
  assert.match(defaults, /alter\s+default\s+privileges\s+for\s+role\s+postgres[\s\S]*?revoke\s+all\s+on\s+tables\s+from\s+anon,\s*authenticated/i);

  const worker = await read("src/index.js");
  const appointment = functionSource(worker, "handleAppointment");
  assert.match(appointment, /SUPABASE_SERVICE_ROLE_KEY/);
  const demoLead = functionSource(worker, "handleDemoRequest");
  assert.match(demoLead, /SUPABASE_SERVICE_ROLE_KEY/);
});


test("Supabase RLS policies use cached auth lookups and a membership lookup index", async () => {
  const policies = await read("supabase/migrations/20261109065306_optimize_rls_policies_and_membership_index.sql");
  const superAdmin = await read("supabase/migrations/20261109065312_optimize_super_admin_clinic_policies.sql");
  assert.match(policies, /create\s+policy\s+"Managers and super admins can view clinics"/i);
  assert.match(policies, /create\s+policy\s+"Managers and super admins can view clinic members"/i);
  assert.match(policies, /create\s+policy\s+"Managers and super admins can view appointments"/i);
  assert.match(policies, /\(select\s+auth\.uid\(\)\)/i);
  assert.match(policies, /create\s+index\s+if\s+not\s+exists\s+clinic_members_user_id_idx/i);
  assert.match(superAdmin, /\(select\s+auth\.uid\(\)\)/i);
  assert.doesNotMatch(policies + superAdmin, /\bauth\.uid\(\)\s*=/i);
});


test("public appointment inserts are server-only, not anonymous Data API writes", async () => {
  const removal = await read("supabase/migrations/20261109065408_remove_unused_anon_appointment_policy.sql");
  assert.match(removal, /drop\s+policy\s+if\s+exists\s+"Allow public appointment requests"/i);
  const worker = await read("src/index.js");
  assert.match(functionSource(worker, "handleAppointment"), /SUPABASE_SERVICE_ROLE_KEY/);
  const pages = await read("functions/api/appointment.js");
  const netlify = await read("netlify/functions/appointment.mjs");
  assert.match(pages, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(netlify, /SUPABASE_SERVICE_ROLE_KEY/);
});


test("manager dashboard clears expired sessions for both reads and status updates", async () => {
  const dashboard = await read("public/admin.html");
  assert.match(dashboard, /function handleSessionError\(err\)/);
  assert.match(dashboard, /response\.status===401\|\|response\.status===403/);
  assert.match(dashboard, /response\.status===409&&\/clinic manager\|more than one clinic\/i\.test/);
  assert.match(dashboard, /message\.includes\('sign in'\)/);
  assert.match(dashboard, /catch\(err\)\{tableStatus\.textContent=err\.message;handleSessionError\(err\)\}/);
  assert.match(dashboard, /let currentStatus=item\.status\|\|'new';select\.value=currentStatus;/);
  assert.match(dashboard, /select\.value=currentStatus;handleSessionError\(err\)/);
  assert.match(dashboard, /sessionStorage\.removeItem\('clinibot_admin_token'\)/);
});


test("Super Admin dashboard clears expired or revoked authorization from every protected action", async () => {
  const dashboard = await read("public/superadmin.html");
  assert.match(dashboard, /function handleSuperAdminSessionError\(err\)/);
  assert.match(dashboard, /message\.includes\('authorization'\)/);
  assert.match(dashboard, /sessionStorage\.removeItem\('clinibot_admin_token'\)/);
  assert.ok((dashboard.match(/handleSuperAdminSessionError\(err\)/g) || []).length >= 7, "all protected dashboard actions should clear revoked sessions");
});


test("clinic settings page clears expired or revoked manager sessions", async () => {
  const page = await read("public/settings.html");
  assert.match(page, /response.status===401||response.status===403/);
  assert.match(page, /response.status===409&&\/clinic manager\|more than one clinic\/i\.test/);
  assert.ok(page.includes("sessionStorage.removeItem('clinibot_admin_token')"));
  assert.ok(page.includes("location.href='/admin.html'"));
});


test("database enforces one clinic membership per manager account", async () => {
  const migration = await read("supabase/migrations/20261109100000_enforce_single_clinic_manager.sql");
  assert.match(migration, /create\s+unique\s+index\s+if\s+not\s+exists\s+clinic_members_one_clinic_per_user_idx/i);
  assert.match(migration, /on\s+public\.clinic_members\s*\(user_id\)/i);
  const cleanup = await read("supabase/migrations/20261109100026_remove_redundant_manager_membership_index.sql");
  assert.match(cleanup, /drop\s+index\s+if\s+exists\s+public\.clinic_members_user_id_idx/i);
});


test("public-facing language options are limited to English and Russian", async () => {
  const landing = await read("public/landing.html");
  const clinic = await read("public/index.html");
  assert.match(landing, /<option value="en">EN<\/option>/);
  assert.match(landing, /<option value="ru">RU<\/option>/);
  assert.doesNotMatch(landing, /\bar\s*:\s*\{/);
  assert.doesNotMatch(landing, /<option value="ar">/);
  const mainCopyStart = landing.indexOf("const translations={");
  const mainCopyEnd = landing.indexOf("Object.assign(translations.ru", mainCopyStart);
  const mainCopy = landing.slice(mainCopyStart, mainCopyEnd);
  assert.ok(mainCopy.includes("ru:{"));
  assert.doesNotMatch(mainCopy, /\b(?:ar|de|fr|es)\s*:/);
  const statusCopyStart = landing.lastIndexOf("const languageCopy = {");
  const statusCopyEnd = landing.indexOf("const translateStatus", statusCopyStart);
  const statusCopy = landing.slice(statusCopyStart, statusCopyEnd);
  assert.ok(statusCopy.includes('ru:'));
  assert.doesNotMatch(statusCopy, /\b(?:ar|de|fr|es)\s*:/);
  assert.doesNotMatch(clinic, /<option value="ar">/);
});
