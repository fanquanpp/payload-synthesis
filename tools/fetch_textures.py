import json, os, io, re, sys, time, zipfile, urllib.request, urllib.parse
from PIL import Image

OUT = r"C:/Atian/Project/Threejs-games/synthetic-accumulation/assets/tex"
os.makedirs(OUT, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

# level -> ambientCG assetId
PICKS = [
    ("lv01", "Onyx006"),
    ("lv02", "Metal061B"),
    ("lv03", "Concrete031"),
    ("lv04", "Metal048A"),
    ("lv05", "Plastic013A"),
    ("lv06", "Tiles141"),
    ("lv07", "Metal063"),
    ("lv08", "Fabric085"),
    ("lv09", "Rock063"),
    ("lv10", "Lava004"),
    ("lv11", "Snow014"),
]

def get(url, timeout=180):
    last = None
    for attempt in range(5):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()
        except Exception as e:          # transient resets / incomplete reads
            last = e
            print("   retry %d (%s)" % (attempt + 1, type(e).__name__), flush=True)
            time.sleep(1.5 * (attempt + 1))
    raise SystemExit("download failed: %s" % last)

def api(asset):
    u = ("https://ambientcg.com/api/v2/full_json?type=Material&id=%s&include=downloadData"
         % urllib.parse.quote(asset))
    d = json.loads(get(u, 60).decode("utf-8"))
    for a in d.get("foundAssets", []):
        if a["assetId"].lower() == asset.lower():
            return a
    raise SystemExit("not found: " + asset)

for lv, asset in PICKS:
    dst = os.path.join(OUT, lv + ".jpg")
    if os.path.exists(dst):
        print("skip", lv); continue
    a = api(asset)
    cats = a["downloadFolders"]["default"]["downloadFiletypeCategories"]
    dl = None
    for key in ("zip",):
        for d in cats.get(key, {}).get("downloads", []):
            if d.get("attribute") == "1K-JPG":
                dl = d["downloadLink"]; break
    if not dl:
        raise SystemExit("no 1K-JPG for " + asset)
    print("downloading", lv, asset, "...", flush=True)
    blob = get(dl)
    z = zipfile.ZipFile(io.BytesIO(blob))
    color = None
    for n in z.namelist():
        if re.search(r"Color\.(jpg|png|jpeg)$", n, re.I):
            color = n; break
    if not color:
        print("  no color map in", z.namelist()[:12]); continue
    img = Image.open(io.BytesIO(z.read(color))).convert("RGB")
    img = img.resize((512, 512), Image.LANCZOS)
    img.save(dst, "JPEG", quality=86, optimize=True)
    print("  saved", lv, os.path.getsize(dst), "bytes")

print("DONE")
for f in sorted(os.listdir(OUT)):
    print(" ", f, os.path.getsize(os.path.join(OUT, f)))
