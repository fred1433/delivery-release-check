// Delivery release check. Pure code: no network, no model, same module in the browser, in Node tests and in n8n.
// Every rule quotes the public page it comes from; tests check each quote against the saved page text.
// Anything we decided ourselves is marked setByUs.

import { sha256 } from "./sha256.js";

export const BENICIA = { zip: "94510", lat: 38.113205, lon: -122.119708 };
const SITE = "https://www.fitnesssuperstore.com";

export const SOURCES = {
  info: { title: "Shipping Information", url: `${SITE}/pages/shipping-information`, file: "shipping-information.txt" },
  policy: { title: "Shipping policy", url: `${SITE}/policies/shipping-policy`, file: "shipping-policy.txt" },
  product: { title: "Product page", url: null, file: null },
  maker: { title: "Manufacturer specification", url: null, file: null },
};

// Exact substrings of the pages read on 2026-09-29 (checked by tests/sources.test.mjs).
export const Q = {
  accessFacts: { src: "product", text: "We will need to know exactly where it is going in your home, including width of the most narrow door, info / pics on turns, and number of stairs involved." },
  priorToShipping: { src: "product", text: "It will need to be proved prior to shipping." },
  accessBeforeBooking: { src: "info", text: "Provide room location, doorway/path measurements, stairs and access photos before booking." },
  groundLevel: { src: "product", text: "As long as there are 3 steps or less required to take from the street to the actual room, select this." },
  stairCarry: { src: "product", text: "If there are 4 steps or more required to take from the street to the actual room, select this." },
  garageInstall: { src: "product", text: "The essential rule to meet this rate is to make sure is can be rolled on wheels for the entire path (no ledges or stairs), the path is at least 60\" wide, and that it does not need and disassembly." },
  garageDelivery: { src: "product", text: "This service only includes going across gravel / concrete, so, if there are barriers such as stairs, softer dirt, grass, a ledge, or a width that is less wide than the crate, then this service would not suffice." },
  garageConfirm: { src: "info", text: "Confirm driveway and pallet-jack access before booking." },
  feasibility: { src: "product", text: "Room-of-choice service and any stair carry are subject to site access, product dimensions and weight, provider availability, and written feasibility for the exact machine and scope." },
  confirmedBeforeBooking: { src: "product", text: "The exact crew, included and excluded work, all-inclusive price, and estimated timing will be confirmed before booking." },
  twoStepFinal: { src: "product", text: "The Alternative Installation will proceed only after we receive your final written YES." },
  twoStepPrelim: { src: "product", text: "Any preliminary response about this option authorizes us to investigate and quote it only; it is not final authorization." },
  installerHandoff: { src: "product", text: "Standard Installation - Shipping to Terminal or Installer (1 Step Process)" },
  notCompletion: { src: "info", text: "the transit estimate is not an installation-completion date." },
  parcelOld: { src: "policy", text: "For items under 150 lbs. Shipped via USPS, FedEx, or UPS." },
  combinedFreight: { src: "product", text: "However if this is a a part of a bigger order, like a large item and this item are part of the same order, or many smaller items, and the size and weight become too costly for Fedex, it will ship via freight and deliver curbside." },
  localNew: { src: "info", text: "Fitness Superstore offers free local delivery on eligible orders of $1,000 or more to approved delivery ZIP codes within approximately 100 miles of 94510." },
  localOldTrucks: { src: "policy", text: "Customers within 120 miles of our Benicia, CA warehouse receive delivery via our own trucks." },
  norcal: { src: "product", text: "We deliver on our own vehicles for Northern California. No tracking will be provided." },
  processingSeparate: { src: "info", text: "Processing time is shown on each product page and is separate from delivery or transit." },
};

