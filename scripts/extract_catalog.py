"""Build data/catalog.json and data/pages_text/*.txt from pages read on 2026-09-29.

Inputs (data/raw, gitignored except the gz copies): product pages, /products.json pages,
/pages/shipping-information and /policies/shipping-policy. Every value in catalog.json
keeps the exact text it came from, so tests can check it against pages_text.
"""
import glob, gzip, html, json, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OUT_TXT = os.path.join(ROOT, "data", "pages_text")
BASE = "https://www.fitnesssuperstore.com"
READ_ON = "2026-09-29"

HANDLES = [
    "scifit-tc-1000-stair-stepper-remanufactured",
    "body-solid-sdc2000g-proclub-line-dual-cable-column-new",
    "octane-fitness-xr6000-seated-elliptical-w-smart-screen-remanufactured",
    "life-fitness-95t-achieve-treadmill-remanufactured",
    "french-fitness-ffb-black-5-stack-multi-jungle-gym-new",
    "matrix-indoor-rower-w-lcd-console-remanufactured",
    "precor-c846i-upright-exercise-bike-remanufactured",
    "french-fitness-mab30-multi-adjustable-bench-new",
    "body-solid-fid46-olympic-leverage-flat-incline-decline-bench-new",
    "woodway-4front-treadmill-w-quick-set-display-remanufactured",
    "schwinn-ac-sport-9-7340-wintp0-bike-new",
]


def read_raw(path):
    if os.path.exists(path):
        return open(path, encoding="utf-8").read()
    return gzip.open(path + ".gz", "rt", encoding="utf-8").read()


def to_lines(page_html):
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", page_html, flags=re.S)
    t = html.unescape(re.sub(r"<[^>]+>", "\n", t))
    return [re.sub(r"\s+", " ", l).strip() for l in t.split("\n") if l.strip()]


def after(lines, label):
    for i, l in enumerate(lines):
        if l == label and i + 1 < len(lines):
            return lines[i + 1]
    return None


def json_ld_product(page_html):
    for m in re.finditer(r"<script[^>]*ld\+json[^>]*>(.*?)</script>", page_html, flags=re.S):
        try:
            j = json.loads(m.group(1))
        except Exception:
            continue
        for it in (j.get("@graph", []) if isinstance(j, dict) else []):
            if it.get("@type") == "Product":
                return it
    return None


def delivery_options(page_html):
    start = page_html.find("Assembly &amp; Room of Choice Installation Needed?")
    if start < 0:
        start = page_html.find("Assembly & Room of Choice Installation Needed?")
    end = page_html.find('class="product-option__item"', start)
    block = page_html[start:end]
    opts = []
    for m in re.finditer(r"<input\s[^>]*type=\"radio\"[^>]*>", block, flags=re.S):
        s = m.group(0)
        fn = re.search(r'data-field-name="([^"]*)"', s)
        fp = re.search(r'data-field-price="\$([^"]*)"', s)
        if fn:
            opts.append({
                "name": html.unescape(fn.group(1)),
                "price": float(fp.group(1).replace(",", "")) if fp else 0.0,
                "default": " checked" in s or "checked\n" in s,
            })
    return opts


def configuration_options(page_html):
    """Configuration choices of the main product (e.g. weight stacks), from the selector block."""
    out = {}
    for m in re.finditer(r'data-type="([a-z-]+)"\s+data-option-accordion\s+data-default-option="(\d+)"', page_html):
        kind = m.group(1)
        if kind not in ("weight-stack",):
            continue
        end = page_html.find("data-option-accordion", m.end())
        block = page_html[m.start(): end if end > 0 else m.start() + 20000]
        opts = []
        for r in re.finditer(r"<input\s[^>]*type=\"radio\"[^>]*>", block, flags=re.S):
            s = r.group(0)
            fn = re.search(r'data-field-name="([^"]*)"', s)
            fp = re.search(r'data-field-price="\$([^"]*)"', s)
            if fn:
                opts.append({"name": html.unescape(fn.group(1)), "price": float(fp.group(1).replace(",", "")) if fp else 0.0})
        out[kind] = opts
    return out


def dims(value):
    m = re.search(r"([\d.]*) inch length x ([\d.]*) inch width x ([\d.]*) inch height", value or "")
    if not m:
        return None
    return {k: (float(v) if v else None) for k, v in zip(["length", "width", "height"], m.groups())}


def main():
    os.makedirs(OUT_TXT, exist_ok=True)
    catalog_json = []
    for f in sorted(glob.glob(os.path.join(RAW, "products_p*.json*"))):
        f = f[:-3] if f.endswith(".gz") else f
        catalog_json += json.loads(read_raw(f))["products"]
    by_handle = {p["handle"]: p for p in catalog_json}

    for name in ["shipping-information", "shipping-policy"]:
        lines = to_lines(read_raw(os.path.join(RAW, name + ".html")))
        open(os.path.join(OUT_TXT, name + ".txt"), "w").write("\n".join(lines))

    products = []
    for h in HANDLES:
        page = read_raw(os.path.join(RAW, "pages", h + ".html"))
        lines = to_lines(page)
        open(os.path.join(OUT_TXT, h + ".txt"), "w").write("\n".join(lines))
        sp = by_handle[h]
        v = sp["variants"][0]
        ld = json_ld_product(page) or {}
        meas = (ld.get("hasMeasurement") or {}).get("value")
        weight_line = next((l for l in lines if l.startswith("Product Weight:") and "lb" in l
                            and ld.get("weight") and l.split(":")[1].strip().startswith(str(ld.get("weight")).split(".")[0])), None)
        dims_line = next((l for l in lines if l.startswith("Dimensions:") and '" L x' in l), None)
        products.append({
            "handle": h,
            "url": f"{BASE}/products/{h}",
            "title": sp["title"],
            "price": float(v["price"]),
            "shopify_grams": v["grams"],
            "shopify_lb": round(v["grams"] / 453.59237, 1),
            "page_weight_lb": float(ld["weight"]) if ld.get("weight") else None,
            "page_weight_quote": weight_line,
            "dimensions_in": dims(meas),
            "dimensions_quote": meas,
            "dimensions_text": dims_line,
            "condition": after(lines, "Condition:"),
            "ships_as": after(lines, "Ships:"),
            "processing_time": after(lines, "Processing Time"),
            "delivery_options": delivery_options(page),
            "configuration_options": configuration_options(page),
            "read_on": READ_ON,
        })
    json.dump({"read_on": READ_ON, "source": BASE, "products": products},
              open(os.path.join(ROOT, "data", "catalog.json"), "w"), indent=2, ensure_ascii=False)
    for p in products:
        print(p["handle"][:40], p["shopify_lb"], p["page_weight_lb"], p["dimensions_in"], p["ships_as"], p["processing_time"], [(o["name"], o["price"]) for o in p["delivery_options"]])


if __name__ == "__main__":
    main()
