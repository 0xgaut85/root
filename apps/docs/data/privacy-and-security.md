# Privacy & security

Root Network is built so that sharing bandwidth cannot become sharing anything else. This page lists what the extension can and cannot do, and what protects you.

## What the extension cannot do

- It **cannot read your browsing**. It has no permission to access tab contents, history, cookies or form data.
- It **cannot read the traffic it relays**. Requests are encrypted for the destination; responses are encrypted for the lab. Your node handles sealed envelopes.
- It **cannot exceed your allocation**. The ceiling is enforced by the router before traffic is sent and by the extension when it is received.
- It **cannot use your device for computation**. There is no workload other than relaying packets.
- It **cannot install anything**. The extension is self-contained and updates only through the browser's extension mechanism.

## What protects you

**Sealed traffic.** End-to-end encryption between the lab and the destination means a compromised node, router or validator sees ciphertext.

**Policy at the router.** Destination allow-lists and the [acceptable use policy](/data/acceptable-use) are enforced before a request reaches your connection. Your node never relays traffic to a destination the network has not vetted.

**Verified labs.** Every lab is identity-verified, signs a usage agreement, and signs every request with its own key. Abuse is attributable.

**Signed receipts.** Your node signs what it delivered with a key that never leaves your device. No one can attribute traffic to your node that your node did not sign for.

**Minimal storage.** The extension stores its configuration and key locally and nothing else. The network stores receipts, not content.

## Permissions

The extension requests the minimum permissions needed to relay traffic and pair with your dashboard. It does not request access to your browsing history, tabs, bookmarks, downloads or clipboard.

## Antivirus and firewalls

Root Network's extension is signed and distributed through your dashboard. If your security software flags it, it is because the extension opens outbound connections on your behalf, which is its purpose. Add an exception or contact us before doing so if you are unsure.

## Reporting a vulnerability

Email **security@rootnetwork.co**. We respond within 48 hours and pay bounties for verified reports.
