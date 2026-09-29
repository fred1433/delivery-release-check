import { replay, SOURCES } from "./rules.js";

const load = (f) => fetch(f).then((r) => r.json());
const [catalog, scenarios, extractions, zips, manufacturer] = await Promise.all([
  load("data/catalog.json"), load("data/scenarios.json"), load("data/extractions.json"), load("data/zips.json"), load("data/manufacturer.json"),
]);
const ctx = { asOf: scenarios.as_of, zips: zips.zips, texts: scenarios.messages, extractions: extractions.messages, manufacturer };
const featured = scenarios.orders.filter((o) => o.featured);
const STUB_NAMES = { 2050: "The stair carry", 2051: "The weight on file", 2052: "The gravel driveway" };

const state = { current: featured[0].id, step: 0, variant: false, edits: {}, lastVerdict: {}, lastChange: null };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = (n) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const productOf = (o) => catalog.products.find((p) => p.handle === o.handle);
const shortName = (t) => t.replace(/\s*\((New|Remanufactured|Used)\)\s*$/, "");
const condOf = (t) => (/\(Remanufactured\)/.test(t) ? "Remanufactured" : /\(New\)/.test(t) ? "New" : "");

function eventsFor(o) {
  let evs = [...o.events];
  if (o.walkthrough) {
    for (const w of o.walkthrough) {
      if (w.step > state.step) break;
      if (w.step === 4 && state.variant) break;
      evs.push(...w.events);
      if (w.step === 3 && state.variant) evs.push(...o.variant.events);
    }
  }
  return evs.concat(state.edits[o.id] || []);
}
const run = (o, evs) => replay(o, productOf(o), evs || eventsFor(o), ctx);

function renderStubs() {
  document.getElementById("stubs").innerHTML = featured.map((o) => {
    const r = run(o);
    const cur = o.id === state.current;
    return `<li><button type="button" class="stub${cur ? " is-current" : ""}" data-id="${o.id}"${cur ? ' aria-current="true"' : ""}>
      <span class="stub-no">${o.id}</span>
      <span class="stub-what">${STUB_NAMES[o.id]}</span>
      <span class="stub-where">${esc(shortName(productOf(o).title))}</span>
      <span class="stub-mark ${r.result.verdict.toLowerCase()}">${r.result.verdict === "HOLD" ? "Hold" : r.result.verdict === "REVIEW" ? "Review" : "Pass"}</span>
    </button></li>`;
  }).join("");
}

function renderWalk(o) {
  const el = document.getElementById("walk");
  if (!o.walkthrough) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  const steps = o.walkthrough.map((w) => {
    const done = w.step <= state.step && !(w.step === 4 && state.variant);
    const next = w.step === state.step + 1 && !(w.step === 4 && state.variant);
    return `<li class="${done ? "done" : next ? "next" : "later"}">
      <span class="w-num">${w.step}</span>
      <span class="w-label">${esc(w.label)}</span>
      ${next ? `<button type="button" class="act" data-act="step">${["", "Send it again", "Add 36 in", "Issue and approve", "Release and deliver"][w.step]}</button>` : done ? `<span class="w-done">Done</span>` : ""}
    </li>`;
  }).join("");
  const variant = state.step === 3
    ? `<label class="variant"><input type="checkbox" data-act="variant"${state.variant ? " checked" : ""}> ${esc(o.variant.label)}</label>` : "";
  const change = state.lastChange ? `<p class="w-change">${state.lastChange}</p>` : `<p class="w-change quiet">Four things happen to this order. Run them in order and watch what changes on the ticket, and what does not.</p>`;
  el.innerHTML = `<ol class="w-steps">${steps}</ol>${variant}${change}${state.step > 0 || state.variant ? `<button type="button" class="reset" data-act="restart">Start the order over</button>` : ""}`;
}

