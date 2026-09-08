# Bandwidth proofs

Root Network pays for bytes. That only works if the network can prove, after the fact, that specific bytes moved through a specific connection at a specific time. Bandwidth proofs are how it does that without anyone having to read the traffic.

## Receipts

Every delivery produces two independent signed statements about the same event:

```text
RoutingReceipt {
  lab_id, node_id, router_id,
  destination_hash,
  bytes_metered,
  issued_at
}                                    signed by router

DeliveryReceipt {
  node_id, router_id,
  destination_hash,
  bytes_in, bytes_out,
  t_start, t_end
}                                    signed by node
```

Neither party can produce the other's receipt. A node cannot inflate its count without the router disagreeing; a router cannot under-report without the node disagreeing. A validator accepts a delivery only when the two agree.

## Integrity sampling

Agreement on byte counts is not enough on its own: a node could return the right number of wrong bytes. Validators therefore sample a fraction of deliveries and obtain a hash of the sealed response from the lab's client. Because the response is encrypted for the lab, this check does not expose content to the validator. A mismatch marks the delivery rejected and lowers the node's reputation.

## Capacity attestation

Each node periodically measures its own throughput and signs the result. Validators use these attestations to sanity-check delivery timings: a claimed 200 MB transfer in two seconds from a node that attests 20 Mbps is rejected.

## Aggregated proofs

Individual receipts are useful for disputes, but settlement works on totals. Validators aggregate all verified deliveries in a window into a compact commitment, a Merkle root over the receipts, which is published with each settlement. Any contributor can verify that their deliveries are included in the total they were paid from, and any lab can verify that the bytes they were billed for are the bytes that verified.

## What is not proven

The proofs establish that bytes moved through a node between a router and a destination. They do not, and are not meant to, reveal what those bytes were. Content is never part of the proof system.
