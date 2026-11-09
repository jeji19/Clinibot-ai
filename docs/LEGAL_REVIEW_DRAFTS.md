# CliniBot AI — legal document drafts (NOT APPROVED FOR PUBLICATION)

**Status: Drafting aid only.** These drafts are intentionally incomplete. Do not publish them, link them from the public site, onboard real patients, or represent them as legal advice or regulatory compliance until qualified counsel has reviewed and approved them for the operating entity and every target jurisdiction.

## Publication fields that must be completed

- Legal operator name and registered address: **[REQUIRED]**
- Country of establishment and governing law: **[REQUIRED]**
- Privacy contact / data-protection contact: **[REQUIRED]**
- Support contact and security incident contact: **[REQUIRED]**
- Initial clinic/customer jurisdiction(s): **[REQUIRED]**
- Whether the operator or clinic is controller, processor, joint controller, or another role for each processing purpose: **[COUNSEL TO DETERMINE]**
- Provider legal entities, current DPAs, subprocessors, data locations, transfer safeguards, and retention: **[VERIFY WITH EACH PROVIDER]**
- Retention schedule and backup deletion timelines: **[REQUIRED]**
- Complaint/supervisory authority process where applicable: **[COUNSEL TO DETERMINE]**

## Privacy notice — working outline

### 1. Who operates the service
CliniBot AI is operated by **[LEGAL OPERATOR NAME, ADDRESS, COUNTRY]**. Contact **[PRIVACY EMAIL]** with privacy questions.

### 2. What the service does
CliniBot AI provides clinics with a configurable assistant that answers routine clinic questions in English and Russian using clinic-provided information and collects appointment requests for clinic staff to review. It is not an emergency service and does not diagnose, prescribe, or replace a healthcare professional.

### 3. Information processed
Depending on how a clinic configures and uses the service, information may include:
- Chat messages submitted by a visitor and technical request metadata.
- Appointment request details: name, telephone number, requested service, preferred date/time, language, clinic identifier, and request status.
- Clinic business configuration: services, prices, opening hours, contact details, and notification email.
- Clinic staff account identifiers and membership/authorization information.
- Demo request contact information submitted by prospective business customers.

Do not submit unnecessary medical history, diagnoses, payment-card data, government identifiers, or other sensitive information in chat. The clinic must define and communicate what information visitors may submit.

### 4. Purposes and recipients
Information may be used to answer routine questions, route urgent or clinical questions to a human, transmit appointment requests to the relevant clinic, authenticate clinic staff, operate and secure the service, and respond to demo inquiries.

The current codebase integrates Cloudflare Workers, Supabase, Google Gemini API, and Resend. The precise legal entities, processing terms, data locations, subprocessors, retention periods, and international-transfer safeguards must be verified against the actual accounts and contracts before this notice is finalized.

### 5. AI processing
When generative fallback is used, a visitor's message and relevant clinic context may be sent to Google Gemini API to generate a response. Do not promise that a provider does not retain or use data unless verified from the applicable account configuration and contractual terms. The assistant is not a clinician and must not be relied on for medical decisions or emergencies.

### 6. Appointment requests
Submitting a request does not create a confirmed appointment. Clinic staff review the request and contact the visitor to confirm availability. Appointment details may be stored in the service database and included in an email notification to the clinic's configured notification address.

### 7. Retention
**[INSERT APPROVED RETENTION PERIODS FOR EACH DATA CATEGORY, BACKUPS, LOGS, AND EMAIL COPIES.]** The current repository does not establish a complete retention schedule. Do not publish this section until the periods and deletion mechanics have been verified.

### 8. Rights and choices
**[INSERT RIGHTS, REQUEST CHANNEL, IDENTITY-VERIFICATION PROCESS, RESPONSE TIMES, AND APPLICABLE EXCEPTIONS FOR EACH TARGET JURISDICTION.]** Do not promise capabilities that have not been implemented or tested, including complete deletion from provider backups or email systems.

