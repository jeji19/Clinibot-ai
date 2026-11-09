import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../.github/workflows/deploy-cloudflare.yml", import.meta.url),
  "utf8",
);

test("production deployment requires explicit confirmation and main branch", () => {
  assert.match(
    workflow,
    /if: \$\{\{ inputs\.confirm_production == true && github\.ref == 'refs\/heads\/main' \}\}/,
  );
  assert.match(workflow, /confirm_production:[\s\S]*default: false/);
  assert.match(workflow, /uses: actions\/checkout@v6\n\s+with:\n\s+ref: main/);
});

test("production deployment validates Worker target and Cloudflare credentials", () => {
  assert.match(workflow, /configured_name=.*wrangler\.jsonc/);
  assert.match(workflow, /WORKER_NAME.*configured_name/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID/);
  assert.match(workflow, /\[\[ ! "\$CLOUDFLARE_ACCOUNT_ID" =~ \^\[a-fA-F0-9\]\{32\}\$ \]\]/);
});

test("deployment performs public smoke tests and rejects unpublished services", () => {
  assert.match(workflow, /Smoke-test public clinic info and chat/);
  assert.match(workflow, /api\/public\/clinic-info/);
  assert.match(workflow, /api\/chat/);
  assert.match(workflow, /Verify unpublished services cannot be booked/);
  assert.match(workflow, /\[\[ "\$status" != "400" \]\]/);
});
