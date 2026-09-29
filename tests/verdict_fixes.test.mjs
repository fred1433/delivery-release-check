// One regression per defect reproduced by ChatGPT 6 Pro on the finished page (2026-09-29, points A to K).
import test from "node:test";
import assert from "node:assert/strict";
import * as R from "../src/rules.js";
import { replay, validateEvent, checkFact } from "../src/rules.js";
import { appendStep, canRelease } from "../src/walk.js";
import { ctx, product, order, scenarios, text } from "./helpers.mjs";

const o = order("2050");
const p = product(o.handle);
const at = (m) => `2026-09-30T1${m}:00:00-06:00`;
const edit = (key, value, m) => ({ type: "fact_entered", id: `x-${key}-${m}`, at: at(m), key, value, by: "you, on this page" });
const walk = (n, base = o.events) => { let h = [...base]; for (let s = 1; s <= n; s++) h = appendStep(o, p, h, s, ctx); return h; };
const issue = (r, id) => r.result.issues.find((i) => i.id === id);

test("A. steps 1-3, clear the door, then step 4: release refused, nothing at the installer", () => {
  let h = walk(3);
  h.push(edit("narrowest_door_in", null, 1));
  assert.equal(canRelease(o, p, h, ctx), false, "the release button must be disabled");
  h = appendStep(o, p, h, 4, ctx);
  const r = replay(o, p, h, ctx);
  assert.equal(r.state.released, false);
  assert.notEqual(r.state.freight, "at installer");
  assert.ok(r.timeline.some((t) => t.event.type === "release_requested" && t.refused));
  assert.ok(!h.some((e) => e.type === "carrier_update"), "no installer receipt after a refused release");
  assert.ok(!issue(r, "after-release"));
});

test("A. an edit before the release is never processed as if it came after it", () => {
  let h = walk(3);
  h.push(edit("narrowest_door_in", 20, 1));
  h = appendStep(o, p, h, 4, ctx);
  const r = replay(o, p, h, ctx);
  assert.equal(r.state.released, false);
  assert.ok(!issue(r, "after-release"));
});

test("B. approved plan for 22 steps, then 40 steps: approval stale, release refused", () => {
  const h = [...walk(3), edit("stairs_count", 40, 2), { type: "release_requested", id: "rr", at: at(3), by: "Ops" }];
  const r = replay(o, p, h, ctx);
  const a = issue(r, "authorization");
  assert.equal(a.kind, "hold");
  assert.match(a.finding, /step count \(plan: 22; now: 40\)/);
  assert.equal(r.state.released, false);
});

test("B. plan versions are immutable: re-issuing version 1 changes nothing", () => {
  const h = [...walk(3), { type: "plan_issued", id: "p1b", at: at(2), version: 1, summary: "cheaper, smaller scope" }];
  const r = replay(o, p, h, ctx);
  assert.equal(r.state.plans[1].summary.startsWith("Fictional plan details"), true);
  assert.equal(r.timeline.at(-1).refused, true);
});

test("C. unknown garage entrance is not 'none'", () => {
  const g = order("2052");
  const r = replay(g, product(g.handle), [...g.events, edit("ledge_or_step_at_garage", null, 1)], ctx);
  assert.equal(r.result.verdict, "HOLD");
  assert.ok(issue(r, "access:garage-ledge"));
});

test("C. garage installation needs a 60 in path", () => {
  const b = order("1044");
  const evs = [{ type: "order_created", id: "c1", at: at(0), service: "Garage Installation" },
    edit("room_location", "garage", 1), edit("narrowest_door_in", 36, 2), edit("path_photos", "received", 3), edit("stairs_count", 0, 4), edit("ledge_or_step_at_garage", false, 5)];
  const r = replay(b, product(b.handle), evs, ctx);
  assert.ok(issue(r, "garage-install"));
  assert.match(issue(r, "garage-install").finding, /60 in/);
});

test("C. an entered fact is never rendered as a customer quote", () => {
  const g = order("2052");
  const r = replay(g, product(g.handle), [...g.events, edit("driveway_surface", "dirt", 1)], ctx);
  const f = issue(r, "access:garage").finding;
  assert.doesNotMatch(f, /null|The message/);
  assert.match(f, /Driveway entered on this ticket/);
});

test("D. carrier probes: only delivered + customer closes customer delivery", () => {
  const released = walk(3).concat([{ type: "release_requested", id: "rel", at: at(1), by: "Ops" }]);
  const probes = [
    [{ status: "in_transit", location: "customer" }, "open"],
    [{ status: "delivered", location: "terminal" }, "open"],
    [{ status: "out_for_delivery" }, "open"],
    [{ status: "exception", location: "customer" }, "open"],
    [{ status: "delivered", location: "installer" }, "open"],
    [{ status: "delivered", location: "customer" }, "delivered"],
  ];
  for (const [probe, expected] of probes) {
    const r = replay(o, p, [...released, { type: "carrier_update", id: "cu", at: at(2), ...probe }], ctx);
    assert.equal(r.state.customerDelivery, expected, JSON.stringify(probe));
  }
});