### 9. Security
Describe only controls that are verified in the deployed environment. No system can be represented as risk-free. Add the approved incident-notification and security-contact process: **[REQUIRED]**.

### 10. International processing and changes
**[DESCRIBE VERIFIED DATA LOCATIONS, TRANSFER MECHANISMS, AND NOTICE-UPDATE PROCESS.]**

### 11. Contact and complaints
Privacy contact: **[REQUIRED]**. Where applicable, explain how to complain to the relevant supervisory authority: **[COUNSEL TO COMPLETE]**.

## Terms of service — working outline

### 1. Parties and scope
These terms are between **[LEGAL OPERATOR]** and **[CUSTOMER LEGAL ENTITY]** and apply to the agreed subscription or pilot order. Effective date: **[DATE]**.

### 2. Service scope
The service provides English- and Russian-language routine FAQ responses based on clinic-approved configuration and collects appointment requests for clinic staff review. Any pilot must define included clinics, users, request volumes, support hours, fees, duration, and success criteria in a signed order.

### 3. No medical advice or emergency service
The service is not a healthcare provider, does not diagnose or prescribe, and is not suitable for emergencies. Clinics must maintain human escalation and emergency instructions appropriate to their jurisdiction.

### 4. Appointment requests are not confirmed bookings
A submitted request is not a reservation or confirmation. The clinic is responsible for reviewing requests, checking actual availability, and communicating confirmation directly to the visitor.

### 5. Customer responsibilities
The clinic is responsible for accurate and lawful clinic information, staff access management, appropriate patient notices and lawful bases, reviewing appointment requests, clinical escalation, and not entering data beyond the agreed scope.

### 6. Data processing agreement
Where required, the parties must execute a separate data-processing agreement before personal data is processed. The DPA must specify roles, instructions, purposes, categories, security measures, subprocessors, transfers, retention, assistance, and deletion/return obligations.

### 7. Fees, payment, and taxes
Fees, billing frequency, taxes, payment method, renewal, failed-payment handling, refunds, and cancellation are **[TO BE AGREED IN A SIGNED ORDER]**. No subscription price or payment obligation is created by this draft.

### 8. Availability and support
No uptime SLA, 24/7 human support, or guaranteed response time is offered unless explicitly stated in a signed service-level agreement.

### 9. Acceptable use and security
Customers must not use the service for unlawful purposes, submit unnecessary sensitive information, attempt unauthorized access, or treat generated responses as clinical decisions. The parties must follow the agreed security and incident procedures.

### 10. Intellectual property and feedback
**[COUNSEL TO COMPLETE OWNERSHIP, LICENSE, CUSTOMER CONTENT, AND FEEDBACK TERMS.]**

### 11. Confidentiality and liability
**[COUNSEL TO DRAFT JURISDICTION-SPECIFIC CONFIDENTIALITY, WARRANTIES, LIABILITY LIMITS, INDEMNITIES, AND MANDATORY CONSUMER/HEALTHCARE EXCEPTIONS.]**

### 12. Term, suspension, and termination
**[INSERT PILOT TERM, RENEWAL, CANCELLATION, SUSPENSION, OFFBOARDING, DATA EXPORT/DELETION, AND FINAL INVOICE RULES.]**

### 13. Governing law and disputes
**[REQUIRED: COUNTRY, COURTS/ARBITRATION, MANDATORY LOCAL LAW, AND LANGUAGE.]**

## Required counsel review before publication or real-patient use

1. Choose the operating legal entity and first customer jurisdiction.
2. Determine applicable privacy, health-data, consumer, AI, marketing, and electronic-communications rules.
3. Verify all provider contracts, DPAs, subprocessors, data locations, international transfers, and provider retention settings.
4. Decide controller/processor roles and execute required clinic agreements.
5. Approve a retention/deletion/export schedule and operational process.
6. Review the public chat, appointment flow, clinic notices, and email notifications in their deployed form.
7. Approve final privacy notice, terms, DPA, pilot order, support policy, and incident process.

**Never replace the bracketed fields with guesses.**
