import { replay, SOURCES, PROPOSED_APPROVAL } from "./rules.js";
import { appendStep, canRelease } from "./walk.js";

const load = (f) => fetch(f).then((r) => r.json());
const [catalog, scenarios, extractions, zips, manufacturer] = await Promise.all([
  load("data/catalog.json"), load("data/scenarios.json"), load("data/extractions.json"), load("data/zips.json"), load("data/manufacturer.json"),
]);
const ctx = { asOf: scenarios.as_of, zips: zips.zips, texts: scenarios.messages, extractions: extractions.messages, manufacturer };
const featured = scenarios.orders.filter((o) => o.featured);
const STUB_NAMES = { 2050: "The stair carry", 2051: "The weight on file", 2052: "The gravel driveway" };

// One chronological history per order: every click and every edit is appended after what already happened.
const state = { current: featured[0].id, history: {}, step: {}, variant: {}, lastVerdict: {}, lastChange: null, seq: 0 };
for (const o of featured) { state.history[o.id] = [...o.events]; state.step[o.id] = 0; }

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = (n) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const productOf = (o) => catalog.products.find((p) => p.handle === o.handle);
const shortName = (t) => t.replace(/\s*\((New|Remanufactured|Used)\)\s*$/, "");
const condOf = (t) => (/\(Remanufactured\)/.test(t) ? "Remanufactured" : /\(New\)/.test(t) ? "New" : "");
const cur = () => featured.find((x) => x.id === state.current);
const run = (o, h) => replay(o, productOf(o), h || state.history[o.id], ctx);
const stamp = () => `2026-09-30T${String(8 + Math.floor(state.seq / 60)).padStart(2, "0")}:${String(state.seq++ % 60).padStart(2, "0")}:00-06:00`;

// Short names for open items, used by the state chips and the change line.
function short(i, st) {
    const map = {
      "access:narrowest_door_in": "Door width missing", "access:stairs_count": "Step count missing", "access:room_location": "Room missing",
      "access:path_photos": i.title.includes("customer says") ? "Photos not reviewed" : "Photos missing",
      authorization: st.approvals && Object.keys(st.approvals).length ? "Plan approval stale" : "Plan approval missing",
      "config:weight": "Weight to confirm", door: "Door feasibility", "access:garage-ledge": "Garage lip unknown", "access:garage-surface": "Driveway unknown",
      "access:garage": "Garage path blocked", "after-release": "Changed after release", carrier: "Carrier update to check",
    };
    return map[i.id] || i.title;
}

// Short state chips: what the ticket says right now, in a few words.
function chips(r) {
  const st = r.state, res = r.result;
  const out = [];
  if (st.payments.length) out.push({ t: `${money(st.payments[0].amount)} recorded once`, k: "ok" });
  for (const i of res.issues.filter((x) => x.kind === "hold" || x.kind === "review")) out.push({ t: short(i, st), k: i.kind });
  if (res.verdict === "PASS") out.push({ t: st.released ? "Released by your team" : "Checklist complete", k: "pass" });
  if (st.freight === "at installer") out.push({ t: "At the installer; customer delivery open", k: "info" });
  return out;
}

function describeChange(before, after) {
  const b = new Set(before.result.openIds), a = new Set(after.result.openIds);
  const title = (id, r) => { const i = r.result.issues.find((x) => x.id === id); return i ? short(i, r.state) : id; };
  const newEntries = after.timeline.slice(before.timeline.length);
  const parts = [];
  if (newEntries.some((t) => t.duplicate)) parts.push("Payment event ignored.");
  for (const t of newEntries) for (const e of t.effects) if (/not accepted|refused|rejected|immutable/i.test(e)) parts.push(e.charAt(0).toUpperCase() + e.slice(1));
  const gone = [...b].filter((x) => !a.has(x));
  const added = [...a].filter((x) => !b.has(x));
  const still = [...a].filter((x) => b.has(x));
  if (gone.length) parts.push(`Resolved: ${gone.map((g) => title(g, before).toLowerCase().replace(/ (missing|not reviewed|unknown|stale|to confirm)$/, "")).join(", ")}.`);
  if (added.length) parts.push(`New: ${added.map((g) => title(g, after).toLowerCase()).join(", ")}.`);
  if (newEntries.some((t) => t.duplicate)) parts.push(still.length === 1 ? "The hold remains." : still.length === 2 ? "Both holds remain." : `All ${still.length} holds remain.`);
  else if (still.length && (gone.length || added.length)) parts.push(`Still open: ${still.map((g) => title(g, after).toLowerCase()).join(", ")}.`);
  const newActions = newEntries.flatMap((t) => t.actions).length;
  if (newEntries.some((t) => t.duplicate) && !newActions) parts.push("No new draft or task.");
  if (newEntries.some((t) => t.release)) parts.push("Released by your team, naming the holds this workflow owns.");
  if (after.state.freight === "at installer" && before.state.freight !== "at installer") parts.push("Freight is at the installer. Customer delivery and installation: still open.");
  if (!parts.length) parts.push(`No change to the open items: ${[...a].map((g) => title(g, after).toLowerCase()).join(", ") || "none"}.`);
  return parts.join(" ");
}

