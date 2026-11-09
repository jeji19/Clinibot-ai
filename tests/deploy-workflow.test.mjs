import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../.github/workflows/deploy-cloudflare.yml", import.meta.url),
  "utf8",
);

test("production deployment requires explicit confirmation and main branch", () => {
  assert.ok(workflow.includes("if: ${{ inputs.confirm_production == true && github.ref == 'refs/heads/main' }}"));
  assert.ok(workflow.includes("default: false"));
  assert.ok(workflow.includes("uses: actions/checkout@v6\n        with:\n          ref: main"));
});

test("production deployment validates Worker target and Cloudflare credentials", () => {
  assert.ok(workflow.includes("configured_name="));
  assert.ok(workflow.includes("wrangler.jsonc"));
  assert.ok(workflow.includes('if [[ "$WORKER_NAME" != "$configured_name" ]]'));
  assert.ok(workflow.includes("CLOUDFLARE_API_TOKEN"));
  assert.ok(workflow.includes("CLOUDFLARE_ACCOUNT_ID"));
  assert.ok(workflow.includes('[[ ! "$CLOUDFLARE_ACCOUNT_ID" =~ ^[a-fA-F0-9]{32}$ ]]'));
});

test("deployment performs public smoke tests and rejects unpublished services", () => {
  assert.ok(workflow.includes("Smoke-test public clinic info and chat"));
  assert.ok(workflow.includes("/api/public/clinic-info"));
  assert.ok(workflow.includes("/api/chat"));
  assert.ok(workflow.includes("Verify unpublished services cannot be booked"));
  assert.ok(workflow.includes('[[ "$status" != "400" ]]'));
});