export const TRANSIT = {
  local: { text: "1–2 business days once ready", min: 1 },
  freight: { west: { text: "less than 1 week after shipment", min: 1 }, central: { text: "1–2 weeks after shipment", min: 5 }, eastern: { text: "2–3 weeks after shipment", min: 10 } },
  parcel: { west: { text: "2–3 business days after shipment", min: 2 }, rest: { text: "3–6 business days after shipment", min: 3 } },
};
export const WEST = ["CA", "OR", "WA", "NV", "AZ", "UT", "ID"];
export const STATE_TZ = {
  AL: "central", AR: "central", CO: "central", CT: "eastern", DE: "eastern", DC: "eastern", FL: "split", GA: "eastern",
  IL: "central", IN: "split", IA: "central", KS: "split", KY: "split", LA: "central", ME: "eastern", MD: "eastern",
  MA: "eastern", MI: "split", MN: "central", MS: "central", MO: "central", MT: "central", NE: "split", NH: "eastern",
  NJ: "eastern", NM: "central", NY: "eastern", NC: "eastern", ND: "split", OH: "eastern", OK: "central", PA: "eastern",
  RI: "eastern", SC: "eastern", SD: "split", TN: "split", TX: "split", VT: "eastern", VA: "eastern", WV: "eastern",
  WI: "central", WY: "central",
};

export const LABELS = {
  access: "HOLD: access evidence incomplete",
  mismatch: "HOLD: service does not match the access described",
  authorization: "HOLD: delivery plan not approved",
  service: "HOLD: service not offered for this machine",
  configuration: "REVIEW: product configuration unresolved",
  feasibility: "REVIEW: feasibility decision needed",
  eligibility: "REVIEW: delivery eligibility unconfirmed",
  date: "REVIEW: requested date needs your team",
  pass: "PASS: this checklist is complete; operational release remains with your team",
};

const ROOM_SERVICE = /Any Room|Room of Choice|Garage Installation|2 Step/;
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];

export function milesBetween(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

export function addBusinessDays(isoDate, n) {
  const d = new Date(isoDate + "T12:00:00Z");
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

export function processingDays(text) {
  const m = /in (\d+)-(\d+) (Business Days|Weeks)/.exec(text || "");
  if (!m) return null;
  const k = m[3] === "Weeks" ? 5 : 1;
  return { min: Number(m[1]) * k, max: Number(m[2]) * k };
}

const bare = (s) => String(s).replace(/[.!?]+$/, "");
const money = (n) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });

