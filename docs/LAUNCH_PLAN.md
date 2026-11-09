# CliniBot AI — launch and first-revenue plan

This is an internal working plan, not a published price list or a claim that billing is already available.

## Commercial target

Target: **USD 5,000 in monthly recurring revenue (MRR)**.

Illustrative clinic-count scenarios:

| Average monthly fee | Active paying clinics for at least $5,000 MRR |
|---:|---:|
| $99 | 51 |
| $149 | 34 |
| $199 | 26 |
| $249 | 21 |
| $349 | 15 |

The fastest plausible path is to validate a higher-touch offer with a small number of clinics before trying to acquire dozens of low-price accounts.

## Pricing hypotheses to validate

Do not publish or collect these prices until interviews confirm willingness to pay and payment/subscription infrastructure is implemented.

- **Pilot — $99/month:** one clinic, public AI receptionist, English/Russian, clinic FAQ, appointment-request collection, clinic dashboard, email notifications. Limited early-customer offer; review after 30–60 days.
- **Standard — $199/month:** same currently shipped product, plus guided onboarding, clinic information setup, and priority support. This is a service-backed offer, not yet a technical feature-gated plan.
- **Concierge — $349/month:** guided setup, tailored FAQ/service configuration, staff onboarding, and monthly optimization review. Only sell while the team can actually deliver this service.

At this stage Basic/Pro/Premium in the Super Admin panel are metadata labels only. There is no payment gateway, subscription ledger, metered usage, automated renewal, invoice, cancellation, or plan enforcement. Never tell a clinic that a plan label means it has paid.

## Best initial customer profile

Start with independent dermatology and aesthetic clinics that:
- receive repeated questions about services, prices, opening hours, and consultations;
- accept appointment requests through a website or social channels;
- have a manager or receptionist who can review requests;
- can provide approved clinic information and a notification email;
- are willing to test English and/or Russian patient conversations.

Avoid clinics expecting automatic calendar booking, medical triage, prescribing, or guaranteed appointment availability; those are not current capabilities.

## First 30-day acquisition experiment

1. Build a list of 30 qualified clinics in one reachable market. Record clinic name, website, public contact channel, specialty, and why the product is relevant.
2. Personalize outreach; do not send bulk unsolicited messages. Ask for a 15-minute demo, not an immediate purchase.
3. Run 10 discovery conversations. Ask how many routine inquiries they receive, how staff handle them, what gets missed after hours, and what a successful pilot would need to prove.
4. Run 5 live demos using a clinic-specific demo profile. Do not enter real patient information into the demo.
5. Offer 3 paid pilots with a written scope, setup checklist, success criteria, and cancellation terms.
6. Review conversion, activation, weekly usage, appointment-request volume, and willingness to continue before changing prices.

## Demo success criteria

A clinic should be able to complete this flow without developer help:
1. Super Admin creates an active clinic and its default settings.
2. Super Admin assigns one manager account to that clinic.
3. Manager signs in and saves clinic description, English/Russian default language, exact services/prices, opening hours, and notification email.
4. Clinic public link displays only that clinic's published services.
5. Visitor asks a routine question in English or Russian and receives a clinic-grounded response.
6. Visitor submits a request for a currently published service.
7. The request is stored under the correct clinic and appears only in that clinic manager's dashboard.
8. The clinic-specific notification email receives the alert; the platform inbox is only the fallback.
9. Manager updates the request status; the clinic's other data remains inaccessible.

## Launch blockers before handling real patient data

- Complete a real browser-based end-to-end test with a dedicated test clinic, manager account, and non-real patient data.
- Confirm which Cloudflare Worker is the production target and verify the actual deployed version. GitHub CI passing does not prove that Cloudflare deployed the same commit.
- Configure a clinic-facing custom domain or Worker route before business-critical production; the current `workers.dev` URL is suitable for testing but Cloudflare recommends custom domains/routes for production workloads.
- Define the controller/processor roles, lawful basis, privacy notice, retention/deletion process, processor agreements, and incident-response procedure for each target market. Patient names, phone numbers, and requested services can constitute personal data and may reveal health-related information.
- Review applicable GDPR and local health-data rules before using the product with real patients. Do not claim HIPAA, GDPR, or other regulatory compliance without a documented assessment and appropriate contracts/controls.
- Configure backups, monitoring, access revocation, and a tested support process.
- Implement and test payment-provider checkout, verified webhooks, subscription state, cancellations, refunds, invoices, and plan enforcement before charging recurring fees.
- Add calendar integration only after the clinic workflow and data-protection requirements are clear.

## Current product limits to disclose

- Appointment requests are not confirmed appointments and do not reserve a calendar slot.
- No Google Calendar or other calendar synchronization.
- English and Russian only.
- One manager account can belong to one clinic.
- Pages and Netlify currently support public endpoints only; management screens require the Cloudflare Worker.
- Subscription billing and plan-based feature limits are not implemented.
- The assistant is not a medical service and must not diagnose, prescribe, or replace clinical judgment.

## Weekly scorecard

Track:
- qualified clinics contacted;
- replies and discovery calls;
- demos booked and completed;
- paid pilots started;
- clinics that complete setup without developer intervention;
- weekly active clinics;
- appointment requests collected per clinic;
- pilot-to-paid conversion;
- monthly recurring revenue and churn;
- support time per clinic.

Do not optimize for sign-ups alone. Optimize for clinics that activate, receive useful appointment requests, and renew.