function describeChange(before, after) {
  const b = new Set(before.result.openIds), a = new Set(after.result.openIds);
  const gone = [...b].filter((x) => !a.has(x));
  const added = [...a].filter((x) => !b.has(x));
  const last = after.timeline.at(-1);
  const name = (id, r) => (r.result.issues.find((i) => i.id === id) || {}).title || id;
  const parts = [];
  if (last.duplicate) parts.push(`Same webhook delivered again: ignored. Payments recorded: ${after.state.payments.length}.`);
  if (gone.length) parts.push(`Resolved: ${gone.map((g) => name(g, before)).join(", ")}.`);
  if (added.length) parts.push(`New: ${added.map((g) => { const i = after.result.issues.find((x) => x.id === g); return `${i.title}. ${i.finding}`; }).join(" ")}`);
  const rel = after.timeline.find((t) => t.release);
  if (rel && !before.timeline.some((t) => t.release)) parts.push(`Released by your team, naming the ${rel.release.variables.holdIds.length} holds this workflow owns.`);
  const still = [...a].filter((x) => b.has(x));
  if (still.length) parts.push(`Still open: ${still.map((g) => name(g, after)).join(", ")}.`);
  const newActions = after.timeline.flatMap((t) => t.actions).length - before.timeline.flatMap((t) => t.actions).length;
  if (last.duplicate) parts.push(newActions ? "" : "No new draft, no new task, no release.");
  if (after.state.freight === "at installer") parts.push("Freight leg done. Customer delivery and installation: still open.");
  if (!parts.length) parts.push(`Verdict: ${after.result.verdict}.`);
  return parts.filter(Boolean).join(" ");
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
  { k: "path_photos", label: "Path photos", kind: "select", opts: [["", "Not on file"], ["promised", "Promised"], ["sent", "Received"]], room: true },
  { k: "driveway_surface", label: "Driveway", kind: "select", opts: [["", "Not stated"], ["paved", "Paved"], ["gravel", "Gravel"], ["dirt", "Dirt"], ["grass", "Grass"], ["mixed_soft", "Soft when wet"]], garage: true },
  { k: "ledge_or_step_at_garage", label: "Lip at garage door", kind: "select", opts: [["", "Not stated"], ["false", "None"], ["true", "Yes"]], garage: true },
];

function factRow(row, facts) {
  const f = facts[row.k];
  const val = f ? String(f.value) : "";
  const control = row.kind === "select"
    ? `<select data-fact="${row.k}" aria-label="${esc(row.label)}">${row.opts.map(([v, l]) => `<option value="${v}"${val === v ? " selected" : ""}>${l}</option>`).join("")}</select>`
    : `<input data-fact="${row.k}" type="number" min="0" step="1" inputmode="numeric" value="${esc(val)}" placeholder="Not on file" aria-label="${esc(row.label)}">`;
  const origin = !f ? `<span class="origin none">Not on file</span>`
    : f.by === "message" ? `<span class="origin">From the message: <q>${esc(f.quote)}</q></span>`
    : `<span class="origin by">${esc(f.by)}</span>`;
  return `<div class="fact"><label class="flabel">${row.label}</label>${control}${origin}</div>`;
}

