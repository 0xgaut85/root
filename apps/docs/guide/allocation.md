# Allocation controls

You decide how much of your connection Root Network may use. The allocation is the single most important setting in the product, and it is designed to be changed often.

## The slider

The allocation slider, available in the dashboard and in the extension popup, sets the **maximum share of your measured capacity** the network may use at any instant. It ranges from 5% to 100%.

| Allocation | What it feels like |
| --- | --- |
| 5–15% | Invisible. Suitable for slow or shared connections |
| 20–40% | Default range. No noticeable effect on browsing or streaming |
| 50–80% | For always-on machines on fast connections |
| 100% | Dedicated node. Everything not used by you is available to the network |

The extension measures your capacity periodically with a short, small throughput test, and the router applies your percentage to that measurement. If your connection speed changes, the ceiling changes with it.

## Automatic back-off

Regardless of allocation, the network backs off when you are actively using your connection. If your browser is streaming, downloading or on a call, the router lowers your node's traffic until you are done. You do not need to adjust anything for this to happen.

## Pause

Pausing sets your allocation to zero without changing your saved setting. Traffic stops within seconds. Resume restores your previous allocation. Pausing does not affect your reputation or your settled balance.

## Schedules

You can set an allocation schedule from the dashboard, for example 80% overnight and 20% during the day. Schedules are evaluated in your local time zone and applied by the extension.

## Per-device allocation

Each paired device has its own allocation. A desktop that is always on can run at 80% while a laptop runs at 15%. The dashboard shows each device separately.

## Data caps

If your internet plan has a monthly data cap, set a **monthly budget** in gigabytes from the dashboard. The network will stop using your node when the budget is reached and resume when the month resets. The budget counts only traffic relayed through the network, not your own use.
