"""
Compile researched broadcast-rights files into src/data/broadcasters.json.

    python scripts/broadcasters/build.py            # resolve new logos, reuse cache
    python scripts/broadcasters/build.py --refresh  # re-resolve every logo

Sources: scripts/broadcasters/sources/<league>.json (one file per competition,
each listing verified broadcasters per ISO country with official URLs and the
evidence used). Logos are resolved per brand domain (apple-touch-icon / large
icon from the official site, YouTube channel avatar for YouTube channels, or
Google's favicon service as a fallback) and validated as real images >= 64 px.
"""

import io
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "scripts" / "broadcasters" / "sources"
CACHE = ROOT / "scripts" / "broadcasters" / "logos.json"
OUT = ROOT / "src" / "data" / "broadcasters.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"

# Consistent display names for brands that sources spell differently.
ALIASES = {
    "amazon prime video": "Prime Video",
    "begin": "BEGIN",
    "fox one": "FOX One",
    "magentatv": "Magenta TV",
    "monomax": "MONOMAX",
    "nova sports": "Novasports",
    "migu video": "Migu",
    "tv360 (viettel)": "TV360",
    "canal+": "CANAL+",
    "spotv": "SPOTV NOW",
    "sky sport austria": "Sky Austria",
}


AMBIGUOUS = {"sctv"}


def canon(name: str) -> str:
    n = name.strip()
    return ALIASES.get(n.lower(), n)


