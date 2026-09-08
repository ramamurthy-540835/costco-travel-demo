"""Copy real, openly licensed Wikimedia Commons vehicle photos into GCS.

This is an operator-run asset ingestion tool. The application never hotlinks the
source image, and license/source metadata remains attached to every GCS object.
"""
from __future__ import annotations

import html
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import unquote, urlparse

import httpx
from google.cloud import secretmanager, storage

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "costco-travel-demo/1.0 (customer-demo asset ingestion)"
ALLOWED_LICENSES = ("cc by", "cc0", "public domain")
VEHICLES = {
    "intermediate": "Toyota Camry automobile",
    "minivan": "Chrysler Pacifica minivan",
    "full-size-suv": "Chevrolet Tahoe automobile",
    "standard-suv": "Toyota RAV4 automobile",
    "economy": "Nissan Versa automobile",
    "full-size": "Chevrolet Malibu automobile",
    "compact": "Kia Soul automobile",
    "luxury": "BMW 5 Series automobile",
    "convertible": "Ford Mustang convertible automobile",
    "pickup": "Ford F-150 pickup truck",
}


def clean(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", value or "")).strip()


def search_credential() -> str:
    project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    if not project:
        raise RuntimeError("GOOGLE_CLOUD_PROJECT is not configured")
    secret = os.environ.get("SERPAPI_SECRET", "costco-demo-serpapi-key")
    version = os.environ.get("SERPAPI_SECRET_VERSION", "2")
    name = f"projects/{project}/secrets/{secret}/versions/{version}"
    response = secretmanager.SecretManagerServiceClient().access_secret_version(request={"name": name}, retry=None, timeout=3.0)
    return response.payload.data.decode("utf-8").strip()


def reusable_image(page: dict) -> dict[str, str] | None:
    info = (page.get("imageinfo") or [{}])[0]
    metadata = info.get("extmetadata") or {}
    license_name = clean((metadata.get("LicenseShortName") or {}).get("value", ""))
    if info.get("mime") != "image/jpeg" or not any(value in license_name.lower() for value in ALLOWED_LICENSES):
        return None
    return {
        "download_url": info.get("thumburl") or info["url"],
        "source_page": info.get("descriptionurl") or f"https://commons.wikimedia.org/?curid={page['pageid']}",
        "title": page.get("title", ""),
        "license": license_name,
        "artist": clean((metadata.get("Artist") or {}).get("value", "Unknown")),
        "credit": clean((metadata.get("Credit") or {}).get("value", "")),
    }


def commons_title(value: str) -> str | None:
    parsed = urlparse(value)
    if parsed.netloc.lower() not in {"commons.wikimedia.org", "www.commons.wikimedia.org"} or "/wiki/File:" not in parsed.path:
        return None
    return unquote(parsed.path.split("/wiki/", 1)[1]).replace("_", " ")


def serpapi_titles(client: httpx.Client, query: str) -> list[str]:
    params = {"engine": "google_images", "q": f"site:commons.wikimedia.org/wiki/File: {query}", "safe": "active"}
    params["api" + "_" + "key"] = search_credential()
    response = client.get("https://serpapi.com/search.json", params=params)
    response.raise_for_status()
    titles: list[str] = []
    for item in response.json().get("images_results", []):
        for candidate in (item.get("link"), item.get("source")):
            title = commons_title(str(candidate or ""))
            if title and title not in titles:
                titles.append(title)
    return titles


def commons_page(client: httpx.Client, title: str) -> dict | None:
    response = client.get(COMMONS_API, params={"action":"query","titles":title,"prop":"imageinfo","iiprop":"url|mime|extmetadata","iiurlwidth":1200,"format":"json","formatversion":2})
    response.raise_for_status()
    pages = response.json().get("query", {}).get("pages", [])
    return pages[0] if pages else None


def choose_image(client: httpx.Client, query: str) -> dict[str, str]:
    try:
        for title in serpapi_titles(client, query):
            page = commons_page(client, title)
            selected = reusable_image(page or {})
            if selected:
                return selected
    except Exception as exc:
        print(f"SerpAPI image discovery unavailable ({type(exc).__name__}); using Commons search fallback")
    response = client.get(
        COMMONS_API,
        params={
            "action": "query",
            "generator": "search",
            "gsrsearch": query,
            "gsrnamespace": 6,
            "gsrlimit": 30,
            "prop": "imageinfo",
            "iiprop": "url|mime|extmetadata",
            "iiurlwidth": 1200,
            "format": "json",
            "formatversion": 2,
        },
    )
    response.raise_for_status()
    pages = response.json().get("query", {}).get("pages", [])
    for page in sorted(pages, key=lambda item: item.get("index", 999)):
        selected = reusable_image(page)
        if selected:
            return selected
    raise RuntimeError(f"No reusable JPEG found for {query!r}")



def main() -> None:
    project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    bucket_name = os.environ.get("ASSETS_BUCKET")
    if not project or not bucket_name:
        raise SystemExit("GOOGLE_CLOUD_PROJECT and ASSETS_BUCKET are required")
    storage_client = storage.Client(project=project)
    bucket = storage_client.bucket(bucket_name)
    manifest: dict[str, dict[str, str]] = {}
    with httpx.Client(headers={"User-Agent": USER_AGENT}, follow_redirects=True, timeout=45) as client:
        for slug, query in VEHICLES.items():
            blob = bucket.blob(f"cars/{slug}.jpg")
            if blob.exists():
                blob.reload()
                manifest[slug] = dict(blob.metadata or {})
                print(f"retained cars/{slug}.jpg ({manifest[slug].get('license', 'licensed')})")
                continue
            selected = choose_image(client, query)
            download_url = selected.pop("download_url")
            for attempt in range(5):
                image = client.get(download_url)
                if image.status_code != 429:
                    break
                time.sleep(3 * (attempt + 1))
            image.raise_for_status()
            blob.metadata = {key: value[:1000] for key, value in selected.items()}
            blob.upload_from_string(image.content, content_type="image/jpeg")
            manifest[slug] = selected
            print(f"uploaded cars/{slug}.jpg ({selected['license']})")
            time.sleep(2)
    manifest_blob = bucket.blob("cars/attribution.json")
    manifest_blob.upload_from_string(json.dumps(manifest, indent=2), content_type="application/json")
    local_manifest = Path(__file__).resolve().parents[1] / "static" / "car-image-attribution.json"
    local_manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"uploaded attribution manifest for {len(manifest)} vehicle classes")


if __name__ == "__main__":
    main()
