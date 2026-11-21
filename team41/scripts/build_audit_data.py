#!/usr/bin/env python3
"""Build the audit-simulation JSON feeds for the team41 "Follow the Rupee" map.

Reads the synthetic BMC civic dataset (CSV) and writes three clean JSON files
into team41/public/data/:

  audit_flags.json        Leakage flags + recoverable rupees (DLP / overbilling / double billing)
  contractor_scores.json  Raw vs weather & flood-adjusted contractor fairness scores
  ward_simulator.json     Per-ward monsoon risk ranking + "next-rupee" simulator inputs

Everything is synthetic. Contractors, wards and notices are audit simulations.

Usage:
  python scripts/build_audit_data.py [--data-dir DIR] [--out-dir DIR]

Defaults resolve the repo layout automatically:
  data:  <repo>/Claude-Impact-Labs-data-2/data   (falls back to <repo>/Project/claude-hackathon-2026/data)
  out:   <repo>/Project/claude-hackathon-2026/team41/public/data
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta

# The ₹ sign in console output breaks cp1252 Windows terminals.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TEAM41_DIR = os.path.dirname(SCRIPT_DIR)  # .../team41
HACKATHON_DIR = os.path.dirname(TEAM41_DIR)  # .../claude-hackathon-2026
REPO_ROOT = os.path.dirname(os.path.dirname(HACKATHON_DIR))  # .../claude-impact-lab

DEFAULT_DATA_DIRS = [
    os.path.join(REPO_ROOT, "Claude-Impact-Labs-data-2", "data"),
    os.path.join(HACKATHON_DIR, "data"),
]
DEFAULT_OUT_DIR = os.path.join(TEAM41_DIR, "public", "data")

GENERATED_AT = datetime.now().strftime("%Y-%m-%d %H:%M")

SYNTHETIC_NOTE = (
    "Audit simulation on 100% synthetic data. Contractors, work orders and notices "
    "are fictional; figures exist to demonstrate an audit workflow, not to accuse anyone."
)

# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #

SEVERITY_WEIGHT = {"Fatal": 3.0, "Grievous": 2.0, "Minor": 0.5}
ROAD_CAUSE_ACCIDENTS = {"Pothole", "Waterlogged road", "Uneven road / open chamber"}
ALERT_RANK = {"Green": 0, "Yellow": 1, "Orange": 2, "Red": 3}
STRESS_ALERTS = {"Orange", "Red"}


def read_csv(data_dir: str, name: str) -> list[dict[str, str]]:
    path = os.path.join(data_dir, name)
    with open(path, newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def to_int(value: str | None, default: int | None = None) -> int | None:
    if value is None or value.strip() == "":
        return default
    try:
        return int(round(float(value)))
    except ValueError:
        return default


def to_float(value: str | None, default: float | None = None) -> float | None:
    if value is None or value.strip() == "":
        return default
    try:
        return float(value)
    except ValueError:
        return default


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(value.strip(), "%Y-%m-%d %H:%M")
    except ValueError:
        try:
            return datetime.strptime(value.strip(), "%Y-%m-%d")
        except ValueError:
            return None


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Approximate great-circle distance in metres."""
    from math import cos, radians, sin, asin, sqrt

    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 6371000 * 2 * asin(sqrt(a))


def write_json(out_dir: str, name: str, payload) -> None:
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, name)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)
    print(f"  wrote {path}")


# --------------------------------------------------------------------------- #
# Loaders
# --------------------------------------------------------------------------- #


def load_alert_by_date(data_dir: str) -> dict[str, str]:
    """Per calendar date, the strongest IMD alert across stations."""
    rows = read_csv(data_dir, "rainfall_daily.csv")
    alert: dict[str, str] = {}
    for r in rows:
        date = (r.get("date") or "").strip()
        a = (r.get("imd_alert") or "").strip()
        if not date:
            continue
        if date not in alert or ALERT_RANK.get(a, 0) > ALERT_RANK.get(alert[date], 0):
            alert[date] = a
    return alert


def load_inputs(data_dir: str):
    wards = read_csv(data_dir, "wards.csv")
    roads = read_csv(data_dir, "roads.csv")
    rate_card = read_csv(data_dir, "rate_card.csv")
    work_orders = read_csv(data_dir, "work_orders.csv")
    contractors = read_csv(data_dir, "contractors.csv")
    accidents = read_csv(data_dir, "accidents.csv")
    flood_hotspots = read_csv(data_dir, "flood_hotspots.csv")
    traffic = read_csv(data_dir, "traffic.csv")
    facilities = read_csv(data_dir, "facilities.csv")
    alert_by_date = load_alert_by_date(data_dir)
    return {
        "wards": wards,
        "roads": roads,
        "rate_card": rate_card,
        "work_orders": work_orders,
        "contractors": contractors,
        "accidents": accidents,
        "flood_hotspots": flood_hotspots,
        "traffic": traffic,
        "facilities": facilities,
        "alert_by_date": alert_by_date,
    }


