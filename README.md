# Delivery release check

A test of one idea: a delivery must not be released while an unrelated hold is open, whatever happens to payments, order details and shipping events around it. Built on the public catalog and delivery pages of a fitness equipment retailer (read September 29, 2026), with fictional customers and messages. It connects to no store.

Live page: https://theaipipe.com/fitness-delivery-check/

## Run the tests

Node 20 or later, no dependencies.

```
git clone https://github.com/fred1433/delivery-release-check && cd delivery-release-check
node --test tests/
```

The n8n workflow was also imported and run on a clean n8n instance with the same orders the page uses (Docker, image `docker.n8n.io/n8nio/n8n:latest`, n8n 2.41.3). To repeat it:

```
docker run -d --name n8n-drc-test -p 57891:5678 docker.n8n.io/n8nio/n8n:latest
node scripts/n8n_live_test.mjs n8n-drc-test 57891   # writes n8n/test-run.json
node --test tests/n8n.test.mjs                      # n8n's answers must equal the engine's
```

## What is here

| Path | What it is |
| --- | --- |
| `src/rules.js` | The rules and the event replay. Same file in the page, the tests and the n8n Code node. |
| `src/ledger.mjs` | Durable record of business actions (intended, then completed; reconcile before retrying). |
| `data/catalog.json` | 11 products as observed on their pages: services and prices from the selector, weight and size from the page's schema.org data, processing time, configuration choices. |
| `data/pages_text/` | Text of every page read, so each quoted rule can be checked word for word. |
| `data/scenarios.json` | 12 fictional orders and 19 fictional messages, as normalized test events. |
| `data/extractions.json` | Facts extracted from each message once, at build time, with the message's SHA-256. |
| `n8n/workflow.json` | Importable workflow: webhook, decision, response, explicit-PASS branch, disabled monday.com node. |
| `scripts/` | Page reader, site build, n8n build and the live n8n test. |

## Rule register

Source: pages read on 2026-09-29. Status for every rule: derived from public pages, not approved by the business. In production each rule needs an owner on the business side before it can block anything.

| Rule | Source | Applies to | Result | Tests |
| --- | --- | --- | --- | --- |
| Access facts before shipping: room, narrowest door, path photos, step count | Product page, Shipping Information | Room of choice, any room, garage installation, two-step | HOLD per missing fact | rules, replay |
| Steps against service paid (more than 3 on ground level) | Product page | Room of choice services | HOLD | rules |
| Garage delivery path: softer dirt, grass or a ledge | Product page | Garage delivery | HOLD; gravel is cleared, not flagged | rules |
| Delivery plan confirmed and approved in writing, per version; a later change of address or service voids it | Product page (two-step: final written YES); set by us for other room services | Room services | HOLD | replay, rules |
| Shopify shipping weight and page weight on opposite sides of 150 lb, or manufacturer weight differs by configuration | Shipping policy, product page, manufacturer | All | REVIEW for the catalog owner; never a customer question; no value replaced | rules, sources |
| Assembled size wider than the narrowest door | Product page dimensions | Fully assembled machines | REVIEW (feasibility), never "impossible" | rules |
| Local delivery eligibility | Shipping Information; shipping policy's 120 miles recorded as a different condition | California within 120 miles | Info, or REVIEW when the customer expects free delivery | rules |
| No tracking on a local order | Product page | Local California orders | Cleared (legitimate path) | rules |
| Requested date earlier than the fastest published path | Shipping Information, product processing time | Orders with a date | REVIEW | rules |
| Release only with explicit, owned hold IDs | Shopify `fulfillmentOrderReleaseHold` docs | Any release | Refused otherwise | replay |

## Runbook

- Duplicates: deliveries are deduplicated on the webhook id; payments on the event id. Business actions (drafts, tasks, payments) go through the durable ledger, which survives restarts and does not expire after 30 minutes. An action whose outcome is unknown is reconciled with the remote system before any retry.
- Failure handling: a missing, malformed or unknown event returns `release_decision: STOP`, never PASS. Only an explicit, current PASS continues toward the (simulated) handoff.
- Credentials: none in this repository. The monday.com node ships disabled with no credential; attach an HTTP header credential and a board id to use it.
- Rollback: the workflow writes nothing outside n8n while the monday.com node is disabled. Deactivating the workflow removes it from the order path.

## What this does not prove

- It is not connected to a store. Events are normalized test events, not native Shopify payloads; the Shopify adapter (HMAC on the raw body, `X-Shopify-Webhook-Id` and `X-Shopify-Event-Id`) is not built.
- The order structure is illustrative: how add-ons and payments are really recorded has not been checked.
- A monday.com item is a warning, not a lock. Blocking a real release needs the route that actually releases shipments.
- The extraction is a frozen example: one model read each fictional message once. A quote proves where a fact came from, not that it was read right. Known miss: in order 1043 the model did not extract "The bedroom door is 30 inches wide" (test `known extraction miss`).
- Distances are straight lines between Census ZIP centroids; road miles are longer.
- In n8n, the action record uses workflow static data, which is fine for the test instance; production needs a database table.
