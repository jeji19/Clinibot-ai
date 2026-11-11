# Production launch blockers — owner and completion evidence

This tracker distinguishes work completed in source/CI from production actions that require account access, owner decisions, or legal approval. Update a blocker only when evidence exists.

| Blocker | Required action | Owner / access | Evidence required | Status |
|---|---|---|---|---|
| Cloudflare deployment credentials | Add narrowly scoped Cloudflare Workers API token and Cloudflare account ID as GitHub Actions secrets named `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Never send either value in chat. | Repository owner with Cloudflare and GitHub admin access | GitHub Actions secret names exist; values are never exposed; deployment run succeeds | VERIFIED — guarded deployment succeeded on 2026-11-10 |
| Production deployment | Run the guarded `Deploy CliniBot AI Worker` workflow from `main`, confirm production, and use worker name `clinibot-ai1`. | Repository owner after credentials are configured | Successful workflow URL, deployed commit SHA, smoke-test output | DEPLOYED — run [42907523403](https://github.com/jeji19/Clinibot-ai/actions/runs/42907523403), Worker `clinibot-ai1`, source commit `71b28592e214d75f2bea84aeaf7e16d2f1477f7e`, version `82c4480d-04eb-4f0f-9e15-02b23e74ac71`; V6 landing assets uploaded and smoke tests passed |
| Custom domain | Choose and register a domain, add it to Cloudflare, configure Worker custom domain/route, TLS, and DNS. | Business owner; domain purchase is a financial/legal ownership decision | Domain ownership, active DNS/TLS, successful HTTPS requests | BLOCKED — domain not selected |
| Browser acceptance test | Run synthetic clinic + manager workflow against the deployed build: login, settings, public EN/RU FAQ, unknown question, appointment request, email notification, manager isolation, expired session, invalid service, safety routing. | Requires deployed URL and synthetic manager account | Recorded checklist with timestamps and sanitized evidence; no real patient data | PARTIAL — public EN/RU FAQ, appointment request, email fallback, opening hours, unpublished-service rejection, and medical/off-topic safety were manually tested; manager isolation and session-expiry browser checks remain outstanding |
| Per-clinic email delivery | Verify a platform-owned sending domain in Resend and set Worker secret `RESEND_FROM_EMAIL` to an address on that verified domain; then test a synthetic request to a clinic-specific inbox. | Business owner with DNS and Resend access | Verified sender domain, configured secret, and successful synthetic delivery | CODE READY — Worker routes to `notification_email` only when `RESEND_FROM_EMAIL` is configured; otherwise it safely falls back to `RESEND_TO_EMAIL`. Production activation and delivery test remain pending |
| Billing | Connect the chosen payment provider account; implement Checkout, webhook signature verification, customer/plan mapping, subscription lifecycle, cancellation, and server-side entitlement checks. | Business owner must connect provider and approve commercial configuration | Test-mode payment lifecycle, verified webhooks, entitlement tests; then owner-approved live mode | NOT IMPLEMENTED |
| Privacy and legal | Complete and approve privacy notice, terms, DPA, retention/deletion, support and incident procedures for first jurisdiction. | Legal operator and qualified counsel | Signed/approved documents and provider agreements | BLOCKED — entity/jurisdiction unknown |
| Real-patient pilot | Do not use real patient data until privacy/legal gate and production acceptance gate pass. | Clinic + operator | Signed pilot scope, notices, DPA where required, approved security and retention controls | BLOCKED |

## Latest verified deployment

The guarded production workflow completed successfully on 2026-11-10: [run 42907523403](https://github.com/jeji19/Clinibot-ai/actions/runs/42907523403). It deployed Worker `clinibot-ai1` from source commit `71b28592e214d75f2bea84aeaf7e16d2f1477f7e` and reported version `82c4480d-04eb-4f0f-9e15-02b23e74ac71`. The deployment uploaded `/landing-visual-v6.css` and the updated `/landing.html`; these V6 visual changes are live. Public clinic-info, chat, and unpublished-service rejection smoke tests passed. The deploy workflow checks that the demo clinic returns `currency_code: USD` and that the chat price reply contains a dollar sign (`$`). Git-connected Cloudflare preview builds have separately reported an authentication error; repair that preview integration separately without confusing it with the successful guarded production deployment.

## Deployment procedure

1. In GitHub repository Settings → Secrets and variables → Actions, add the two Cloudflare secrets above.
2. Open Actions → Deploy CliniBot AI Worker.
3. Run the workflow from `main`; set `confirm_production=true` and `worker_name=clinibot-ai1`.
4. Confirm all deployment and smoke-test steps pass.
5. Record the run URL and deployed commit SHA. A passing source CI run is not proof of deployment.

## Safe testing data

Use synthetic clinic names, fictional staff accounts, and obviously fake patient details. Never use real patient records or real contact details in acceptance tests or the public demo.

## Commercial configuration not yet approved

Pricing remains a hypothesis, not an active tariff. Do not enable live billing or advertise subscription plans until the owner approves prices, currency, tax handling, cancellation/refund terms, and support commitments.
