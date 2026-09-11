# Chrome Web Store submission kit

**Published.** Listing: https://chromewebstore.google.com/detail/jlgmdngjhimpgjeceddehokdjcbglebg · Extension ID `jlgmdngjhimpgjeceddehokdjcbglebg` (stable across updates; the server reads it from `EXTENSION_ID`).

To ship an update: bump `version` in `manifest.json`, run `npm run build:extension -- --store` from `apps/earn`, upload the new `root-network-extension-store.zip` in the developer dashboard → **Package** → **Upload new package**, then **Submit for review**. Users get it automatically within a few hours of approval.

Everything in this folder is ready to paste into the developer dashboard. Only steps that need your Google account are left.

## Files

| File | Use |
| --- | --- |
| `root-network-extension-store.zip` | Upload as the package (built with `npm run build:extension -- --store` from `apps/earn`; production hosts only, `manifest.json` at zip root) |
| `screenshot-1-popup.png` … `screenshot-4-pairing.png` | Store screenshots, 1280×800 (upload all four, in order) |
| `promo-tile-440x280.png` | Small promo tile |
| `../icons/icon128.png` | Store icon (128×128) |

Rebuild images with the scripts in `C:\Users\jum\tmp\rootnet\store-shots.mjs` + `compose.mjs` if the popup changes.

## Steps (you)

1. Go to https://chrome.google.com/webstore/devconsole and sign in with the Google account that should own the listing (use a company account, not a personal one; ownership transfer later is painful). Pay the one-time $5 registration fee.
2. **Account tab** → fill publisher name `Root Network`, contact email, and verify the email. Set **Privacy policy URL** on the item, not the account (see below).
3. **New item** → upload `root-network-extension-store.zip`.
4. **Store listing** → paste the copy below, upload icon, 4 screenshots, promo tile. Category: **Productivity** (or *Tools*). Language: English.
5. **Privacy practices** → paste the single-purpose statement, permission justifications and data disclosures below. Privacy policy URL: `https://rootnetwork.co/privacy`.
6. **Distribution** → Visibility **Unlisted** until you are ready to open the app (the install link works, but the listing does not appear in search or on the store home). Switch to Public later with no re-review of the listing.
7. Submit for review. Typical turnaround is 1–3 business days; MV3 with only `storage` + `alarms` and one narrow host permission is low-risk.

## Store listing copy

**Name** (45 max)
`Root Network — Put your idle internet to work`

**Summary** (132 max)
`Share the bandwidth you don't use with verified AI research labs. Set a percentage, keep your data, get paid in dollars.`

**Description**
```
Your internet connection sits idle most of the day. Root Network lets you put that unused capacity to work for AI research and get paid for it, in dollars, not tokens.

HOW IT WORKS
1. Install the extension and sign in at earn.rootnetwork.co. Pairing is one click.
2. Choose how much of your connection the network may use, from 5% to 100%. Change it or pause any time.
3. Verified AI labs route requests for public web content through participating connections. Your node relays sealed packets it cannot read.
4. Every byte is verified before you are paid. Labs pay per gigabyte; 70% goes to contributors, Root Network keeps a flat 30% fee. Withdraw in USDC on Base or USDG on Robinhood Chain with no fees.

WHAT YOU SEE
• Live throughput and a sparkline of recent activity
• Today's earnings, data shared and your balance
• An allocation slider and a pause switch, right in the popup
• A dashboard with hourly earnings, network totals and every device you have paired

WHAT IT NEVER DOES
• Read, record or modify your browsing. No access to pages, history, cookies or passwords.
• Inject anything into websites. Its only page script runs on earn.rootnetwork.co, for pairing.
• Use more than the share you allow, or run when paused.
• Mine, compute or run anything other than bandwidth relays.

A NETWORK YOU CAN AUDIT
Contributors, nodes online, gigabytes shared and what labs paid are published live at earn.rootnetwork.co/data. The protocol is documented at read.rootnetwork.co.

Root Network sells bandwidth, not you. Privacy policy: rootnetwork.co/privacy
```

**Category** Productivity · **Language** English (United States)

**Official URL** `https://rootnetwork.co` · **Support URL** `https://rootnetwork.co/privacy` (or a support address once you have one)

## Privacy practices tab

**Single purpose description**
`Relays sealed bandwidth requests from verified AI research labs through the user's connection, within a share the user sets, and reports verified usage to the user's Root Network dashboard so they can be paid.`

**Permission justifications**

| Permission | Justification |
| --- | --- |
| `storage` | Stores the device pairing token, the user's allocation and pause state, the last measured capacity and a short history of throughput samples used to draw the popup sparkline. Nothing else is stored. |
| `alarms` | Schedules the periodic heartbeat (every 30 s) that reports relayed bytes and receives the next assignment, and a capacity re-measurement every 6 hours. Required because MV3 service workers cannot keep timers alive. |
| Host permission `https://earn.rootnetwork.co/*` | The extension's own backend: pairing, heartbeats, capacity probe download and unpair. Also lets the dashboard on this origin detect the installed extension and pair it with one click via a content script limited to this origin. No other origin is requested. |
| Remote code | **No.** All code ships in the package; nothing is fetched or evaluated at runtime. |

**Data usage disclosures** — tick:

- ☑ Personally identifiable information → *no* (the extension itself handles no PII; sign-in happens on the website)
- ☑ Authentication information → **yes**: an opaque device token issued at pairing, stored locally, sent only to `earn.rootnetwork.co`
- ☑ Website content → no · Web history → no · User activity → no · Location → no (the server derives country from the connecting IP; the extension sends nothing)
- ☑ Personal communications → no · Financial and payment info → no · Health → no

Certify all three statements: not sold to third parties; not used for purposes unrelated to the single purpose; not used for creditworthiness or lending.

## Before flipping to Public

- `earn.rootnetwork.co` is live and is the extension's default API base, its only host permission, and the popup's "Open dashboard" target. The default `*.up.railway.app` domains were removed; each service redirects any stray Railway host to its canonical domain.
- `PRIVY_APP_ID` / `PRIVY_APP_SECRET` / `VITE_PRIVY_APP_ID`, `ALLOW_DEV_AUTH=0`, `PUBLIC_URL` and `EXTENSION_ID` are set on the `earn` service.
- Add `https://earn.rootnetwork.co` to the Privy app's allowed origins.
- Bump `version` in `manifest.json` for every new upload; the store rejects duplicate versions.
- Replace the landing page's "Coming soon" popups with the real links.
