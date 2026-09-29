// The walkthrough appends to one chronological history. A step's events go after everything already done,
// edits included; the installer receipt is only appended if the release actually happened.
import { replay } from "./rules.js";

export function appendStep(order, product, history, step, ctx) {
  const w = order.walkthrough.find((x) => x.step === step);
  const out = [...history];
  for (const ev of w.events) {
    if (ev.type === "carrier_update") {
      const r = replay(order, product, out, ctx);
      if (!r.state.released) break;
    }
    out.push(ev);
  }
  return out;
}

export function canRelease(order, product, history, ctx) {
  const r = replay(order, product, history, ctx);
  return r.result.verdict === "PASS" && !r.state.released;
}
