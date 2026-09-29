// The featured order: payment, measurement, approval, installer. Payment confirmed; release still blocked.
import test from "node:test";
import assert from "node:assert/strict";
import { replay, buildReleaseHold } from "../src/rules.js";
import { ctx, product, order } from "./helpers.mjs";

const o = order("2050");
const p = product(o.handle);
const steps = Object.fromEntries(o.walkthrough.map((w) => [w.step, w.events]));
const upTo = (n) => [...o.events, ...[1, 2, 3, 4].filter((s) => s <= n).flatMap((s) => steps[s])];
const open = (r) => r.result.issues.filter((i) => i.kind === "hold" || i.kind === "review").map((i) => i.id).sort();

test("before any action: payment recorded, separate holds (door, unreviewed photos, plan), one draft", () => {
  const r = replay(o, p, upTo(0), ctx);
  assert.equal(r.result.verdict, "HOLD");
  assert.deepEqual(open(r), ["access:narrowest_door_in", "access:path_photos", "authorization"]);
  assert.equal(r.state.payments.length, 1);
  assert.equal(r.timeline.flatMap((t) => t.actions).filter((a) => a.kind === "draft").length, 1);
});

test("1. the same payment delivered twice is recorded once, holds unchanged, no new draft or item", () => {
  const before = replay(o, p, upTo(0), ctx);
  const after = replay(o, p, upTo(1), ctx);
  assert.equal(after.state.payments.length, 1);
  assert.deepEqual(open(after), open(before));
  const last = after.timeline.at(-1);
  assert.equal(last.duplicate, true);
  assert.equal(last.actions.length, 0);
  assert.equal(last.release, undefined);
});

test("2. adding the door width resolves only that item", () => {
  const before = open(replay(o, p, upTo(1), ctx));
  const after = open(replay(o, p, upTo(2), ctx));
  assert.deepEqual(before.filter((x) => !after.includes(x)), ["access:narrowest_door_in"]);
  assert.deepEqual(after.filter((x) => !before.includes(x)), []);
});

test("3. a written approval of the current plan version passes; changing the address afterwards voids it", () => {
  const r = replay(o, p, upTo(3), ctx);
  assert.equal(r.result.verdict, "PASS");
  const moved = replay(o, p, [...upTo(3), ...o.variant.events], ctx);
  assert.equal(moved.result.verdict, "HOLD");
  const auth = moved.result.issues.find((i) => i.id === "authorization");
  assert.match(auth.finding, /Plan version 1 was approved by Sam R\., but delivery address \(plan: 80202; now: 80205\)/);
});

test("changing the service after approval also voids it", () => {
  const r = replay(o, p, [...upTo(3), { type: "service_changed", id: "s1", at: "2026-09-29T12:10:00-06:00", service: "Room of Choice - Ground Level (0-3 Steps)" }], ctx);
  assert.ok(open(r).includes("authorization"));
});

test("4. released with named holds; 'delivered to installer' is not delivery to the customer", () => {
  const r = replay(o, p, upTo(4), ctx);
  const rel = r.timeline.find((t) => t.event.type === "release_requested");
  assert.deepEqual(rel.release.variables.holdIds.length, 2);
  assert.equal(r.state.freight, "at installer");
  assert.equal(r.state.customerDelivery, "open");
  assert.equal(r.state.installation, "open");
});

test("a release is refused while anything is on hold", () => {
  const r = replay(o, p, [...upTo(1), { type: "release_requested", id: "rx", at: "2026-09-29T09:30:00-06:00", by: "Ops", hold_ids: "owned" }], ctx);
  const t = r.timeline.at(-1);
  assert.equal(t.refused, true);
  assert.equal(r.state.released, false);
});

test("no payment event ever produces a release request", () => {
  const r = replay(o, p, upTo(1), ctx);
  for (const t of r.timeline.filter((x) => x.event.type === "payment_received")) assert.equal(t.release, undefined);
});

test("fulfillmentOrderReleaseHold without explicit, owned holdIds is refused", () => {
  const owned = ["gid://shopify/FulfillmentHold/1"];
  assert.throws(() => buildReleaseHold({ fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1", ownedHoldIds: owned }), /without explicit holdIds/);
  assert.throws(() => buildReleaseHold({ fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1", holdIds: [], ownedHoldIds: owned }), /without explicit holdIds/);
  assert.throws(() => buildReleaseHold({ fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1", holdIds: ["gid://shopify/FulfillmentHold/9"], ownedHoldIds: owned }), /not owned/);
  const ok = buildReleaseHold({ fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1", holdIds: owned, ownedHoldIds: owned });
  assert.deepEqual(ok.variables.holdIds, owned);
});
