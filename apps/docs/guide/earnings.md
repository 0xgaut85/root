# Earnings

Root Network pays contributors in dollars for verified bandwidth. There are no points, epochs or tiers to decode. This page explains exactly what you are paid for and how the amount is computed.

## What you are paid for

You earn when the network **uses** your connection to deliver traffic. Each confirmed delivery adds bytes to your account. At the end of every settlement window (currently one hour), those bytes are converted to dollars.

Two things determine how much your node is used:

- **Availability**: your node is online and has unused allocation.
- **Selection**: routers prefer nodes with a strong [reputation](/architecture/node-reputation) in regions with demand, and they rotate across nodes so no single connection is overused.

You do not need to do anything to be selected. Stay online, keep an allocation that leaves you comfortable, and let the routers work.

## How the amount is computed

For each settlement window:

1. Every lab payment for that window is pooled. **80%** of the pool is set aside for contributors; 20% goes to Root Network.
2. Each delivery in the window is weighted: `weight = bytes × region_multiplier × reliability_multiplier`.
3. Your payout is your share of the total weight, applied to the contributor pool.

**Region multiplier** reflects what labs pay for access from your country. Demand is not uniform; some regions are worth more per gigabyte because they are harder to reach.

**Reliability multiplier** rewards connections that complete deliveries quickly and consistently. It ranges from 0.8 for new or unstable nodes to 1.25 for nodes with a long clean record.

### Example

Suppose labs paid **$12,000** for a window in which the network delivered **9,600 GB**. The contributor pool is $9,600, or **$1.00 per weighted GB**. Your node delivered 4.2 GB from a 1.1× region with a 1.15× reliability score, so your weight is 5.31 GB and you earn **$5.31** for that window.

## Live estimate vs. settled

Your dashboard shows two numbers:

- **Live**: an estimate updated every few seconds from deliveries that routers have reported but validators have not yet confirmed.
- **Settled**: the confirmed amount after validators have verified the window. This is what you can withdraw.

The two normally agree within a few percent. If a delivery fails verification, it is removed from the live figure at settlement.

## What does not earn

- Being online without traffic. Availability is necessary but the network pays for bytes delivered, not for idle time.
- Traffic that fails verification, for example a response that did not match the router's receipt.
- Traffic above your allocation. The network never sends more than you allowed, so this does not happen in practice.

## Maximising earnings

- Keep the extension running while your computer is on. Sleeping laptops are offline.
- Allocate as much as you are comfortable with. Allocation is the ceiling; the network only uses what it needs.
- Use a wired or strong Wi-Fi connection. Latency and packet loss lower your reliability multiplier.
- Avoid VPNs on the same machine. A VPN moves your exit to a data-center IP, which is not eligible.
