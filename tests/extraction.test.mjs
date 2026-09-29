// A quote proves provenance, not interpretation. These cases check what the frozen extraction returned and what the code refuses.
import test from "node:test";
import assert from "node:assert/strict";
import { factsFromMessages, checkFact, replay } from "../src/rules.js";
import { sha256 } from "../src/sha256.js";
import { scenarios, extractions, ctx, product, order } from "./helpers.mjs";

const factsOf = (...ids) => factsFromMessages(ids.map((m, i) => ({ message: m, at: `2026-09-2${i}` })), scenarios.messages, extractions);

test("every frozen extraction matches the exact message it was made from", () => {
  for (const [id, msg] of Object.entries(scenarios.messages)) assert.equal(extractions[id].message_sha256, sha256(msg), id);
});

test("a changed message never reuses its old extraction", () => {
  const texts = { ...scenarios.messages, "m-a-corr": scenarios.messages["m-a-corr"] + " Actually, fourteen." };
  const r = factsFromMessages([{ message: "m-a-corr", at: "x" }], texts, extractions);
  assert.deepEqual(r.facts, {});
  assert.match(r.dropped[0].reason, /changed after extraction/);
});

test("negation: 'not going in the garage' does not become the garage", () => {
  const { facts } = factsOf("m-a-neg");
  assert.doesNotMatch(String(facts.room_location.value), /^garage$/i);
  assert.equal(facts.stairs_count.value, 16);
});

test("correction: the corrected count wins over the one it corrects", () => {
  assert.equal(factsOf("m-a-corr").facts.stairs_count.value, 12);
});

test("a width without a unit is not a width", () => {
  assert.equal(factsOf("m-a-unit").facts.narrowest_door_in, undefined);
  assert.equal(checkFact("narrowest_door_in", { value: 32, quote: "is 32" }, scenarios.messages["m-a-unit"]), "no unit in the quote");
});

test("unknown is not zero", () => {
  assert.equal(factsOf("m-a-unknown").facts.stairs_count, undefined);
  assert.equal(checkFact("stairs_count", { value: 0, quote: "maybe a few" }, scenarios.messages["m-a-unknown"]), "count not in the quote");
});

test("conflicting messages: the later one replaces the earlier value", () => {
  assert.equal(factsOf("m-a-conf-1", "m-a-conf-2").facts.narrowest_door_in.value, 28);
});

test("a quote that is not in the message is dropped", () => {
  assert.equal(checkFact("room_location", { value: "garage", quote: "in the garage" }, "It goes upstairs."), "quote not found in the message");
});

test("a preliminary yes never approves a plan, whatever the extraction says", () => {
  // The frozen extraction for m-2050-1 labels "sounds good, go ahead" a final yes; the rule still holds.
  assert.equal(extractions["m-2050-1"].facts.approval_reply.value, "final_written_yes");
  const o = order("2050");
  const r = replay(o, product(o.handle), o.events, ctx);
  const auth = r.result.issues.find((i) => i.id === "authorization");
  assert.equal(auth.kind, "hold");
  assert.match(auth.finding, /preliminary reply, not approval/);
});

test("known extraction miss is recorded, not hidden: 1043's '30 inches wide' was not extracted", () => {
  // Re-running the extraction may fix this; if it does, update this test and the README.
  assert.equal(extractions["m-1043-1"].facts.narrowest_door_in, null);
});
