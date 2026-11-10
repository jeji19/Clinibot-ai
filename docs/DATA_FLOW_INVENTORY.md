# CliniBot AI — observed data-flow inventory

**Status:** engineering inventory for privacy/legal review; not a privacy notice, legal opinion, or compliance certification.

This document records data flows visible in the current repository. Confirm each item against the deployed configuration and provider contracts before a clinic pilot. Retention periods, controller/processor roles, lawful bases, international-transfer mechanisms, and jurisdiction-specific requirements remain to be determined with qualified counsel.

## 1. Data categories observed in the application

| Flow | Data observed in source | Purpose | Application storage / recipient |
|---|---|---|---|
| Public clinic chat | Visitor's message (up to 1,200 characters), clinic slug, clinic-approved settings/services/hours included as answer context | Answer routine clinic questions and route clinical/urgent prompts safely | Message is sent to the configured Cloud.ru model API when `CLOUDRU_API_KEY` is present; otherwise the configured Google Gemini API may be used. FAQ/safety paths can answer without either generative provider. The chat handler does not insert chat messages into the application's Supabase tables. Provider-side processing/logging and Worker platform logs must be checked separately. |
| Appointment request | Patient name, phone number, requested service, preferred date/time, language, clinic identifier, creation timestamp and status | Let clinic staff review and contact the patient to confirm availability | Stored in Supabase `appointment_requests`; visible through the authorized clinic manager workflow and Super Admin workflow. |
| Appointment notification | Clinic name, patient name, phone, service, preferred date/time, language and request status | Notify the clinic that a new request needs review | For the currently deployed Cloudflare Worker, sent through Resend to the platform inbox configured by `RESEND_TO_EMAIL` (temporary shared-sender restriction); the clinic's `notification_email` is not used by this Worker route. The Pages/Netlify adapters route to the clinic notification email when configured, with a platform fallback. A verified platform sending domain is required before per-clinic Worker delivery. Email inboxes and mail-provider retention are separate from the database. |
| Demo lead | Clinic name, contact person's name, work email, optional phone, specialty | Arrange a product demonstration | Stored in Supabase `demo_requests`; notification may be sent through Resend to the configured platform inbox. |
| Manager / Super Admin access | Supabase Auth account credentials and user ID; clinic membership and allowlist membership | Authenticate staff and authorize clinic-specific administration | Supabase Auth plus `clinic_members` and `super_admins` tables. Password handling is provided by Supabase Auth. |
| Clinic configuration | Clinic name/slug, notification email, description, services/prices, opening hours, default language, logo URL, active/plan metadata | Configure public clinic answers and staff workflows | Supabase `clinics` and `clinic_settings` tables. |

## 2. Infrastructure and external services visible in source

| Provider / service | Observed role | Data that may reach it |
|---|---|---|
| Cloudflare Workers | Hosts the Worker, public pages, and API handlers | HTTP request metadata and application traffic; review Cloudflare account logging, observability, and retention settings. |
| Supabase | Database, Auth, and REST API | Clinic configuration, appointment requests, demo leads, user accounts, memberships, and authorization data. |
| Cloud.ru Foundation Models API | Preferred generative chat provider when `CLOUDRU_API_KEY` is configured | Visitor message and clinic context included in the prompt when the generative path is used. |\n| Google Gemini API | Optional generative fallback when the Cloud.ru key is absent | Visitor message and clinic context included in the prompt when the generative path is used. |
| Resend | Transactional email delivery | Appointment notification content and demo-lead notification content. |

The source uses server-side secrets for Supabase service-role access, Cloud.ru (preferred), optional Gemini fallback, and Resend. These credentials must remain in platform secret storage and must never be embedded in browser assets or shared with clinics.

## 3. Important product boundaries

- Appointment submissions are requests, not confirmed bookings or calendar reservations.
- The chat assistant is not a medical service and must not diagnose, prescribe, or replace clinical judgment.
- Do not enter real patient information into the public demo or synthetic acceptance tests.
- The current code's chat handler does not write conversation transcripts to the application's Supabase tables; this is not a promise that Cloudflare, Gemini, network infrastructure, or other providers do not process or retain request data.
- Appointment notification emails contain patient contact details and requested services. Treat the receiving clinic mailbox as a personal-data destination.
- The demo-lead form collects business contact details. Do not reuse them for unrelated marketing without an appropriate legal basis and notice.

## 4. Retention and deletion — unresolved

The repository does not establish a complete, customer-facing retention schedule or automated data-subject deletion/export workflow. Before a pilot, decide and document:

- Retention period for appointment requests and associated emails.
- Retention period for demo leads and unsuccessful sales inquiries.
- Retention/deletion process for clinic accounts, managers, and clinic configuration after termination.
- How backups, provider logs, email copies, and support records are handled.
- Who receives and fulfills access, correction, export, and deletion requests.
- Whether any data is transferred internationally and what contractual safeguards are required.

Do not publish guessed retention periods or promise deletion from third-party backups/logs until the relevant provider capabilities and contracts are verified.

## 5. Required review before real-patient pilot

1. Confirm the legal entity operating CliniBot and each clinic's controller/processor roles.
2. Select the initial customer jurisdiction and identify applicable privacy and health-data rules.
3. Review Cloudflare, Supabase, Google, and Resend terms, data-processing agreements, subprocessors, data locations, retention, and international-transfer terms.
4. Determine the lawful basis and patient-facing notice for each data flow, including appointment requests and AI processing.
5. Decide whether sensitive/health-related data may be entered into free-text chat; minimize collection and add appropriate warnings/controls.
6. Define retention, deletion, export, access, incident response, and clinic offboarding procedures.
7. Publish reviewed privacy notice and terms, and sign required customer/provider agreements before using real patient data.
8. Re-check the actual production environment and enabled providers; this inventory is based on repository source, not a live production inspection.

## 6. Evidence and limitations

This inventory was prepared from the repository's Worker handlers, public landing form, and Supabase schema. It does not independently verify deployed code, provider settings, account contracts, subprocessors, logs, or data residency. It is an engineering aid for counsel and must not be presented as proof of GDPR, HIPAA, or other regulatory compliance.
