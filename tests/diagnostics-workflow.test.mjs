import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/diagnose-cloudflare-logs.yml", "utf8");
const deployment = readFileSync("DEPLOYMENT.md", "utf8");

test("Cloudflare diagnostics are manual-only and read logs from the intended Worker", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*(push|pull_request|schedule):/m);
  assert.match(workflow, /clinibot-ai1/);
  assert.match(workflow, /workers\/observability\/telemetry\/query/);
  assert.match(workflow, /secrets\.CLOUDFLARE_DIAGNOSTICS_TOKEN/);
  assert.match(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
});

test("Cloudflare diagnostics limit output to sanitized categories", () => {
  assert.match(workflow, /notification_skipped_missing_configuration/);
  assert.match(workflow, /resend_request_accepted/);
  assert.match(workflow, /resend_request_failed/);
  assert.match(workflow, /resend_runtime_error/);
  assert.doesNotMatch(workflow, /\.message\s*:\s*\(\.\[\s*"\$metadata"\s*\]\.message/);
  assert.doesNotMatch(workflow, /echo\s+.*CF_API_TOKEN/);
  assert.match(workflow, /Raw messages, patient data, email addresses, phone numbers, and request payloads are intentionally withheld/);
});

test("deployment documentation explains the exact observability permission caveat", () => {
  assert.match(deployment, /Workers Observability Write/);
  assert.match(deployment, /Diagnose CliniBot AI Worker Logs/);
  assert.match(deployment, /manual-only/);
});
