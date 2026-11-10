# CliniBot AI — sales readiness gate

This document defines what must be true before outbound sales messages promise a live clinic pilot. It separates a demo-ready product from a production-ready service.

## Current verified product scope

The repository currently implements:

- Public clinic chat and clinic information endpoints.
- English and Russian conversations, including clinic-configured default language.
- Clinic-approved FAQ, services, prices, and opening hours.
- Appointment **requests** (not confirmed bookings), stored for the relevant clinic.
- A clinic manager dashboard to review requests and update their status.
- Clinic settings for description, default language, services/prices, opening hours, and notification email.
- Appointment requests are stored for clinic staff review. The currently deployed Cloudflare Worker routes email alerts to the platform inbox; clinic-specific email delivery is blocked pending a verified Resend sending domain. The Pages/Netlify adapters use the configured clinic notification email when available.
- Super Admin workflows for creating clinics and assigning one manager per clinic.
- Medical safety responses that direct clinical questions to qualified staff and urgent cases to emergency care.

Automated validation currently covers syntax, public API adapters, demo requests, appointment requests, clinic information, chat language/safety, manager/Super Admin authorization, and clean PostgreSQL bootstrap/RLS checks.

## Do not promise these capabilities

Until implemented and tested, sales material must not claim:

- Automatic calendar synchronization or confirmed appointment booking.
- WhatsApp, Instagram, Telegram, SMS, or phone-call integration.
- Payment collection, recurring subscriptions, invoices, or automatic plan enforcement.
- Medical diagnosis, treatment recommendations, prescribing, or emergency monitoring.
- GDPR, HIPAA, or other regulatory certification/compliance.
- Guaranteed uptime, response-time SLAs, or 24/7 human support.
- That the Worker currently runs the latest GitHub commit unless deployment has been verified.

## Go/no-go gate before a paid clinic pilot

A paid pilot may be offered only after every P0 item below is completed and evidenced.

### P0 — must pass

- [x] Deploy the current Worker source to the production Worker using the guarded deployment workflow (run [42781453004](https://github.com/jeji19/Clinibot-ai/actions/runs/42781453004), Worker `clinibot-ai1`, version `2c079bfa-28fe-4fa6-b064-c20935769803`). Re-run after any subsequent Worker-source changes.
- [ ] Confirm the deployed Worker name, environment variables, Supabase connection, Cloud.ru/Gemini configuration (if generative AI answers are enabled), and Resend configuration.
- [ ] Configure a clinic-facing custom domain or production route and verify HTTPS.
- [ ] Run a real browser end-to-end test using a dedicated synthetic clinic, dedicated manager account, and entirely synthetic patient details.
- [ ] Verify clinic onboarding from start to finish: create clinic, create/assign manager, manager login, save settings, publish services, and open the public clinic link.
- [ ] Verify English and Russian FAQ answers are grounded in the clinic's saved information; unknown questions must not invent prices, services, hours, or availability.
- [ ] Verify a valid appointment request is stored against the correct clinic, appears in that clinic manager dashboard only, and triggers a notification to that clinic’s own verified email address. Current Worker email routing is platform-inbox-only, so this gate remains open.
- [ ] Verify manager A cannot see or change clinic B's records; verify manager session expiry/revocation and logout.
- [ ] Verify invalid, unpublished, and malformed appointment submissions are rejected without creating records.
- [ ] Verify medical/urgent prompts return safe escalation guidance and do not call the generative model where deterministic safety handling applies.
- [ ] Test email delivery, failure behavior, and a manual fallback process for missed notifications.
- [ ] Publish customer-facing privacy notice, terms, retention/deletion contact/process, and support contact appropriate to the pilot market.
- [ ] Review and approve the engineering data-flow inventory in `docs/DATA_FLOW_INVENTORY.md`; confirm provider contracts, data locations, retention, and international-transfer terms.
- [ ] Complete a documented privacy/security review for the intended jurisdiction and data flows; sign required processor agreements before real patient data is used.
- [ ] Define written pilot scope, duration, price, cancellation/refund terms, onboarding responsibilities, support hours, and success criteria.

### P1 — required before scaling beyond a small supervised pilot

- [ ] Payment provider integration, subscription state, invoices/receipts, cancellation, failed-payment handling, and server-side plan entitlements.
- [ ] Usage limits and abuse/rate controls for public chat and appointment submissions.
- [ ] Monitoring and alerting for Worker errors, database failures, email delivery, and unusual traffic.
- [ ] Backup/restore procedure and tested access revocation/offboarding.
- [ ] Data export and deletion workflow for clinic/customer records.
- [ ] Operational runbook for support, incidents, and service degradation.
- [ ] Localization review by fluent English and Russian speakers, including dates, times, currencies, and clinic-specific wording.
- [ ] Load, browser/device, accessibility, and security testing appropriate to the intended customer volume.

## Pilot acceptance test

Use a synthetic clinic and record pass/fail evidence for each step:

1. Super Admin creates a clinic and assigns its manager.
2. Manager signs in and configures clinic description, default language, services/prices, opening hours, and notification email.
3. Public clinic page exposes only that clinic's published information.
4. Test visitor asks a question in English; answer matches saved clinic data.
5. Test visitor asks a question in Russian; answer matches saved clinic data.
6. Ask for an unknown service/price; assistant does not invent an answer.
7. Submit a request for a published service; it is stored and visible only to the correct manager.
8. Confirm the clinic-specific notification email is delivered. Until the verified sender domain is configured, the deployed Worker sends notifications to the platform inbox only.
9. Submit an unpublished service; request is rejected and no record is created.
10. Manager updates request status; updated status persists after refresh.
11. Attempt cross-clinic access with a second manager; access is denied.
12. Sign out/expire the session; protected dashboard and settings APIs reject the old token.

## Commercial positioning for the first pilot

Position CliniBot as an **English/Russian virtual front-desk assistant for clinic FAQs and appointment requests**, with a human clinic team retaining control of confirmation and clinical decisions.

Sell a supervised, setup-assisted pilot first. Do not present draft price tiers as active subscriptions until payment and entitlement systems exist. Prefer a clinic that can supply approved content and a staff member to monitor incoming requests.

## Current launch blockers known from repository review

- Production Worker deployment is verified for source commit `24e25aa821299d25160bcfd10b2e0bc05413ba98`; the latest Pages/Netlify currency-adapter parity changes do not modify Worker source. Cloudflare Git-connected preview builds still fail with an authentication error and need separate repair.
- Production custom domain/route is not yet confirmed.
- No real browser-based manager/Super Admin end-to-end test is evidenced.
- Billing and subscription enforcement are not implemented.
- Privacy/legal review and real-patient data readiness are not established.
- Calendar synchronization is not implemented; requests require clinic staff review and confirmation.
