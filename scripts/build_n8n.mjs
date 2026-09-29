// Builds n8n/workflow.json: the same engine as the page (src/sha256.js + src/rules.js) and the same fixtures,
// inlined into one Code node. Run: node scripts/build_n8n.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const json = (p) => JSON.parse(read(p));

const strip = (src) => src
  .replace(/^import .*$/gm, "")
  .replace(/^export (const|function|class) /gm, "$1 ");

export function engineSource() {
  return strip(read("src/sha256.js")) + "\n" + strip(read("src/rules.js"));
}

export function fixtures() {
  const scenarios = json("data/scenarios.json");
  const catalog = json("data/catalog.json");
  const handles = new Set(scenarios.orders.map((o) => o.handle));
  return {
    scenarios,
    products: catalog.products.filter((p) => handles.has(p.handle)),
    extractions: json("data/extractions.json").messages,
    zips: json("data/zips.json").zips,
    manufacturer: json("data/manufacturer.json"),
  };
}

const handler = `
// Input: one normalized test event per request: { "order_id": "2050", "event": { "type": ..., "id": ..., "at": ..., ... } }.
// Events are normalized test events, not native Shopify payloads; a Shopify adapter (HMAC on the raw body,
// X-Shopify-Webhook-Id and X-Shopify-Event-Id) is not part of this workflow.
const body = $input.first().json.body || {};
const store = $getWorkflowStaticData('global');
store.events = store.events || {};
store.actions = store.actions || {};
const invalid = (why) => [{ json: { decision_valid: false, release_decision: 'STOP', reason: why } }];
const order = FIX.scenarios.orders.find((o) => o.id === String(body.order_id));
if (!order) return invalid('unknown order_id');
const ev = body.event;
// Validate the type and the fields that type needs BEFORE the event is stored or replayed.
const why = validateEvent(ev);
if (why) return invalid(why);
const product = FIX.products.find((p) => p.handle === order.handle);
const log = (store.events[order.id] = store.events[order.id] || []);
log.push(ev);
const ledger = { once(key, action) { if (store.actions[key]) return { created: false, key }; store.actions[key] = new Date().toISOString(); return { created: true, key, action }; } };
const ctx = { asOf: FIX.scenarios.as_of, zips: FIX.zips, texts: FIX.scenarios.messages, extractions: FIX.extractions, manufacturer: FIX.manufacturer };
const run = replay(order, product, log, ctx, ledger);
const last = run.timeline[run.timeline.length - 1];
const r = run.result;
return [{ json: {
  decision_valid: true,
  order_id: order.id,
  events_seen: log.length,
  duplicate: !!last.duplicate,
  verdict: r.verdict,
  label: r.label,
  open: r.openIds,
  new_actions: last.actions.map((a) => ({ kind: a.kind, title: a.title || null })),
  release: last.release || null,
  refused: !!last.refused,
  status: last.status || null,
  // Only an explicit, current PASS continues toward the (simulated) handoff. Anything else stops.
  checklist: r.verdict,
  // A checklist PASS is not a release: release_authorized is true only when a release event succeeded with named holds.
  release_authorized: !!last.release,
  has_new_actions: last.actions.length > 0,
  release_decision: last.duplicate || r.verdict !== 'PASS' ? 'STOP' : last.status && last.status.released && ev.type !== 'release_requested' ? 'NO_ACTION' : 'CONTINUE',
} }];
`;

export function workflow() {
  const code = `const FIX = ${JSON.stringify(fixtures())};\n${engineSource()}\n${handler}`;
  return {
    id: "DrcDemoWf0000001",
    name: "Delivery release check (simulated release decision)",
    nodes: [
      { parameters: { httpMethod: "POST", path: "delivery-release-check", responseMode: "responseNode", options: {} }, id: "a1f0c0de-0001-4000-8000-000000000001", name: "Order event", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [0, 0], webhookId: "5b0c9f5e-8d7c-4f6e-9a51-6f7d0d2a1c01" },
      { parameters: { jsCode: code }, id: "a1f0c0de-0001-4000-8000-000000000002", name: "Decide", type: "n8n-nodes-base.code", typeVersion: 2, position: [240, 0] },
      { parameters: { respondWith: "firstIncomingItem", options: {} }, id: "a1f0c0de-0001-4000-8000-000000000003", name: "Return decision", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1, position: [480, 0] },
      { parameters: { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ id: "c0nd-0001", leftValue: "={{ $json.release_decision }}", rightValue: "CONTINUE", operator: { type: "string", operation: "equals" } }], combinator: "and" }, options: {} }, id: "a1f0c0de-0001-4000-8000-000000000004", name: "Explicit PASS?", type: "n8n-nodes-base.if", typeVersion: 2, position: [720, 0] },
      { parameters: {}, id: "a1f0c0de-0001-4000-8000-000000000005", name: "Checklist passed (release stays with your team)", type: "n8n-nodes-base.noOp", typeVersion: 1, position: [960, -120] },
      { parameters: { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ id: "c0nd-0002", leftValue: "={{ $json.has_new_actions }}", rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true } }], combinator: "and" }, options: {} }, id: "a1f0c0de-0001-4000-8000-000000000007", name: "New actions?", type: "n8n-nodes-base.if", typeVersion: 2, position: [960, 120] },
      { parameters: { method: "POST", url: "https://api.monday.com/v2", authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendHeaders: true, headerParameters: { parameters: [{ name: "Idempotency-Key", value: "={{ 'drc-' + $json.order_id + '-' + ($json.open || []).join('+') }}" }, { name: "API-Version", value: "2025-10" }] }, sendBody: true, specifyBody: "json", jsonBody: "={{ JSON.stringify({ query: 'mutation ($board: ID!, $name: String!) { create_item (board_id: $board, item_name: $name) { id } }', variables: { board: 'REPLACE_WITH_BOARD_ID', name: 'Order ' + $json.order_id + ': ' + $json.label } }) }}", options: {} }, id: "a1f0c0de-0001-4000-8000-000000000006", name: "monday.com item (example only, disabled)", notes: "Example only. Keep external writes disabled until event validation, persistent state and action execution are connected and tested together.", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [1200, 120], disabled: true },
    ],
    connections: {
      "Order event": { main: [[{ node: "Decide", type: "main", index: 0 }]] },
      Decide: { main: [[{ node: "Return decision", type: "main", index: 0 }]] },
      "Return decision": { main: [[{ node: "Explicit PASS?", type: "main", index: 0 }]] },
      "Explicit PASS?": { main: [[{ node: "Checklist passed (release stays with your team)", type: "main", index: 0 }], [{ node: "New actions?", type: "main", index: 0 }]] },
      "New actions?": { main: [[{ node: "monday.com item (example only, disabled)", type: "main", index: 0 }], []] },
    },
    settings: { executionOrder: "v1" },
    pinData: {},
    active: false,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(path.join(root, "n8n"), { recursive: true });
  fs.writeFileSync(path.join(root, "n8n", "workflow.json"), JSON.stringify(workflow(), null, 2) + "\n");
  console.log("wrote n8n/workflow.json");
}
