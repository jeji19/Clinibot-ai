# Production launch blockers — owner and completion evidence

This tracker distinguishes work completed in source/CI from production actions that require account access, owner decisions, or legal approval. Update a blocker only when evidence exists.

| Blocker | Required action | Owner / access | Evidence required | Status |
|---|---|---|---|---|
| Cloudflare deployment credentials | Add narrowly scoped Cloudflare Workers API token and Cloudflare account ID as GitHub Actions secrets named `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Never send either value in chat. | Repository owner with Cloudflare and GitHub admin access | GitHub Actions secret names exist; values are never exposed; deployment run succeeds | VERIFIED — guarded deployment succeeded on 2026-11-10 |
| Production deployment | Run the guarded `Deploy CliniBot AI Worker` workflow from `main`, confirm production, and use worker name `clinibot-ai1`. | Repository owner after credentials are configured | Successful workflow URL, deployed commit SHA, smoke-test output | DEPLOYED — run [42781453004](https://github.com/jeji19/Clinibot-ai/actions/runs/42781453004), Worker `clinibot-ai1`, source commit `24e25aa821299d25160bcfd10b2e0bc05413ba98`, version `2c079bfa-28fe-4fa6-b064-c20935769803` |
| Custom domain | Choose and register a domain, add it to Cloudflare, configure Worker custom domain/route, TLS, and DNS. | Business owner; domain purchase is a financial/legal ownership decision | Domain ownership, active DNS/TLS, successful HTTPS requests | BLOCKED — domain not selected |
| Browser acceptance test | Run synthetic clinic + manager workflow against the deployed build: login, settings, public EN/RU FAQ, unknown question, appointment request, email notification, manager isolation, expired session, invalid service, safety routing. | Requires deployed URL and synthetic manager account | Recorded checklist with timestamps and sanitized evidence; no real patient data | PARTIAL — public EN/RU FAQ, appointment request, email fallback, opening hours, unpublished-service rejection, and medical/off-topic safety were manually tested; manager isolation and session-expiry browser checks remain outstanding |
| Per-clinic email delivery | Verify a platform-owned sending domain in Resend and configure a sender address on that domain; then route appointment alerts to each clinic’s configured notification email and test delivery/failure handling. | Business owner with DNS and Resend access | Verified sender domain and successful synthetic delivery to a clinic-specific inbox | BLOCKED — deployed Worker currently routes alerts to the platform inbox because the shared Resend testing sender cannot deliver to arbitrary clinic recipients |
| Billing | Connect the chosen payment provider account; implement Checkout, webhook signature verification, customer/plan mapping, subscription lifecycle, cancellation, and server-side entitlement checks. | Business owner must connect provider and approve commercial configuration | Test-mode payment lifecycle, verified webhooks, entitlement tests; then owner-approved live mode | NOT IMPLEMENTED |
| Privacy and legal | Complete and approve privacy notice, terms, DPA, retention/deletion, support and incident procedures for first jurisdiction. | Legal operator and qualified counsel | Signed/approved documents and provider agreements | BLOCKED — entity/jurisdiction unknown |
| Real-patient pilot | Do not use real patient data until privacy/legal gate and production acceptance gate pass. | Clinic + operator | Signed pilot scope, notices, DPA where required, approved security and retention controls | BLOCKED |

## Latest verified deployment

The guarded production workflow completed successfully on 2026-11-10: [run 42781453004](https://github.com/jeji19/Clinibot-ai/actions/runs/42781453004). It deployed Worker `clinibot-ai1` from source commit `24e25aa821299d25160bcfd10b2e0bc05413ba98` and reported version `2c079bfa-28fe-4fa6-b064-c20935769803`. Subsequent currency-adapter parity changes affect Cloudflare Pages and Netlify adapters and tests, not `src/index.js`; the deployed Worker source therefore remains unchanged. Git-connected Cloudflare preview builds separately report an authentication error; that preview integration needs repair but does not invalidate the successful guarded production deployment.

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
