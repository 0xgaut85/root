# Contributor payments

This page describes how the contributor pool is distributed and paid. For what you see in the dashboard, read [Earnings](/guide/earnings) and [Payouts](/guide/payouts).

## The pool

For every settlement window, contributor payments equal **80% of the lab payments** that verified in that window. The pool is computed after verification, so it reflects only deliveries that will be billed.

## Weighting

Each verified delivery contributes a weight:

```text
weight = verified_bytes × region_multiplier × reliability_multiplier
```

- `region_multiplier` reflects the lab rate for the node's country relative to the default pool. Values typically fall between 0.9 and 1.6.
- `reliability_multiplier` is derived from the node's [reputation](/architecture/node-reputation), between 0.8 and 1.25.

A node's payment for the window is `pool × (node_weight / total_weight)`.

## Cadence

- **Settlement**: hourly. Balances update at the end of each window.
- **Withdrawal**: on demand above $5, or automatic at a threshold you choose.
- **Currency**: USDC. Gas is paid by the network.

## Referral bonuses

Referral bonuses (10% of a referral's earnings for 12 months) are paid from Root Network's 20% share, not from the pool. They appear as a separate line in your history.

## Disputes

If you believe a delivery attributed to you was not credited, the dashboard lets you file a dispute against a specific settlement with the receipt hash. Validators re-check the receipts and respond within 72 hours. Corrections are written as new ledger entries.
