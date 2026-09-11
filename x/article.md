# X Article — Root Network

**Post from:** @rootnetworkco (or founder account, then repost from the brand)
**Cover image:** the red/black grain gradient from the landing page with the R mark centered, 1600×900. No text on the image.
**Inline images (optional, in this order):** `unused_assets/router6__ghost.png` (ghost router), the Data page node map screenshot, the Settings payout-rail screenshot.

---

# You pay for 500 Mbps. You use 20. Somebody is already selling the rest.

Look at your router right now.

The little light is blinking. It blinks all day, even when nobody is home. Your ISP sold you a pipe, and for about 22 hours out of 24 that pipe is empty.

Now here is the part nobody tells you.

That empty pipe is one of the most wanted resources on the internet in 2026, and there is a multi-billion-dollar industry built on renting it out. Not renting it *to* you. Renting *yours*, to someone else, without you ever seeing a cent.

Let me explain who is paying, why, and why we built Root Network to send that money back to the house it came from.

## The web looks different from a house

AI labs live on the public web. They build training sets from it, they check their models against live pages, and they run agents that need to browse the way a person would.

Almost all of that traffic leaves from data centers. And websites have learned to hate data centers.

Load a page from an AWS range and you get the thin version: a captcha, a login wall, a 403, a stripped-down page with half the content missing. Load the same URL from a house in Detroit, Lyon or São Paulo and you get what a human sees.

If you are trying to measure the web that people actually use, a rack in Virginia is the wrong place to stand.

So labs pay for **residential IPs**. Connections that look like a home, because they are a home.

## The dirty secret of "residential proxies"

This is already a huge business. Residential proxy providers charge **$3 to $15 per gigabyte** for exactly this: traffic that exits from a real household's connection.

Where do the households come from?

Mostly from free apps and SDKs bundled into software you already have. VPNs. Ad blockers. Games. Screensavers. Somewhere in a 40-page terms of service you agreed to "share unused resources." Your connection became inventory. The provider got paid dollars per gigabyte. You got a free flashlight app.

The few networks that do pay the household pay in points, tokens, or a few cents per gigabyte, and you usually cannot tell what traffic went through your address or who sent it.

Everyone in that chain is worse off:

- The lab cannot verify what it bought.
- The household cannot tell research traffic from junk.
- Website owners cannot tell a university crawl from an attack, so they block both.

It works only because the person supplying the resource is not in the room.

## What Root Network does instead

Root Network is a bandwidth network with the household as the customer, not the product.

You share the slice of your home connection you are not using. Verified AI labs pay to reach **public websites** through it. The network records what was delivered and pays you in **dollars**.

Here is the money, in one line:

**Labs pay $1.25 per gigabyte. 70% goes to you. We keep 30%.**

A dollar per gigabyte to the house. $0.25 to run routing, verification, lab vetting, support and withdrawals. Academic and non-profit work pays more ($1.50). Big volume pays a bit less ($0.95). If a request fails or gets blocked by policy, nobody is charged, and nobody is paid.

Compare that to cents-per-gigabyte and "points" that may or may not turn into anything, and you understand why we think this is a different category, not a better version of the same thing.

## How a request actually travels

Because "share your bandwidth" sounds scary until you know what is inside the pipe.

1. You install a browser extension (Chrome, Brave, Edge, Arc) and set a percentage of your connection. 10%. 30%. Whatever you want. Pause it any time.
2. A lab sends a signed request for a public URL, optionally naming a country.
3. A router picks a node in that region and encrypts the request so **your** software cannot read it.
4. Your extension forwards the request, gets the reply, sends it back.
5. Both sides produce a receipt. A validator compares them. If they match, you are paid.

That is it. No jobs run on your computer. Your CPU is not training anyone's model. The extension does not see your tabs, history, cookies or passwords. It cannot read the pages it forwards, because they are encrypted end to end between the lab and the website.

## Policy is enforced before it reaches your house

This is the part we care about most.

Labs can load public pages and public APIs. They **cannot** open accounts, pass logins, post, or change anything on a destination site. Every request is signed by a lab whose identity was checked by a human. Onboarding a lab takes about two business days, and that is on purpose. It is slower than buying a proxy list. It is also the reason we can tell you exactly what travels through your address: public pages, for a named research team, under a contract.

If a request made it to your extension, it already cleared those rules.

## Getting paid

Earnings accumulate as a dollar balance in your dashboard. You withdraw from **$5**, no fee from us, as:

- **USDC on Base**, or
- **USDG on Robinhood Chain**

Pick one in settings, paste an address, done. Every payout leaves from a single public treasury wallet, so you can verify on-chain that the money is real and that it is moving.

The dashboard also shows the whole network live: gigabytes delivered, active nodes on a world map, what labs paid this week, what went to contributors, what we kept. We publish the split because the whole point is that the person supplying the resource should be able to see the ledger.

## "How much will I actually make?"

Honest answer: it depends on demand in your region, and early on it is better than it will be later.

Right now lab demand is well ahead of supply, so a household that shares a modest slice of its connection is landing in the low single-digit dollars per day. That will come down as more homes join, and we would rather tell you that now than have you find out.

But the floor still matters. Even when it settles, a dollar per gigabyte for something that was sitting idle beats a free flashlight app.

## Every home becomes a node

There is a bigger idea here than a side income.

The internet was designed so that anyone's machine could serve anyone else. Then it got centralized into a few dozen buildings, and now the people who need to see the web from the outside are paying a fortune to pretend they live in a house.

They should just pay the house.

Root Network is that. A network where the edge is your living room, the customer is a lab that has been vetted, the traffic is public pages only, and the money goes where the bandwidth came from.

## What to do now

- If you have a home connection: go to **rootnetwork.co**, follow **@rootnetworkco**, and be first in line when the extension opens. Start with a low slider. Turn it off whenever you want.
- If you build datasets or run evaluations and cloud IPs keep handing you a broken copy of the web: we are an API with country targeting, receipts and a hard budget. Python and TypeScript clients. Talk to us.
- If you are a website owner: named labs, public pages only, signed requests. You can finally tell a research crawl from an attack.

Your router light is blinking right now.

It might as well be earning.

---

## Launch posts (post the article, then quote it with these over 48h)

**1 — the hook (pin this)**
> You pay for 500 Mbps.
> You use about 20.
>
> There is a $B industry renting the other 480 to AI labs at $3–15/GB.
>
> You get a free flashlight app.
>
> We built Root Network to pay the house instead. $1/GB, in dollars.
>
> Full write-up 👇

**2 — the contrast**
> Residential proxy providers: charge labs $3–15 per GB of *your* connection.
> "Passive income" apps: pay you points, or a few cents.
> Root Network: labs pay $1.25/GB, you get $0.875, in USDC.
>
> Same pipe. Different recipient.

**3 — the safety objection**
> "Share my bandwidth" sounds scary until you know what's in the pipe.
>
> Public pages only. Encrypted end to end so your extension can't read it. Signed by a lab a human vetted. No CPU used. No tabs, cookies or passwords.
>
> If it reached your house, it already passed the rules.

**4 — the ledger**
> We publish the split every week: what labs paid, what went to contributors, what we kept (30%).
>
> One public treasury wallet. Every payout is on-chain.
>
> If you're supplying the resource, you should be able to see the ledger.

**5 — the line**
> The internet was built so anyone's machine could serve anyone else.
>
> Then it moved into 40 buildings, and now labs pay a fortune to pretend they live in a house.
>
> They should just pay the house.
>
> Every home becomes a node.

**Reply to your own pinned post with:** rootnetwork.co (keep the link out of the main post body; X down-ranks external links in the post itself).
