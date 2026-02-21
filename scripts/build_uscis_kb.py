#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parent.parent
SOURCES_PATH = ROOT / "app" / "data" / "source_map.json"
OUTPUT_PATH = ROOT / "data" / "knowledge_chunks.json"
RAW_OUTPUT_PATH = ROOT / "data" / "knowledge_raw.json"

WHITESPACE_RE = re.compile(r"\s+")


def main() -> None:
    payload = json.loads(SOURCES_PATH.read_text())
    sources = payload.get("sources", [])

    raw_documents = []
    chunks = []

    for source in sources:
        source_id = source["id"]
        title = source["title"]
        url = source["url"]
        source_type = source.get("source_type", "external")
        flows = source.get("flows", [])

        print(f"Fetching {source_id}: {url}")
        text = fetch_page_text(url)
        if not text:
            print("  -> skipped (empty text)")
            continue

        fetched_at = datetime.now(timezone.utc).isoformat()
        raw_documents.append(
            {
                "source_id": source_id,
                "title": title,
                "url": url,
                "source_type": source_type,
                "flows": flows,
                "fetched_at": fetched_at,
                "text": text,
            }
        )

        for idx, chunk_text in enumerate(chunk_text_by_size(text, size=960, overlap=140)):
            chunks.append(
                {
                    "chunk_id": f"{source_id}-{idx}",
                    "source_id": source_id,
                    "title": title,
                    "url": url,
                    "source_type": source_type,
                    "flows": flows,
                    "text": chunk_text,
                }
            )

    raw_payload = {"documents": raw_documents}
    chunk_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_count": len(raw_documents),
        "chunk_count": len(chunks),
        "chunks": chunks,
    }

    RAW_OUTPUT_PATH.write_text(json.dumps(raw_payload, indent=2))
    OUTPUT_PATH.write_text(json.dumps(chunk_payload, indent=2))

    print(f"Wrote {len(raw_documents)} documents to {RAW_OUTPUT_PATH}")
    print(f"Wrote {len(chunks)} chunks to {OUTPUT_PATH}")


def fetch_page_text(url: str) -> str:
    headers = {
        "User-Agent": (
            "VisaFlowHackathonBot/0.2 (+local demo prototype) "
            "for educational ingestion"
        )
    }

    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
    except requests.RequestException as exc:
        print(f"  -> request failed: {exc}")
        return ""

    content_type = response.headers.get("content-type", "")
    if "pdf" in content_type.lower() or url.lower().endswith(".pdf"):
        print("  -> PDF source skipped in this MVP (HTML ingestion only)")
        return ""

    soup = BeautifulSoup(response.text, "html.parser")

    content_root = (
        soup.find("main")
        or soup.find(id="main-content")
        or soup.find("article")
        or soup.body
    )

    if content_root is None:
        return ""

    for tag in content_root(["script", "style", "noscript", "svg", "img", "footer", "nav"]):
        tag.decompose()

    text = content_root.get_text(" ", strip=True)
    text = WHITESPACE_RE.sub(" ", text).strip()
    return text[:26000]


def chunk_text_by_size(text: str, size: int = 960, overlap: int = 140) -> list[str]:
    if len(text) <= size:
        return [text]

    chunks = []
    start = 0
    while start < len(text):
        end = min(len(text), start + size)
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start = max(0, end - overlap)
    return chunks


if __name__ == "__main__":
    main()
