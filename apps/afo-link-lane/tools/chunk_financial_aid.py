#!/usr/bin/env python3
import argparse
import bisect
import hashlib
import json
import re
from pathlib import Path

from tokenizers import Tokenizer

TOKENIZER_MODEL = "BAAI/bge-base-en-v1.5"
CHUNKER_VERSION = "pdf-page-v1"
TARGET_TOKENS = 320
SOFT_CAP_TOKENS = 384
HARD_CAP_TOKENS = 448
OVERLAP_TOKENS = 48
MAX_PAGES_PER_CHUNK = 2

CONFIG = {
    "chunker_version": CHUNKER_VERSION,
    "tokenizer_model": TOKENIZER_MODEL,
    "target_tokens": TARGET_TOKENS,
    "soft_cap_tokens": SOFT_CAP_TOKENS,
    "hard_cap_tokens": HARD_CAP_TOKENS,
    "overlap_tokens": OVERLAP_TOKENS,
    "max_pages_per_chunk": MAX_PAGES_PER_CHUNK,
    "page_separator": "form-feed",
    "embedding_pooling": "cls",
}


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def page_spans(text: str):
    start = 0
    page_number = 1
    for match in re.finditer("\f", text):
        yield page_number, start, match.start(), text[start:match.start()]
        start = match.end()
        page_number += 1
    if start < len(text) or page_number == 1:
        yield page_number, start, len(text), text[start:]


def heading_candidates(page_text: str):
    candidates = []
    cursor = 0
    for raw_line in page_text.splitlines(keepends=True):
        line = raw_line.strip()
        if line:
            letters = [c for c in line if c.isalpha()]
            upper_ratio = (
                sum(1 for c in letters if c.isupper()) / len(letters)
                if letters
                else 0.0
            )
            heading_like = (
                len(line) <= 100
                and (
                    line.endswith(":")
                    or upper_ratio >= 0.72
                    or bool(re.match(r"^(step|part|section|chapter)\b", line, re.I))
                )
            )
            if heading_like:
                candidates.append((cursor, line[:160]))
        cursor += len(raw_line)
    return candidates


def nearest_heading(candidates, local_char_start):
    chosen = None
    for pos, title in candidates:
        if pos > local_char_start:
            break
        chosen = title
    return chosen


def trim_offsets(text: str, start: int, end: int):
    while start < end and text[start].isspace():
        start += 1
    while end > start and text[end - 1].isspace():
        end -= 1
    return start, end


def paragraph_token_boundaries(page_text: str, offsets):
    token_starts = [start for start, _ in offsets]
    boundaries = set()
    for match in re.finditer(r"\n[ \t]*\n+", page_text):
        boundaries.add(bisect.bisect_left(token_starts, match.end()))
    return sorted(i for i in boundaries if 0 < i < len(offsets))


def token_count(tokenizer: Tokenizer, text: str) -> int:
    return len(tokenizer.encode(text, add_special_tokens=True).ids)


def build_chunks(text: str, resource_id: str, tokenizer: Tokenizer):
    chunks = []
    for page_number, page_abs_start, _, page_text in page_spans(text):
        if not page_text.strip():
            continue

        encoding = tokenizer.encode(page_text, add_special_tokens=False)
        offsets = encoding.offsets
        if not offsets:
            continue

        boundaries = paragraph_token_boundaries(page_text, offsets)
        headings = heading_candidates(page_text)
        start_token = 0

        while start_token < len(offsets):
            target_end = min(len(offsets), start_token + TARGET_TOKENS)
            soft_end = min(len(offsets), start_token + SOFT_CAP_TOKENS)
            candidates = [b for b in boundaries if target_end <= b <= soft_end]
            end_token = candidates[-1] if candidates else target_end
            if end_token <= start_token:
                end_token = min(len(offsets), start_token + 1)

            local_start = offsets[start_token][0]
            local_end = offsets[end_token - 1][1]
            local_start, local_end = trim_offsets(page_text, local_start, local_end)
            if local_start >= local_end:
                start_token = end_token
                continue

            chunk_index = len(chunks)
            citation_header = (
                f"Resource: {resource_id}\n"
                f"Pages: {page_number}\n"
                f"Chunk: {chunk_index}"
            )
            body = page_text[local_start:local_end]

            while (
                token_count(tokenizer, citation_header + "\n\n" + body)
                > HARD_CAP_TOKENS
                and end_token > start_token + 1
            ):
                end_token -= 8
                local_end = offsets[end_token - 1][1]
                local_start, local_end = trim_offsets(page_text, local_start, local_end)
                body = page_text[local_start:local_end]

            if not body.strip():
                start_token = max(end_token, start_token + 1)
                continue

            total_tokens = token_count(
                tokenizer, citation_header + "\n\n" + body
            )
            if total_tokens > HARD_CAP_TOKENS:
                raise RuntimeError(
                    f"Unable to fit page {page_number} chunk {chunk_index} "
                    f"within {HARD_CAP_TOKENS} tokens"
                )

            absolute_start = page_abs_start + local_start
            absolute_end = page_abs_start + local_end
            chunk_hash = sha256_text(body)
            chunks.append(
                {
                    "chunk_index": chunk_index,
                    "section_title": nearest_heading(headings, local_start),
                    "page_start": page_number,
                    "page_end": page_number,
                    "char_start": absolute_start,
                    "char_end": absolute_end,
                    "token_count": total_tokens,
                    "chunk_sha256": chunk_hash,
                    "citation_header": citation_header,
                    "text": body,
                }
            )

            if end_token >= len(offsets):
                break
            next_start = max(start_token + 1, end_token - OVERLAP_TOKENS)
            start_token = next_start

    return chunks


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--resource-id", required=True)
    parser.add_argument("--source-sha256", required=True)
    parser.add_argument("--text-sha256", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    source_sha = args.source_sha256.lower()
    text_sha = args.text_sha256.lower()
    if not re.fullmatch(r"[a-f0-9]{64}", source_sha):
        raise SystemExit("source SHA-256 must be 64 lowercase hex characters")
    if not re.fullmatch(r"[a-f0-9]{64}", text_sha):
        raise SystemExit("text SHA-256 must be 64 lowercase hex characters")

    input_path = Path(args.input)
    raw_bytes = input_path.read_bytes()
    actual_text_sha = hashlib.sha256(raw_bytes).hexdigest()
    if actual_text_sha != text_sha:
        raise SystemExit(
            f"text SHA-256 mismatch: expected {text_sha}, got {actual_text_sha}"
        )

    text = raw_bytes.decode("utf-8")
    tokenizer = Tokenizer.from_pretrained(TOKENIZER_MODEL)
    chunks = build_chunks(text, args.resource_id, tokenizer)
    if not chunks:
        raise SystemExit("chunker produced no chunks")

    config_sha = hashlib.sha256(
        canonical_json(CONFIG).encode("utf-8")
    ).hexdigest()
    payload = {
        "schema_version": 1,
        "resource_id": args.resource_id,
        "source_sha256": source_sha,
        "extracted_text_sha256": text_sha,
        "chunker_version": CHUNKER_VERSION,
        "chunk_config_sha256": config_sha,
        "tokenizer_model": TOKENIZER_MODEL,
        "embedding_pooling": "cls",
        "chunks": chunks,
    }
    Path(args.output).write_text(
        json.dumps(payload, ensure_ascii=False),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "ok": True,
                "resource_id": args.resource_id,
                "chunk_count": len(chunks),
                "chunk_config_sha256": config_sha,
                "max_token_count": max(c["token_count"] for c in chunks),
            }
        )
    )


if __name__ == "__main__":
    main()
