// One test per defect found by the fresh review of the finished page (2026-09-29). Each failed before its fix.
import test from "node:test";
import assert from "node:assert/strict";
import { replay } from "../src/rules.js";
import { ctx, product, order, catalog, text } from "./helpers.mjs";

const o = order("2050");
const p = product(o.handle);
const steps = Object.fromEntries(o.walkthrough.map((w) => [w.step, w.events]));
const upTo = (n) => [...o.events, ...[1, 2, 3, 4].filter((s) => s <= n).flatMap((s) => steps[s])];
const at = (m) => `2026-09-29T2${m}:00:00-06:00`;
const entered = (key, value, m = 0) => ({ type: "fact_entered", id: `t-${key}-${m}`, at: at(m), key, value, by: "Ops" });
const issue = (r, id) => r.result.issues.find((i) => i.id === id);

test("1. a door narrower than a mostly assembled machine asks for a feasibility decision", () => {
  const r = replay(o, p, [...upTo(1), entered("narrowest_door_in", 20)], ctx);
  const door = issue(r, "door");
  assert.ok(door, "no door issue for a 20 in door and a 35 in wide machine");
  assert.equal(door.kind, "review");
  assert.match(door.finding, /arms removed/i);
});

test("1b. boxed machines say the comparison does not run, instead of staying silent", () => {
  const b = order("1049");
  const r = replay(b, product(b.handle), b.events, ctx);
  const door = issue(r, "door");
  assert.ok(door);
  assert.equal(door.kind, "info");
  assert.match(door.finding, /^Not compared/);
});

test("2. a new address voids the access facts of the old one and asks again", () => {
  const r = replay(o, p, [...upTo(3), ...o.variant.events], ctx);
  const open = r.result.openIds;
  for (const k of ["access:narrowest_door_in", "access:stairs_count", "access:path_photos", "access:room_location"]) assert.ok(open.includes(k), k);
  assert.ok(r.state.draft, "a draft to the customer must ask again");
});

test("3. the model remark appears only when no plan was ever issued", () => {
  const moved = replay(o, p, [...upTo(3), ...o.variant.events], ctx);
  assert.doesNotMatch(issue(moved, "authorization").finding, /extraction model/);
  const svc = replay(o, p, [...upTo(3), { type: "service_changed", id: "s1", at: at(1), service: "Room of Choice - Ground Level (0-3 Steps)" }], ctx);
  assert.doesNotMatch(issue(svc, "authorization").finding, /extraction model/);
  assert.match(issue(replay(o, p, upTo(0), ctx), "authorization").finding, /extraction model/);
});

test("4. a change after release is its own explicit hold, and open questions still reach the draft", () => {
  const r = replay(o, p, [...upTo(4), { type: "service_changed", id: "s2", at: at(5), service: "Room of Choice - Ground Level (0-3 Steps)" }], ctx);
  assert.equal(r.result.verdict, "HOLD");
  assert.ok(issue(r, "after-release"), "no explicit after-release state");
  const asks = r.result.issues.filter((i) => i.kind === "hold" && i.ask);
  assert.ok(asks.length > 0);
  assert.ok(r.state.draft, "a hold with a question is open but no draft exists");
});

test("5. the stair question does not claim the customer said it when ops entered the count", () => {
  const b = order("1043");
  const r = replay(b, product(b.handle), [...b.events, entered("stairs_count", 9)], ctx);
  assert.doesNotMatch(issue(r, "steps").ask, /Your message/);
  const fromMsg = replay(b, product(b.handle), b.events, ctx);
  assert.match(issue(fromMsg, "steps").ask, /Your message/);
});

test("6. path photos are labelled as the customer's claim, not as received", () => {
  const app = text("site/app.js");
  assert.match(app, /Customer says sent/);
  assert.doesNotMatch(app, /\["sent", "Received"\]/);
});

test("7. clearing a step count says it was cleared, not that the message only gives a floor", () => {
  const r = replay(o, p, [...upTo(0), entered("stairs_count", null)], ctx);
  const i = issue(r, "access:stairs_count");
  assert.match(i.finding, /Cleared on this ticket/);
  assert.doesNotMatch(i.finding, /a floor, not a step count/);
});

test("8. an approval voided by a change stays void when the change is undone", () => {
  const svc = (s, m) => ({ type: "service_changed", id: `sv-${m}`, at: at(m), service: s });
  const r = replay(o, p, [...upTo(3), svc("Room of Choice - Ground Level (0-3 Steps)", 1), svc("Room of Choice - Stair Carry (4+ Steps)", 2)], ctx);
  assert.equal(issue(r, "authorization").kind, "hold");
});

test("10. dimensions follow the page's visible L x W x H", () => {
  const sdc = catalog.products.find((x) => x.handle.startsWith("body-solid-sdc2000g"));
  assert.deepEqual([sdc.dimensions_in.length, sdc.dimensions_in.width, sdc.dimensions_in.height], [39, 46, 83]);
});

test("11. a negative or fractional step count is refused, not taken", () => {
  for (const bad of [-1, 2.5]) {
    const r = replay(o, p, [...upTo(0), entered("stairs_count", bad)], ctx);
    assert.equal(r.state.facts.stairs_count.value, 22, `value ${bad} was taken`);
    assert.ok(r.timeline.at(-1).effects.join(" ").includes("not accepted"));
  }
});

test("9. on phones the first order card keeps the 16px gutter when snapped", () => {
  assert.match(text("site/style.css"), /scroll-padding-inline: 16px/);
});

test("4b. after release the page locks the order fields instead of letting them contradict the freight box", () => {
  const app = text("site/app.js");
  assert.match(app, /factRow\(row, st\.facts, st\.released\)/);
  assert.match(app, /data-fact="service" aria-label="Service on the order"\$\{st\.released \? " disabled"/);
});
