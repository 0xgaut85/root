# How Root Network Pays People for Unused Home Internet

**Title:** 56 characters including spaces  
**Sponsored link:** https://rootnetwork.co  
**Image (one):** `images/01-featured-antenna-field.png`

---

How Root Network Pays People for Unused Home Internet

AI labs spend a lot of time on the public web. They collect pages for training sets, check models against live sites, and run agents that need to browse the way a person would. Most of that traffic still leaves from data-center IP addresses, because those are cheap and easy to meter.

Websites have learned to treat those addresses as bots. A page fetched from a cloud range is often thinner, slower, or blocked. The same URL loaded from a house in São Paulo, Lyon, or Detroit can look completely different. If you are trying to measure the web people actually see, a rack in Virginia is the wrong place to stand.

![Antenna radiation pattern.](images/01-featured-antenna-field.png)

Research teams usually want three things. They want public pages as they appear in a given country. They want a record that the download finished. They want a spending limit that does not move. What they get instead is often a proxy list with no named operators and a household at the other end who is paid poorly, if at all.

That arrangement helps nobody for long. Labs cannot check what they bought. People at home cannot tell research traffic from junk. Site owners cannot tell a university crawl from an attack, so they block both.

Root Network (https://rootnetwork.co) is built for that gap. People share the part of their home connection they are not using. Verified AI labs pay to reach public websites through those connections. The network records what was delivered and pays the household in dollars.

A home internet plan is sold as a fixed pipe. Most of the day, only a slice of it is in use. Root Network does not run jobs on your computer. It uses leftover capacity so a request can leave from a normal residential address. Labs already have machines that generate text. What they lack is a clean way to ask the public web a question from the same kind of connection a person has.

The path is straightforward. Someone at home sets how much of their connection the network may use. A lab sends a signed request for a public URL and names a country if it needs one. A router chooses a node in that region and encrypts the request so the household software cannot read it. The extension forwards the request, waits for the reply, and sends the reply back. A validator compares receipts from both sides. If they match, the household is paid.

Labs pay per gigabyte that actually arrives. Contributors receive 70 percent of that payment. Root Network keeps 30 percent to run routing, verification, lab checks, support, and withdrawals. On the standard plan a lab pays $1.25 per gigabyte, so 87.5 cents go to contributors and $0.375 stays with the network. Academic and non-profit work is $1.50 per gigabyte. Larger volume starts at $0.95. If a request fails or is blocked by policy, nobody is charged.

Earnings show up as a dollar balance. People can withdraw from $5, with no fee from Root Network.

The software at home is a browser extension for Chrome, Brave, Edge, and Arc. You set a percentage of your connection and you can pause it at any time. If your plan has a monthly data cap, you can set a gigabyte budget as well. The extension does not see your tabs, history, cookies, or passwords. It does not use your processor to train models. Traffic is encrypted between the lab and the website, so the computer that forwards it cannot read the page.

Policy is applied before a request reaches anyone's house. Labs can load public pages and public APIs. They cannot open accounts, pass logins, or change anything on the destination site. Each request is signed by a lab whose identity has been checked. If it reached an extension, it already cleared those rules.

A lab call is an HTTP request: a URL, an optional country, and a cap on spend. The lab does not learn who forwarded it. After a delivery, both sides produce a receipt. Settlement adds up the verified traffic and publishes the totals: what labs paid, what went to contributors, and what the network kept. Onboarding takes about two business days because the lab is reviewed by a person. That is slower than buying a proxy list. It is also why a household can be told what travels through their address: public pages, for a named research team, under a contract.

If you build datasets or run evaluations and cloud IPs keep giving you a broken copy of the web, Root Network is an API with country targeting, receipts, and a hard budget. Client libraries exist for Python and TypeScript. If you have a home connection in a country we can pay, you install the extension, keep the slider low at first, and turn it off whenever you want.

Details, pricing, and the rules labs have to follow are on https://rootnetwork.co.

This story was published under HackerNoon’s Business Blogging Program.