# --------------------------------------------------------------------------- #
# 1. Audit flags (leakage & recoverable rupees)
# --------------------------------------------------------------------------- #


def job_overlaps_alert(start: datetime | None, end: datetime | None, alert_by_date) -> bool:
    if start is None:
        return False
    day = start.date()
    last = end.date() if end else day
    while day <= last:
        if alert_by_date.get(day.isoformat(), "Green") in STRESS_ALERTS:
            return True
        day += timedelta(days=1)
    return False


def build_audit_flags(data) -> dict:
    roads = {r["road_id"]: r for r in data["roads"]}
    rate_card = {r["repair_method"]: r for r in data["rate_card"]}
    alert_by_date = data["alert_by_date"]

    orders = []
    for r in data["work_orders"]:
        cost = to_int(r.get("cost_inr"))
        if cost is None:
            continue
        road = roads.get(r.get("road_id", ""), {})
        rc = rate_card.get((r.get("repair_method") or "").strip(), {})
        start = parse_dt(r.get("work_started_at"))
        end = parse_dt(r.get("completed_at"))
        expected = None
        unit = (rc.get("unit") or "").strip()
        rate = to_float(rc.get("standard_rate_inr"))
        if rate is not None:
            if unit == "per sqm":
                area = to_float(r.get("area_sqm"))
                expected = int(round(area * rate)) if area is not None else None
            elif unit == "per job":
                expected = int(round(rate))
        orders.append(
            {
                "work_order_id": r.get("work_order_id", ""),
                "linked_complaint_ids": (r.get("linked_complaint_ids") or "").strip(),
                "ward_code": r.get("ward_code", ""),
                "road_id": r.get("road_id", ""),
                "road_name": road.get("road_name", ""),
                "last_resurfaced": road.get("last_resurfaced", ""),
                "under_dlp": (road.get("under_dlp") or "").strip().upper() == "Y",
                "contractor_id": r.get("contractor_id", ""),
                "contractor_name": r.get("contractor_name", ""),
                "repair_method": (r.get("repair_method") or "").strip(),
                "work_type": (r.get("work_type") or "").strip(),
                "cost_inr": cost,
                "expected_cost": expected,
                "assigned_at": r.get("assigned_at", ""),
                "assigned_dt": parse_dt(r.get("assigned_at")),
                "work_started_at": r.get("work_started_at", ""),
                "completed_at": r.get("completed_at", ""),
                "start_dt": start,
                "end_dt": end,
                "engineer_remark": (r.get("engineer_remark") or "").strip(),
                "in_stress_window": job_overlaps_alert(start, end, alert_by_date),
            }
        )

    # ---- flag pass -------------------------------------------------------
    by_key = defaultdict(list)
    for o in orders:
        by_key[(o["road_id"], o["work_type"])].append(o)

    for o in orders:
        o["flag_reasons"] = []
        o["recoverable_parts"] = []

    # (a) DLP violation: BMC paid although road is under defect liability.
    for o in orders:
        if o["under_dlp"]:
            o["flag_reasons"].append("DLP_VIOLATION")
            o["recoverable_parts"].append(o["cost_inr"])

    # (b) Overbilled: > 30% above rate card expectation.
    for o in orders:
        exp = o["expected_cost"]
        if exp is not None and exp > 0 and o["cost_inr"] > exp * 1.30:
            o["flag_reasons"].append("OVERBILLED")
            o["recoverable_parts"].append(o["cost_inr"] - exp)

    # (c) Double billed: same road + work_type again within 7 days, no complaint linked.
    DUPLICATE_WINDOW = timedelta(days=7)
    for group in by_key.values():
        group.sort(key=lambda o: (o["assigned_dt"] or datetime.min, o["work_order_id"]))
        prior: dict | None = None
        for o in group:
            if (
                prior is not None
                and o["assigned_dt"] is not None
                and prior["assigned_dt"] is not None
                and o["assigned_dt"] - prior["assigned_dt"] <= DUPLICATE_WINDOW
                and not o["linked_complaint_ids"]
            ):
                o["flag_reasons"].append("DOUBLE_BILLED")
                o["recoverable_parts"].append(o["cost_inr"])
            prior = o

    flags = []
    for o in orders:
        if not o["flag_reasons"]:
            continue
        # Recoverable rupees: never double-count overlapping flags (a DLP job's
        # full cost already includes any overbilling on it).
        recoverable = max(o["recoverable_parts"]) if o["recoverable_parts"] else 0
        flags.append(
            {
                "work_order_id": o["work_order_id"],
                "ward_code": o["ward_code"],
                "road_id": o["road_id"],
                "road_name": o["road_name"],
                "last_resurfaced": o["last_resurfaced"],
                "contractor_id": o["contractor_id"],
                "contractor_name": o["contractor_name"],
                "repair_method": o["repair_method"],
                "work_type": o["work_type"],
                "cost_inr": o["cost_inr"],
                "expected_cost": o["expected_cost"],
                "recoverable_inr": int(round(recoverable)),
                "flag_reasons": o["flag_reasons"],
                "assigned_at": o["assigned_at"],
                "completed_at": o["completed_at"],
                "engineer_remark": o["engineer_remark"],
            }
        )
    flags.sort(key=lambda f: (-f["recoverable_inr"], f["work_order_id"]))

    # ---- summaries --------------------------------------------------------
    total_spend = sum(o["cost_inr"] for o in orders)
    total_budget = sum(to_int(w.get("monsoon_repair_budget_inr_2025"), 0) or 0 for w in data["wards"])

    citywide_total = sum(f["recoverable_inr"] for f in flags)
    by_ward = defaultdict(lambda: {"total_recoverable_inr": 0, "flagged_orders": 0})
    by_reason = defaultdict(lambda: {"count": 0, "recoverable_inr": 0})
    for f in flags:
        ward = by_ward[f["ward_code"]]
        ward["total_recoverable_inr"] += f["recoverable_inr"]
        ward["flagged_orders"] += 1
        for reason in f["flag_reasons"]:
            by_reason[reason]["count"] += 1
            by_reason[reason]["recoverable_inr"] += f["recoverable_inr"]

    reason_labels = {
        "DLP_VIOLATION": "Warranty ignored — the road was still under the contractor's free-repair warranty (DLP), so BMC shouldn't have paid at all",
        "OVERBILLED": "Overcharged — billed more than 30% above the government rate card for this repair",
        "DOUBLE_BILLED": "Billed twice — same road & same work billed again within 7 days with no citizen complaint linked",
    }

    return {
        "meta": {
            "generated_at": GENERATED_AT,
            "synthetic": True,
            "note": SYNTHETIC_NOTE,
            "flag_reason_labels": reason_labels,
            "methodology": {
                "DLP_VIOLATION": "road.under_dlp == 'Y' → whole cost_inr recoverable from the original contractor",
                "OVERBILLED": "cost_inr > 1.30 × expected_cost (rate card × area for per-sqm, flat rate for per-job) → cost − expected recoverable",
                "DOUBLE_BILLED": "same road_id + work_type re-billed within 7 days, linked_complaint_ids blank → duplicate cost_inr recoverable",
                "recoverable_inr": "max of the applicable flag amounts, so overlapping flags are never double-counted",
            },
        },
        "summary": {
            "citywide_total_recoverable_inr": int(citywide_total),
            "total_spend_inr": int(total_spend),
            "total_budget_inr": int(total_budget),
            "total_work_orders": len(orders),
            "flagged_orders": len(flags),
            "by_reason": {k: by_reason[k] for k in sorted(by_reason)},
            "by_ward": {k: by_ward[k] for k in sorted(by_ward)},
        },
        "flags": flags,
    }