test("E. the same payment event under a new delivery id changes nothing, not even the service", () => {
  const h = [...o.events, { type: "service_changed", id: "sc", at: at(1), service: "Curbside Delivery Only" },
    { type: "payment_received", id: "e3b", at: at(2), webhook_id: "wh-new", event_id: "ev-88121", amount: 699, for_service: "Room of Choice - Stair Carry (4+ Steps)" }];
  const r = replay(o, p, h, ctx);
  assert.equal(r.state.service, "Curbside Delivery Only");
  assert.equal(r.state.payments.length, 1);
  assert.equal(r.timeline.at(-1).duplicate, true);
});

test("F. unsupported types and incomplete events are rejected before anything is recorded", () => {
  assert.match(validateEvent({ type: "banana", id: "b", at: at(0) }), /unsupported/);
  assert.match(validateEvent({ type: "carrier_update", id: "c", at: at(0) }), /needs status/);
  assert.match(validateEvent({ type: "carrier_update", id: "c", at: at(0), status: "delivered", location: "moon" }), /location/);
  const r = replay(o, p, [...walk(3), { type: "banana", id: "b", at: at(1) }], ctx);
  assert.equal(r.timeline.at(-1).rejected, true);
});

test("F. n8n: validation before storage, monday.com node only reachable through new actions", () => {
  const wf = JSON.parse(text("n8n/workflow.json"));
  const code = wf.nodes.find((n) => n.name === "Decide").parameters.jsCode;
  assert.ok(code.indexOf("validateEvent(ev)") < code.indexOf("log.push(ev)"));
  const into = Object.entries(wf.connections).filter(([, c]) => c.main.flat().some((t) => t.node.startsWith("monday.com"))).map(([k]) => k);
  assert.deepEqual(into, ["New actions?"]);
});

test("F/G/H. honest texts on the page and in the README", () => {
  const html = text("site/index.html");
  assert.match(html, /The browser demonstrates event replay without external writes/);
  assert.match(text("README.md"), /Example only\. Keep external writes disabled until event validation, persistent state and action execution are connected and tested together\./);
  assert.match(text("src/rules.js"), /Proposed approval control: this example requires written customer approval of the confirmed plan\./);
  assert.match(text("src/rules.js"), /This example pauses release until Ops confirms the applicable weight and routing\./);
});

test("I. photos the customer says were sent still need your team's review", () => {
  const r = replay(o, p, o.events, ctx);
  assert.match(issue(r, "access:path_photos").title, /customer says sent, not yet reviewed/);
});

test("I. 80 cm is not 80 in, and 2 is not 22", () => {
  assert.equal(checkFact("narrowest_door_in", { value: 80, quote: "80 cm" }, "The door is 80 cm."), "unit is not inches");
  assert.equal(checkFact("stairs_count", { value: 2, quote: "22 steps" }, "There are 22 steps."), "count not in the quote");
  assert.equal(checkFact("stairs_count", { value: 22, quote: "22 steps" }, "There are 22 steps."), null);
});

test("K. fictional business names say so", () => {
  for (const id of ["2050", "2051"]) assert.match(order(id).customer, /\(fictional\)/);
});

test("A. the page keeps one chronological history: steps are appended after edits, never rebuilt before them", () => {
  const app = text("site/app.js");
  assert.match(app, /import \{ appendStep, canRelease \} from "\.\/walk\.js"/);
  assert.doesNotMatch(app, /concat\(state\.edits/);
  assert.match(app, /data-act="step"\$\{releaseOk \? "" : " disabled"\}/);
});

test("J. the intro is one short disclosure and the action labels say what they do", () => {
  const html = text("site/index.html");
  assert.match(html, /Fictional orders, using your public products and delivery rules\. No store connection\. Proposed controls are marked\./);
  const labels = order("2050").walkthrough.map((w) => w.label);
  assert.deepEqual([labels[0], labels[2], labels[3]], ["Replay payment event", "Use sample plan and approval", "Release; simulate installer receipt"]);
  assert.match(html, /This check would run inside your existing n8n handoff\. Your team would keep its current tools and retain release decisions\./);
});

test("E. replaying the full history with a persistent action ledger rebuilds the same state (n8n replays every call)", () => {
  const { MemoryLedger } = R;
  const ledger = new MemoryLedger();
  const h = walk(1);
  const first = replay(o, p, h.slice(0, 3), ctx, ledger);
  const again = replay(o, p, h, ctx, ledger);
  assert.equal(first.state.service, "Room of Choice - Stair Carry (4+ Steps)");
  assert.equal(again.state.service, "Room of Choice - Stair Carry (4+ Steps)");
  assert.equal(again.result.verdict, "HOLD");
  assert.equal(again.state.payments.length, 1);
});