function renderTicket() {
  const o = featured.find((x) => x.id === state.current);
  const product = productOf(o);
  const r = run(o);
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
  const garage = /Garage Delivery/.test(st.service);
  const rows = FACT_ROWS.filter((f) => (f.room && room) || (f.garage && garage));
  const d = product.dimensions_in || {};
  const chosen = product.delivery_options.find((x) => x.name === st.service);
  const actions = r.timeline.flatMap((t) => t.actions);
  const draft = st.draft;
  const opsItems = actions.filter((a) => a.kind === "ops-item");
  const labelText = res.label.replace(/^(HOLD|REVIEW|PASS): /, "");
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
      <div class="box wide"><span class="blabel">Machine</span><a class="entry" href="${product.url}" target="_blank" rel="noopener">${esc(shortName(product.title))}</a><span class="sub">${condOf(product.title)}, ${money(product.price)}. Ships ${esc(product.ships_as.replace(/ \(.*\)$/, "").toLowerCase())}. ${d.length ?? "?"} × ${d.width ?? "?"} × ${d.height ?? "?"} in.${o.configuration ? ` Configuration: ${esc(o.configuration)}.` : ""}</span></div>
      <div class="box wide service"><span class="blabel">Service on the order</span>
        <select data-fact="service" aria-label="Service on the order">${product.delivery_options.map((x) => `<option value="${esc(x.name)}"${x.name === st.service ? " selected" : ""}>${esc(x.name)}${x.price ? ", " + money(x.price) : ", included"}</option>`).join("")}</select>
        <span class="sub">Services and prices exactly as this product page lists them</span></div>
      <div class="box"><span class="blabel">Payments recorded</span><span class="entry">${st.payments.length ? st.payments.map((p) => money(p.amount)).join(" + ") : "Order total only"}</span><span class="sub">${st.payments.length ? "for " + esc(st.payments[0].for) : "no upgrade payment"}</span></div>
      <div class="box"><span class="blabel">Freight</span><span class="entry">${st.released ? (st.freight === "at installer" ? "At the installer" : "Released") : "Not released"}</span><span class="sub">${st.released ? "released by your team, naming its holds" : "nothing leaves before a PASS"}</span></div>
      <div class="box"><span class="blabel">Customer delivery and installation</span><span class="entry">${st.customerDelivery === "delivered" ? "Delivered" : "Open"}</span><span class="sub">${st.installation === "installed" ? "installed" : "not installed"}</span></div>
    </div>

    ${st.messages.map((m) => `<div class="msg-box"><span class="blabel">Customer message, ${m.at.slice(5, 10).replace("-", "/")} <em>(fictional)</em></span><p class="msg-text">${markMessage(scenarios.messages[m.message], st.facts, m.message)}</p></div>`).join("")}

    ${rows.length ? `<div class="facts"><div class="facts-head"><span class="blabel">Facts on file</span><span class="hint">Change one; the ticket recalculates</span></div><div class="fact-grid">${rows.map((row) => factRow(row, st.facts)).join("")}</div></div>` : ""}

    <ol class="issues">${main.map((i) => issueRow(i, product)).join("")}</ol>
    ${cleared.length ? `<div class="cleared"><span class="blabel">Looked like a problem, cleared by your own pages</span><ol class="issues">${cleared.map((i) => issueRow(i, product)).join("")}</ol></div>` : ""}
    ${info.length ? `<ol class="issues quiet">${info.map((i) => issueRow(i, product)).join("")}</ol>` : ""}

    <div class="outcome">
      <div>
        <span class="blabel">Draft to the customer <em>(not sent)</em></span>
        ${draft ? `<pre class="draft">${esc(draft.text)}</pre>` : `<p class="draft none">${main.some((i) => i.kind === "hold" || i.kind === "review") ? "Nothing to ask the customer. The open items belong to your team." : "Nothing to ask the customer."}</p>`}
      </div>
      <div>
        <span class="blabel">Tasks for your team <em>(one per open item, never twice)</em></span>
        ${opsItems.length ? `<ul class="tasks">${opsItems.map((a) => { const open = res.openIds.includes(a.id); return `<li class="${open ? "" : "closed"}">${esc(a.title)}<span>${open ? esc(a.owner || "Ops") : "Closed: resolved on this ticket"}</span></li>`; }).join("")}</ul>` : `<p class="draft none">None.</p>`}
      </div>
    </div>

    <details class="record"><summary>Execution record, ${r.timeline.length} events</summary>
      <ol>${r.timeline.map((t) => `<li class="${t.duplicate ? "dup" : ""}"><span class="r-time">${t.event.at.slice(5, 16).replace("T", " ")}</span><span class="r-what">${esc(t.effects.join(" "))}</span><span class="r-v">${t.duplicate ? "ignored" : t.result ? t.result.verdict.toLowerCase() : ""}</span></li>`).join("")}</ol>
      <p class="i-note">Normalized test events, not native Shopify payloads.</p>
    </details>
  `;
}

function render() { renderStubs(); renderWalk(featured.find((x) => x.id === state.current)); renderTicket(); }

document.getElementById("stubs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]");
  if (!b || b.dataset.id === state.current) return;
  state.current = b.dataset.id;
  state.lastChange = null;
  render();
});

document.getElementById("walk").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || b.tagName === "INPUT") return;
  const o = featured.find((x) => x.id === state.current);
  if (b.dataset.act === "step") {
    const before = run(o);
    state.step += 1;
    state.lastChange = esc(describeChange(before, run(o)));
  }
  if (b.dataset.act === "restart") { state.step = 0; state.variant = false; state.edits[o.id] = []; state.lastChange = null; }
  render();
});
document.getElementById("walk").addEventListener("change", (e) => {
  if (e.target.dataset.act !== "variant") return;
  const o = featured.find((x) => x.id === state.current);
  const before = run(o);
  state.variant = e.target.checked;
  state.lastChange = esc(describeChange(before, run(o)));
  render();
});

let editSeq = 0;
document.getElementById("ticket").addEventListener("change", (e) => {
  const k = e.target.dataset.fact;
  if (!k) return;
  const o = featured.find((x) => x.id === state.current);
  const list = (state.edits[o.id] ||= []);
  const at = "2026-09-29T23:" + String(10 + (editSeq++ % 49)).padStart(2, "0") + ":00-06:00";
  let v = e.target.value;
  if (k === "service") list.push({ type: "service_changed", id: `edit-${editSeq}`, at, service: v });
  else {
    if (e.target.type === "number") v = v === "" ? null : Number(v);
    if (k === "ledge_or_step_at_garage") v = v === "" ? null : v === "true";
    if (v === "") v = null;
    list.push({ type: "fact_entered", id: `edit-${editSeq}`, at, key: k, value: v, by: "Entered by you on this page" });
  }
  const before = replay(o, productOf(o), eventsFor(o).slice(0, -1), ctx);
  state.lastChange = o.walkthrough ? esc(describeChange(before, run(o))) : null;
  render();
});

render();