// ---------- Facts from customer messages ----------
// A quote proves where a fact came from, not that it was read correctly; these guards catch what code can catch.
export function checkFact(key, fact, message) {
  if (!fact) return null;
  if (typeof fact.quote !== "string" || !fact.quote || !message.includes(fact.quote)) return "quote not found in the message";
  const q = fact.quote.toLowerCase();
  if (key === "narrowest_door_in") {
    if (!/(\d+(\.\d+)?)/.test(q) || !q.includes(String(fact.value))) return "number not in the quote";
    if (!/(inch|inches|\bin\b|"|feet|foot|ft\b|cm\b)/.test(q)) return "no unit in the quote";
  }
  if (key === "stairs_count") {
    const n = Number(fact.value);
    const ok = q.includes(String(n)) || (NUMBER_WORDS[n] && new RegExp(`\\b${NUMBER_WORDS[n]}\\b`).test(q)) || (n === 0 && /\bno (steps|stairs)\b/.test(q));
    if (!ok) return "count not in the quote";
  }
  return null;
}

// Facts from messages in event order; a later message replaces an earlier value. An extraction made from a different
// text (hash mismatch) is never reused.
export function factsFromMessages(messageEvents, texts, extractions) {
  const facts = {};
  const dropped = [];
  for (const ev of messageEvents) {
    const text = texts[ev.message];
    const ex = extractions[ev.message];
    if (!ex || !text) { dropped.push({ message: ev.message, reason: "no extraction for this message" }); continue; }
    if (ex.message_sha256 !== sha256(text)) { dropped.push({ message: ev.message, reason: "message changed after extraction; extraction not reused" }); continue; }
    for (const [key, f] of Object.entries(ex.facts || {})) {
      if (!f) continue;
      const why = checkFact(key, f, text);
      if (why) { dropped.push({ message: ev.message, key, reason: why }); continue; }
      facts[key] = { value: f.value, quote: f.quote, by: "message", message: ev.message, at: ev.at };
    }
  }
  return { facts, dropped };
}

// ---------- Evaluation of one order state ----------
export function evaluate(st) {
  const { product, service, zip, state: usState, geo, facts, plans, approvals, asOf } = st;
  const issues = [];
  const add = (i) => issues.push(i);
  const f = (k) => facts[k] || null;
  const chosen = product.delivery_options.find((o) => o.name === service);
  const room = ROOM_SERVICE.test(service);

  if (!chosen) add({ id: "service", kind: "hold", group: "service", title: "Service offered for this machine", finding: `"${service}" is not among the services listed on this product page.`, owner: "Ops" });

  // Access evidence the product page asks for before shipping. One issue per missing fact.
  if (room) {
    const where = f("room_location") || f("floor_or_stairs_described");
    const photos = f("path_photos");
    const need = [
      { key: "room_location", ok: !!where, label: "Where it goes", ask: "Which room will it go in, and on which floor?" },
      { key: "narrowest_door_in", ok: !!f("narrowest_door_in"), label: "Narrowest door width", ask: "What is the width of the narrowest door on the way in, in inches?" },
      { key: "path_photos", ok: photos && photos.value === "sent", label: photos && photos.value === "promised" ? "Path photos (promised, not received)" : "Photos of the path and turns", ask: "Could you send photos of the path from the street, including every turn?" },
      { key: "stairs_count", ok: f("stairs_count") != null, label: "Number of steps", ask: "How many steps are there in total between the street and the room?" },
    ];
    for (const n of need) {
      if (n.ok) continue;
      add({ id: `access:${n.key}`, kind: "hold", group: "access", title: n.label, finding: n.key === "stairs_count" && f("floor_or_stairs_described") ? `The message describes "${bare(f("floor_or_stairs_described").quote)}", which is a floor, not a step count.` : "Not on file.", quotes: [Q.accessFacts, Q.priorToShipping, Q.accessBeforeBooking], ask: n.ask, owner: "Ops" });
    }
  }

  // Steps against the service paid for.
  const steps = f("stairs_count");
  if (steps && /Ground Level \(0-3 Steps\)/.test(service) && Number(steps.value) > 3) {
    const carry = product.delivery_options.find((o) => /Stair Carry/.test(o.name));
    add({ id: "steps", kind: "hold", group: "mismatch", title: "Steps against the service paid for", finding: `Paid for ground level (0 to 3 steps); the customer describes ${steps.value} steps.` + (carry && chosen ? ` The stair carry service on this machine is ${money(carry.price)}.` : ""), evidence: steps, quotes: [Q.groundLevel, Q.stairCarry], ask: "Your message mentions more than 3 steps; the ground-level service covers 3 or fewer. May we move the order to the stair-carry service?", owner: "Ops (a price change needs the customer's OK)" });
  }
  if (steps && /Garage Installation/.test(service) && Number(steps.value) > 0) {
    add({ id: "steps", kind: "hold", group: "mismatch", title: "Steps against the service paid for", finding: `Garage installation needs a path with no ledges or stairs; the customer describes ${steps.value} step(s).`, evidence: steps, quotes: [Q.garageInstall], owner: "Ops" });
  }

  // Published size against the narrowest door: a feasibility question, never "impossible".
  const door = f("narrowest_door_in");
  if (room && door) {
    const d = product.dimensions_in || {};
    const known = [d.length, d.width, d.height].filter((x) => typeof x === "number");
    if (/^Fully Assembled/.test(product.ships_as || "") && known.length === 3 && Math.min(...known) > Number(door.value)) {
      add({ id: "door", kind: "review", group: "feasibility", title: "Published size against the narrowest door", finding: `Ships fully assembled at ${d.length} × ${d.width} × ${d.height} in; the smallest side is wider than the ${door.value} in door. Whether another transport configuration works is your crew's call.`, evidence: door, owner: "Ops" });
    }
  }

  // Garage delivery ground conditions.
  if (/Garage Delivery/.test(service)) {
    const surface = f("driveway_surface");
    const ledge = f("ledge_or_step_at_garage");
    const bad = [];
    if (surface && ["dirt", "grass", "mixed_soft"].includes(surface.value)) bad.push(surface);
    if (ledge && ledge.value === true) bad.push(ledge);
    if (bad.length) {
      add({ id: "access:garage", kind: "hold", group: "access", title: "Pallet-jack path to the garage", finding: `The message describes ${bad.map((b) => `"${bare(b.quote)}"`).join(" and ")}; the service text lists softer dirt, grass and a ledge as barriers.`, quotes: [Q.garageDelivery, Q.garageConfirm], ask: "Garage delivery needs a firm path with no lip or step. Would curbside delivery work instead, or can the path be firmed up for the delivery day?", owner: "Ops" });
    } else if (!surface) {
      add({ id: "access:garage", kind: "hold", group: "access", title: "Pallet-jack path to the garage", finding: "Driveway surface and garage entry not on file.", quotes: [Q.garageConfirm, Q.garageDelivery], ask: "Is the path from the street to the garage paved or gravel, and is there any lip or step at the garage door?", owner: "Ops" });
    } else if (surface.value === "gravel") {
      add({ id: "cleared:gravel", kind: "cleared", title: "Gravel driveway", finding: `"${bare(surface.quote)}" looks like a problem for a pallet jack, but the service text names gravel as covered.`, quotes: [Q.garageDelivery] });
    }
  }

  // Weight and configuration records.
  const s = product.shopify_lb, p = product.page_weight_lb, maker = st.maker;
  const makerW = maker ? maker.weights.find((w) => w.matches === st.configuration) : null;
  const differs = p != null && ((s < 150) !== (p < 150));
  const configSplit = maker && makerW && p != null && Math.abs(makerW.assembled_lb - p) > 5;
  if (differs || configSplit) {
    const parts = [`Shopify shipping record: ${s} lb (${product.shopify_grams.toLocaleString("en-US")} g).`, `Product page: ${p} lb, one figure for the machine.`];
    if (maker) parts.push(`Manufacturer: ${maker.weights.map((w) => `${w.assembled_lb} lb assembled in the ${w.configuration.replace(". ", " ").toLowerCase()} configuration`).join(", ")}.`);
    if (st.configuration) parts.push(`This order: ${st.configuration}.`);
    add({ id: "config:weight", kind: "review", group: "configuration", title: "Which weight belongs to this configuration", finding: parts.join(" "), note: "Product, assembled, per-box and gross weights are different quantities; none of these values replaces another automatically. A weight-based routing decision waits; nothing else does.", quotes: differs ? [Q.parcelOld, Q.combinedFreight] : [], makerSource: maker ? maker.source : null, owner: "Catalog owner or ops, never the customer" });
  }

  // Zone and eligibility. Distance is a straight line between Census ZIP centroids.
  let zone = null;
  const miles = geo ? milesBetween(BENICIA, geo) : null;
  if (miles != null) {
    const calc = `Straight line from ZIP ${BENICIA.zip} to ZIP ${zip}: ${miles.toFixed(1)} miles (Census ZIP centroids; road miles run longer).`;
    const expectsFree = f("expects_free_local_delivery");
    if (usState === "CA" && miles <= 120) zone = miles <= 100 ? "local" : "edge";
    else zone = WEST.includes(usState) ? "west" : STATE_TZ[usState] || "unknown";
    if (zone === "local" || zone === "edge") {
      const text = zone === "local"
        ? `Local area, ${miles.toFixed(0)} miles. Free local delivery also needs an approved ZIP and a qualifying subtotal of $1,000 or more; the ZIP list is not published. Eligibility requires checkout or operations confirmation.`
        : `${miles.toFixed(0)} miles: past the "approximately 100 miles" of Shipping Information. The shipping policy's 120 miles describes your own trucks for small-parcel items, a different condition, so the two figures are recorded side by side, not reconciled.`;
      add({ id: "zone", kind: zone === "edge" && expectsFree ? "review" : "info", group: "eligibility", title: "Local delivery area", finding: text + (zone === "edge" && expectsFree ? " The customer expects free local delivery." : ""), calc, quotes: zone === "local" ? [Q.localNew] : [Q.localNew, Q.localOldTrucks], evidence: expectsFree, owner: zone === "edge" && expectsFree ? "Ops (which rule applies here has an owner on your side)" : null });
      if (zone === "local") add({ id: "cleared:tracking", kind: "cleared", title: "No tracking number", finding: "A local order with no tracking number would look like a broken handoff. Your pages say Northern California deliveries go on your own vehicles, by phone appointment, without tracking.", quotes: [Q.norcal], setByUs: "We treat every California ZIP within 100 miles of 94510 as Northern California." });
    } else {
      add({ id: "zone", kind: zone === "split" || zone === "unknown" ? "review" : "info", group: "eligibility", title: "Transit group", finding: WEST.includes(usState) ? `West group outside the local area (${miles.toFixed(0)} miles).` : zone === "split" ? `${usState} spans two time zones; the address's own zone sets the transit time.` : `${zone === "eastern" ? "Eastern" : "Central or Mountain"} time zone.`, calc });
    }
    if (/Manufacturer's Warehouse/.test(product.processing_time || "")) {
      add({ id: "origin", kind: "info", title: "Where it ships from", finding: "This product ships from the manufacturer's warehouse, so the distance from Benicia describes your service area, not the shipment's origin." });
    }
  }

  // A date the customer asked for, against the fastest published path.
  const needBy = f("need_by");
  if (needBy && zone) {
    const proc = processingDays(product.processing_time);
    const small = s < 150 && (p == null || p < 150) && !room;
    let t;
    if (zone === "local") t = { ...TRANSIT.local, how: "local" };
    else if (small) t = { ...(zone === "west" ? TRANSIT.parcel.west : TRANSIT.parcel.rest), how: "parcel" };
    else t = { ...(zone === "west" || zone === "edge" ? TRANSIT.freight.west : zone === "eastern" ? TRANSIT.freight.eastern : TRANSIT.freight.central), how: "freight" };
    if (proc) {
      const earliest = addBusinessDays(asOf, proc.min + t.min);
      if (earliest > needBy.value) {
        add({ id: "date", kind: "review", group: "date", title: "Date the customer asked for", finding: `Needed by ${needBy.value}. The fastest published path lands ${earliest}: processing "${product.processing_time.replace(" + Transit Time", "")}" plus ${t.how}, ${t.text}.`, calc: `${asOf} + ${proc.min} business days + ${t.min} business days = ${earliest} (weekends skipped, holidays not)`, evidence: needBy, quotes: [Q.processingSeparate], owner: "Ops (only your team promises a date)" });
      }
    }
  }

  // Authorization: a confirmed plan for this exact machine, scope and address, and the customer's written OK on that version.
  if (room) {
    const current = Object.values(plans).filter((pl) => pl.for.service === service && pl.for.zip === zip).sort((a, b) => b.version - a.version)[0];
    const approved = current && approvals[current.version];
    const stale = Object.values(approvals).find((a) => !current || a.version !== current.version);
    const reply = f("approval_reply");
    if (!approved) {
      let finding;
      if (stale) finding = `Plan version ${stale.version} was approved by ${stale.by}, but the ${plans[stale.version].for.zip !== zip ? "delivery address" : "service"} changed afterwards. That approval no longer covers this order.`;
      else if (current) finding = `Plan version ${current.version} was sent; no written approval of it yet.`;
      else finding = reply ? `The message says "${bare(reply.quote)}". No plan with crew, scope, price and timing has been confirmed yet, so this is a preliminary reply, not approval.` : "No plan with crew, scope, price and timing confirmed yet.";
      if (reply && reply.value === "final_written_yes" && !current) finding += " (The extraction model labelled it a final yes. The rule does not take its word.)";
      add({ id: "authorization", kind: "hold", group: "authorization", title: "Delivery plan and written approval", finding, quotes: /2 Step/.test(service) ? [Q.twoStepPrelim, Q.twoStepFinal] : [Q.feasibility, Q.confirmedBeforeBooking], setByUs: /2 Step/.test(service) ? null : "Your pages require a final written YES for the two-step plan. This test applies the same to any room service: the customer approves the confirmed plan version in writing.", owner: "Ops (send the plan, record who approved which version)" });
    } else {
      add({ id: "authorization", kind: "pass", title: "Delivery plan and written approval", finding: `Plan version ${current.version} approved by ${approved.by} (${approved.channel}, ${approved.at.slice(0, 16).replace("T", " ")}): "${approved.text}"` });
    }
  }

  const holds = issues.filter((i) => i.kind === "hold");
  const reviews = issues.filter((i) => i.kind === "review");
  const verdict = holds.length ? "HOLD" : reviews.length ? "REVIEW" : "PASS";
  const label = holds.length ? LABELS[holds[0].group] : reviews.length ? LABELS[reviews[0].group] : LABELS.pass;
  return { verdict, label, issues, miles, zone, openIds: [...holds, ...reviews].map((i) => i.id) };
}

// ---------- Business actions and replay ----------
export class MemoryLedger {
  constructor() { this.done = new Map(); }
  once(key, action) {
    if (this.done.has(key)) return { created: false, key, action: this.done.get(key) };
    this.done.set(key, action);
    return { created: true, key, action };
  }
}

// Shopify's fulfillmentOrderReleaseHold releases every hold when holdIds is omitted
// (https://shopify.dev/docs/api/admin-graphql/latest/mutations/fulfillmentOrderReleaseHold, read 2026-09-29).
// This builder refuses that call shape.
export function buildReleaseHold({ fulfillmentOrderId, holdIds, ownedHoldIds }) {
  if (!Array.isArray(holdIds) || holdIds.length === 0) throw new Error("Refused: a release without explicit holdIds would release every hold.");
  const foreign = holdIds.filter((h) => !(ownedHoldIds || []).includes(h));
  if (foreign.length) throw new Error(`Refused: hold ${foreign.join(", ")} is not owned by this workflow.`);
  return { query: "mutation ($id: ID!, $holdIds: [ID!]) { fulfillmentOrderReleaseHold(id: $id, holdIds: $holdIds) { fulfillmentOrder { id status } userErrors { field message } } }", variables: { id: fulfillmentOrderId, holdIds } };
}

function customerDraft(order, result) {
  const asks = [...new Set(result.issues.filter((i) => i.kind === "hold" && i.ask).map((i) => i.ask))];
  if (!asks.length) return null;
  const first = order.customer.split(/[ ,]/)[0];
  return {
    key: `draft:${order.id}:${asks.map((a) => a.slice(0, 24)).sort().join("|")}`,
    text: `Hi ${first}, before your order goes to the carrier we need ${asks.length > 1 ? "a few details" : "one detail"}:\n\n${asks.map((a, i) => (asks.length > 1 ? `${i + 1}. ${a}` : a)).join("\n")}\n\nThank you, the delivery team`,
  };
}

export function initialState(order, product, ctx) {
  return {
    order, product, asOf: ctx.asOf, service: null, zip: order.zip, city: order.city, state: order.state,
    geo: ctx.zips[order.zip], configuration: order.configuration || null, maker: ctx.manufacturer ? ctx.manufacturer[order.handle] || null : null,
    facts: {}, dropped: [], messages: [], draft: null, plans: {}, approvals: {}, payments: [], freight: "not shipped", customerDelivery: "open", installation: "open", released: false,
  };
}

export function replay(order, product, events, ctx, ledger = new MemoryLedger()) {
  const st = initialState(order, product, ctx);
  const seenDeliveries = new Set();
  const timeline = [];
  let result = null;
  for (const ev of events) {
    const entry = { event: ev, effects: [], actions: [] };
    if (ev.webhook_id) {
      if (seenDeliveries.has(ev.webhook_id)) {
        entry.duplicate = true;
        entry.effects.push(`Duplicate delivery ${ev.webhook_id} ignored${ev.event_id ? ` (same event ${ev.event_id})` : ""}.`);
        entry.result = result;
        timeline.push(entry);
        continue;
      }
      seenDeliveries.add(ev.webhook_id);
    }
    switch (ev.type) {
      case "order_created": st.service = ev.service; entry.effects.push(`Order created: ${ev.service}.`); break;
      case "customer_message": {
        st.messages.push(ev);
        const r = factsFromMessages(st.messages, ctx.texts, ctx.extractions);
        const entered = Object.fromEntries(Object.entries(st.facts).filter(([, v]) => v.by !== "message"));
        st.facts = { ...r.facts, ...entered };
        st.dropped = r.dropped;
        entry.effects.push("Customer message read; facts taken only where the exact words are in it.");
        break;
      }
      case "payment_received": {
        const rec = ledger.once(`payment:${ev.event_id || ev.webhook_id}`, { amount: ev.amount, for: ev.for_service });
        if (rec.created) st.payments.push({ amount: ev.amount, for: ev.for_service, at: ev.at });
        const changed = ev.for_service && ev.for_service !== st.service;
        if (changed) st.service = ev.for_service;
        entry.effects.push(`Payment of ${money(ev.amount)} ${rec.created ? "recorded" : "already recorded, not added again"}${changed ? `; service is now ${ev.for_service}` : ""}. Holds are re-checked, never released by a payment.`);
        break;
      }
      case "fact_entered":
        if (ev.value === null || ev.value === undefined || ev.value === "") { delete st.facts[ev.key]; entry.effects.push(`${ev.by} cleared ${ev.key.replace(/_/g, " ")}.`); }
        else { st.facts[ev.key] = { value: ev.value, quote: null, by: ev.by, at: ev.at }; entry.effects.push(`${ev.by}: ${ev.key.replace(/_/g, " ")} = ${ev.value}.`); }
        break;
      case "plan_issued": st.plans[ev.version] = { ...ev }; entry.effects.push(`Plan version ${ev.version} sent to the customer.`); break;
      case "plan_approved": st.approvals[ev.version] = { ...ev }; entry.effects.push(`${ev.by} approved plan version ${ev.version} in writing (${ev.channel}).`); break;
      case "destination_changed": st.zip = ev.zip; st.city = ev.city; st.geo = ctx.zips[ev.zip] || st.geo; entry.effects.push(`Delivery address changed to ZIP ${ev.zip}.`); break;
      case "service_changed": st.service = ev.service; entry.effects.push(`Service changed to ${ev.service}.`); break;
      case "release_requested": {
        const r = evaluate(st);
        if (r.verdict !== "PASS") { entry.effects.push(`Release refused: ${r.label}.`); entry.refused = true; break; }
        const owned = ["gid://shopify/FulfillmentHold/demo-access", "gid://shopify/FulfillmentHold/demo-plan"];
        const req = buildReleaseHold({ fulfillmentOrderId: `gid://shopify/FulfillmentOrder/demo-${order.id}`, holdIds: ev.hold_ids === "owned" ? owned : ev.hold_ids, ownedHoldIds: owned });
        st.released = true;
        entry.release = req;
        entry.effects.push(`${ev.by} released the order, naming the ${req.variables.holdIds.length} holds this workflow owns.`);
        break;
      }
      case "carrier_update":
        if (ev.location === "installer") { st.freight = "at installer"; entry.effects.push(`${ev.label}. Freight leg done; customer delivery and installation still open.`); }
        else { st.freight = "delivered"; st.customerDelivery = "delivered"; entry.effects.push("Carrier confirms delivery to the customer."); }
        break;
      case "installation_complete": st.installation = "installed"; st.customerDelivery = "delivered"; entry.effects.push("Installer confirms installation at the customer's address."); break;
      default: entry.effects.push(`Unknown event type ${ev.type}; ignored.`);
    }
    result = evaluate(st);
    if (!st.released) {
      // One draft per order, updated in place when the questions change; never a second message for the same state.
      const draft = customerDraft(order, result);
      const prevKey = st.draft ? st.draft.key : null;
      if (draft && draft.key !== prevKey) {
        const r = ledger.once(draft.key, draft);
        if (r.created) entry.actions.push({ kind: st.draft ? "draft-updated" : "draft", text: draft.text });
        st.draft = draft;
      } else if (!draft && st.draft) {
        entry.actions.push({ kind: "draft-withdrawn" });
        st.draft = null;
      }
      for (const i of result.issues.filter((x) => (x.kind === "hold" || x.kind === "review") && !x.ask)) {
        const r = ledger.once(`item:${order.id}:${i.id}`, i);
        if (r.created) entry.actions.push({ kind: "ops-item", id: i.id, title: i.title, owner: i.owner });
      }
    }
    entry.result = result;
    entry.status = { freight: st.freight, customerDelivery: st.customerDelivery, installation: st.installation, released: st.released };
    timeline.push(entry);
  }
  return { state: st, result, timeline, ledger };
}
