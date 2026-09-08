# How Root Network makes money

There is exactly one revenue stream: **AI labs pay the network for bandwidth, and Root Network keeps 20% of what they pay.** The other 80% goes to contributors. There is no token, no advertising, and no sale of data.

<div class="rn-split"><div class="rn-split__a">80% · paid to contributors</div><div class="rn-split__b">20% · Root</div></div>
<div class="rn-split-legend"><span>Split by verified bytes, weighted by region and reliability</span><span>Routers, validators, payments, support, compliance</span></div>

## The flow of a dollar

1. A lab prepays a balance or is invoiced monthly for the gigabytes it consumes at its contracted rate.
2. At each settlement window, verified deliveries are totalled. The lab is billed for the bytes that verified and nothing else.
3. 80% of the window's lab payments form the **contributor pool**, distributed to nodes by weighted bytes delivered.
4. 20% is retained by Root Network.

The 20% is a flat network fee. It does not vary by contributor, region or volume, and it is not layered with hidden spreads: contributors receive exactly 80% of the price labs paid.

## What the 20% pays for

- **Routers and validators**: the infrastructure that selects nodes, seals traffic, verifies deliveries and computes settlements, deployed in multiple regions.
- **Payments**: withdrawals in USDC (Base) or USDG (Robinhood Chain) with gas covered by the network.
- **Lab onboarding and compliance**: identity verification, usage agreements, and enforcement of the acceptable use policy.
- **Support** for contributors and labs.
- **Development** of the extension, dashboard, desktop and mobile nodes.
- **Referral bonuses**, which are paid from this share rather than from contributors' earnings.

## Why a flat cut

A flat, public take rate keeps the incentives simple. Root Network only earns more when labs pay more, and labs only pay more when the network delivers more verified bandwidth. Every improvement that makes contributors earn more makes us earn more, in the same proportion.

We considered a token model and decided against it. Tokens let a network pay contributors with the promise of future value instead of present revenue. We would rather grow only as fast as real demand from labs allows, and pay contributors in the currency the labs pay us in.

## Unit economics

Per gigabyte at a representative contracted rate:

| | |
| --- | --- |
| Lab pays | $1.25 |
| Contributor pool | $1.00 |
| Root Network | $0.25 |

Labs pay a premium over data-centre bandwidth because residential access is what they need and cannot get elsewhere; $1.25 is at the low end of what residential access sells for today (commercial residential proxy networks list between roughly $1 and $8 per GB). Contributors are paid a rate that no consumer product for idle bandwidth has offered before (most pay $0.10–$0.50 per GB and keep the rest), because we do not sit between them and the labs with anything more than the fee above.

## Transparency

Each settlement publishes total lab payments, the contributor pool and the network share alongside the Merkle root of verified deliveries. Network-level totals are shown live on the **Data** page of the dashboard.
