# What is Root Network

Root Network is a bandwidth network for AI research. People share the part of their internet connection they do not use; AI labs pay to route their traffic through it; the network verifies what was delivered and pays contributors in dollars.

## The problem we started from

Most home connections sit idle for the majority of the day. You pay for a fixed pipe, and you use a fraction of it. At the same time, AI labs need enormous, geographically diverse, residential-grade access to the public web to build training sets, evaluate models against the live internet, and run agents that browse like real users do.

Today that demand is served by a handful of data-center proxy vendors with opaque pricing, and the people whose connections actually make it possible see none of the value.

Root Network is our answer: connect the two sides directly, verify every byte, and pass most of the money through to the people supplying the resource.

## What makes Root Network different

**Paid in dollars, not points.** Your dashboard shows earnings in USD from the first hour. There is no points system to decode, no token to wait for, and no conversion rate that changes under you.

**Transparent take rate.** AI labs pay the network for bandwidth. Contributors receive 80% of what labs pay. Root Network keeps 20% to run routers, validators, support and compliance. That is the whole business model, and you can read it in [How Root Network makes money](/economics/how-we-make-money).

**You set the limits.** The extension lets you allocate a percentage of your connection to the network and change it at any time. Pausing is instant. The network never uses more than you allowed.

**Your data is never in the loop.** Traffic relayed through your node is encrypted end-to-end between the lab and the destination website. Your node forwards sealed packets and never sees, stores or touches what is inside. Nothing on your device is read, and nothing you do online is visible to the network.

**Only public web data.** Labs use Root Network to reach publicly accessible web pages and APIs. The [acceptable use policy](/data/acceptable-use) is enforced at the router, not left to good faith.

## Who it is for

- **Contributors** who want their idle connection to pay for itself, with no configuration beyond a slider.
- **AI labs and research teams** who need reliable residential access to the public web with verifiable delivery and predictable pricing.

## Where it runs

Root Network runs today as a browser extension for Chromium-based browsers (Chrome, Brave, Edge, Arc), paired with a dashboard at [earn.rootnetwork.co](https://earn.rootnetwork.co). Desktop and mobile nodes are in development.
