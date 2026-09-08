# For AI labs

Root Network gives research teams verifiable residential access to the public web, priced per gigabyte, with delivery receipts you can audit.

## Why residential access

Public web data looks different depending on where you fetch it from. Data-centre IPs are rate-limited, blocked or served degraded content by a large share of the web. Residential connections see the internet as people see it. For training-set construction, model evaluation against the live web, and agent testing, that is the only view that matters.

## What you get

- **Coverage**: nodes across dozens of countries, targetable at country level.
- **Verification**: every delivery is backed by two signed receipts and included in a published settlement commitment. You are billed only for bytes that verified.
- **Predictable pricing**: a flat per-gigabyte rate with hard spend caps at the request, project and account level. See [Pricing](/economics/pricing).
- **Policy you can rely on**: all traffic is subject to the [acceptable use policy](/data/acceptable-use), enforced at the router, which protects you as much as it protects destinations.

## What you do not get

- Access to content behind authentication or paywalls
- Any information about contributors
- Unverified deliveries on your invoice

## Integration

The Root API is an HTTP API. Requests take a destination URL, an optional region and a spend cap, and return the response body plus a receipt id. Client libraries are provided for Python and TypeScript. See [Access & API](/labs/access).

## Onboarding

Labs are onboarded manually. We verify identity, agree on usage, and issue signing keys. Onboarding typically takes two business days.
