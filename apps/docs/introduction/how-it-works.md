# How it works

A request from an AI lab travels through four stages before a contributor gets paid. Each stage is verifiable by the next.

<div class="rn-flow">
<div class="rn-flow__node"><b>AI lab</b><span>Submits a signed request for a public URL through the Root API.</span></div>
<div class="rn-flow__arrow">→</div>
<div class="rn-flow__node"><b>Router</b><span>Chooses an eligible node by region, reputation and allocation. Seals the packet.</span></div>
<div class="rn-flow__arrow">→</div>
<div class="rn-flow__node"><b>Root node</b><span>Your extension relays the sealed packet to the website and returns the sealed reply.</span></div>
<div class="rn-flow__arrow">→</div>
<div class="rn-flow__node"><b>Validator</b><span>Verifies delivery, records bytes to the ledger, credits your account.</span></div>
</div>

## 1. A lab asks for public web data

A research team integrates the Root API into their pipeline. Every request is signed with the lab's key and carries the destination, the desired region, and a spending cap. The request never contains anything about you; it does not know who you are.

## 2. A router picks a node

Routers are the traffic managers of the network. For each request they select a node that:

- is in the requested region,
- has spare allocation right now (you decide how much with the slider in your dashboard),
- has a reputation score above the lab's threshold, and
- has not been used for a similar task recently, so load and risk are spread across the network.

The router then seals the request. Sealing means the request is encrypted so that only the destination website can open it, and the response is encrypted so that only the lab can read it. Your node receives an opaque envelope and a delivery address.

## 3. Your node relays the sealed packet

The Root extension running in your browser forwards the envelope to the website, waits for the sealed answer, and hands it back to the router. That is all your node ever does. It cannot read the request, it cannot read the response, and it stores neither.

Because the traffic exits from your connection, the website sees an ordinary residential visitor, which is exactly what makes the network valuable to labs.

## 4. A validator verifies and pays

Validators receive a receipt from the router and a receipt from your node for every delivery. They check that both sides agree on what was sent, how many bytes were moved, and how long it took. Confirmed deliveries are written to the [contribution ledger](/architecture/contribution-ledger), and your balance in the dashboard increases.

## The money

Labs pay per gigabyte delivered. Of every dollar a lab pays:

<div class="rn-split"><div class="rn-split__a">70% · contributors</div><div class="rn-split__b">30% · Root</div></div>
<div class="rn-split-legend"><span>Split by bytes delivered, weighted by region and reliability</span><span>Routers, validators, support</span></div>

Your share of the 70% is proportional to the verified bytes your node delivered, weighted by the demand in your region and the reliability of your connection. The math is explained in [Earnings](/guide/earnings).
