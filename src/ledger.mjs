// Durable record of business actions (Node only). An in-memory set or a 30-minute idempotency cache is not enough:
// monday.com caches Idempotency-Key responses for 30 minutes, then the same key executes again
// (https://developer.monday.com/api-reference/docs/idempotency, read 2026-09-29).
//
// Each action goes through: intended -> completed. A crash or an ambiguous timeout leaves "intended"; the next attempt
// reconciles with the remote system (checkRemote) before doing anything, instead of blindly repeating.
// This gives "the tested replay does not create another action", not "exactly once".

import fs from "node:fs";
import path from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class FileLedger {
  constructor(file, { now = () => new Date().toISOString() } = {}) {
    this.file = file;
    this.now = now;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, "");
  }

  read() {
    const map = new Map();
    for (const line of fs.readFileSync(this.file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line);
      map.set(rec.key, { ...(map.get(rec.key) || {}), ...rec });
    }
    return map;
  }

  status(key) {
    const rec = this.read().get(key);
    return rec ? rec.state : "none";
  }

  append(rec) {
    const fd = fs.openSync(this.file, "a");
    try { fs.writeSync(fd, JSON.stringify({ ...rec, at: this.now() }) + "\n"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }

  async lock(key) {
    const lockPath = `${this.file}.${Buffer.from(key).toString("hex").slice(0, 80)}.lock`;
    for (let i = 0; i < 400; i++) {
      try { const fd = fs.openSync(lockPath, "wx"); fs.closeSync(fd); return () => fs.unlinkSync(lockPath); } catch (e) {
        if (e.code !== "EEXIST") throw e;
        await sleep(5);
      }
    }
    throw new Error(`Lock timeout for ${key}`);
  }

  // perform(key, doAction, { checkRemote }) -> { outcome: "done" | "already-done" | "reconciled", result }
  async perform(key, doAction, { checkRemote } = {}) {
    const release = await this.lock(key);
    try {
      const rec = this.read().get(key);
      if (rec && rec.state === "completed") return { outcome: "already-done", result: rec.result };
      if (rec && rec.state === "intended") {
        if (!checkRemote) throw new Error(`Action ${key} has an unknown outcome and no way to reconcile it; refusing to repeat it.`);
        const remote = await checkRemote(key);
        if (remote && remote.exists) {
          this.append({ key, state: "completed", result: remote.result, reconciled: true });
          return { outcome: "reconciled", result: remote.result };
        }
      }
      this.append({ key, state: "intended" });
      const result = await doAction();
      this.append({ key, state: "completed", result });
      return { outcome: "done", result };
    } finally {
      release();
    }
  }
}
