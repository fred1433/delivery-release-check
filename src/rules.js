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
  afterRelease: "HOLD: changed after release",
  carrier: "REVIEW: carrier update needs your team",
  pass: "PASS: this checklist is complete; operational release remains with your team",
};

const LOCATION_FACTS = ["room_location", "floor_or_stairs_described", "stairs_count", "narrowest_door_in", "path_photos", "driveway_surface", "ledge_or_step_at_garage"];
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
const VALUE_WORDS = { true: "yes", false: "none", mixed_soft: "soft when wet", received: "received and reviewed", sent: "customer says sent" };
const fmt = (v) => (String(v) in VALUE_WORDS ? VALUE_WORDS[String(v)] : String(v).replace(/_/g, " "));

// Where a fact came from, in words: the customer's own words, or who entered it on the ticket.
// Always starts in lower case; callers capitalize it when it opens a sentence.
export function said(f, what) {
  const w = what.charAt(0).toLowerCase() + what.slice(1);
  if (!f) return `${w}: not on file`;
  if (f.by === "message") return `the message says "${bare(f.quote)}"`;
  return `${w} entered on this ticket (${f.by}): ${fmt(f.value)}`;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Facts from customer messages ----------
// A quote proves where a fact came from, not that it was read correctly; these guards catch what code can catch.
const wholeNumber = (q, n) => new RegExp(`(^|[^\\d.])${String(n).replace(".", "\\.")}(?![\\d.]*\\d)`).test(q);
export function checkFact(key, fact, message) {
  if (!fact) return null;
  if (typeof fact.quote !== "string" || !fact.quote || !message.includes(fact.quote)) return "quote not found in the message";
  const q = fact.quote.toLowerCase();
  if (key === "narrowest_door_in") {
    if (!wholeNumber(q, fact.value)) return "number not in the quote";
    if (/(\bcm\b|\bmm\b|centimet|millimet|\bmeters?\b|\bfeet\b|\bfoot\b|\bft\b)/.test(q)) return "unit is not inches";
    if (!/(\binch(es)?\b|\bin\b|")/.test(q)) return "no unit in the quote";
  }
  if (key === "stairs_count") {
    const n = Number(fact.value);
    const ok = wholeNumber(q, n) || (NUMBER_WORDS[n] && new RegExp(`\\b${NUMBER_WORDS[n]}\\b`).test(q)) || (n === 0 && /\bno (steps|stairs)\b/.test(q));
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

// ---------- Event validation: supported types and the fields each one needs ----------
export const CARRIER_STATUSES = ["in_transit", "out_for_delivery", "delivered", "exception"];
export const CARRIER_LOCATIONS = ["terminal", "installer", "customer"];
const FACT_KEYS = ["room_location", "floor_or_stairs_described", "stairs_count", "narrowest_door_in", "path_photos", "driveway_surface", "ledge_or_step_at_garage", "need_by", "expects_free_local_delivery"];
export const EVENT_FIELDS = {
  order_created: ["service"],
  customer_message: ["message"],
  payment_received: ["event_id", "amount", "for_service"],
  fact_entered: ["key", "by"],
  plan_issued: ["version", "summary"],
  plan_approved: ["version", "by", "channel", "text"],
  destination_changed: ["zip"],
  service_changed: ["service"],
  release_requested: ["by"],
  carrier_update: ["status", "location"],
  installation_complete: ["by"],
};
export function validateEvent(ev) {
  if (!ev || typeof ev !== "object") return "event missing";
  for (const k of ["type", "id", "at"]) if (typeof ev[k] !== "string" || !ev[k]) return `event needs ${k}`;
  const need = Object.hasOwn(EVENT_FIELDS, ev.type) ? EVENT_FIELDS[ev.type] : null;
  if (!need) return `unsupported event type "${ev.type}"`;
  for (const k of need) if (ev[k] === undefined || ev[k] === null || ev[k] === "") return `${ev.type} needs ${k}`;
  if (ev.type === "carrier_update") {
    if (!CARRIER_STATUSES.includes(ev.status)) return `unknown carrier status "${ev.status}"`;
    if (!CARRIER_LOCATIONS.includes(ev.location)) return `unknown carrier location "${ev.location}"`;
  }
  if (ev.type === "fact_entered" && !FACT_KEYS.includes(ev.key)) return `unknown fact "${ev.key}"`;
  if (ev.type === "payment_received" && !(typeof ev.amount === "number" && ev.amount > 0)) return "payment amount must be a positive number";
  return null;
}

// What a plan was written for. A plan version is immutable; its approval covers this snapshot only.
const SNAPSHOT_FIELDS = { service: "service", zip: "delivery address", stairs_count: "step count", narrowest_door_in: "narrowest door" };
export function snapshotOf(st) {
  return { service: st.service, zip: st.zip, stairs_count: st.facts.stairs_count ? st.facts.stairs_count.value : null, narrowest_door_in: st.facts.narrowest_door_in ? st.facts.narrowest_door_in.value : null };
}
function snapshotDiff(a, b) {
  return Object.keys(SNAPSHOT_FIELDS).filter((k) => a[k] !== b[k]).map((k) => ({ field: SNAPSHOT_FIELDS[k], was: a[k], now: b[k] }));
}
const diffText = (d) => d.map((x) => `${x.field} (plan: ${x.was ?? "none"}; now: ${x.now ?? "none"})`).join(", ");

// ---------- Evaluation of one order state ----------
export function evaluate(st) {
  const { product, service, zip, state: usState, geo, facts, plans, approvals, asOf } = st;
  const issues = [];
  const add = (i) => issues.push(i);
  const f = (k) => facts[k] || null;
  const chosen = product.delivery_options.find((o) => o.name === service);
  const room = ROOM_SERVICE.test(service);
  const cleared = st.cleared || {};

  if (!chosen) add({ id: "service", kind: "hold", group: "service", title: "Service offered for this machine", finding: `"${service}" is not among the services listed on this product page.`, owner: "Ops" });

  // Access evidence the product page asks for before shipping. One issue per missing fact.
  if (room) {
    const where = f("room_location") || f("floor_or_stairs_described");
    const photos = f("path_photos");
    const need = [
      { key: "room_location", ok: !!where, label: "Where it goes", ask: "Which room will it go in, and on which floor?" },
      { key: "narrowest_door_in", ok: !!f("narrowest_door_in"), label: "Narrowest door width", ask: "What is the width of the narrowest door on the way in, in inches?" },
      photos && photos.value === "sent"
        ? { key: "path_photos", ok: false, label: "Path photos: customer says sent, not yet reviewed", finding: `${cap(said(photos, "Path photos"))}. Nobody has confirmed receiving and reviewing them.`, owner: "Ops (confirm the photos arrived and review them)" }
        : { key: "path_photos", ok: photos && photos.value === "received", label: photos && photos.value === "promised" ? "Path photos (promised, not received)" : "Photos of the path and turns", ask: "Could you send photos of the path from the street, including every turn?" },
      { key: "stairs_count", ok: f("stairs_count") != null, label: "Number of steps", ask: "How many steps are there in total between the street and the room?" },
    ];
    for (const n of need) {
      if (n.ok) continue;
      const finding = n.finding || (cleared[n.key] ? `Cleared on this ticket (${cleared[n.key]}); not on file.` : n.key === "stairs_count" && f("floor_or_stairs_described") && f("floor_or_stairs_described").by === "message" ? `The message says "${bare(f("floor_or_stairs_described").quote)}", which gives a floor, not a step count.` : "Not on file.");
      add({ id: `access:${n.key}`, kind: "hold", group: "access", title: n.label, finding, quotes: [Q.accessFacts, Q.priorToShipping, Q.accessBeforeBooking], ask: n.ask, owner: n.owner || "Ops" });
    }
  }

  // Steps against the service paid for.
  const steps = f("stairs_count");
  if (steps && /Ground Level \(0-3 Steps\)/.test(service) && Number(steps.value) > 3) {
    const carry = product.delivery_options.find((o) => /Stair Carry/.test(o.name));
    add({ id: "steps", kind: "hold", group: "mismatch", title: "Steps against the service paid for", finding: `Paid for ground level (0 to 3 steps); ${said(steps, "Step count")}.` + (carry && chosen ? ` The stair carry service on this machine is ${money(carry.price)}.` : ""), evidence: steps, quotes: [Q.groundLevel, Q.stairCarry], ask: steps.by === "message" ? "Your message mentions more than 3 steps; the ground-level service covers 3 or fewer. May we move the order to the stair-carry service?" : `We have ${steps.value} steps on file between the street and the room; the ground-level service covers 3 or fewer. May we move the order to the stair-carry service?`, owner: "Ops (a price change needs the customer's OK)" });
  }

  // Garage installation: rolled on wheels the whole way, no ledge or stair, path at least 60 in wide.
  if (/Garage Installation/.test(service)) {
    const door = f("narrowest_door_in");
    const ledge = f("ledge_or_step_at_garage");
    const bad = [];
    if (steps && Number(steps.value) > 0) bad.push(said(steps, "Step count"));
    if (ledge && ledge.value === true) bad.push(said(ledge, "Lip at the garage door"));
    if (door && Number(door.value) < 60) bad.push(`${said(door, "Narrowest door")}, under the 60 in path`);
    if (bad.length) add({ id: "garage-install", kind: "hold", group: "mismatch", title: "Garage installation path", finding: `Garage installation needs a path at least 60 in wide with no ledge or stair; ${bad.join("; ")}.`, quotes: [Q.garageInstall], owner: "Ops (another service may fit)" });
    else if (!ledge) add({ id: "access:garage-ledge", kind: "hold", group: "access", title: "Lip or step at the garage door", finding: `${cap(said(null, "Lip or step at the garage door"))}; garage installation needs a path with no ledge.`, quotes: [Q.garageInstall], ask: "Is there any lip or step at the garage door?", owner: "Ops" });
  }

  // Published size against the narrowest door: a feasibility question, never "impossible".
  const door = f("narrowest_door_in");
  if (room && door) {
    const d = product.dimensions_in || {};
    const known = [d.length, d.width, d.height].filter((x) => typeof x === "number");
    const ships = product.ships_as || "";
    const size = `${d.length ?? "?"} × ${d.width ?? "?"} × ${d.height ?? "?"} in`;
    const title = "Published size against the narrowest door";
    if (/^(Fully|Mostly) Assembled/.test(ships) && known.length === 3) {
      const smallest = Math.min(...known);
      if (smallest > Number(door.value)) {
        const mostly = /^Mostly/.test(ships);
        add({ id: "door", kind: "review", group: "feasibility", title, finding: `Ships ${mostly ? "mostly assembled, arms removed," : "fully assembled"} at ${size}; even the smallest side (${smallest} in) is wider than the ${door.value} in door.${mostly ? " With the arms off the frame may still be close to this size." : ""} Whether another transport configuration works is your crew's call.`, evidence: door, owner: "Ops" });
      }
    } else {
      add({ id: "door", kind: "info", title, finding: `Not compared: this machine ships "${ships.replace(/ \(.*\)$/, "").toLowerCase()}" and ${known.length < 3 ? "one published dimension is blank" : "the size of what arrives is not published"}. Your crew checks the ${door.value} in door.` });
    }
  }

  // Garage delivery ground conditions: both the driveway and the garage entry must be known.
  if (/Garage Delivery/.test(service)) {
    const surface = f("driveway_surface");
    const ledge = f("ledge_or_step_at_garage");
    const bad = [];
    if (surface && ["dirt", "grass", "mixed_soft"].includes(surface.value)) bad.push(said(surface, "Driveway"));
    if (ledge && ledge.value === true) bad.push(said(ledge, "Lip at the garage door"));
    if (bad.length) {
      add({ id: "access:garage", kind: "hold", group: "access", title: "Pallet-jack path to the garage", finding: `${bad.join("; ")}. The service text lists softer dirt, grass and a ledge as barriers.`.replace(/^./, (c) => c.toUpperCase()), quotes: [Q.garageDelivery, Q.garageConfirm], ask: "Garage delivery needs a firm path with no lip or step. Would curbside delivery work instead, or can the path be firmed up for the delivery day?", owner: "Ops" });
    }
    if (!surface) add({ id: "access:garage-surface", kind: "hold", group: "access", title: "Driveway surface", finding: cleared.driveway_surface ? `Cleared on this ticket (${cleared.driveway_surface}); not on file.` : "Not on file.", quotes: [Q.garageConfirm, Q.garageDelivery], ask: "Is the path from the street to the garage paved or gravel?", owner: "Ops" });
    if (!ledge) add({ id: "access:garage-ledge", kind: "hold", group: "access", title: "Lip or step at the garage door", finding: cleared.ledge_or_step_at_garage ? `Cleared on this ticket (${cleared.ledge_or_step_at_garage}); not on file.` : "Not on file. Unknown is not the same as none.", quotes: [Q.garageConfirm, Q.garageDelivery], ask: "Is there any lip or step at the garage door?", owner: "Ops" });
    if (surface && surface.value === "gravel" && !bad.length) {
      add({ id: "cleared:gravel", kind: "cleared", title: "Gravel driveway", finding: `${said(surface, "Driveway").replace(/^./, (c) => c.toUpperCase())}. That looks like a problem for a pallet jack, but the service text names gravel as covered.`, quotes: [Q.garageDelivery] });
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
    add({ id: "config:weight", kind: "review", group: "configuration", title: "Which weight belongs to this configuration", finding: parts.join(" "), note: "This example pauses release until Ops confirms the applicable weight and routing. It does not establish which value your checkout or warehouse uses.", quotes: differs ? [Q.parcelOld, Q.combinedFreight] : [], makerSource: maker ? maker.source : null, owner: "Catalog owner or ops, never the customer" });
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
        add({ id: "date", kind: "review", group: "date", title: "Date the customer asked for", finding: `Needed by ${needBy.value} (${said(needBy, "Date")}). The fastest published path lands ${earliest}: processing "${product.processing_time.replace(" + Transit Time", "")}" plus ${t.how}, ${t.text}.`, calc: `${asOf} + ${proc.min} business days + ${t.min} business days = ${earliest} (weekends skipped, holidays not)`, evidence: needBy, quotes: [Q.processingSeparate], owner: "Ops (only your team promises a date)" });
      }
    }
  }

  // Authorization: the latest plan version, approved in writing, still matching the order it was written for.
  if (room) {
    const versions = Object.keys(plans).map(Number).sort((a, b) => b - a);
    const current = versions.length ? plans[versions[0]] : null;
    const voided = st.voided || {};
    const drift = current ? snapshotDiff(current.snapshot, snapshotOf(st)) : [];
    const approval = current ? approvals[current.version] : null;
    const reply = f("approval_reply");
    const twoStep = /2 Step/.test(service);
    if (approval && !voided[current.version] && !drift.length) {
      add({ id: "authorization", kind: "pass", title: "Delivery plan and written approval", finding: `Plan version ${current.version} approved by ${approval.by} (${approval.channel}, ${approval.at.slice(0, 16).replace("T", " ")}): "${approval.text}"`, proposed: !twoStep });
    } else {
      let finding;
      if (approval) {
        const v = voided[current.version];
        const before = v && v.when === "before";
        finding = `Plan version ${current.version} was approved by ${approval.by}, but ${diffText(v ? v.diff : drift)} changed ${before ? "between the plan and the approval" : "afterwards"}. That approval does not cover this order, even if the change is undone: a new plan version needs a new approval.`;
      }
      else if (current && drift.length) finding = `Plan version ${current.version} no longer matches the order: ${diffText(drift)}. Issue a new version.`;
      else if (current) finding = `Plan version ${current.version} was sent; no written approval of it yet.`;
      else finding = reply ? `The message says "${bare(reply.quote)}". No plan with crew, scope, price and timing has been confirmed yet, so this is a preliminary reply, not approval.` : "No plan with crew, scope, price and timing confirmed yet.";
      if (reply && reply.value === "final_written_yes" && versions.length === 0) finding += " (The extraction model labelled it a final yes. The rule does not take its word.)";
      add({ id: "authorization", kind: "hold", group: "authorization", title: "Delivery plan and written approval", finding, proposed: !twoStep, quotes: twoStep ? [Q.twoStepPrelim, Q.twoStepFinal] : [Q.feasibility, Q.confirmedBeforeBooking], owner: "Ops (send the plan, record who approved which version)" });
    }
  }

  if (st.carrierIssue) add({ id: "carrier", kind: "review", group: "carrier", title: "Carrier update", finding: st.carrierIssue, owner: "Ops" });
  if (st.changedAfterRelease) {
    add({ id: "after-release", kind: "hold", group: "afterRelease", title: "Changed after release", finding: `The order was already released to the carrier when ${st.changedAfterRelease} changed. Nothing here recalls a shipment; your team decides with the carrier and issues a new plan.`, owner: "Ops (carrier and new plan)" });
  }
  const holds = issues.filter((i) => i.kind === "hold");
  const reviews = issues.filter((i) => i.kind === "review");
  const verdict = holds.length ? "HOLD" : reviews.length ? "REVIEW" : "PASS";
  const label = holds.length ? LABELS[holds[0].group] : reviews.length ? LABELS[reviews[0].group] : LABELS.pass;
  return { verdict, label, issues, miles, zone, openIds: [...holds, ...reviews].map((i) => i.id) };
}

export const PROPOSED_APPROVAL = "Proposed approval control: this example requires written customer approval of the confirmed plan.";

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
    facts: {}, dropped: [], messages: [], earlierMessages: [], cleared: {}, voided: {}, changedAfterRelease: null, carrierIssue: null, draft: null, plans: {}, approvals: {}, payments: [], freight: "not shipped", customerDelivery: "open", installation: "open", released: false,
  };
}

const OWNED_HOLDS = ["gid://shopify/FulfillmentHold/demo-access", "gid://shopify/FulfillmentHold/demo-plan"];

export function replay(order, product, events, ctx, ledger = new MemoryLedger()) {
  const st = initialState(order, product, ctx);
  const seenDeliveries = new Set();
  const seenBusiness = new Set();
  const timeline = [];
  let result = null;
  for (const ev of events) {
    const entry = { event: ev, effects: [], actions: [] };
    const invalid = validateEvent(ev);
    if (invalid) {
      entry.rejected = true;
      entry.effects.push(`Event rejected: ${invalid}. Nothing changed.`);
      entry.result = result;
      entry.status = { freight: st.freight, customerDelivery: st.customerDelivery, installation: st.installation, released: st.released };
      timeline.push(entry);
      continue;
    }
    // Two kinds of duplicate: the same delivery (webhook id) and the same business event under a new delivery (event id).
    // Neither changes the order.
    const dupDelivery = ev.webhook_id && seenDeliveries.has(ev.webhook_id);
    const dupBusiness = ev.event_id && seenBusiness.has(ev.event_id);
    if (dupDelivery || dupBusiness) {
      entry.duplicate = true;
      entry.effects.push(dupDelivery ? `Duplicate delivery ${ev.webhook_id} ignored${ev.event_id ? ` (same event ${ev.event_id})` : ""}.` : `Event ${ev.event_id} arrived again under a new delivery id (${ev.webhook_id || "none"}); already applied, nothing changed.`);
      entry.result = result;
      entry.status = { freight: st.freight, customerDelivery: st.customerDelivery, installation: st.installation, released: st.released };
      timeline.push(entry);
      continue;
    }
    if (ev.webhook_id) seenDeliveries.add(ev.webhook_id);
    if (ev.event_id) seenBusiness.add(ev.event_id);
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
        // Rebuilding the order's state and suppressing external actions are separate jobs: duplicates were already
        // skipped above by event id, so this event is new to the order. The ledger only records the business action.
        st.payments.push({ amount: ev.amount, for: ev.for_service, at: ev.at });
        ledger.once(`payment:${ev.event_id}`, { amount: ev.amount, for: ev.for_service });
        const changed = ev.for_service !== st.service;
        if (changed) { st.service = ev.for_service; if (st.released) st.changedAfterRelease = "the service"; }
        entry.effects.push(`Payment of ${money(ev.amount)} recorded${changed ? `; service is now ${ev.for_service}` : ""}. Holds are re-checked, never released by a payment.`);
        break;
      }
      case "fact_entered": {
        const label = ev.key.replace(/_/g, " ");
        const bad = (ev.key === "stairs_count" && ev.value != null && ev.value !== "" && !(Number.isInteger(ev.value) && ev.value >= 0))
          || (ev.key === "narrowest_door_in" && ev.value != null && ev.value !== "" && !(typeof ev.value === "number" && ev.value > 0 && ev.value < 200));
        if (bad) { entry.effects.push(`${ev.by}: ${label} = ${ev.value} not accepted (not a valid value); previous value kept.`); break; }
        if (st.released) st.changedAfterRelease = label;
        if (ev.value === null || ev.value === undefined || ev.value === "") { delete st.facts[ev.key]; st.cleared[ev.key] = ev.by; entry.effects.push(`${ev.by} cleared ${label}.`); }
        else { st.facts[ev.key] = { value: ev.value, quote: null, by: ev.by, at: ev.at }; delete st.cleared[ev.key]; entry.effects.push(`${ev.by}: ${label} = ${fmt(ev.value)}.`); }
        break;
      }
      case "plan_issued":
        if (st.plans[ev.version]) { entry.effects.push(`Plan version ${ev.version} already exists; plan versions are immutable. Issue a new version instead.`); entry.refused = true; break; }
        st.plans[ev.version] = { version: ev.version, summary: ev.summary, at: ev.at, snapshot: snapshotOf(st) };
        entry.effects.push(`Plan version ${ev.version} sent to the customer, written for ${st.service}, ZIP ${st.zip}.`);
        break;
      case "plan_approved":
        if (!st.plans[ev.version]) { entry.effects.push(`Approval for plan version ${ev.version}, which was never issued: not recorded.`); entry.refused = true; break; }
        st.approvals[ev.version] = { ...ev };
        { const d = snapshotDiff(st.plans[ev.version].snapshot, snapshotOf(st)); if (d.length) st.voided[ev.version] = { diff: d, when: "before" }; }
        entry.effects.push(`${ev.by} approved plan version ${ev.version} in writing (${ev.channel}).`);
        break;
      case "destination_changed": {
        st.zip = ev.zip; st.city = ev.city || st.city; st.geo = ctx.zips[ev.zip] || st.geo;
        for (const k of LOCATION_FACTS) delete st.facts[k];
        st.earlierMessages.push(...st.messages);
        st.messages = [];
        if (st.released) st.changedAfterRelease = "the delivery address";
        entry.effects.push(`Delivery address changed to ZIP ${ev.zip}. Room, stairs, door and photos on file described the old address and were set aside.`);
        break;
      }
      case "service_changed":
        if (st.released && ev.service !== st.service) st.changedAfterRelease = "the service";
        st.service = ev.service; entry.effects.push(`Service changed to ${ev.service}.`); break;
      case "release_requested": {
        const r = evaluate(st);
        if (st.released) { entry.effects.push("Already released; nothing to do."); break; }
        if (r.verdict !== "PASS") { entry.effects.push(`Release refused: ${r.label}.`); entry.refused = true; break; }
        const req = buildReleaseHold({ fulfillmentOrderId: `gid://shopify/FulfillmentOrder/demo-${order.id}`, holdIds: OWNED_HOLDS, ownedHoldIds: OWNED_HOLDS });
        st.released = true;
        entry.release = req;
        entry.effects.push(`${ev.by} released the order, naming the ${req.variables.holdIds.length} holds this workflow owns.`);
        break;
      }
      case "carrier_update": {
        if (!st.released) { st.carrierIssue = `Carrier reported "${fmt(ev.status)}" at ${ev.location} for an order that was never released. Nothing advanced.`; entry.effects.push(st.carrierIssue); break; }
        const where = ev.location;
        if (ev.status === "exception") { st.freight = "exception"; st.carrierIssue = `Carrier exception${ev.label ? `: ${ev.label}` : ""}. Nothing advanced.`; entry.effects.push(st.carrierIssue); break; }
        if (ev.status !== "delivered") { st.freight = "in transit"; entry.effects.push(`Carrier: ${fmt(ev.status)}${where ? ` (${where})` : ""}. In transit; nothing completed.`); break; }
        if (where === "customer") { st.freight = "delivered"; st.customerDelivery = "delivered"; entry.effects.push("Carrier confirms delivery to the customer's address."); }
        else { st.freight = where === "installer" ? "at installer" : "at terminal"; entry.effects.push(`${ev.label || `Delivered to the ${where}`}. Freight leg done; customer delivery and installation still open.`); }
        break;
      }
      case "installation_complete": st.installation = "installed"; st.customerDelivery = "delivered"; entry.effects.push(`${ev.by} confirms installation at the customer's address.`); break;
    }
    // Plans are written for a snapshot of the order. Once an approved plan stops matching, its approval is void for good.
    for (const v of Object.keys(st.approvals)) {
      if (st.voided[v]) continue;
      const d = snapshotDiff(st.plans[v].snapshot, snapshotOf(st));
      if (d.length) st.voided[v] = { diff: d, when: "after" };
    }
    result = evaluate(st);
    {
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
