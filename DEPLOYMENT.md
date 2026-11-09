# CliniBot AI deployment checklist

## Deployment adapters and feature coverage

The repository contains three deployment adapters:

- **Cloudflare Worker:** `src/index.js` serves the public assets and implements public APIs, clinic-manager APIs, and Super Admin APIs.
- **Cloudflare Pages Functions:** `functions/api/` implements public chat, public clinic information, appointment submission, and demo-lead submission.
- **Netlify Functions:** `netlify/functions/` implements public chat, public clinic information, appointment submission, and demo-lead submission.

**Important:** The Pages and Netlify adapters do not currently implement the clinic-manager or Super Admin API routes used by `public/admin.html`, `public/settings.html`, and `public/superadmin.html`. Those management screens therefore require the Cloudflare Worker deployment as currently implemented. Do not advertise Pages or Netlify as full-featured alternatives until their management endpoints have been ported and tested.

The public booking page selects the Netlify endpoints when it is served from a `.netlify.app` hostname; otherwise it uses same-origin `/api/*` routes. The landing-page demo form posts to `/api/demo-request`: Cloudflare Worker and Pages expose that route directly, while Netlify rewrites it to `/.netlify/functions/demo-request` in `netlify.toml`. Netlify publishes only the `public/` directory so repository source and deployment files are not part of the static site.

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

The repository currently contains a tracked SQL migration for `demo_requests`. The other schema and Row Level Security policies are not fully represented by tracked migrations here. Verify them in the target Supabase project before production use; do not assume that successful source-code checks prove RLS is configured correctly.

The application uses the service-role key only in server-side functions. Manager access is scoped in the Worker API to the manager's clinic membership. Super Admin actions require a verified user listed in `super_admins`. Confirm the actual Supabase RLS policies independently.

## Deployment target warning

The tracked `wrangler.jsonc` currently names the Worker `clinibot-ai`, while the previously supplied live hostname is `clinibot-ai1.albizrahemran.workers.dev`. Confirm which Worker is the intended production target in Cloudflare before running a deployment command. Do not change the configured Worker name based on the hostname alone.

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

A GitHub Actions workflow at `.github/workflows/validate.yml` runs dependency-free JavaScript module syntax checks on pushes and pull requests to `main`. This is a syntax check only; it does not test browser behavior, Supabase permissions, email delivery, or production deployment.

A live Cloudflare/Supabase end-to-end verification has not yet been completed, so do not treat a GitHub commit or a passing syntax workflow as proof of production deployment.
