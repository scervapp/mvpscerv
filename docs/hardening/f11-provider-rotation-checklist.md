# F11 provider rotation checklist

Task: A-10 / F11
Owner: Founder + Engineering
Status: Provider action required

## Purpose

Close the credential-exposure incident without copying secrets into chat, docs or commits.

## Before cleanup is marked complete

- PayPal sandbox/live credentials and apps from the tracked source incident are revoked/deleted in the PayPal dashboard unless there is a separate non-Scerv reason to keep them.
- dLocal/dLocalGo sandbox/live credentials and apps are revoked/deleted if they correspond to Scerv-created provider assets.
- Stripe and Resend dashboards are reviewed because `src.zip` was tracked and its contents were not extracted in A-10.
- Secret Manager entries are updated only with newly rotated values.
- A screenshot or written provider confirmation is stored outside the repo; do not commit screenshots containing secret values.

PayPal and dLocalGo are inactive Scerv payment workflows per D-011. Do not preserve those provider credentials for future optionality.

## Engineering cleanup after provider rotation

- Confirm `functions/test.js` remains removed from the repo.
- Confirm `functions/.env` remains removed from the repo.
- Confirm `src.zip` remains removed from the repo.
- Keep `.env`, `.env.*` and generated archives ignored.
- Run `npm run security:secret-scan`.
- Keep the GitHub `Secret hygiene` workflow active.

## Decision

History rewrite is optional after provider revocation. If the repository is private and all exposed credentials are revoked, ordinary removal plus secret scanning is usually sufficient. If the repo was public, forked, mirrored or shared widely, escalate to history cleanup planning.
