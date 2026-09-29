// Builds site/dist/fitness-delivery-check/ : the page, the same engine the tests run, and the frozen data.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "site", "dist", "fitness-delivery-check");
fs.rmSync(path.join(root, "site", "dist"), { recursive: true, force: true });
fs.mkdirSync(path.join(out, "data"), { recursive: true });
const copy = (from, to) => fs.copyFileSync(path.join(root, from), path.join(out, to));
for (const f of ["index.html", "style.css", "app.js", "favicon.svg", "favicon.png", "apple-touch-icon.png"]) copy(`site/${f}`, f);
copy("src/rules.js", "rules.js");
copy("src/sha256.js", "sha256.js");
copy("src/walk.js", "walk.js");
for (const f of ["catalog.json", "scenarios.json", "extractions.json", "zips.json", "manufacturer.json"]) copy(`data/${f}`, `data/${f}`);
const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
if (html.includes("\u2014")) throw new Error("em dash in the page");
fs.writeFileSync(path.join(root, "site", "dist", "_headers"), "/*\n  X-Robots-Tag: noindex, nofollow\n");
console.log("built", out);
