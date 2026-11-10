import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/diagnose-cloudflare-logs.yml", "utf8");
const deployment = readFileSync("DEPLOYMENT.md", "utf8");

test("Cloudflare diagnostics run on workflow changes and can be manually dispatched", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /push:\s*\n\s*branches: \[main\]/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /diagnostics\/latest\.json/);
  assert.match(workflow, /clinibot-ai1/);
  assert.match(workflow, /\$metadata\.trigger/);
  assert.match(workflow, /\/api\/chat/);
  assert.match(workflow, /workers\/observability\/telemetry\/query/);
  assert.match(workflow, /secrets\.CLOUDFLARE_DIAGNOSTICS_TOKEN/);
  assert.match(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
});

test("Cloudflare diagnostics limit output to sanitized categories", () => {
  assert.match(workflow, /cloudru_upstream_error/);
  assert.match(workflow, /gemini_upstream_error/);
  assert.match(workflow, /chat_handler_error/);
  assert.match(workflow, /Gemini error/);
  assert.match(workflow, /Total chat events reported by Cloudflare/);
  assert.doesNotMatch(workflow, /\.message\s*:\s*\(\.\[\s*"\$metadata"\s*\]\.message/);
  assert.doesNotMatch(workflow, /echo\s+.*CF_API_TOKEN/);
  assert.match(workflow, /Raw messages, API keys, patient data, and request payloads are intentionally withheld/);
});

test("deployment documentation explains the exact observability permission caveat", () => {
  assert.match(deployment, /Workers Observability Write/);
  assert.match(deployment, /Diagnose CliniBot AI Worker Logs/);
  assert.match(deployment, /manual-only/);
});
