# Contribution ledger

The contribution ledger is the network's append-only record of verified deliveries, settlements and payouts. Everything you see in your dashboard is a view over it.

## Entries

| Entry | Written by | Contains |
| --- | --- | --- |
| `delivery` | Validator | Node, lab, destination hash, verified bytes, region, timestamps, receipt hashes |
| `settlement` | Validator | Window, total lab payments, contributor pool, per-node weights and amounts, Merkle root of deliveries |
| `payout` | Payments service | Contributor, amount, destination wallet, transaction reference |
| `reputation` | Validator | Node, score change, reason |

Entries are immutable once written. Corrections are made by writing a new entry that references the one it corrects.

## What contributors can see

From the dashboard you can export:

- every verified delivery attributed to your nodes, with bytes and timestamps;
- every settlement you were part of, with your weight and amount;
- every payout, with its transaction reference.

Destinations are shown as hashes, not URLs, because the ledger is designed to prove delivery without disclosing what labs are researching.

## What labs can see

Labs see the mirror image: every delivery they were billed for, with the region, bytes and timing, plus the settlement totals. They do not see which contributor relayed a given request.

## Public commitments

Each settlement's Merkle root is published so that both sides can independently verify inclusion. Root Network publishes these commitments today; anchoring them to a public chain is planned so that the history cannot be rewritten even by us.