function renderStubs() {
  document.getElementById("stubs").innerHTML = featured.map((o) => {
    const r = run(o);
    const isCur = o.id === state.current;
    return `<li><button type="button" class="stub${isCur ? " is-current" : ""}" data-id="${o.id}"${isCur ? ' aria-current="true"' : ""}>
      <span class="stub-no">${o.id}</span>
      <span class="stub-what">${STUB_NAMES[o.id]}</span>
      <span class="stub-where">${esc(shortName(productOf(o).title))}</span>
      <span class="stub-mark ${r.result.verdict.toLowerCase()}">${r.result.verdict === "HOLD" ? "Hold" : r.result.verdict === "REVIEW" ? "Review" : "Pass"}</span>
    </button></li>`;
  }).join("");
}

function renderNow(o, r) {
  const el = document.getElementById("now");
  const c = chips(r).map((x) => `<li class="chip ${x.k}">${esc(x.t)}</li>`).join("");
  let action = "";
  if (o.walkthrough) {
    const step = state.step[o.id];
    const next = o.walkthrough.find((w) => w.step === step + 1);
    const blockedByVariant = state.variant[o.id];
    const releaseOk = next && next.step === 4 ? canRelease(o, productOf(o), state.history[o.id], ctx) : true;
    const outline = o.walkthrough.map((w) => `<li class="${w.step <= step ? "done" : w.step === step + 1 ? "next" : ""}">${esc(w.label)}</li>`).join("");
    action = `<div class="now-act">
      ${next && !blockedByVariant ? `<span class="now-step">Step ${next.step} of 4</span>
        <button type="button" class="act" data-act="step"${releaseOk ? "" : " disabled"}>${esc(next.label)}</button>
        ${releaseOk ? "" : `<span class="now-why">Release waits for a PASS on the ticket.</span>`}` : `<span class="now-step">${blockedByVariant ? "Address changed after approval: a new plan is needed" : "All four steps done"}</span>`}
      ${step === 3 && !blockedByVariant ? `<button type="button" class="variant" data-act="variant">Or: change the delivery address first</button>` : ""}
      ${step > 0 || blockedByVariant || state.history[o.id].length > o.events.length ? `<button type="button" class="reset" data-act="restart">Start over</button>` : ""}
    </div>
    <ol class="outline">${outline}</ol>`;
  }
  const change = state.lastChange ? `<p class="now-change">${esc(state.lastChange)}</p>` : "";
  el.innerHTML = `<ul class="chips" aria-label="Current state">${c}</ul>${change}${action}`;
}

function sourceOf(q, product) {
  if (q.src === "product") return { href: product.url, label: "Product page" };
  return { href: SOURCES[q.src].url, label: SOURCES[q.src].title };
}

