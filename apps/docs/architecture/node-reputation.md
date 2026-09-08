# Node reputation

Routers choose among eligible nodes partly by reputation. A node's reputation is a score from 0 to 100 that summarises how reliably it has delivered in the past. New nodes start at 50.

## Dimensions

| Dimension | Measures | Moves the score when |
| --- | --- | --- |
| **Completeness** | Whether deliveries finish with the full response | A response is truncated or a delivery times out |
| **Consistency** | Whether the node's receipts agree with routers' receipts | Byte counts or timings disagree |
| **Timeliness** | Latency and throughput relative to attested capacity | Deliveries are much slower than the node's own attestation |
| **Availability** | Uptime and heartbeat regularity | The node goes offline mid-delivery or flaps frequently |

## Effect on earnings

Reputation feeds the **reliability multiplier** used at settlement, from 0.8× at the low end to 1.25× at the high end. It also affects selection: labs can set a minimum reputation for their traffic, and routers prefer higher-reputation nodes when several are eligible.

## Recovery

Scores move slowly in both directions. A bad week on a flaky connection lowers a node a few points; a clean week brings it back. Going offline does not lower reputation on its own; only interrupted deliveries do. Pausing is always safe.

## Abuse

Nodes that return fabricated responses, run on ineligible IPs (data centres, VPNs), or are operated by the same person under multiple accounts are removed from the network and forfeit unsettled earnings.
