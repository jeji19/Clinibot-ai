# CliniBot AI deployment checklist

## Deployment adapters and feature coverage

The repository contains three deployment adapters:

- **Cloudflare Worker:** `src/index.js` serves the public assets and implements public APIs, clinic-manager APIs, and Super Admin APIs.
- **Cloudflare Pages Functions:** `functions/api/` implements public chat, public clinic information, appointment submission, and demo-lead submission.
- **Netlify Functions:** `netlify/functions/` implements public chat, public clinic information, appointment submission, and demo-lead submission.

**Important:** The Pages and Netlify adapters do not currently implement the clinic-manager or Super Admin API routes used by `public/admin.html`, `public/settings.html`, and `public/superadmin.html`. Those management screens therefore require the Cloudflare Worker deployment as currently implemented. Do not advertise Pages or Netlify as full-featured alternatives until their management endpoints have been ported and tested.

The public booking page selects direct Netlify function URLs on a `.netlify.app` hostname; otherwise it uses same-origin `/api/*` routes. Netlify rewrites `/api/chat`, `/api/appointment`, `/api/public/clinic-info`, and `/api/demo-request` to their corresponding functions, so custom domains work too. Netlify publishes only the `public/` directory so repository source and deployment files are not part of the static site.

## Required environment configuration

Set these values in the deployment platform's environment/secrets settings. Never commit credentials.

| Variable | Required for | Notes |
|---|---|---|
| `SUPABASE_URL` | Chat, public clinic info, bookings, demo leads, admin | Project URL, origin or project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Chat FAQ, public clinic info, appointment storage, demo leads | Server-side secret only; never expose to browser code |
| `SUPABASE_ANON_KEY` | Admin authentication and authenticated manager/Super Admin operations | Public project key; database RLS still matters |
| `CLOUDRU_API_KEY` | Preferred free-form AI chat provider | Optional until Cloud.ru is provisioned; when set, it takes priority over Gemini. Store only as a server-side secret. |
| `CLOUDRU_MODEL` | Cloud.ru model selection | Optional; defaults to `Qwen/Qwen3.6-35B-A3B`. |
| `GEMINI_API_KEY` | Legacy free-form AI chat fallback | Optional; used only when `CLOUDRU_API_KEY` is not configured. FAQ and safety responses work without either provider. |
| `RESEND_API_KEY` | Email notifications | Optional; requests are stored even if email delivery fails |
| `RESEND_TO_EMAIL` | Email notification destination | The current Worker config defaults this to the platform inbox |

**Current Cloudflare Worker behavior:** appointment notifications are temporarily sent to `RESEND_TO_EMAIL` for every clinic. This is an intentional owner-inbox fallback because the shared Resend testing sender `onboarding@resend.dev` is not suitable for arbitrary clinic recipients. It is not production-ready per-clinic delivery. Before onboarding real clinics, configure a domain owned by the platform, verify it in Resend, use a sender address on that domain, and restore clinic-specific routing to `clinics.notification_email`. Demo-request notifications remain routed to the platform inbox.

## Database prerequisites

The application expects the Supabase tables and columns used by the API, including:

- `clinics`
- `clinic_settings`
- `clinic_members`
- `super_admins`
- `appointment_requests`
- `demo_requests`

The repository contains a fresh-project bootstrap at `supabase/bootstrap/initial_schema.sql` (with instructions in `supabase/bootstrap/README.md`) plus chronological migrations for `demo_requests` and project-specific hardening: least-privilege table grants, default grants for tables created by `postgres`, optimized RLS policies, a unique manager-to-clinic membership constraint, and removal of a redundant lookup index. For a brand-new project, run the bootstrap SQL first, then apply every migration in filename order. The migration folder alone is not a complete bootstrap because the baseline schema/policies are intentionally kept outside migration history.

The connected `clinibot-ai` project was audited and these hardening migrations were applied there. A fresh live metadata check on 2026-11-09 confirmed all six application tables exist and have RLS enabled; the seven recorded hardening migrations are present. Supabase Security Advisor currently reports no performance findings and two security notices: leaked-password protection is disabled, and `demo_requests` has RLS enabled with no policies. The latter is intentional: the table has no direct client grants and is accessed only through verified server-side Super Admin routes. Supabase documentation states leaked-password protection is available on Pro and above; this project is currently on the Free plan, so enabling it requires a plan upgrade. This is a known launch-hardening limitation, not a reason to weaken other password requirements. Recheck these findings before launch. Anonymous (`anon`) has no direct table privileges on the six application tables. Authenticated access is limited to the operations needed by the Worker manager/Super Admin APIs; `demo_requests` is service-role-only. RLS remains enabled on all six tables. The application uses service-role credentials only in server-side functions. Manager access is scoped to clinic membership, and Super Admin actions require a verified user listed in `super_admins`. The current manager dashboard supports one clinic per manager; this is enforced by a unique index on `clinic_members.user_id`, not only by an API preflight check. The existing membership rows were audited before the index was added; no duplicate manager assignments were found.

