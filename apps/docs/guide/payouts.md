# Payouts

Earnings are held as a dollar balance in your account and can be withdrawn to any EVM address you choose, in the dollar you prefer.

## Balance

Your **settled balance** is the sum of all verified settlement windows minus previous withdrawals. It is shown at the top of your dashboard and is available to withdraw at any time above the minimum.

## Two ways to be paid

Root Network pays in fully-reserved dollar stablecoins, on two rails. You pick one in **Settings → Payouts** and can switch at any time.

| | USDC on Base | USDG on Robinhood Chain |
| --- | --- | --- |
| Issuer | Circle | Paxos (Global Dollar Network) |
| Network | Base, Coinbase's Ethereum L2 (chain ID 8453) | Robinhood Chain, an Arbitrum Orbit L2 (chain ID 4663) |
| Token contract | `0x8335…2913` | `0x5fc5…d168` |
| Explorer | [basescan.org](https://basescan.org/address/0x3e32A1b643A81927802E7Fa202709395Ce8D1821) | [robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com/address/0x3e32A1b643A81927802E7Fa202709395Ce8D1821) |
| Address format | `0x…` (any EVM wallet) | `0x…` (Robinhood wallet or any EVM wallet) |
| Typical settlement | Under a minute | Under a minute |
| Fee | None | None |

Both are 1:1 dollar tokens. One `0x` address works for either rail, so you can switch rails without changing your address.

## Withdrawing

1. Open **Settings → Payouts** in your dashboard.
2. Pick your rail and enter your payout address. If you signed in with a wallet, you can use it in one tap.
3. Press **Withdraw** and confirm the amount.

Withdrawals are sent from the Root Network treasury, `0x3e32A1b643A81927802E7Fa202709395Ce8D1821`, on both chains. The **Data** page of the dashboard lists the latest transfers leaving the treasury with a link to each transaction, so you can verify yours on-chain.

| | |
| --- | --- |
| Minimum withdrawal | $5.00 |
| Fee | None from Root Network. Network gas is covered by us |
| Frequency | Unlimited |
| Currency | USDC (Base) or USDG (Robinhood Chain) |

## Automatic payouts

You can enable automatic payouts to send your balance to your address whenever it crosses a threshold you choose ($10, $25, $50 or $100). This is the recommended setting for contributors who do not want to think about it.

## Eligibility

Root Network pays contributors in every jurisdiction where it can do so lawfully. If you are in a jurisdiction subject to sanctions or significant regulatory restrictions, you will not be able to withdraw. Your dashboard tells you if this applies to you before you install the extension.

## Taxes

Payouts are income in most jurisdictions. A statement of all settled earnings and withdrawals per calendar year is available from support. Root Network does not withhold taxes on your behalf.
