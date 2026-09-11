# Root Node

A Root node is the network's gateway to the internet. It is free to run, lightweight, and today takes the form of a browser extension. Node operators, meaning contributors running the extension, are paid for the traffic relayed through their node and are assigned traffic based on their reputation and the demand in their region.

## What a node does

1. **Relays** sealed requests from a router to the destination website.
2. **Returns** the sealed response to the router, together with a signed delivery receipt.

That is the complete job. A node does not decide where traffic goes, does not open what it carries, and does not store anything about it.

## Running a node

Running a node is free and takes about a minute.

1. Sign in at [earn.rootnetwork.co](https://earn.rootnetwork.co)
2. Add the Root extension from the [Chrome Web Store](https://chromewebstore.google.com/detail/jlgmdngjhimpgjeceddehokdjcbglebg) (or from the **Extension** page); the dashboard pairs it automatically
3. Choose an allocation

See [Set up Root Network](/guide/set-up) for the full guide.

## Supported systems

| System | Availability | Notes |
| --- | --- | --- |
| Chrome, Brave, Edge, Arc (Windows, macOS, Linux) | Available on the [Chrome Web Store](https://chromewebstore.google.com/detail/jlgmdngjhimpgjeceddehokdjcbglebg) | Chromium-based browsers, Chrome 116 or newer |
| Desktop node (Windows, macOS, Linux) | In development | Runs without a browser open |
| Android | In development | |

## Node operation

On first launch the extension pairs with your account and registers the node. Registration issues the node a key pair; the private half never leaves your device and is used to sign every delivery receipt.

Once online, a node:

- reports a heartbeat to the network every few seconds so routers know it is available,
- measures its own capacity periodically so your allocation percentage maps to a real number,
- accepts sealed envelopes up to its current allocation, and
- backs off automatically when it detects you are actively using your connection.

Each envelope a node receives carries only a destination address. The payload is encrypted for the destination; the reply is encrypted for the lab. Both directions are authenticated with signatures from the lab, the router and the node, so a validator can later prove exactly who moved what.

## Resource usage

A node uses a few megabytes of memory and negligible CPU. Its network usage is bounded by your allocation. It does not write to disk except for its own configuration and key.

## Privacy and security

The network is not using your computer or looking at anything on it. All a node does is route sealed traffic through your IP address, which is entirely separate from your activity. That means **zero access to your private data.** Everything the network fetches is publicly accessible web content.

For more, see [Privacy & security](/data/privacy-and-security).
