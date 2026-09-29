// Durable action record: concurrent duplicates, restart, late replay, ambiguous timeout.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileLedger } from "../src/ledger.mjs";

const fresh = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "drc-ledger-")), "actions.jsonl");

test("five concurrent duplicates run the action once", async () => {
  const file = fresh();
  let runs = 0;
  const ledgers = Array.from({ length: 5 }, () => new FileLedger(file));
  const out = await Promise.all(ledgers.map((l) => l.perform("item:2050:access", async () => { runs++; await new Promise((r) => setTimeout(r, 20)); return { id: "m-1" }; })));
  assert.equal(runs, 1);
  assert.equal(out.filter((o) => o.outcome === "done").length, 1);
  assert.equal(out.filter((o) => o.outcome === "already-done").length, 4);
});

test("after a restart the record is still there", async () => {
  const file = fresh();
  await new FileLedger(file).perform("draft:2050", async () => "d1");
  let runs = 0;
  const r = await new FileLedger(file).perform("draft:2050", async () => { runs++; });
  assert.equal(r.outcome, "already-done");
  assert.equal(runs, 0);
});

test("a replay long after the first delivery (past a 30-minute cache) does not act again", async () => {
  const file = fresh();
  await new FileLedger(file, { now: () => "2026-09-29T10:00:00Z" }).perform("payment:ev-88121", async () => "p1");
  let runs = 0;
  const r = await new FileLedger(file, { now: () => "2026-09-29T13:00:00Z" }).perform("payment:ev-88121", async () => { runs++; });
  assert.equal(r.outcome, "already-done");
  assert.equal(runs, 0);
});

test("ambiguous timeout: the next attempt reconciles instead of repeating", async () => {
  const file = fresh();
  const remote = new Set();
  const l = new FileLedger(file);
  await assert.rejects(l.perform("item:2050:plan", async () => { remote.add("item:2050:plan"); throw new Error("timeout after send"); }));
  assert.equal(l.status("item:2050:plan"), "intended");
  let runs = 0;
  const r = await new FileLedger(file).perform("item:2050:plan", async () => { runs++; }, { checkRemote: async (k) => ({ exists: remote.has(k), result: { id: "m-7" } }) });
  assert.equal(r.outcome, "reconciled");
  assert.equal(runs, 0);
});

test("an unknown outcome with no way to check is refused, not repeated", async () => {
  const file = fresh();
  const l = new FileLedger(file);
  await assert.rejects(l.perform("item:x", async () => { throw new Error("timeout"); }));
  await assert.rejects(l.perform("item:x", async () => "again"), /refusing to repeat/);
});