# --------------------------------------------------------------------------- #
# 2. Contractor scores (raw vs weather / flood adjusted)
# --------------------------------------------------------------------------- #

RAW_WEIGHTS = {"sla": 0.45, "reopen": 0.35, "cost": 0.20}


def cost_discipline_score(avg_cost_ratio: float) -> float:
    """100 = billed at rate card; falls to 0 once avg billing is ~40% above it."""
    over = max(0.0, avg_cost_ratio - 1.0)
    return clamp(100.0 - over * 250.0, 0.0, 100.0)


def composite_score(sla_met_pct: float, reopen_pct: float, cost_score: float) -> float:
    return round(
        RAW_WEIGHTS["sla"] * sla_met_pct
        + RAW_WEIGHTS["reopen"] * (100.0 - reopen_pct)
        + RAW_WEIGHTS["cost"] * cost_score,
        1,
    )


def build_contractor_scores(data) -> dict:
    roads = {r["road_id"]: r for r in data["roads"]}
    rate_card = {r["repair_method"]: r for r in data["rate_card"]}
    ward_lli = {
        (w.get("ward_code") or "").strip(): to_float(w.get("low_lying_index"), 0.5) or 0.5
        for w in data["wards"]
    }
    alert_by_date = data["alert_by_date"]

    jobs_by_contractor = defaultdict(list)
    for r in data["work_orders"]:
        cost = to_int(r.get("cost_inr"))
        if cost is None:
            continue
        cid = (r.get("contractor_id") or "").strip()
        rc = rate_card.get((r.get("repair_method") or "").strip(), {})
        rate = to_float(rc.get("standard_rate_inr"))
        unit = (rc.get("unit") or "").strip()
        expected = None
        if rate is not None:
            if unit == "per sqm":
                area = to_float(r.get("area_sqm"))
                expected = area * rate if area is not None else None
            elif unit == "per job":
                expected = rate
        start = parse_dt(r.get("work_started_at"))
        end = parse_dt(r.get("completed_at"))
        jobs_by_contractor[cid].append(
            {
                "cost_inr": cost,
                "expected_cost": expected,
                "sla_met": (r.get("sla_met") or "").strip().upper() == "Y",
                "reopened": (r.get("reopened_within_30d") or "").strip().upper() == "Y",
                "low_lying": ward_lli.get((r.get("ward_code") or "").strip(), 0.5),
                "in_stress": job_overlaps_alert(start, end, alert_by_date),
            }
        )

    names = {c["contractor_id"]: c["contractor_name"] for c in data["contractors"]}
    for cid in jobs_by_contractor:
        names.setdefault(cid, cid)

    def summarize(jobs: list[dict]) -> dict:
        n = len(jobs)
        sla_met_pct = 100.0 * sum(j["sla_met"] for j in jobs) / n if n else 0.0
        reopen_pct = 100.0 * sum(j["reopened"] for j in jobs) / n if n else 0.0
        ratios = [j["cost_inr"] / j["expected_cost"] for j in jobs if j["expected_cost"]]
        avg_ratio = sum(ratios) / len(ratios) if ratios else 1.0
        avg_lli = sum(j["low_lying"] for j in jobs) / n if n else 0.5
        stress_pct = 100.0 * sum(j["in_stress"] for j in jobs) / n if n else 0.0
        return {
            "jobs": n,
            "sla_met_pct": round(sla_met_pct, 1),
            "sla_miss_pct": round(100.0 - sla_met_pct, 1),
            "reopen_pct": round(reopen_pct, 1),
            "total_billed_inr": int(sum(j["cost_inr"] for j in jobs)),
            "avg_cost_inr": int(sum(j["cost_inr"] for j in jobs) / n) if n else 0,
            "avg_cost_vs_expected_pct": round(avg_ratio * 100.0, 1),
            "avg_ward_low_lying_index": round(avg_lli, 3),
            "stress_jobs_pct": round(stress_pct, 1),
            "cost_score": round(cost_discipline_score(avg_ratio), 1),
        }

    all_jobs = [j for jobs in jobs_by_contractor.values() for j in jobs]
    city = summarize(all_jobs)

    # Expected-vs-actual model: citywide miss/reopen probability per
    # (low-lying bucket, Orange/Red-alert) cell, so each contractor's failures
    # can be compared against what their exact ward/rain mix would predict.
    def lli_bucket(lli: float) -> str:
        if lli >= 0.7:
            return "hi"
        if lli >= 0.55:
            return "mid"
        return "lo"

    cells: dict[tuple[str, bool], dict[str, float]] = defaultdict(
        lambda: {"n": 0, "miss": 0, "reopen": 0}
    )
    for j in all_jobs:
        cell = cells[(lli_bucket(j["low_lying"]), j["in_stress"])]
        cell["n"] += 1
        cell["miss"] += not j["sla_met"]
        cell["reopen"] += j["reopened"]
    city_miss_rate = city["sla_miss_pct"] / 100.0
    city_reopen_rate = city["reopen_pct"] / 100.0

    def cell_prob(key: tuple[str, bool], metric: str) -> float:
        cell = cells.get(key)
        if cell and cell["n"] >= 20:
            return cell[metric] / cell["n"]
        return city_miss_rate if metric == "miss" else city_reopen_rate

    contractors = []
    for cid, jobs in jobs_by_contractor.items():
        raw = summarize(jobs)
        raw_score = composite_score(raw["sla_met_pct"], raw["reopen_pct"], raw["cost_score"])

        exp_miss = sum(cell_prob((lli_bucket(j["low_lying"]), j["in_stress"]), "miss") for j in jobs)
        exp_reopen = sum(cell_prob((lli_bucket(j["low_lying"]), j["in_stress"]), "reopen") for j in jobs)
        miss_ratio = (raw["sla_miss_pct"] / 100.0 * len(jobs)) / exp_miss if exp_miss > 0 else 1.0
        reopen_ratio = (raw["reopen_pct"] / 100.0 * len(jobs)) / exp_reopen if exp_reopen > 0 else 1.0

        # Fairness adjustment: flood-prone wards + Orange/Red-alert weeks make
        # SLA misses and 30-day reopens objectively harder to avoid, so we
        # shrink the contractor's *miss rates* by their exposure relative to
        # the city average before re-scoring (hard conditions → smaller blame).
        lli_gap = (raw["avg_ward_low_lying_index"] - city["avg_ward_low_lying_index"]) / max(
            city["avg_ward_low_lying_index"], 0.1
        )
        stress_gap = (raw["stress_jobs_pct"] - city["stress_jobs_pct"]) / max(city["stress_jobs_pct"], 1.0)
        difficulty = clamp(1.0 + 1.0 * lli_gap + 0.6 * stress_gap, 0.75, 1.6)
        adj_sla_met = clamp(100.0 - raw["sla_miss_pct"] / difficulty, 0.0, 100.0)
        adj_reopen = clamp(raw["reopen_pct"] / difficulty, 0.0, 100.0)
        fair_score = composite_score(adj_sla_met, adj_reopen, raw["cost_score"])

        if difficulty >= 1.08:
            exposure = (
                f"Adjusted up for flood-prone patch: low-lying idx {raw['avg_ward_low_lying_index']:.2f}, "
                f"{raw['stress_jobs_pct']:.0f}% jobs in Orange/Red-alert weeks"
            )
        elif difficulty <= 0.92:
            exposure = (
                f"Easier patch than city avg: low-lying idx {raw['avg_ward_low_lying_index']:.2f}, "
                f"{raw['stress_jobs_pct']:.0f}% jobs in Orange/Red-alert weeks"
            )
        else:
            exposure = "Working conditions close to the city average"
        if reopen_ratio >= 1.2:
            verdict = f"reopens {reopen_ratio:.1f}× the rate its ward/rain mix predicts — red flag stands"
        elif reopen_ratio <= 0.8:
            verdict = f"reopens just {reopen_ratio:.1f}× the rate its ward/rain mix predicts — genuinely solid"
        else:
            verdict = f"reopens {reopen_ratio:.1f}× the rate its ward/rain mix predicts"
        note = f"{exposure}; {verdict}"

        contractors.append(
            {
                "contractor_id": cid,
                "contractor_name": names.get(cid, cid),
                "raw": raw,
                "raw_score": raw_score,
                "adjusted": {
                    "difficulty_factor": round(difficulty, 3),
                    "sla_met_pct": round(adj_sla_met, 1),
                    "reopen_pct": round(adj_reopen, 1),
                    "fair_score": fair_score,
                    "miss_vs_expected": round(miss_ratio, 2),
                    "reopen_vs_expected": round(reopen_ratio, 2),
                    "context_note": note,
                },
                "ward_low_lying_index": raw["avg_ward_low_lying_index"],
                "stress_jobs_pct": raw["stress_jobs_pct"],
            }
        )

    contractors.sort(key=lambda c: (-c["raw_score"], -c["raw"]["jobs"]))
    for i, c in enumerate(contractors, start=1):
        c["raw_rank"] = i

    contractors.sort(key=lambda c: (-c["adjusted"]["fair_score"], -c["raw"]["jobs"]))
    for i, c in enumerate(contractors, start=1):
        c["fair_rank"] = i
        c["rank_delta"] = c["raw_rank"] - c["fair_rank"]  # +N = climbs under fair ranking

    contractors.sort(key=lambda c: c["raw_rank"])
    return {
        "meta": {
            "generated_at": GENERATED_AT,
            "synthetic": True,
            "note": SYNTHETIC_NOTE,
            "weights": RAW_WEIGHTS,
            "score_formula": "0.45·SLA met% + 0.35·(100 − reopen30d%) + 0.20·cost-discipline",
            "adjustment_formula": (
                "difficulty = clamp(1 + 1.0·(ward low-lying gap vs city) + 0.6·(Orange/Red-alert "
                "job gap vs city), 0.75, 1.6); SLA-miss% and reopen% are divided by difficulty "
                "before re-scoring, so contractors working flood-prone wards in heavy-rain weeks "
                "are not unfairly penalized"
            ),
            "city_baseline": city,
        },
        "contractors": contractors,
    }


