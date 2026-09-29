"""ZIP centroids for the demo orders, from the 2024 Census Gazetteer ZCTA file
(https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_zcta_national.zip)."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
want = {"94510", "80205"} | {o["zip"] for o in json.load(open(os.path.join(ROOT, "data", "scenarios.json")))["orders"]}
out = {}
for line in open(os.path.join(ROOT, "data", "raw", "2024_Gaz_zcta_national.txt")).readlines()[1:]:
    p = line.split()
    if p[0] in want:
        out[p[0]] = {"lat": float(p[5]), "lon": float(p[6])}
json.dump({"source": "US Census 2024 Gazetteer, ZCTA internal points", "zips": out}, open(os.path.join(ROOT, "data", "zips.json"), "w"), indent=1)
print(len(out), "of", len(want))
