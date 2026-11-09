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
