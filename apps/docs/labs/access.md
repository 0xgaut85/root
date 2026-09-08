# Access & API

## Requesting access

Email **labs@rootnetwork.co** with:

- your organisation and a short description of the research,
- expected monthly volume and target regions,
- a technical contact.

We reply within two business days. Onboarding includes identity verification and a usage agreement covering the [acceptable use policy](/data/acceptable-use). You then receive a signing key and dashboard access.

## Authentication

Every request is signed with your lab key. The client libraries handle signing; if you integrate directly, sign the canonical request with Ed25519 and pass the signature in the `Root-Signature` header along with your `Root-Key-Id`.

## Making a request

```bash
curl https://api.rootnetwork.co/v1/fetch \
  -H "Root-Key-Id: lab_3f9c..." \
  -H "Root-Signature: ..." \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/page",
    "region": "DE",
    "max_spend_usd": 0.02,
    "render": false
  }'
```

```json
{
  "status": 200,
  "headers": { "content-type": "text/html; charset=utf-8" },
  "body_b64": "PCFkb2N0eXBlIGh0bWw+...",
  "receipt_id": "rcpt_01J9...",
  "bytes": 48213,
  "region": "DE",
  "cost_usd": 0.0060
}
```

## Parameters

| Field | Type | Description |
| --- | --- | --- |
| `url` | string | Destination. Must be publicly accessible and pass destination policy |
| `region` | string | ISO country code. Omit for the default pool |
| `max_spend_usd` | number | Hard cap for this request. Rejected if the estimate exceeds it |
| `render` | boolean | Execute JavaScript and return the rendered DOM. Billed at 2× bytes |
| `headers` | object | Additional request headers. Authentication headers are rejected |
| `min_reputation` | number | Minimum node reputation (0–100). Default 50 |

## Receipts

`GET /v1/receipts/{receipt_id}` returns the routing and delivery receipts and the settlement it was included in, with the Merkle proof of inclusion.

## Rate card

`GET /v1/rates` returns current per-gigabyte rates by region for your plan.

## Client libraries

```bash
pip install rootnetwork
npm install @rootnetwork/sdk
```

```python
from rootnetwork import Client

root = Client(key_id="lab_3f9c...", secret=os.environ["ROOT_SECRET"])
page = root.fetch("https://example.com/page", region="DE", max_spend_usd=0.02)
print(page.status, page.bytes, page.receipt_id)
```

## Limits

Concurrency, monthly ceilings and per-project budgets are configured in the lab dashboard. Traffic stops at a ceiling; it never overruns.