def slug(s: str) -> str:
    s = s.lower().replace("+", " plus ")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def fetch(url: str, timeout: float = 12.0) -> tuple[int, str, bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*", "Accept-Language": "en"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.headers.get("Content-Type", ""), r.read(3_000_000)
    except Exception:
        return 0, "", b""


def image_size(data: bytes, ctype: str) -> int:
    if "svg" in ctype or data[:200].lstrip().startswith(b"<svg") or b"<svg" in data[:400]:
        return 512
    if Image is None or not data:
        return 0
    try:
        im = Image.open(io.BytesIO(data))
        return min(im.size)
    except Exception:
        return 0


def valid(url: str) -> int:
    status, ctype, data = fetch(url)
    if status != 200 or not data:
        return 0
    if not ("image" in ctype or data[:4] in (b"\x89PNG", b"GIF8") or data[:3] == b"\xff\xd8\xff" or b"<svg" in data[:400]):
        return 0
    return image_size(data, ctype)


LINK_RE = re.compile(r"<link\b[^>]*>", re.I)


def icon_candidates(page_url: str, html: str) -> list[tuple[int, str]]:
    out = []
    for tag in LINK_RE.findall(html):
        rel = re.search(r'rel=["\']([^"\']+)["\']', tag, re.I)
        href = re.search(r'href=["\']([^"\']+)["\']', tag, re.I)
        if not rel or not href:
            continue
        r = rel.group(1).lower()
        if "icon" not in r:
            continue
        sizes = re.search(r'sizes=["\'](\d+)x(\d+)["\']', tag, re.I)
        size = int(sizes.group(1)) if sizes else (180 if "apple-touch" in r else 32)
        if href.group(1).lower().endswith(".svg") or "svg" in tag.lower():
            size = max(size, 256)
        out.append((size, urllib.parse.urljoin(page_url, href.group(1).replace("&amp;", "&"))))
    return sorted(out, reverse=True)


def youtube_avatar(url: str) -> str | None:
    status, _, data = fetch(url)
    if status != 200:
        return None
    html = data.decode("utf-8", "ignore")
    m = re.search(r'<meta property="og:image" content="([^"]+)"', html)
    return m.group(1) if m else None


WIKI_TITLES = {
    "beIN SPORTS": "BeIN Sports",
    "TSN": "The Sports Network",
    "RDS": "Réseau des sports",
    "USA Network": "USA Network",
    "Sport TV": "Sport TV (Portugal)",
    "SPOTV NOW": "Spotv",
    "STARZPLAY": "Starzplay",
    "Coupang Play": "Coupang Play",
    "Migu": "Migu (company)",
    "StarHub": "StarHub",
    "Vidio": "Vidio",
    "FPT Play": "FPT Play",
    "DSports": "DirecTV Sports",
    "FanCode": "FanCode",
    "VTVcab": "VTVcab",
    "RCTI": "RCTI",
    "MNC Vision": "MNC Vision",
    "AIS PLAY": "Advanced Info Service",
    "Azam TV": "Azam TV",
    "Sony Sports Network": "Sony Sports Network",
    "Dubai Sports": "Dubai Sports",
    "ServusTV": "ServusTV",
    "ANT1": "ANT1",
    "Toffee": "Toffee (streaming service)",
    "FOX One": "Fox One",
    "Play Sports": "Play Sports",
    "Sky Sport Now": "Sky Sport (New Zealand)",
    "Unite8 Sports": "Unite8 Sports",
}


def _tokens(name: str) -> list[str]:
    stop = {"tv", "the", "sports", "sport", "network", "play", "plus"}
    toks = [t for t in re.split(r"[^a-z0-9]+", name.lower().replace("+", "plus")) if t]
    core = [t for t in toks if t not in stop]
    return core or toks


def _file_matches(name: str, file_title: str) -> bool:
    ft = re.sub(r"[^a-z0-9]+", "", file_title.lower())
    return all(t in ft for t in _tokens(name)) and ("logo" in ft or "wordmark" in ft)


def _thumb(file_title: str) -> str | None:
    qs = urllib.parse.urlencode({
        "action": "query", "format": "json", "titles": file_title,
        "prop": "imageinfo", "iiprop": "url", "iiurlwidth": 400,
    })
    for host in ("commons.wikimedia.org", "en.wikipedia.org"):
        status, _, data = fetch(f"https://{host}/w/api.php?{qs}")
        if status != 200:
            continue
        try:
            pages = json.loads(data).get("query", {}).get("pages", {})
        except Exception:
            continue
        for p in pages.values():
            info = (p.get("imageinfo") or [{}])[0]
            url = info.get("thumburl") or info.get("url")
            if url and valid(url) >= 64:
                return url
    return None


def wikipedia_logo(name: str) -> str | None:
    """Brand logo from Wikipedia/Commons — only files whose name contains the brand and 'logo'."""
    title = WIKI_TITLES.get(name, name)
    # 1) the lead image of the brand's Wikipedia article, if it is a logo file
    for t in (title, name):
        qs = urllib.parse.urlencode({"action": "query", "format": "json", "redirects": 1, "titles": t, "prop": "pageimages", "piprop": "name"})
        status, _, data = fetch(f"https://en.wikipedia.org/w/api.php?{qs}")
        if status == 200:
            try:
                for p in json.loads(data).get("query", {}).get("pages", {}).values():
                    img = p.get("pageimage")
                    if img and _file_matches(name, img):
                        url = _thumb("File:" + img)
                        if url:
                            return url
            except Exception:
                pass
    # 2) Commons file search
    qs = urllib.parse.urlencode({"action": "query", "format": "json", "list": "search", "srnamespace": 6, "srsearch": f"{name} logo", "srlimit": 8})
    status, _, data = fetch(f"https://commons.wikimedia.org/w/api.php?{qs}")
    if status == 200:
        try:
            for hit in json.loads(data).get("query", {}).get("search", []):
                if _file_matches(name, hit["title"]):
                    url = _thumb(hit["title"])
                    if url:
                        return url
        except Exception:
            pass
    return None


def resolve_logo(domain: str, sample_url: str, name: str = "") -> str | None:
    if domain == "youtube.com":
        avatar = youtube_avatar(sample_url)
        if avatar and valid(avatar) >= 64:
            return avatar
        return None
    best: tuple[int, str] | None = None
    for page in (f"https://www.{domain}/", f"https://{domain}/", sample_url):
        status, _, data = fetch(page)
        if status != 200 or not data:
            continue
        for size_hint, cand in icon_candidates(page, data.decode("utf-8", "ignore"))[:5]:
            px = valid(cand)
            if px >= 64 and (best is None or px > best[0]):
                best = (px, cand)
            if best and best[0] >= 180:
                break
        if best:
            break
    if best:
        return best[1]
    g = f"https://www.google.com/s2/favicons?domain={domain}&sz=256"
    if valid(g) >= 64:
        return g
    w = wikipedia_logo(name) if name and slug(name) not in AMBIGUOUS else None
    if w:
        return w
    # Last resort: a smaller but genuine site icon.
    for cand in (g, f"https://icons.duckduckgo.com/ip3/{domain}.ico"):
        if valid(cand) >= 48:
            return cand
    return None


def main() -> None:
    refresh = "--refresh" in sys.argv
    cache: dict[str, str | None] = {} if refresh or not CACHE.exists() else json.loads(CACHE.read_text("utf-8"))

    channels: dict[str, dict] = {}
    leagues: dict[str, dict] = {}
    tried: set[str] = set()
    seasons: dict[str, str] = {}
    sample: dict[str, str] = {}

    for f in sorted(SRC.glob("*.json")):
        d = json.loads(f.read_text("utf-8"))
        for league in d["leagues"]:
            seasons[league] = d.get("season", "")
            per = leagues.setdefault(league, {})
            for cc, lst in d["countries"].items():
                rows = []
                for b in lst:
                    name = canon(b["name"])
                    domain = b.get("domain", "").strip().lower().removeprefix("www.")
                    # YouTube channels are distinct brands sharing one domain.
                    key = slug(name) if domain != "youtube.com" else "yt-" + slug(name)
                    # Different companies that share a brand name (e.g. SCTV Indonesia vs SCTV Vietnam).
                    if slug(name) in AMBIGUOUS:
                        key = f"{slug(name)}-{domain.rsplit('.', 1)[-1]}"
                    ch = channels.setdefault(key, {"name": name, "domain": domain, "logo": None, "_domains": {}})
                    ch["_domains"][domain] = ch["_domains"].get(domain, 0) + 1
                    if domain == "youtube.com":
                        sample.setdefault(key, b["url"])
                    else:
                        sample.setdefault(domain, b["url"])
                    if not any(r["c"] == key for r in rows):
                        rows.append({"c": key, "url": b["url"], "type": b["type"], "note": b.get("note", "")})
                per[cc.upper()] = rows

    # Resolve logos: per channel, try its domains (most used first); cache per domain.
    for key, ch in channels.items():
        counts = ch.pop("_domains")
        domains = sorted(counts, key=lambda d: -counts[d])
        ch["domain"] = domains[0]
        logo = None
        for dm in domains:
            ck = key if dm == "youtube.com" else dm
            if cache.get(ck) is None and ck not in tried:
                tried.add(ck)
                url = sample.get(ck) or f"https://{dm}/"
                cache[ck] = resolve_logo(dm, url, ch["name"])
                print(f"logo {ck:28s} -> {cache[ck]}", flush=True)
            logo = logo or cache.get(ck)
        if not logo and key.split("-")[0] not in AMBIGUOUS and cache.get("brand:" + key) is None:
            cache["brand:" + key] = wikipedia_logo(ch["name"])
            print(f"brand {key:27s} -> {cache['brand:' + key]}", flush=True)
        ch["logo"] = logo or cache.get("brand:" + key)

    CACHE.write_text(json.dumps(cache, indent=2, sort_keys=True, ensure_ascii=False) + "\n", "utf-8")
    from datetime import date

    out = {
        "updated": date.today().isoformat(),
        "seasons": seasons,
        "channels": dict(sorted(channels.items())),
        "leagues": leagues,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", "utf-8")
    missing = [c["name"] for c in channels.values() if not c["logo"]]
    print(f"\nchannels={len(channels)} leagues={len(leagues)} missing logos={len(missing)}: {missing}")


if __name__ == "__main__":
    main()
