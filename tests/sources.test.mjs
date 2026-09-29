// Every rule quote is word for word on the page it cites; catalog values are bound to the main product.
import test from "node:test";
import assert from "node:assert/strict";
import { Q, SOURCES } from "../src/rules.js";
import { catalog, text, manufacturer } from "./helpers.mjs";

test("each quoted rule is on its source page", () => {
  for (const [name, q] of Object.entries(Q)) {
    if (q.src === "product") {
      for (const p of catalog.products) assert.ok(text(`data/pages_text/${p.handle}.txt`).includes(q.text), `${name} missing on ${p.handle}`);
    } else {
      assert.ok(text(`data/pages_text/${SOURCES[q.src].file}`).includes(q.text), `${name} missing on ${q.src}`);
    }
  }
});

test("each order service is one the product page offers, with its price", () => {
  for (const p of catalog.products) {
    assert.ok(p.delivery_options.length >= 2, p.handle);
    for (const o of p.delivery_options) assert.ok(text(`data/pages_text/${p.handle}.txt`).includes(o.name.replace(/&amp;/g, "&")), `${o.name} on ${p.handle}`);
  }
});

test("page weight comes from the main product, not an accessory listed on the same page", () => {
  const sdc = catalog.products.find((p) => p.handle.startsWith("body-solid-sdc2000g"));
  assert.equal(sdc.page_weight_lb, 824);
  const lines = text(`data/pages_text/${sdc.handle}.txt`).split("\n");
  const first = lines.find((l) => l.startsWith("Product Weight:"));
  assert.notEqual(first, "Product Weight: 824 lbs", "the first weight on the page belongs to an accessory; the parser must not take it");
  assert.deepEqual(sdc.configuration_options["weight-stack"].map((o) => o.name), ["(2) 160 lb Weight Stack", "(2) 235 lb Weight Stack (SP15)"]);
  assert.equal(manufacturer[sdc.handle].weights[0].assembled_lb, 674);
});

test("processing time is read per product", () => {
  const scifit = catalog.products.find((p) => p.handle.startsWith("scifit-tc-1000"));
  assert.equal(scifit.processing_time, "Ships from our Warehouse in 2-4 Weeks + Transit Time");
});