# --------------------------------------------------------------------------- #
# 3. Ward simulator (monsoon risk + next-rupee allocation)
# --------------------------------------------------------------------------- #

SIM_METHODS = ["Cold mix patch", "Mastic asphalt"]
RISK_ROADS_PER_WARD = 8
FLOOD_NEAR_M = 800.0


def build_ward_simulator(data) -> dict:
    wards = data["wards"]
    roads = data["roads"]
    alert_by_date = data["alert_by_date"]
    rate_card = {r["repair_method"]: r for r in data["rate_card"]}

    # --- indexes -----------------------------------------------------------
    accidents_by_road = defaultdict(lambda: {"Fatal": 0, "Grievous": 0, "Minor": 0, "other": 0})
    for a in data["accidents"]:
        if (a.get("probable_cause") or "").strip() not in ROAD_CAUSE_ACCIDENTS:
            continue
        sev = (a.get("severity") or "").strip()
        bucket = accidents_by_road[a.get("road_id", "")]
        if sev in bucket:
            bucket[sev] += 1
        else:
            bucket["other"] += 1

    traffic_by_road = {t["road_id"]: t for t in data["traffic"]}
    hotspots_by_ward = defaultdict(list)
    for h in data["flood_hotspots"]:
        hotspots_by_ward[(h.get("ward_code") or "").strip()].append(h)

    facilities_by_road = defaultdict(lambda: {"Hospital": [], "School": []})
    for f in data["facilities"]:
        kind = (f.get("type") or "").strip()
        if kind in facilities_by_road[(f.get("ambulance_entry_road") or "").strip()]:
            facilities_by_road[f["ambulance_entry_road"]][kind].append(f.get("name", ""))

    # --- work-order history (per ward × method, with stress split) ---------
    # stress = job window overlaps an Orange/Red IMD alert day.
    hist = defaultdict(lambda: {"n": 0, "area": [], "cost": [], "reopen": 0})
    hist_stress = defaultdict(lambda: {"n": 0, "reopen": 0})
    ward_spend = defaultdict(int)
    method_totals = defaultdict(lambda: {"n": 0, "reopen": 0})

    for r in data["work_orders"]:
        cost = to_int(r.get("cost_inr"))
        if cost is None:
            continue
        ward = (r.get("ward_code") or "").strip()
        method = (r.get("repair_method") or "").strip()
        ward_spend[ward] += cost
        method_totals[method]["n"] += 1
        method_totals[method]["reopen"] += (r.get("reopened_within_30d") or "").strip().upper() == "Y"
        key = (ward, method)
        hist[key]["n"] += 1
        hist[key]["cost"].append(cost)
        area = to_float(r.get("area_sqm"))
        if area:
            hist[key]["area"].append(area)
        reopened = (r.get("reopened_within_30d") or "").strip().upper() == "Y"
        hist[key]["reopen"] += reopened
        start, end = parse_dt(r.get("work_started_at")), parse_dt(r.get("completed_at"))
        if job_overlaps_alert(start, end, alert_by_date):
            hist_stress[key]["n"] += 1
            hist_stress[key]["reopen"] += reopened

    def reopen_rate(key: tuple[str, str], stress: bool) -> tuple[float, int, bool]:
        """(rate_pct, jobs, is_fallback) with ward → city → method-total fallback."""
        src = hist_stress if stress else hist
        entry = src.get(key)
        if entry and entry["n"] >= 3:
            return round(100.0 * entry["reopen"] / entry["n"], 1), entry["n"], False
        method = key[1]
        m = method_totals[method]
        if m["n"]:
            rate = 100.0 * m["reopen"] / m["n"]
            if stress:
                rate *= 1.6  # no ward-level stress sample: apply citywide stress uplift
            return round(rate, 1), m["n"], True
        return 20.0 if stress else 12.0, 0, True

    def avg_area(key: tuple[str, str]) -> float:
        areas = hist.get(key, {}).get("area") or []
        if areas:
            return round(sum(areas) / len(areas), 1)
        city_areas = [a for e in hist.values() for a in e["area"]]
        return round(sum(city_areas) / len(city_areas), 1) if city_areas else 25.0

    # --- per-ward payload ---------------------------------------------------
    out_wards = []
    for w in wards:
        ward = (w.get("ward_code") or "").strip()
        budget = to_int(w.get("monsoon_repair_budget_inr_2025"), 0) or 0
        spend = ward_spend.get(ward, 0)
        ward_roads = [r for r in roads if (r.get("ward_code") or "").strip() == ward]
        ward_hotspots = hotspots_by_ward.get(ward, [])

        scored = []
        for r in ward_roads:
            rid = r.get("road_id", "")
            lat = to_float(r.get("start_lat"))
            lon = to_float(r.get("start_lon"))
            lat2 = to_float(r.get("end_lat"))
            lon2 = to_float(r.get("end_lon"))
            mid = ((lat + lat2) / 2 if lat is not None and lat2 is not None else lat,
                   (lon + lon2) / 2 if lon is not None and lon2 is not None else lon)

            acc = accidents_by_road.get(rid, {"Fatal": 0, "Grievous": 0, "Minor": 0, "other": 0})
            weighted = SEVERITY_WEIGHT["Fatal"] * acc["Fatal"] + SEVERITY_WEIGHT["Grievous"] * acc["Grievous"] + SEVERITY_WEIGHT["Minor"] * acc["Minor"]
            accident_score = clamp(weighted / 6.0, 0.0, 1.0)

            flood_score, nearby_hotspots = 0.0, []
            for h in ward_hotspots:
                hlat, hlon = to_float(h.get("lat")), to_float(h.get("lon"))
                if mid[0] is None or mid[1] is None or hlat is None or hlon is None:
                    continue
                if haversine_m(mid[0], mid[1], hlat, hlon) <= FLOOD_NEAR_M:
                    depth = to_float(h.get("avg_water_depth_cm"), 0) or 0
                    years = to_float(h.get("years_flagged_last_5"), 0) or 0
                    intensity = clamp(depth / 40.0, 0.2, 1.0) * (0.5 + years / 10.0)
                    if (h.get("tide_sensitive") or "").strip().upper() == "Y":
                        intensity *= 1.1
                    flood_score = max(flood_score, clamp(intensity, 0.0, 1.0))
                    nearby_hotspots.append(h.get("name", ""))
            if flood_score == 0.0 and ward_hotspots:
                # No hotspot within walking distance; fall back to a weak
                # ward-level signal so chronic flood wards aren't scored as dry.
                worst = max(
                    (to_float(h.get("avg_water_depth_cm"), 0) or 0) / 40.0 for h in ward_hotspots
                )
                flood_score = clamp(0.3 * worst, 0.0, 1.0)

            congestion = clamp((to_float(traffic_by_road.get(rid, {}).get("congestion_index_0_10"), 0) or 0) / 10.0, 0.0, 1.0)

            hospitals = facilities_by_road.get(rid, {}).get("Hospital", [])
            schools = facilities_by_road.get(rid, {}).get("School", [])
            facility_score = clamp((2.0 * len(hospitals) + len(schools)) / 4.0, 0.0, 1.0)

            risk = 100.0 * (
                0.40 * accident_score + 0.30 * flood_score + 0.15 * congestion + 0.15 * facility_score
            )
            scored.append(
                {
                    "road_id": rid,
                    "road_name": r.get("road_name", ""),
                    "road_type": r.get("road_type", ""),
                    "length_m": to_int(r.get("length_m"), 0) or 0,
                    "lanes": to_int(r.get("lanes"), 1) or 1,
                    "last_resurfaced": r.get("last_resurfaced", ""),
                    "under_dlp": (r.get("under_dlp") or "").strip().upper() == "Y",
                    "risk_score": round(risk, 1),
                    "components": {
                        "accident": round(accident_score, 3),
                        "flood": round(flood_score, 3),
                        "congestion": round(congestion, 3),
                        "facility": round(facility_score, 3),
                    },
                    "accidents_fatal": acc["Fatal"],
                    "accidents_grievous": acc["Grievous"],
                    "accidents_minor": acc["Minor"],
                    "congestion_index": to_float(traffic_by_road.get(rid, {}).get("congestion_index_0_10"), 0) or 0,
                    "hospitals": hospitals,
                    "schools": schools,
                    "flood_hotspots_nearby": sorted(set(nearby_hotspots)),
                }
            )
        scored.sort(key=lambda s: -s["risk_score"])
        top_roads = scored[:RISK_ROADS_PER_WARD]

        strategies = {}
        simulation = {}
        for method in SIM_METHODS:
            rc = rate_card.get(method, {})
            rate = to_float(rc.get("standard_rate_inr"), 0) or 0
            key = (ward, method)
            area = avg_area(key)
            per_road_cost = int(round(area * rate))
            strats = {
                "standard_rate_inr": int(rate),
                "unit": rc.get("unit", "per sqm"),
                "avg_patch_area_sqm": area,
                "cost_per_road_inr": per_road_cost,
                "history_jobs": hist.get(key, {}).get("n", 0),
            }
            for label, stress in (("normal", False), ("stress", True)):
                rate_pct, jobs, fallback = reopen_rate(key, stress)
                strats[f"reopen_{label}_pct"] = rate_pct
                strats[f"reopen_{label}_jobs"] = jobs
                strats[f"reopen_{label}_fallback"] = fallback

                # Greedy coverage of the top-risk list within remaining budget.
                remaining = budget - spend
                covered, spent = [], 0
                for road in top_roads:
                    if spent + per_road_cost <= remaining:
                        covered.append(road)
                        spent += per_road_cost
                hospitals = sorted({h for r_ in covered for h in r_["hospitals"]})
                schools = sorted({s for r_ in covered for s in r_["schools"]})
                waste = int(round(per_road_cost * rate_pct / 100.0)) * len(covered)
                sim = {
                    "roads_covered": len(covered),
                    "roads_in_scope": len(top_roads),
                    "road_ids": [r_["road_id"] for r_ in covered],
                    "spend_inr": spent,
                    "hospitals_covered": hospitals,
                    "schools_covered": schools,
                    "reopen_rate_pct": rate_pct,
                    "expected_reopen_waste_inr": waste,
                }
                simulation.setdefault(method, {})[label] = sim
            strategies[method] = strats

        out_wards.append(
            {
                "ward_code": ward,
                "ward_name": w.get("ward_name", ""),
                "low_lying_index": to_float(w.get("low_lying_index"), 0) or 0,
                "monsoon_budget_inr_2025": budget,
                "spend_to_date_inr": spend,
                "remaining_budget_inr": budget - spend,
                "top_risk_roads": top_roads,
                "all_risk_roads": [
                    {"road_id": s["road_id"], "risk_score": s["risk_score"]} for s in scored
                ],
                "strategies": strategies,
                "simulation": simulation,
            }
        )

    # Citywide method history for the UI legend.
    method_history = []
    for method, m in sorted(method_totals.items()):
        rc = rate_card.get(method, {})
        n = m["n"] or 1
        n_stress = sum(e["n"] for k, e in hist_stress.items() if k[1] == method)
        re_stress = sum(e["reopen"] for k, e in hist_stress.items() if k[1] == method)
        costs = [c for k, e in hist.items() for c in e["cost"] if k[1] == method]
        method_history.append(
            {
                "repair_method": method,
                "unit": rc.get("unit", ""),
                "standard_rate_inr": to_float(rc.get("standard_rate_inr"), 0) or 0,
                "jobs": m["n"],
                "reopen_rate_pct": round(100.0 * m["reopen"] / n, 1),
                "stress_jobs": n_stress,
                "stress_reopen_rate_pct": round(100.0 * re_stress / n_stress, 1) if n_stress else None,
                "avg_cost_per_job_inr": int(sum(costs) / len(costs)) if costs else 0,
            }
        )

    return {
        "meta": {
            "generated_at": GENERATED_AT,
            "synthetic": True,
            "note": SYNTHETIC_NOTE,
            "risk_formula": (
                "100 × (0.40·road-cause accident severity (Fatal 3 / Grievous 2 / Minor 0.5, capped) "
                "+ 0.30·nearby flood-hotspot intensity (≤800 m, depth · years flagged · tide factor) "
                "+ 0.15·congestion_index_0_10/10 + 0.15·critical facilities on the segment "
                "(hospital ×2, school ×1))"
            ),
            "stress_definition": "job window overlaps an IMD Orange or Red alert day; big-tide scenario applies a 1.6× reopen uplift where ward-level stress samples are thin",
            "method_history_citywide": method_history,
        },
        "city_totals": {
            "monsoon_budget_inr_2025": sum(w["monsoon_budget_inr_2025"] for w in out_wards),
            "spend_to_date_inr": sum(w["spend_to_date_inr"] for w in out_wards),
            "remaining_budget_inr": sum(w["remaining_budget_inr"] for w in out_wards),
        },
        "wards": out_wards,
    }


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data-dir", default=None, help="Directory holding the synthetic CSVs")
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR, help="Output directory for JSON feeds")
    args = parser.parse_args()

    data_dir = args.data_dir
    if data_dir is None:
        data_dir = next((d for d in DEFAULT_DATA_DIRS if os.path.isdir(d)), DEFAULT_DATA_DIRS[0])
    if not os.path.isdir(data_dir):
        print(f"error: data directory not found: {data_dir}", file=sys.stderr)
        return 1

    print(f"Reading synthetic dataset from {data_dir}")
    data = load_inputs(data_dir)
    print(
        f"  {len(data['wards'])} wards · {len(data['roads'])} road segments · "
        f"{len(data['work_orders'])} work orders · {len(data['rate_card'])} rate-card methods"
    )

    print("Building audit_flags.json …")
    audit = build_audit_flags(data)
    print(
        f"  {audit['summary']['flagged_orders']} flagged orders, "
        f"₹{audit['summary']['citywide_total_recoverable_inr']:,} recoverable citywide"
    )

    print("Building contractor_scores.json …")
    scores = build_contractor_scores(data)
    print(f"  {len(scores['contractors'])} contractors scored (raw + flood/weather adjusted)")

    print("Building ward_simulator.json …")
    simulator = build_ward_simulator(data)
    print(f"  {len(simulator['wards'])} wards with risk-ranked roads + simulator outcomes")

    write_json(args.out_dir, "audit_flags.json", audit)
    write_json(args.out_dir, "contractor_scores.json", scores)
    write_json(args.out_dir, "ward_simulator.json", simulator)
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