function issueRow(i, product) {
  const quotes = (i.quotes || []).map((q) => { const s = sourceOf(q, product); return `<blockquote><p>${esc(q.text)}</p><a href="${s.href}" target="_blank" rel="noopener">${s.label}</a></blockquote>`; }).join("");
  const maker = i.makerSource ? `<blockquote><p>Assembled weight per stack configuration, as published by the manufacturer.</p><a href="${i.makerSource}" target="_blank" rel="noopener">Manufacturer specification</a></blockquote>` : "";
  const mark = { hold: "Hold", review: "Review", pass: "Clear", cleared: "Cleared", info: "Note" }[i.kind];
  return `<li class="issue ${i.kind}">
    <span class="i-mark">${mark}</span>
    <div class="i-body">
      <h3>${esc(i.title)}</h3>
      ${i.proposed ? `<p class="i-proposed">${esc(PROPOSED_APPROVAL)}</p>` : ""}
      <p>${esc(i.finding)}</p>
      ${i.note ? `<p class="i-note">${esc(i.note)}</p>` : ""}
      ${i.calc ? `<p class="i-note">${esc(i.calc)}</p>` : ""}
      ${i.setByUs ? `<p class="i-set">Set by us: ${esc(i.setByUs)}</p>` : ""}
      ${i.owner ? `<p class="i-owner">Decision: ${esc(i.owner)}</p>` : ""}
      ${quotes || maker ? `<details><summary>Your page says</summary>${quotes}${maker}</details>` : ""}
    </div>
  </li>`;
}

function markMessage(text, facts, id) {
  const spans = Object.values(facts).filter((f) => f.by === "message" && f.message === id && f.quote)
    .map((f) => ({ s: text.indexOf(f.quote), e: text.indexOf(f.quote) + f.quote.length })).filter((x) => x.s >= 0).sort((a, b) => a.s - b.s);
  let out = "", pos = 0;
  for (const x of spans) { if (x.s < pos) continue; out += esc(text.slice(pos, x.s)) + `<mark>${esc(text.slice(x.s, x.e))}</mark>`; pos = x.e; }
  return out + esc(text.slice(pos));
}

const FACT_ROWS = [
  { k: "narrowest_door_in", label: "Narrowest door (in)", kind: "number", room: true },
  { k: "stairs_count", label: "Steps, street to room", kind: "number", room: true },
  { k: "path_photos", label: "Path photos", kind: "select", opts: [["", "Not on file"], ["promised", "Promised"], ["sent", "Customer says sent"], ["received", "Received and reviewed by your team"]], room: true },
  { k: "driveway_surface", label: "Driveway", kind: "select", opts: [["", "Not stated"], ["paved", "Paved"], ["gravel", "Gravel"], ["dirt", "Dirt"], ["grass", "Grass"], ["mixed_soft", "Soft when wet"]], garage: true },
  { k: "ledge_or_step_at_garage", label: "Lip at garage door", kind: "select", opts: [["", "Not stated"], ["false", "None"], ["true", "Yes"]], garage: true },
];

function factRow(row, facts, locked) {
  const f = facts[row.k];
  const val = f ? String(f.value) : "";
  const control = row.kind === "select"
    ? `<select data-fact="${row.k}" aria-label="${esc(row.label)}"${locked ? " disabled" : ""}>${row.opts.map(([v, l]) => `<option value="${v}"${val === v ? " selected" : ""}>${l}</option>`).join("")}</select>`
    : `<input data-fact="${row.k}" type="number" min="0" step="1" inputmode="numeric" value="${esc(val)}" placeholder="Not on file" aria-label="${esc(row.label)}"${locked ? " disabled" : ""}>`;
  const origin = !f ? `<span class="origin none">Not on file</span>`
    : f.by === "message" ? `<span class="origin">From the message: <q>${esc(f.quote)}</q></span>`
    : `<span class="origin by">${f.by === "you, on this page" ? "Entered by you on this page" : esc(f.by)}</span>`;
  return `<div class="fact"><label class="flabel">${row.label}</label>${control}${origin}</div>`;
}

