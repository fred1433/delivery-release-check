// The n8n export carries the same engine and fixtures as the page, and the recorded run on a clean
// n8n instance answered exactly what the engine computes.
import test from "node:test";
import assert from "node:assert/strict";
import { json, ctx, scenarios, product } from "./helpers.mjs";
import { workflow } from "../scripts/build_n8n.mjs";
import { replay, validateEvent } from "../src/rules.js";

const wf = json("n8n/workflow.json");

test("the committed workflow is what the build script produces from the current engine", () => {
  assert.deepEqual(wf, JSON.parse(JSON.stringify(workflow())));
});

test("every connection points at an existing node; the monday.com node ships disabled", () => {
  const names = new Set(wf.nodes.map((n) => n.name));
  for (const [from, c] of Object.entries(wf.connections)) {
    assert.ok(names.has(from));
    for (const branch of c.main) for (const t of branch) assert.ok(names.has(t.node), t.node);
  }
  assert.equal(wf.nodes.find((n) => n.name.startsWith("monday.com")).disabled, true);
  assert.match(wf.nodes.find((n) => n.name.startsWith("monday.com")).notes, /^Example only\. Keep external writes disabled/);
});

test("recorded n8n run: all executions succeeded and every answer equals the engine's", () => {
  const run = json("n8n/test-run.json");
  assert.equal(run.execution_log["n8n.workflow.success"], run.calls.length);
  assert.equal(run.execution_log["n8n.workflow.failed"], undefined);
  const logs = {};
  for (const c of run.calls) {
    const o = scenarios.orders.find((x) => x.id === c.request.order_id);
    if (!o || validateEvent(c.request.event)) { assert.equal(c.response.decision_valid, false, JSON.stringify(c.request.event)); assert.equal(c.response.release_decision, "STOP"); continue; }
    (logs[o.id] ||= []).push(c.request.event);
    const r = replay(o, product(o.handle), logs[o.id], ctx);
    assert.equal(c.response.verdict, r.result.verdict, `${o.id} after ${c.request.event.id}`);
    assert.deepEqual(c.response.open, r.result.openIds);
    assert.equal(c.response.duplicate, !!r.timeline.at(-1).duplicate);
  }
});
