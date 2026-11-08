# CliniBot AI deployment checklist

## Supported API adapters

The repository contains three deployment adapters:

- **Cloudflare Worker:** `src/index.js` with static assets from `public/`.
- **Cloudflare Pages Functions:** `functions/api/`.
- **Netlify Functions:** `netlify/functions/`.

The public booking page selects the Netlify endpoints when it is served from a `.netlify.app` hostname; otherwise it uses the same-origin `/api/*` routes. Keep the adapters aligned when changing chat, clinic information, or appointment handling.

## Required environment configuration

Set these values in the deployment platform's environment/secrets settings. Never commit credentials.

| Variable | Required for | Notes |
|---|---|---|
| `SUPABASE_URL` | Chat, public clinic info, bookings, admin | Project URL, origin or project URL |
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

The application uses the service-role key only in server-side functions. Manager access is additionally scoped in the API to the manager's clinic membership. Super Admin actions require a verified user listed in `super_admins`.

## Deployment target warning

The tracked `wrangler.jsonc` currently names the Worker `clinibot-ai`, while the previously supplied live hostname is `clinibot-ai1.albizrahemran.workers.dev`. Confirm which Worker is the intended production target in Cloudflare before running a deployment command. Do not change the configured Worker name based on the hostname alone.

## Production verification checklist

After deployment, verify with a real test clinic and test accounts:

1. Public clinic page loads and lists only active clinic services.
2. English and Russian chat responses work, including clinic FAQ and medical-safety fallbacks.
3. A published service can be selected; an unpublished service is rejected by the server.
4. Appointment date and time validation works; a request is stored with the correct clinic ID.
5. The manager can see and update only that clinic's requests.
6. A manager assigned to another clinic cannot read or update the first clinic's requests.
7. Super Admin access is denied to ordinary manager accounts.
8. Demo leads are stored and visible only through the Super Admin flow.
9. Email delivery is checked separately from database storage.
10. Review Worker logs and Supabase logs for failed requests and RLS denials.

## Current verification limits

Static JavaScript syntax checks and source-level assertions have been run on the Worker, booking page, landing page, Cloudflare Pages adapters, and Netlify adapters. No CI checks are configured in the repository. A live Cloudflare/Supabase end-to-end verification has not yet been completed, so do not treat a GitHub commit as proof of production deployment.