function renderTicket(o, r) {
  const product = productOf(o);
  const st = r.state;
  const res = r.result;
  const verdict = res.verdict.toLowerCase();
  const prev = state.lastVerdict[o.id];
  const restamp = prev && prev !== res.verdict;
  state.lastVerdict[o.id] = res.verdict;
  const rank = { hold: 0, review: 1, pass: 2, cleared: 3, info: 4 };
  const issues = [...res.issues].sort((a, b) => rank[a.kind] - rank[b.kind]);
  const main = issues.filter((i) => i.kind !== "cleared" && i.kind !== "info");
  const cleared = issues.filter((i) => i.kind === "cleared");
  const info = issues.filter((i) => i.kind === "info");
  const room = /Any Room|Room of Choice|Garage Installation|2 Step/.test(st.service);
  const garage = /Garage/.test(st.service);
  const rows = FACT_ROWS.filter((f) => (f.room && room) || (f.garage && garage));
  const d = product.dimensions_in || {};
  const actions = r.timeline.flatMap((t) => t.actions);
  const opsItems = actions.filter((a) => a.kind === "ops-item");
  const labelText = res.label.replace(/^(HOLD|REVIEW|PASS): /, "");
  const plans = Object.values(st.plans).sort((a, b) => b.version - a.version);
  const el = document.getElementById("ticket");
  el.className = `ticket v-${verdict}`;
  el.innerHTML = `
    <header class="t-head">
      <div>
        <p class="form-name">Delivery release ticket</p>
        <p class="t-no">Order ${o.id}</p>
        <p class="t-cust">${esc(o.customer)}, ${esc(st.city)}, ${o.state} ${st.zip}</p>
      </div>
      <div class="stamp ${verdict}${restamp ? " restamp" : ""}" role="img" aria-label="${esc(res.label)}"><span>${res.verdict}</span></div>
    </header>
    <p class="t-label ${verdict}">${esc(labelText)}</p>

    <div class="t-grid">
      <div class="box wide"><span class="blabel">Machine</span><a class="entry" href="${product.url}" target="_blank" rel="noopener">${esc(shortName(product.title))}</a><span class="sub">${condOf(product.title)}, ${money(product.price)}. Ships ${esc(product.ships_as.replace(/ \(.*\)$/, "").toLowerCase())}. ${d.length ?? "?"} × ${d.width ?? "?"} × ${d.height ?? "?"} in (L × W × H).${o.configuration ? ` Configuration: ${esc(o.configuration)}.` : ""}</span></div>
      <div class="box wide service"><span class="blabel">Service on the order</span>
        <select data-fact="service" aria-label="Service on the order"${st.released ? " disabled" : ""}>${product.delivery_options.map((x) => `<option value="${esc(x.name)}"${x.name === st.service ? " selected" : ""}>${esc(x.name)}${x.price ? ", " + money(x.price) : ", included"}</option>`).join("")}</select>
        <span class="sub">Services and prices exactly as this product page lists them</span></div>
      <div class="box"><span class="blabel">Payments recorded</span><span class="entry">${st.payments.length ? st.payments.map((p) => money(p.amount)).join(" + ") : "Order total only"}</span><span class="sub">${st.payments.length ? "for " + esc(st.payments[0].for) : "no upgrade payment"}</span></div>
      <div class="box"><span class="blabel">Freight</span><span class="entry">${st.released ? (st.freight === "at installer" ? "At the installer" : st.freight === "at terminal" ? "At the terminal" : st.freight === "delivered" ? "Delivered" : "Released") : "Not released"}</span><span class="sub">${st.released ? "released by your team, naming its holds" : "a checklist PASS does not release anything"}</span></div>
      <div class="box"><span class="blabel">Customer delivery and installation</span><span class="entry">${st.customerDelivery === "delivered" ? "Delivered" : "Open"}</span><span class="sub">${st.installation === "installed" ? "installed" : "not installed"}</span></div>
      ${plans.length ? `<div class="box wide"><span class="blabel">Delivery plan on file</span><span class="entry small">Version ${plans[0].version}${st.approvals[plans[0].version] ? `, approved in writing by ${esc(st.approvals[plans[0].version].by)}` : ", not approved"}</span><span class="sub">${esc(plans[0].summary)}</span></div>` : ""}
    </div>

    ${st.earlierMessages.map((m) => `<div class="msg-box earlier"><span class="blabel">Customer message, ${m.at.slice(5, 10).replace("-", "/")} <em>(fictional; describes the earlier address, not used for this one)</em></span><p class="msg-text">${esc(scenarios.messages[m.message])}</p></div>`).join("")}
    ${st.messages.map((m) => `<div class="msg-box"><span class="blabel">Customer message, ${m.at.slice(5, 10).replace("-", "/")} <em>(fictional)</em></span><p class="msg-text">${markMessage(scenarios.messages[m.message], st.facts, m.message)}</p></div>`).join("")}

    ${rows.length ? `<div class="facts"><div class="facts-head"><span class="blabel">Facts on file</span><span class="hint">${st.released ? "Released: changes now go through your carrier and a new plan" : "Change one; the ticket recalculates"}</span></div><div class="fact-grid">${rows.map((row) => factRow(row, st.facts, st.released)).join("")}</div></div>` : ""}

    <ol class="issues">${main.map((i) => issueRow(i, product)).join("")}</ol>
    ${cleared.length ? `<div class="cleared"><span class="blabel">Looked like a problem, cleared by your own pages</span><ol class="issues">${cleared.map((i) => issueRow(i, product)).join("")}</ol></div>` : ""}
    ${info.length ? `<ol class="issues quiet">${info.map((i) => issueRow(i, product)).join("")}</ol>` : ""}

    <div class="outcome">
      <div>
        <span class="blabel">Draft to the customer <em>(not sent)</em></span>
        ${st.draft ? `<pre class="draft">${esc(st.draft.text)}</pre>` : `<p class="draft none">${main.some((i) => i.kind === "hold" || i.kind === "review") ? "Nothing to ask the customer. The open items belong to your team." : "Nothing to ask the customer."}</p>`}
      </div>
      <div>
        <span class="blabel">Tasks for your team <em>(one per open item, never twice)</em></span>
        ${opsItems.length ? `<ul class="tasks">${opsItems.map((a) => { const open = res.openIds.includes(a.id); return `<li class="${open ? "" : "closed"}">${esc(a.title)}<span>${open ? esc(a.owner || "Ops") : "Closed: resolved on this ticket"}</span></li>`; }).join("")}</ul>` : `<p class="draft none">None.</p>`}
      </div>
    </div>

    <details class="record"><summary>Execution record, ${r.timeline.length} events</summary>
      <ol>${r.timeline.map((t) => `<li class="${t.duplicate || t.rejected ? "dup" : ""}"><span class="r-time">${t.event.at.slice(5, 16).replace("T", " ")}</span><span class="r-what">${esc(t.effects.join(" "))}</span><span class="r-v">${t.duplicate ? "ignored" : t.rejected ? "rejected" : t.result ? t.result.verdict.toLowerCase() : ""}</span></li>`).join("")}</ol>
      <p class="i-note">Normalized test events in the order they happened, not native Shopify payloads.</p>
    </details>
  `;
}

