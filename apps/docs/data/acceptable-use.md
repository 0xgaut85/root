# Acceptable use

Labs may use Root Network only to access **publicly available web content** for research, dataset construction, model evaluation and agent testing. The policy below is enforced technically at the router, not by trust.

## Permitted

- Fetching publicly accessible web pages and public APIs
- Rendering public pages as an ordinary visitor would see them
- Repeated access at rates that respect the destination's published limits

## Prohibited

- Accessing content behind authentication, paywalls or access controls
- Circumventing rate limits, CAPTCHAs or bot protections in ways that harm the destination
- Any activity that is unlawful in the lab's jurisdiction or the destination's jurisdiction
- Attacking, probing or overloading destinations
- Fraud, credential testing, account creation, or any interaction that changes state on a destination
- Accessing content that is illegal to possess

## Enforcement

- **Destination policy**: routers check every destination against block-lists and category rules before selection.
- **Rate controls**: per-lab and per-destination limits are enforced at the router.
- **Attribution**: every request is signed by the lab that made it. Violations are attributable to a verified identity.
- **Consequences**: labs that violate the policy are suspended, forfeit prepaid balances, and may be reported to relevant authorities.

Contributors never have to enforce any of this. If a request reaches your node, it has already passed policy.
