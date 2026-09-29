// Each rule has at least one case that passes and one that stops, on real products and invented messages.
import test from "node:test";
import assert from "node:assert/strict";
import { replay, evaluate, initialState, LABELS } from "../src/rules.js";
import { scenarios, ctx, product, order, allEvents } from "./helpers.mjs";

const run = (id, events) => { const o = order(id); return replay(o, product(o.handle), events || o.events, ctx); };
const ids = (r) => r.result.issues.filter((i) => i.kind === "hold" || i.kind === "review").map((i) => i.id).sort();

// A state built by hand, for single-rule cases.
function state(id, patch) {
  const o = order(id);
  const st = initialState(o, product(o.handle), ctx);
  return { ...st, service: o.events[0].service, ...patch };
}
const fact = (value) => ({ value, quote: null, by: "test" });

test("expected verdict for every fixture", () => {
  const expected = { 2050: "PASS", 2051: "REVIEW", 2052: "PASS", 1041: "HOLD", 1043: "HOLD", 1044: "HOLD", 1045: "HOLD", 1046: "REVIEW", 1047: "REVIEW", 1048: "PASS", 1049: "HOLD", 1051: "HOLD" };
  for (const o of scenarios.orders) {
    const r = replay(o, product(o.handle), allEvents(o), ctx);
    assert.equal(r.result.verdict, expected[o.id], `order ${o.id}`);
  }
});

test("access evidence: each missing fact is its own hold; complete evidence clears them", () => {
  assert.deepEqual(ids(run("1045")).filter((i) => i.startsWith("access")), ["access:narrowest_door_in", "access:path_photos", "access:stairs_count"]);
  const full = evaluate(state("1045", { facts: { room_location: fact("basement"), narrowest_door_in: fact(36), path_photos: fact("received"), stairs_count: fact(12) } }));
  assert.equal(full.issues.filter((i) => i.id.startsWith("access")).length, 0);
});

test("a floor is not a step count", () => {
  const i = run("1045").result.issues.find((x) => x.id === "access:stairs_count");
  assert.match(i.finding, /a floor, not a step count/);
});

test("steps against service: 14 steps on ground level holds; 2 steps does not", () => {
  assert.ok(ids(run("1043")).includes("steps"));
  const ok = evaluate(state("1043", { facts: { stairs_count: fact(2) } }));
  assert.ok(!ok.issues.some((i) => i.id === "steps"));
});

test("garage delivery: softer dirt and a lip hold; gravel is cleared, not flagged", () => {
  assert.equal(run("1044").result.label, LABELS.access);
  const r = run("2052");
  assert.equal(r.result.verdict, "PASS");
  assert.ok(r.result.issues.some((i) => i.id === "cleared:gravel" && i.kind === "cleared"));
});

test("no tracking number on a local order is a legitimate path, not an alarm", () => {
  const r = run("2052");
  assert.ok(r.result.issues.some((i) => i.id === "cleared:tracking" && i.kind === "cleared"));
});

test("an assembled machine wider than the door asks for a feasibility decision, never 'impossible'", () => {
  const r = evaluate(state("1041", { facts: { room_location: fact("den"), narrowest_door_in: fact(20), path_photos: fact("received"), stairs_count: fact(0) } }));
  const door = r.issues.find((i) => i.id === "door");
  assert.equal(door.kind, "review");
  assert.doesNotMatch(door.finding, /impossible|cannot/i);
  const fits = evaluate(state("1041", { facts: { narrowest_door_in: fact(30) } }));
  assert.ok(!fits.issues.some((i) => i.id === "door"));
});

test("weight records: disagreement across the 150 lb line is a REVIEW for the catalog, with no customer question", () => {
  const r = run("2051");
  const w = r.result.issues.find((i) => i.id === "config:weight");
  assert.equal(w.kind, "review");
  assert.equal(w.ask, undefined);
  assert.match(w.finding, /674 lb/);
  assert.ok(!r.timeline.some((t) => t.actions.some((a) => a.kind === "draft")));
  const same = run("1048");
  assert.ok(!same.result.issues.some((i) => i.id === "config:weight"), "13 lb and 99.2 lb sit on the same side: no review");
});

test("local eligibility is never inferred from distance", () => {
  const z = run("1041").result.issues.find((i) => i.id === "zone");
  assert.match(z.finding, /Eligibility requires checkout or operations confirmation/);
  const edge = run("1047").result.issues.find((i) => i.id === "zone");
  assert.equal(edge.kind, "review");
  assert.match(edge.finding, /different condition/);
});

test("a date the published times cannot meet goes to your team; a reachable one does not", () => {
  assert.ok(ids(run("1046")).includes("date"));
  const later = evaluate(state("1046", { facts: { need_by: fact("2026-11-30") } }));
  assert.ok(!later.issues.some((i) => i.id === "date"));
});

test("two-step plan: a preliminary yes holds; a sent plan approved in writing passes", () => {
  assert.ok(ids(run("1049")).includes("authorization"));
  const o = order("1049");
  const evs = [...o.events,
    { type: "plan_issued", id: "p1", at: "2026-09-29T09:00:00-06:00", version: 1, summary: "x", for: { service: "Assembly - Any Room (2 Step Process)", zip: "80202" } },
    { type: "plan_approved", id: "p2", at: "2026-09-29T10:00:00-06:00", version: 1, by: "Chris O.", channel: "email", text: "YES" }];
  assert.ok(!ids(replay(o, product(o.handle), evs, ctx)).includes("authorization"));
});

test("a service not listed for the product holds", () => {
  const r = evaluate(state("1048", { service: "Room of Choice - Stair Carry (4+ Steps)" }));
  assert.ok(r.issues.some((i) => i.id === "service" && i.kind === "hold"));
});