function render() {
  const o = cur();
  const r = run(o);
  renderStubs();
  renderNow(o, r);
  renderTicket(o, r);
}

function apply(o, next) {
  const before = run(o);
  state.history[o.id] = next;
  state.lastChange = describeChange(before, run(o));
  render();
}

document.getElementById("stubs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]");
  if (!b || b.dataset.id === state.current) return;
  state.current = b.dataset.id;
  state.lastChange = null;
  render();
});

document.getElementById("now").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  const o = cur();
  if (b.dataset.act === "step") {
    const n = state.step[o.id] + 1;
    const h = state.history[o.id];
    const next = appendStep(o, productOf(o), h, n, ctx).map((ev, i) => (i < h.length ? ev : { ...ev, at: stamp() }));
    state.step[o.id] = n;
    apply(o, next);
  }
  if (b.dataset.act === "variant") {
    state.variant[o.id] = true;
    apply(o, [...state.history[o.id], ...o.variant.events.map((ev) => ({ ...ev, at: stamp() }))]);
  }
  if (b.dataset.act === "restart") {
    state.history[o.id] = [...o.events]; state.step[o.id] = 0; state.variant[o.id] = false; state.lastChange = null;
    render();
  }
});

document.getElementById("ticket").addEventListener("change", (e) => {
  const k = e.target.dataset.fact;
  if (!k) return;
  const o = cur();
  const h = state.history[o.id];
  let v = e.target.value;
  const id = `edit-${state.seq}`;
  if (k === "service") return apply(o, [...h, { type: "service_changed", id, at: stamp(), service: v }]);
  if (e.target.type === "number") v = v === "" ? null : Number(v);
  if (k === "ledge_or_step_at_garage") v = v === "" ? null : v === "true";
  if (v === "") v = null;
  apply(o, [...h, { type: "fact_entered", id, at: stamp(), key: k, value: v, by: "you, on this page" }]);
});

render();
