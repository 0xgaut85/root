# Validators

Validators are the network's auditors. They confirm that what a router says happened is what a node says happened, and only then write the delivery to the ledger that drives payment.

## What a validator checks

For every delivery a validator receives two signed receipts:

- the **routing receipt** from the router: lab id, node id, destination hash, timestamp, bytes metered;
- the **delivery receipt** from the node: destination hash, bytes in, bytes out, timings.

The validator confirms that:

1. both signatures are valid and correspond to a registered router and node;
2. the destination hashes match;
3. the byte counts agree within tolerance;
4. the timings are plausible for the node's measured capacity;
5. the delivery does not duplicate an earlier one.

A sample of deliveries is additionally checked for **response integrity**: the validator requests a hash of the sealed response from the lab's client and compares it with the router's record. A node that returns corrupted or fabricated responses is detected here.

## Outcomes

- **Verified**: appended to the [contribution ledger](/architecture/contribution-ledger). The lab is billed and the contributor is credited at settlement.
- **Rejected**: not written. Neither side is billed or paid. Repeated rejections lower the node's or router's [reputation](/architecture/node-reputation).

## Settlement

At the end of each settlement window a validator totals verified bytes per lab and per node, computes the contributor pool (70% of lab payments) and each node's weighted share, and publishes the settlement. Contributor balances update at that moment.

## Operation

Validators are run by Root Network today. As with routers, the protocol reserves a role for independent validators once volume justifies it, with stake-weighted assignment and slashing for accepting invalid deliveries.
