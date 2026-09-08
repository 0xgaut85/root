# Routers

Routers are the network's traffic managers. They sit between labs and nodes, decide which node handles which request, seal traffic, meter it, and enforce policy.

## Responsibilities

**Node selection.** For each request a router picks a node that is online, in the right region, has spare allocation, meets the lab's reputation threshold, and has not recently been used for a related task. Selection is randomised within those constraints so that traffic spreads across the network.

**Sealing.** The router encrypts the request for the destination and arranges for the response to be encrypted for the lab. Nodes only ever handle envelopes.

**Metering.** The router records bytes in and bytes out for every delivery and issues a signed routing receipt that a validator can compare against the node's delivery receipt.

**Policy.** Destination checks, rate limits, the [acceptable use policy](/data/acceptable-use) and per-lab spend caps are all enforced at the router. A request that fails policy is rejected before it reaches any contributor.

**Latency.** Routers are deployed in multiple regions and requests are handled by the router closest to the selected node, keeping the added latency low.

## Trust model

A router can see which lab sent a request, which node relayed it, the destination, and the byte counts. It cannot read payloads. It cannot bill a lab or pay a node on its own; only a validator can write to the ledger, and only when the router's receipt matches the node's.

This means a malicious router could at worst refuse service or misreport a byte count, and misreported counts are caught at verification because the node independently signs its own receipt.

## Operation

Routers are operated by Root Network today. The protocol reserves a role for independent router operators, selected by stake and paid a share of network fees, once volume justifies it. Independent routers will be subject to slashing for reporting invalid traffic, censoring participants or violating policy.
