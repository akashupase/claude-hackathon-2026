#!/usr/bin/env python3
"""Build the citizen-trail / dispute-radar index for the team41 map.

Reads the synthetic BMC dataset and writes team41/public/data/trail_index.json:

  - geocodes complaints with a blank ward_code against localities.csv
    (names + aliases, including Devanagari)
  - deduplicates complaints on ward + locality + category within 48 hours
  - links complaints to work orders via linked_complaint_ids
  - runs a "dispute radar": flags work orders whose fix is marked SLA-met /
    completed, yet a WhatsApp/X post mentioning the locality appears after
    completion complaining about potholes / waterlogging / flooding
  - emits a compact searchable index (~500 representative complaints across
    en / hi-en / mr / hi + every disputed-resolution match + road gazetteer)

Everything is synthetic — this is an audit-simulation demo, not real BMC data.

Usage:
  python scripts/build_trail_data.py [--data-dir DIR] [--out-dir DIR]
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TEAM41_DIR = os.path.dirname(SCRIPT_DIR)
HACKATHON_DIR = os.path.dirname(TEAM41_DIR)
REPO_ROOT = os.path.dirname(os.path.dirname(HACKATHON_DIR))

DEFAULT_DATA_DIRS = [
    os.path.join(REPO_ROOT, "Claude-Impact-Labs-data-2", "data"),
    os.path.join(HACKATHON_DIR, "data"),
]
DEFAULT_OUT_DIR = os.path.join(TEAM41_DIR, "public", "data")

GENERATED_AT = datetime.now().strftime("%Y-%m-%d %H:%M")

SYNTHETIC_NOTE = (
    "Audit simulation on 100% synthetic data. Complaints, posts, contractors "
    "and figures are fictional; nothing here describes real citizens or officials."
)

MAX_RECORDS = 520
DEDUP_WINDOW = timedelta(hours=48)

# Terms that mark a social post as a fresh complaint about road/monsoon mess
# (English, Hinglish, Hindi, Marathi).
DISPUTE_TERMS = [
    "pothole", "potholes", "waterlog", "water logging", "water-logging",
    "flood", "flooded", "flooding", "cave-in", "cave in", "sinking road",
    "paani", "pani bhar", "bhar gaya", "bhari gayi",
    "गड्डा", "गड्डे", "खड्डा", "खड्डे", "पानी", "बाढ़", "सड़क",
    "पाणी", "खोडगा", "रस्ता", "गटार",
]

# A post that thanks BMC is citizen appreciation, not a fresh complaint — the
# dataset includes deliberate thank-you posts, so exclude them from the radar.
PRAISE_TERMS = [
    "thank", "thanks", "shukriya", "dhanyavad", "kudos", "appreciate",
    "well done", "great work", "good work", "fixed so quickly", "resolved so",
    "धन्यवाद", "आभार", "शुक्रिया", "👍", "👏",
]

# Work orders about these categories are the ones a post can "dispute".
DISPUTABLE_WORK_TYPES = {
    "Pothole",
    "Waterlogging",
    "Road cave-in",
    "Broken paver blocks",
    "Choked drain / nullah overflow",
}


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #


def read_csv(data_dir: str, name: str) -> list[dict[str, str]]:
    with open(os.path.join(data_dir, name), newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def parse_dt(value: str | None) -> datetime | None:
    if not value or not value.strip():
        return None
    try:
        return datetime.strptime(value.strip(), "%Y-%m-%d %H:%M")
    except ValueError:
        try:
            return datetime.strptime(value.strip(), "%Y-%m-%d")
        except ValueError:
            return None


def norm(text: str | None) -> str:
    return re.sub(r"\s+", " ", (text or "").strip()).casefold()


def write_json(out_dir: str, name: str, payload, compact: bool = False) -> None:
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, name)
    with open(path, "w", encoding="utf-8") as fh:
        if compact:
            # The searchable index rides to the browser, so skip pretty-printing.
            json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(payload, fh, ensure_ascii=False, indent=1)
    size_kb = os.path.getsize(path) / 1024
    print(f"  wrote {path} ({size_kb:.0f} KB)")


# --------------------------------------------------------------------------- #
# Locality gazetteer (geocoding)
# --------------------------------------------------------------------------- #


def build_gazetteer(localities: list[dict[str, str]]):
    """normalized name/alias -> (ward_code, display locality). Longest first."""
    key_map: dict[str, tuple[str, str]] = {}
    for row in localities:
        ward = (row.get("ward_code") or "").strip()
        display = (row.get("locality") or "").strip()
        if not ward or not display:
            continue
        keys = [display] + [a for a in (row.get("aliases") or "").split(";") if a.strip()]
        for key in keys:
            key_map.setdefault(norm(key), (ward, display))
    # Sort keys longest-first so "sion trombay road" style text prefers the
    # most specific match when we scan for containment.
    sorted_keys = sorted(key_map, key=len, reverse=True)
    return key_map, sorted_keys


def geocode_locality(text: str, key_map, sorted_keys):
    """Exact or containment match of free text -> (ward_code, display) | None."""
    t = norm(text)
    if not t:
        return None
    hit = key_map.get(t)
    if hit:
        return hit
    for key in sorted_keys:
        if len(key) < 4:
            continue
        if key in t or (len(t) >= 4 and t in key):
            return key_map[key]
    return None


# --------------------------------------------------------------------------- #
# Complaint cleanup: geocode + dedup + work-order link
# --------------------------------------------------------------------------- #


def clean_complaints(complaints, wards, key_map, sorted_keys):
    ward_offices = {
        (w.get("ward_code") or "").strip(): (w.get("assistant_commissioner_office") or "").strip()
        for w in wards
    }
    records = []
    geocoded_count = 0
    for c in complaints:
        ward = (c.get("ward_code") or "").strip()
        geocoded = False
        if not ward:
            hit = geocode_locality(c.get("locality_text", ""), key_map, sorted_keys)
            if hit:
                ward, _ = hit
                geocoded = True
                geocoded_count += 1
        records.append(
            {
                "complaint_id": (c.get("complaint_id") or "").strip(),
                "received_at": (c.get("received_at") or "").strip(),
                "received_dt": parse_dt(c.get("received_at")),
                "channel": (c.get("channel") or "").strip(),
                "language": (c.get("language") or "").strip().lower(),
                "category_reported": (c.get("category_reported") or "").strip(),
                "description": (c.get("description") or "").strip(),
                "locality_text": (c.get("locality_text") or "").strip(),
                "ward_code": ward,
                "assistant_commissioner_office": ward_offices.get(ward, ""),
                "upvotes": int(c.get("upvotes") or 0),
                "status": (c.get("status") or "").strip(),
                "photo_description": (c.get("photo_description") or "").strip(),
                "geocoded": geocoded,
                # filled below
                "duplicate_count": 1,
                "duplicate_channels": [],
                "duplicate_complaint_ids": [],
                "work_order_id": None,
            }
        )
    return records, geocoded_count


def deduplicate(records: list[dict]) -> int:
    """Cluster same ward + locality + category within 48h; annotate representatives."""
    groups = defaultdict(list)
    for r in records:
        if not r["ward_code"]:
            continue  # still ungeocoded and blank in source — nothing to group on
        key = (r["ward_code"], norm(r["locality_text"]), norm(r["category_reported"]))
        groups[key].append(r)

    merged = 0
    for group in groups.values():
        if len(group) == 1:
            group[0]["duplicate_count"] = 1
            group[0]["duplicate_channels"] = [group[0]["channel"]]
            group[0]["duplicate_complaint_ids"] = [group[0]["complaint_id"]]
            continue
        group.sort(key=lambda r: (r["received_dt"] or datetime.min, r["complaint_id"]))
        clusters: list[list[dict]] = []
        for r in group:
            if (
                clusters
                and r["received_dt"]
                and clusters[-1][-1]["received_dt"]
                and r["received_dt"] - clusters[-1][-1]["received_dt"] <= DEDUP_WINDOW
            ):
                clusters[-1].append(r)
            else:
                clusters.append([r])
        for cluster in clusters:
            rep = max(cluster, key=lambda r: (r["upvotes"], -(r["received_dt"].timestamp() if r["received_dt"] else 0)))
            rep["duplicate_count"] = len(cluster)
            rep["duplicate_channels"] = sorted({c["channel"] for c in cluster})
            rep["duplicate_complaint_ids"] = [c["complaint_id"] for c in cluster][:12]
            merged += len(cluster) - 1
    return merged


# --------------------------------------------------------------------------- #
# Work-order links
# --------------------------------------------------------------------------- #


def link_work_orders(records: list[dict], work_orders: list[dict]):
    by_complaint: dict[str, list[dict]] = defaultdict(list)
    for w in work_orders:
        ids = [i.strip() for i in (w.get("linked_complaint_ids") or "").split("|") if i.strip()]
        for cid in ids:
            by_complaint[cid].append(w)

    wo_by_id = {w["work_order_id"]: w for w in work_orders}

    def compact(w: dict) -> dict:
        return {
            "work_order_id": w.get("work_order_id", ""),
            "road_id": w.get("road_id", ""),
            "assigned_at": w.get("assigned_at", ""),
            "work_started_at": w.get("work_started_at", ""),
            "completed_at": w.get("completed_at", ""),
            "completed_dt": parse_dt(w.get("completed_at")),
            "sla_met": (w.get("sla_met") or "").strip().upper() == "Y",
            "reopened_within_30d": (w.get("reopened_within_30d") or "").strip().upper() == "Y",
        }

    linked = 0
    for r in records:
        wos = sorted(
            by_complaint.get(r["complaint_id"], []),
            key=lambda w: (parse_dt(w.get("assigned_at")) or datetime.min),
        )
        if wos:
            r["work_order_id"] = wos[-1]["work_order_id"]  # most recent assignment
            r["_wo"] = compact(wos[-1])
            linked += 1
    return linked, wo_by_id


# --------------------------------------------------------------------------- #
# Social dispute radar
# --------------------------------------------------------------------------- #


def run_dispute_radar(records, work_orders, social_posts, key_map, sorted_keys):
    """Flag SLA-met/completed work orders that fresh social posts re-complain about."""
    # index work orders by ward for quick lookup
    wos_by_ward = defaultdict(list)
    for w in work_orders:
        ward = (w.get("ward_code") or "").strip()
        completed = parse_dt(w.get("completed_at"))
        if not ward or not completed:
            continue
        if (w.get("sla_met") or "").strip().upper() != "Y":
            continue
        if (w.get("work_type") or "").strip() not in DISPUTABLE_WORK_TYPES:
            continue
        wos_by_ward[ward].append(w)

    disputes: dict[str, dict] = {}  # work_order_id -> best dispute post
    posts_hit = 0
    for p in social_posts:
        text = (p.get("text") or "").strip()
        t = norm(text)
        if not any(term in t for term in DISPUTE_TERMS):
            continue
        if any(term in t for term in PRAISE_TERMS):
            continue  # citizen appreciation, not a fresh complaint
        posted_at = parse_dt(p.get("posted_at"))
        if not posted_at:
            continue
        # which wards does the post mention?
        hit = geocode_locality(text, key_map, sorted_keys)
        if not hit:
            continue
        ward = hit[0]
        candidates = [
            w
            for w in wos_by_ward.get(ward, [])
            if (parse_dt(w.get("completed_at")) or datetime.min) <= posted_at
        ]
        if not candidates:
            continue
        # the fix "disputed" is the most recent completed one before the post
        wo = max(candidates, key=lambda w: parse_dt(w.get("completed_at")))
        likes = int(p.get("likes_or_forwards") or 0)
        existing = disputes.get(wo["work_order_id"])
        if existing is None or likes > existing["_likes"]:
            disputes[wo["work_order_id"]] = {
                "_likes": likes,
                "post_id": p.get("post_id", ""),
                "source": p.get("source", ""),
                "posted_at": p.get("posted_at", ""),
                "text": text,
                "likes_or_forwards": likes,
                "locality": hit[1],
            }
            posts_hit += 1

    # attach disputes to the complaints linked to each disputed work order
    by_complaint = defaultdict(list)
    for w in work_orders:
        for cid in (w.get("linked_complaint_ids") or "").split("|"):
            cid = cid.strip()
            if cid:
                by_complaint[cid].append(w["work_order_id"])

    attached = 0
    for r in records:
        woid = r["work_order_id"]
        if woid and woid in disputes:
            r["social_dispute"] = {
                k: v for k, v in disputes[woid].items() if not k.startswith("_")
            }
            attached += 1
    return posts_hit, len(disputes), attached


# --------------------------------------------------------------------------- #
# Compact index selection
# --------------------------------------------------------------------------- #


LANGS = ["en", "hi-en", "mr", "hi"]


def select_records(records, wo_by_id, max_records=MAX_RECORDS):
    """Disputes first, then linked, then unresolved 'Never Fixed' — language spread."""
    def public_record(r: dict) -> dict | None:
        wo = wo_by_id.get(r["work_order_id"]) if r["work_order_id"] else None
        if wo is None and r["work_order_id"]:
            return None
        record = {
            "complaint_id": r["complaint_id"],
            "received_at": r["received_at"],
            "channel": r["channel"],
            "language": r["language"],
            "category_reported": r["category_reported"],
            "description": r["description"],
            "locality_text": r["locality_text"],
            "ward_code": r["ward_code"],
            "assistant_commissioner_office": r["assistant_commissioner_office"],
            "upvotes": r["upvotes"],
            "status": r["status"],
            "photo_description": r["photo_description"],
            "geocoded": r["geocoded"],
            "duplicate_count": r["duplicate_count"],
            "duplicate_channels": r["duplicate_channels"],
            "duplicate_complaint_ids": r["duplicate_complaint_ids"],
            "work_order": None,
            "social_dispute": r.get("social_dispute"),
        }
        # Display snippets only — cap the longest free-text fields so the
        # browser payload stays lean.
        if len(record["description"]) > 420:
            record["description"] = record["description"][:417].rstrip() + "…"
        if len(record["photo_description"]) > 220:
            record["photo_description"] = record["photo_description"][:217].rstrip() + "…"
        if record["social_dispute"] and len(record["social_dispute"]["text"]) > 300:
            record["social_dispute"]["text"] = (
                record["social_dispute"]["text"][:297].rstrip() + "…"
            )
        if wo is not None:
            record["work_order"] = {
                "work_order_id": wo.get("work_order_id", ""),
                "road_id": wo.get("road_id", ""),
                "assigned_at": wo.get("assigned_at", ""),
                "work_started_at": wo.get("work_started_at", ""),
                "completed_at": wo.get("completed_at", ""),
                "sla_met": (wo.get("sla_met") or "").strip().upper() == "Y",
                "reopened_within_30d": (wo.get("reopened_within_30d") or "").strip().upper() == "Y",
                "engineer_remark": (wo.get("engineer_remark") or "").strip(),
                "repair_method": (wo.get("repair_method") or "").strip(),
                "cost_inr": int(float(wo.get("cost_inr") or 0)),
                "contractor_name": wo.get("contractor_name", ""),
            }
            # road name resolved by UI from roads.csv gazetteer below
        return record

    disputed = [r for r in records if r.get("social_dispute")]
    linked = [r for r in records if r["work_order_id"] and not r.get("social_dispute")]
    unresolved = [
        r
        for r in records
        if not r["work_order_id"] and r["status"] in ("Open", "In Progress")
    ]

    def round_robin(pool: list[dict], limit: int) -> list[dict]:
        buckets: dict[str, list[dict]] = defaultdict(list)
        for r in sorted(pool, key=lambda r: -r["upvotes"]):
            lang = r["language"] if r["language"] in LANGS else "en"
            buckets[lang].append(r)
        out: list[dict] = []
        i = 0
        while len(out) < limit:
            progressed = False
            for lang in LANGS:
                if buckets[lang] and i < len(buckets[lang]):
                    out.append(buckets[lang][i])
                    progressed = True
                    if len(out) >= limit:
                        break
            if not progressed:
                break
            i += 1
        return out

    remaining = max_records - len(disputed)
    linked_pick = round_robin(linked, max(0, remaining * 3 // 4))
    remaining = max_records - len(disputed) - len(linked_pick)
    unresolved_pick = round_robin(unresolved, max(0, remaining))

    chosen = disputed + linked_pick + unresolved_pick
    seen, out = set(), []
    for r in chosen:
        if r["complaint_id"] in seen:
            continue
        seen.add(r["complaint_id"])
        rec = public_record(r)
        if rec:
            out.append(rec)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data-dir", default=None)
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR)
    args = parser.parse_args()

    data_dir = args.data_dir
    if data_dir is None:
        data_dir = next((d for d in DEFAULT_DATA_DIRS if os.path.isdir(d)), DEFAULT_DATA_DIRS[0])
    if not os.path.isdir(data_dir):
        print(f"error: data directory not found: {data_dir}", file=sys.stderr)
        return 1

    print(f"Reading synthetic dataset from {data_dir}")
    complaints = read_csv(data_dir, "complaints.csv")
    localities = read_csv(data_dir, "localities.csv")
    work_orders = read_csv(data_dir, "work_orders.csv")
    roads = read_csv(data_dir, "roads.csv")
    wards = read_csv(data_dir, "wards.csv")
    social_posts = read_csv(data_dir, "social_posts.csv")
    print(
        f"  {len(complaints)} complaints · {len(localities)} localities · "
        f"{len(work_orders)} work orders · {len(social_posts)} social posts"
    )

    key_map, sorted_keys = build_gazetteer(localities)

    print("Cleaning complaints (geocoding + dedup) …")
    records, geocoded = clean_complaints(complaints, wards, key_map, sorted_keys)
    merged = deduplicate(records)
    print(f"  geocoded {geocoded} blank-ward complaints, merged {merged} duplicates")

    print("Linking complaints to work orders …")
    linked, wo_by_id = link_work_orders(records, work_orders)
    print(f"  linked {linked} complaints to work orders")

    print("Running social dispute radar …")
    posts_hit, disputed_wos, attached = run_dispute_radar(
        records, work_orders, social_posts, key_map, sorted_keys
    )
    print(
        f"  {posts_hit} dispute posts matched {disputed_wos} completed work orders "
        f"({attached} complaint records carry a dispute)"
    )

    print("Selecting compact searchable index …")
    chosen = select_records(records, wo_by_id)
    langs = defaultdict(int)
    disputes_in_out = 0
    for rec in chosen:
        langs[rec["language"]] += 1
        if rec["social_dispute"]:
            disputes_in_out += 1

    # Road gazetteer for universal search (road name -> ward).
    road_list = [
        {
            "road_id": r.get("road_id", ""),
            "road_name": r.get("road_name", ""),
            "ward_code": (r.get("ward_code") or "").strip(),
        }
        for r in roads
    ]

    ward_offices = {
        (w.get("ward_code") or "").strip(): (w.get("assistant_commissioner_office") or "").strip()
        for w in wards
    }

    payload = {
        "meta": {
            "generated_at": GENERATED_AT,
            "synthetic": True,
            "note": SYNTHETIC_NOTE,
            "dedup_window_hours": 48,
            "stats": {
                "complaints_total": len(complaints),
                "geocoded_blank_wards": geocoded,
                "duplicates_merged": merged,
                "complaints_linked_to_work_orders": linked,
                "dispute_posts_matched": posts_hit,
                "disputed_work_orders": disputed_wos,
                "records_out": len(chosen),
                "disputes_out": disputes_in_out,
                "languages_out": dict(langs),
            },
        },
        "ward_offices": ward_offices,
        "roads": road_list,
        "complaints": chosen,
    }
    write_json(args.out_dir, "trail_index.json", payload, compact=True)
    print(f"Done — {len(chosen)} records ({disputes_in_out} disputed) across {dict(langs)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
