// Imports n8n/workflow.json into a clean n8n instance (Docker), publishes it, sends the page's fixtures as
// normalized events, and saves every response to n8n/test-run.json. tests/n8n.test.mjs then checks that the
// recorded n8n answers equal what the page's engine computes for the same events.
// Usage: node scripts/n8n_live_test.mjs <container-name> <host-port>
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const [container = "n8n-drc-test", port = "57891"] = process.argv.slice(2);
const sh = (...a) => execFileSync("docker", a, { encoding: "utf8" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
execFileSync("node", ["scripts/build_n8n.mjs"]);
sh("cp", "n8n/workflow.json", `${container}:/tmp/workflow.json`);
sh("exec", container, "n8n", "import:workflow", "--input=/tmp/workflow.json");
sh("exec", container, "n8n", "publish:workflow", "--id=DrcDemoWf0000001");
sh("restart", container);
const url = `http://localhost:${port}/webhook/delivery-release-check`;
for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${port}/healthz`); if (r.ok) break; } catch {} await sleep(1000); }
await sleep(4000);

const sc = JSON.parse(fs.readFileSync("data/scenarios.json", "utf8"));
const calls = [];
for (const o of sc.orders.filter((x) => x.featured)) {
  const events = [...o.events, ...(o.walkthrough || []).flatMap((w) => w.events)];
  for (const ev of events) calls.push({ order_id: o.id, event: ev });
}
calls.push({ order_id: "2050", event: { type: "payment_received", at: "2026-09-30T09:00:00-06:00" } });
calls.push({ order_id: "2050", event: { type: "banana", id: "b1", at: "2026-09-30T09:01:00-06:00" } });
calls.push({ order_id: "2050", event: { type: "carrier_update", id: "c9", at: "2026-09-30T09:02:00-06:00" } });
calls.push({ order_id: "2050", event: { type: "payment_received", id: "e3c", at: "2026-09-30T09:03:00-06:00", webhook_id: "wh-other", event_id: "ev-88121", amount: 699, for_service: "Room of Choice - Stair Carry (4+ Steps)" } });
calls.push({ order_id: "9999", event: { type: "order_created", id: "x", at: "2026-09-30T09:00:00-06:00" } });

const out = [];
for (const c of calls) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
  out.push({ request: c, status: res.status, response: body });
}
const version = sh("exec", container, "n8n", "--version").trim();
// Execution record from n8n's own event log: every run must end in workflow.success.
const log = sh("exec", container, "sh", "-c", "cat /home/node/.n8n/n8nEventLog*.log");
const counts = {};
for (const line of log.split("\n")) {
  let j; try { j = JSON.parse(line); } catch { continue; }
  const n = j.eventName || "";
  if (n === "n8n.workflow.success" || n === "n8n.workflow.failed" || n === "n8n.node.finished") {
    const k = n === "n8n.node.finished" ? `node finished: ${j.payload.nodeName}` : n;
    counts[k] = (counts[k] || 0) + 1;
  }
}
fs.writeFileSync("n8n/test-run.json", JSON.stringify({ n8n_version: version, ran_at: new Date().toISOString(), image: "docker.n8n.io/n8nio/n8n:latest", execution_log: counts, calls: out }, null, 2) + "\n");
console.log(`n8n ${version}: ${out.length} calls`);
for (const o of out) console.log(o.status, o.request.order_id, o.request.event.type, o.response.verdict || o.response.reason || JSON.stringify(o.response).slice(0, 120), o.response.release_decision || "", o.response.duplicate ? "DUP" : "");
