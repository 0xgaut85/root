# Architecture overview

Root Network is a layered system. Each layer has one job, produces a receipt the next layer can check, and can be replaced without touching the others.

## Layers

| Layer | Run by | Job |
| --- | --- | --- |
| **Labs** | AI labs, research teams | Submit signed requests for public web data through the Root API |
| **Routers** | Root Network today; independent operators over time | Select nodes, seal traffic, meter bytes, enforce policy |
| **Root nodes** | Contributors | Relay sealed packets through residential connections |
| **Validators** | Root Network today; independent operators over time | Verify deliveries, write the contribution ledger, trigger settlement |
| **Ledger** | The network | Append-only record of every verified delivery and payment |

## Design principles

**Verify, then pay.** No contributor is paid for a delivery until a validator has matched the router's receipt against the node's receipt. No lab is billed for a delivery that did not verify.

**Sealed in transit.** Requests are encrypted so only the destination can read them; responses are encrypted so only the lab can read them. Nodes and routers handle envelopes, never contents.

**Least privilege at every hop.** A node knows the destination address and nothing else. A router knows the lab, the node and the byte counts, but not the payload. A validator sees receipts, not traffic.

**Policy at the router, not the node.** Destination allow-lists, rate limits and the acceptable use policy are enforced before a packet reaches a contributor, so a node never has to decide what is acceptable.

**Boring for contributors.** All of the above happens without configuration. A contributor picks an allocation and the rest is the network's problem.

## Request lifecycle

1. A lab calls the API with a destination URL, target region and per-request spend cap. The request is signed with the lab's key.
2. The router validates the signature and the destination against policy, selects a node, seals the request for the destination, and issues a **routing receipt** (lab, node, destination hash, timestamp).
3. The node receives the envelope, forwards it to the destination, receives the sealed reply, and returns it with a **delivery receipt** (bytes in, bytes out, timings), signed with the node's key.
4. The router forwards the sealed reply to the lab and both receipts to a validator.
5. The validator checks the receipts agree, samples the reply for integrity, and appends a **verified delivery** to the ledger.
6. At the end of the settlement window, the ledger totals are used to bill labs and credit contributors as described in [Earnings](/guide/earnings).

## Decentralisation path

Routers and validators are operated by Root Network today so that we can move fast on reliability and policy. The protocol is designed so that both roles can be opened to independent operators, with stake-weighted selection and slashing for misbehaviour, once the network has enough volume to make independent operation viable. This is described in the [Routers](/architecture/routers) and [Validators](/architecture/validators) pages.