Default privileges for future public tables created by the `postgres` role were also tightened. The existing default privileges for `supabase_admin` could not be changed through the connected database role and remain a separate follow-up item.

## Product scope and commercial readiness

The public product and demo interfaces currently support English and Russian only. The Super Admin `plan` field (Basic/Pro/Premium) is account metadata; automated subscription billing, payment collection, plan-based feature enforcement, and a customer self-service subscription portal are not implemented. Do not represent a clinic as paid or actively subscribed based only on the plan label. Before accepting recurring payments, implement and test a payment provider, webhook verification, subscription state synchronization, cancellation, and invoice handling.

Appointment requests are not calendar bookings: the clinic team must review each request and confirm availability. The product does not currently synchronize with Google Calendar or another scheduling system.

## Deployment target warning

The tracked `wrangler.jsonc` now names the Worker `clinibot-ai1`, matching the previously supplied `clinibot-ai1.albizrahemran.workers.dev` hostname. Cloudflare recommends a custom domain or Worker route rather than `workers.dev` for business-critical production; `workers.dev` is intended primarily for personal or hobby projects ([Cloudflare workers.dev guidance](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)). Cloudflare documents the production route format as `<worker-name>.<account-subdomain>.workers.dev` and requires the Worker name to match the Wrangler configuration for Git-connected builds ([workers.dev naming](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/), [Git integration name requirement](https://developers.cloudflare.com/workers/ci-cd/builds/)). A guarded, manual production deployment workflow is available at `.github/workflows/deploy-cloudflare.yml`. It requires an explicit `confirm_production=true`, verifies the selected name against `wrangler.jsonc`, requires the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` GitHub Actions secrets, and runs public smoke tests after deployment. It is not triggered by ordinary pushes. The production workflow successfully deployed commit `24b1d550121309ea57e2f6429d126fb58278c862` on 2026-11-09 (GitHub Actions run [42661818994](https://github.com/jeji19/Clinibot-ai/actions/runs/42661818994)). Its public clinic-info, chat, and unpublished-service rejection smoke tests all passed.

To enable the guarded workflow, add these GitHub Actions repository secrets (do not paste them into chat or commit them):
- `CLOUDFLARE_API_TOKEN`: a narrowly scoped Cloudflare API token with the **Edit Cloudflare Workers** permission for the target account.
- `CLOUDFLARE_ACCOUNT_ID`: the target Cloudflare account ID.

To deploy a later release, open GitHub Actions → **Deploy CliniBot AI Worker** → **Run workflow**, set `confirm_production` to true, and keep `worker_name` as `clinibot-ai1`. The workflow verifies the Wrangler target before deploying and then checks public clinic info, chat, and rejection of an unpublished service. A successful CI validation run alone does not deploy the Worker.

## Supabase RLS audit

A read-only metadata audit is available at `supabase/audits/20261109_rls_audit.sql`. Run it in the Supabase SQL Editor using a project owner/admin role. It reports whether the six application tables exist, whether RLS is enabled/forced, the policies attached to them (including their `USING` and `WITH CHECK` expressions), explicit grants for `anon`, `authenticated`, and `service_role`, and indexes on `clinic_members`.

The audit does not modify the database. It can be rerun to verify the applied changes. Current access model:
- Clinic managers should only read/update appointment requests belonging to a clinic they are a member of.
- Clinic managers should only read/update settings for their membership-derived clinic.
- Ordinary authenticated users must not gain Super Admin privileges; the Super Admin allowlist is stored in `super_admins`.
- Demo leads must not be directly readable by anonymous users or clinic managers.
- Public endpoints use server-side service credentials; those credentials must never be exposed to browsers.

Do not paste API keys, access tokens, patient records, or other secrets into chat. Share only the audit output with sensitive identifiers and values redacted if a policy review is needed.

## Production verification checklist

After deployment, verify with a real test clinic and test accounts:

1. Public clinic page loads and lists only active clinic services.
2. English and Russian chat responses work, including clinic FAQ, medical-safety fallbacks, and the clinic default language for language-neutral messages.
3. A published service can be selected; an unpublished service is rejected by the server.
4. Appointment date and time validation works; a request is stored with the correct clinic ID.
5. The landing-page demo form stores a lead and sends a notification when email is configured.
6. The manager can see and update only that clinic's requests.
7. A manager assigned to another clinic cannot read or update the first clinic's requests.
8. Super Admin access is denied to ordinary manager accounts.
9. Demo leads are stored and visible only through the Super Admin flow.
10. Review Worker logs and Supabase logs for failed requests and RLS denials.

## Automated checks and current verification limits

A GitHub Actions workflow at `.github/workflows/validate.yml` runs dependency-free JavaScript module syntax checks, verifies public API adapter wiring, exercises chat, booking, demo-request, clinic-info, manager, and Super Admin endpoints with mocked upstream services, and checks baseline security safeguards. A separate PostgreSQL 17 CI job provisions a clean database, runs the fresh-project bootstrap plus every migration in order, verifies RLS/grants/indexes, and exercises simulated manager-versus-Super-Admin row isolation. The security tests assert that manager endpoints authenticate users and scope clinic data to membership-derived clinic IDs, malformed chat, demo-lead, booking, and manager-status payloads are rejected, clinic settings inputs (including duplicate service names) are validated, manager sessions are cleared when access is revoked, Super Admin routes verify the allowlist before privileged operations, public pages contain no server secrets, dashboard pages avoid known unsafe HTML sinks, and database migrations enforce one clinic per manager while keeping demo leads server-only.

These automated checks validate source-level safeguards and mocked endpoint behavior, including the least-privilege grant migrations and server-only appointment writes. They do not test browser behavior or authenticated requests using real manager/Super Admin JWTs. The connected Supabase project's RLS/grant metadata has been inspected and verified. Production deployment and public smoke tests passed in run [42661818994](https://github.com/jeji19/Clinibot-ai/actions/runs/42661818994). The platform owner has also confirmed receipt of a real appointment notification email after that deployment. The platform owner manually confirmed successful login to both the Manager and Super Admin dashboards on 2026-11-09. This confirms authentication access in the browser, but does not replace a full authorization-isolation test using two distinct manager accounts. A full multi-clinic email test remains outstanding.


## Cloudflare Worker log diagnostics

A manual, read-only log-inspection workflow is available at `.github/workflows/diagnose-cloudflare-logs.yml`. It queries the Cloudflare Workers Observability Telemetry API for recent `/api/chat` invocation events from `clinibot-ai1`, classifying Gemini upstream errors by HTTP status and chat-handler errors. It defaults to the previous 48 hours and prints only sanitized categories, timestamps, and status codes; raw log messages, API keys, patient data, and request payloads are withheld. It does not deploy or change Worker settings.

Add these GitHub Actions secrets:
- `CLOUDFLARE_DIAGNOSTICS_TOKEN`: a narrowly scoped token for Workers Observability.
- `CLOUDFLARE_ACCOUNT_ID`: the account ID already used by the deployment workflow.

**Permission caveat:** Cloudflare's current API reference lists `Workers Observability Write` as the accepted permission for the telemetry query endpoint, even though this workflow only reads log results. A token with only `Workers Observability Read` may receive HTTP 403. Do not add Worker script edit, account administration, billing, DNS, or user-management permissions for this diagnostics workflow. Run GitHub Actions → **Diagnose CliniBot AI Worker Logs** → **Run workflow** and keep the default 48-hour lookback. The workflow is manual-only and is not run automatically on pushes.


## Cloud.ru AI provider (prepared, not yet activated)

The Worker, Cloudflare Pages, and Netlify chat adapters support Cloud.ru Evolution Foundation Models through its OpenAI-compatible Chat Completions endpoint. When `CLOUDRU_API_KEY` is present, it takes priority over Gemini. The default model is `Qwen/Qwen3.6-35B-A3B`; override it with `CLOUDRU_MODEL` only after confirming that the model is enabled in the Cloud.ru project.

Required Worker secret: `CLOUDRU_API_KEY`. Optional Worker variable: `CLOUDRU_MODEL=Qwen/Qwen3.6-35B-A3B`. Keep the key server-side; never place it in public assets, browser code, GitHub source, or chat messages. The provider branch has automated mocked tests, but it is not production-active until a Cloud.ru account, model access, API key, and live English/Russian response tests have been completed. Do not remove the Gemini key until the Cloud.ru provider has passed live tests. Do not send real patient data during provider validation; use synthetic demo prompts only.
