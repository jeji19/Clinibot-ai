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
| `GEMINI_API_KEY` | Free-form AI chat replies | Optional; FAQ and safety responses work without it |
| `RESEND_API_KEY` | Email notifications | Optional; requests are stored even if email delivery fails |
| `RESEND_TO_EMAIL` | Email notification destination | The current Worker config defaults this to the platform inbox |

## Database prerequisites

The application expects the Supabase tables and columns used by the API, including:

- `clinics`
- `clinic_settings`
- `clinic_members`
- `super_admins`
- `appointment_requests`
- `demo_requests`

The repository contains the `demo_requests` table migration plus project-specific hardening migrations for least-privilege table grants, default grants for tables created by `postgres`, optimized RLS policies, and the clinic-members lookup index. The full bootstrap schema and every original RLS policy are not yet represented as a clean, from-scratch migration set. The hardening migrations assume the existing tables and named baseline policies are already present; do not use this migration folder alone to provision a brand-new project.

The connected `clinibot-ai` project was audited and these hardening migrations were applied there. Anonymous (`anon`) has no direct table privileges on the six application tables. Authenticated access is limited to the operations needed by the Worker manager/Super Admin APIs; `demo_requests` is service-role-only. RLS remains enabled on all six tables. The application uses service-role credentials only in server-side functions. Manager access is scoped to clinic membership, and Super Admin actions require a verified user listed in `super_admins`.

Default privileges for future public tables created by the `postgres` role were also tightened. The existing default privileges for `supabase_admin` could not be changed through the connected database role and remain a separate follow-up item.

## Deployment target warning

The tracked `wrangler.jsonc` currently names the Worker `clinibot-ai`, while the previously supplied live hostname is `clinibot-ai1.albizrahemran.workers.dev`. Confirm which Worker is the intended production target in Cloudflare before running a deployment command. Do not change the configured Worker name based on the hostname alone.

## Supabase RLS audit

A read-only metadata audit is available at `supabase/audits/20261109_rls_audit.sql`. Run it in the Supabase SQL Editor using a project owner/admin role. It reports whether the six application tables exist, whether RLS is enabled/forced, the policies attached to them (including their `USING` and `WITH CHECK` expressions), and explicit grants for `anon`, `authenticated`, and `service_role`.

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
2. English and Russian chat responses work, including clinic FAQ and medical-safety fallbacks.
3. A published service can be selected; an unpublished service is rejected by the server.
4. Appointment date and time validation works; a request is stored with the correct clinic ID.
5. The landing-page demo form stores a lead and sends a notification when email is configured.
6. The manager can see and update only that clinic's requests.
7. A manager assigned to another clinic cannot read or update the first clinic's requests.
8. Super Admin access is denied to ordinary manager accounts.
9. Demo leads are stored and visible only through the Super Admin flow.
10. Review Worker logs and Supabase logs for failed requests and RLS denials.

## Automated checks and current verification limits

A GitHub Actions workflow at `.github/workflows/validate.yml` runs dependency-free JavaScript module syntax checks, verifies public API adapter wiring, exercises demo-request endpoint behavior with mocked database/email services, and checks baseline security safeguards. The security tests assert that manager endpoints authenticate users and scope clinic data to membership-derived clinic IDs, Super Admin routes verify the allowlist before privileged operations, public pages contain no server secrets, dashboard pages avoid known unsafe HTML sinks, and the tracked demo-request migration enables RLS without direct client policies.

These automated checks validate source-level safeguards and mocked endpoint behavior, including the least-privilege grant migrations and server-only appointment writes. They do not test browser behavior, authenticated requests using real manager/Super Admin JWTs, email delivery, or production deployment. The connected Supabase project has been inspected directly and its current RLS/grant metadata verified; a real login-based manager/Super Admin end-to-end test is still required.

A live Cloudflare/Supabase end-to-end verification has not yet been completed, so do not treat a GitHub commit or a passing CI workflow as proof of production deployment.
