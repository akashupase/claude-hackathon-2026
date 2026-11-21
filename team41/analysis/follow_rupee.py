"""Follow the Rupee: audit, fair scorecards and next-rupee plan for Mumbai monsoon road repairs.

Deterministic rules do the checking (the answer key rewards accuracy); Claude writes the
plain-language text on top of these numbers. All data is synthetic (Claude Impact Lab Mumbai).

Usage:  python analysis/follow_rupee.py      -> out/follow_the_rupee.json + out/audit_flags.csv
"""
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "data"
OUT = ROOT / "data"  # the app reads data/follow_the_rupee.json at runtime

# --- rules (documented on the page) --------------------------------------------------------
OVERBILL_RATIO = 1.35       # normal jobs vary 20-30% around the rate card; nothing sits in 1.30-1.35
DOUBLE_BILL_DAYS = 5        # repeat job, same road + method + contractor, no complaint, within N days
HEAVY_RAIN_MM = 64.5        # IMD "Heavy" threshold, mm/day
SURFACE_TYPES = {"Pothole", "Broken paver blocks", "Road cave-in"}


def load():
    t = lambda f, **k: pd.read_csv(D / f, **k)
    wo = t("work_orders.csv", parse_dates=["assigned_at", "work_started_at", "completed_at"])
    return dict(
        wo=wo, rc=t("rate_card.csv"), roads=t("roads.csv"), wards=t("wards.csv"),
        con=t("contractors.csv"), comp=t("complaints.csv", parse_dates=["received_at", "resolved_at"]),
        rain=t("rainfall_daily.csv", parse_dates=["date"]), tides=t("tides.csv", parse_dates=["date"]),
        flood=t("flood_hotspots.csv"), traffic=t("traffic.csv"), acc=t("accidents.csv"),
        fac=t("facilities.csv"), loc=t("localities.csv"), social=t("social_posts.csv"),
    )


def haversine_m(lat1, lon1, lat2, lon2):
    p = np.pi / 180
    a = (np.sin((lat2 - lat1) * p / 2) ** 2
         + np.cos(lat1 * p) * np.cos(lat2 * p) * np.sin((lon2 - lon1) * p / 2) ** 2)
    return 12742000 * np.arcsin(np.sqrt(a))


# --- 1. audit -------------------------------------------------------------------------------
def audit(x):
    wo, rc, roads = x["wo"].copy(), x["rc"], x["roads"]
    wo = wo.merge(rc, on="repair_method", how="left")
    wo["expected_inr"] = wo.standard_rate_inr * np.where(wo.unit == "per sqm", wo.area_sqm, 1)
    wo["cost_ratio"] = wo.cost_inr / wo.expected_inr
    wo = wo.merge(roads[["road_id", "road_name", "under_dlp", "last_resurfaced"]], on="road_id", how="left")
    wo["has_complaint"] = wo.linked_complaint_ids.notna()

    flags = []
    def add(r, kind, reason, at_risk, confidence="High", **facts):
        flags.append(dict(work_order_id=r.work_order_id, ward_code=r.ward_code, road_id=r.road_id,
                          road_name=r.road_name, contractor_name=r.contractor_name, flag=kind,
                          confidence=confidence, reason=reason, cost_inr=int(r.cost_inr),
                          inr_at_risk=int(round(at_risk)), method=r.repair_method, work_type=r.work_type, **facts))

    # a) over-billed vs rate card (High from 1.5x; 1.35-1.5x is Medium)
    for r in wo[wo.cost_ratio > OVERBILL_RATIO].itertuples():
        add(r, "Over-billed",
            f"Billed ₹{r.cost_inr:,.0f}, {r.cost_ratio:.1f}x the rate card (expected about ₹{r.expected_inr:,.0f} "
            f"for {r.repair_method.lower()}{f', {r.area_sqm} sqm' if r.unit == 'per sqm' else ''}).",
            r.cost_inr - r.expected_inr, "High" if r.cost_ratio >= 1.5 else "Medium",
            ratio=round(float(r.cost_ratio), 1), expected_inr=int(round(r.expected_inr)))

    # b) double billing: no complaint, same road + method + contractor as a real job a few days apart
    real = wo[wo.has_complaint]
    for r in wo[~wo.has_complaint].itertuples():
        o = real[(real.road_id == r.road_id) & (real.repair_method == r.repair_method)
                 & (real.contractor_id == r.contractor_id)]
        if o.empty:
            continue
        gap = (o.completed_at - r.completed_at).abs().dt.total_seconds() / 86400
        if gap.min() <= DOUBLE_BILL_DAYS:
            twin = o.loc[gap.idxmin()]
            add(r, "Possible double billing",
                f"No complaint linked. Same road, method and contractor as {twin.work_order_id}, "
                f"completed {gap.min():.0f} day(s) apart. Remark: “{r.engineer_remark}”.",
                r.cost_inr, twin=twin.work_order_id, gap_days=int(round(gap.min())))

    # c) BMC paid for a repair on a road still under the contractor's Defect Liability Period
    for r in wo[(wo.under_dlp == "Y") & (wo.cost_inr > 0)].itertuples():
        kind = "surface defect" if r.work_type in SURFACE_TYPES else "drainage/utility work on the road"
        add(r, "Paid during DLP",
            f"Road resurfaced {r.last_resurfaced} and still under its Defect Liability Period; "
            f"{r.work_type.lower()} ({kind}) should be fixed by the original contractor at no cost to BMC.",
            r.cost_inr, "High" if r.work_type in SURFACE_TYPES else "Medium", resurfaced=str(r.last_resurfaced))

    f = pd.DataFrame(flags)
    return wo, f


# --- 2. context: rain after the fix, low-lying wards ------------------------------------------
def add_context(x, wo):
    rain = x["rain"].groupby("date").rainfall_mm.max()          # worse of Santacruz / Colaba
    heavy_days = set(rain[rain >= HEAVY_RAIN_MM].index.normalize())
    def heavy_next_week(ts):
        d0 = ts.normalize()
        return any((d0 + pd.Timedelta(days=i)) in heavy_days for i in range(0, 8))
    wo["heavy_rain_after"] = wo.completed_at.apply(heavy_next_week)
    wards = x["wards"].set_index("ward_code")
    wo["low_lying"] = wo.ward_code.map(wards.low_lying_index)
    wo["low_lying_band"] = pd.cut(wo.low_lying, [-1, 0.4, 0.65, 2], labels=["low", "mid", "high"]).astype(str)
    return wo


def expected_rate(wo, outcome, keys):
    """Indirect standardisation: what rate would an average contractor get on this same mix of jobs?"""
    y = (wo[outcome] == "Y").astype(float)
    cell = y.groupby([wo[k] for k in keys]).transform("mean")
    return cell


# --- 3. fair contractor scorecards -------------------------------------------------------------
def scorecards(x, wo, flags):
    wo["exp_reopen"] = expected_rate(wo, "reopened_within_30d", ["repair_method", "low_lying_band", "heavy_rain_after"])
    wo["exp_sla"] = expected_rate(wo, "sla_met", ["work_type", "heavy_rain_after", "low_lying_band"])
    out = []
    fl = flags.groupby(["contractor_name", "flag"]).size().unstack(fill_value=0) if len(flags) else None
    for name, g in wo.groupby("contractor_name"):
        n = len(g)
        reopen, exp_r = (g.reopened_within_30d == "Y").mean(), g.exp_reopen.mean()
        sla, exp_s = (g.sla_met == "Y").mean(), g.exp_sla.mean()
        fr = fl.loc[name].to_dict() if fl is not None and name in fl.index else {}
        out.append(dict(
            contractor=name, contractor_id=g.contractor_id.iloc[0], jobs=n,
            billed_inr=int(g.cost_inr.sum()), wards=sorted(g.ward_code.unique().tolist()),
            sla_met_pct=round(100 * sla), sla_expected_pct=round(100 * exp_s),
            reopen_pct=round(100 * reopen), reopen_expected_pct=round(100 * exp_r),
            median_cost_ratio=round(float(g.cost_ratio.median()), 2),
            cold_mix_share_pct=round(100 * (g.repair_method == "Cold mix patch").mean()),
            heavy_rain_share_pct=round(100 * g.heavy_rain_after.mean()),
            low_lying_share_pct=round(100 * (g.low_lying_band == "high").mean()),
            evidence=flags[(flags.contractor_name == name) & (flags.flag != "Paid during DLP")]
                .sort_values("inr_at_risk", ascending=False).work_order_id.head(5).tolist() if len(flags) else [],
            flags={k: int(v) for k, v in fr.items()},
            inr_flagged=int(flags[flags.contractor_name == name].drop_duplicates("work_order_id").cost_inr.sum()) if len(flags) else 0,
        ))
    df = pd.DataFrame(out)
    # durability / speed vs expected, in percentage points (positive = better than expected)
    df["durability_vs_expected_pp"] = df.reopen_expected_pct - df.reopen_pct
    df["speed_vs_expected_pp"] = df.sla_met_pct - df.sla_expected_pct
    def grade(r):
        pts = 0
        pts += 2 if r.durability_vs_expected_pp >= 5 else (-2 if r.durability_vs_expected_pp <= -5 else 0)
        pts += 1 if r.speed_vs_expected_pp >= 5 else (-1 if r.speed_vs_expected_pp <= -5 else 0)
        overbill = r.flags.get("Over-billed", 0) + r.flags.get("Possible double billing", 0)
        pts -= 2 if overbill / r.jobs > 0.05 else (1 if overbill / r.jobs > 0.01 else 0)
        return "A" if pts >= 2 else "B" if pts >= 0 else "C" if pts >= -2 else "D"
    df["grade"] = df.apply(grade, axis=1)
    return df.sort_values("billed_inr", ascending=False)


# --- 4. connect complaints to roads and work orders ------------------------------------------
def connect(x, wo):
    comp, roads, loc = x["comp"].copy(), x["roads"].copy(), x["loc"]
    roads["mid_lat"] = (roads.start_lat + roads.end_lat) / 2
    roads["mid_lon"] = (roads.start_lon + roads.end_lon) / 2
    # geocode: GPS if present, else locality gazetteer (name or alias), else ward only
    alias = {}
    for r in loc.itertuples():
        for a in [r.locality] + (str(r.aliases).split(";") if isinstance(r.aliases, str) else []):
            alias[a.strip().lower()] = (r.lat, r.lon, r.ward_code)
    def geo(r):
        if pd.notna(r.lat) and pd.notna(r.lon):
            return r.lat, r.lon, r.ward_code, "gps"
        t = str(r.locality_text).strip().lower()
        hit = alias.get(t) or next((v for k, v in alias.items() if k and (k in t or t in k) and len(t) > 2), None)
        if hit:
            return hit[0], hit[1], r.ward_code if isinstance(r.ward_code, str) else hit[2], "locality"
        return np.nan, np.nan, r.ward_code, "none"
    g = comp.apply(geo, axis=1, result_type="expand")
    comp[["g_lat", "g_lon", "g_ward", "geo_via"]] = g
    # nearest road segment in the same ward
    comp["road_id"] = None
    for w, grp in comp[comp.g_lat.notna()].groupby("g_ward"):
        rw = roads[roads.ward_code == w] if isinstance(w, str) else roads
        if rw.empty:
            rw = roads
        dist = haversine_m(grp.g_lat.values[:, None], grp.g_lon.values[:, None],
                           rw.mid_lat.values[None, :], rw.mid_lon.values[None, :])
        comp.loc[grp.index, "road_id"] = rw.road_id.values[dist.argmin(axis=1)]
    c2wo = wo[["work_order_id", "linked_complaint_ids"]].dropna().assign(
        complaint_id=lambda d: d.linked_complaint_ids.str.split("|")).explode("complaint_id")
    comp["work_order_id"] = comp.complaint_id.map(c2wo.drop_duplicates("complaint_id").set_index("complaint_id").work_order_id)
    comp["linked_to_wo"] = comp.work_order_id.notna()
    # re-read the issue from the text (stand-in for Claude: en / hi / mr keywords); ~18% are mis-filed
    comp["issue_type"] = comp.apply(lambda r: classify(r.description, r.category_reported), axis=1)
    comp["recategorised"] = comp.issue_type != comp.category_reported
    comp["never_fixed"] = comp.status.isin(["Open", "In Progress"]) & ~comp.linked_to_wo
    stats = dict(
        total=len(comp), languages=comp.language.value_counts().to_dict(),
        duplicates=int((comp.status == "Closed - Duplicate").sum()),
        linked_to_work_order=int(comp.linked_to_wo.sum()),
        open_not_fixed=int(comp.never_fixed.sum()),
        forwarded_or_rejected=int(comp.status.str.startswith(("Forwarded", "Rejected")).sum()),
        geocoded=comp.geo_via.value_counts().to_dict(),
        recategorised=int(comp.recategorised.sum()),
    )
    return comp, stats


ISSUE_WORDS = [  # order matters: most specific first
    ("Open or broken manhole", ["manhole", "chamber", "झाकण", "ढक्कन", "मैनहोल", "मॅनहोल", "gutter cover", "lid"]),
    ("Road cave-in", ["cave", "caved", "sinkhole", "खचला", "खचली", "धंस", "धस", "collapsed", "crater"]),
    ("Broken paver blocks", ["paver", "पेव्हर", "पेवर", "blocks"]),
    ("Choked drain / nullah overflow", ["drain", "nullah", "nala", "गटार", "नाला", "नाली", "sewer", "overflow"]),
    ("Waterlogging", ["waterlog", "flood", "water logging", "पाणी साचले", "पानी भर", "जलभराव", "knee", "submerged", "पाणी"]),
    ("Pothole", ["pothole", "potholes", "खड्डा", "खड्डे", "गड्ढा", "गड्ढे", "khadda", "gaddha", "crack", "patch"]),
]


def classify(text, reported):
    """Keep the citizen's category when the text supports it; change it only when the text
    clearly points to exactly one other issue. Vague categories fall back to the first match."""
    t = str(text).lower()
    hits = [issue for issue, words in ISSUE_WORDS if any(w in t for w in words)]
    vague = reported in ("Road related", "Other")
    if not vague and (reported in hits or len(hits) != 1):
        return reported
    return hits[0] if hits else reported


# --- complaints -> issues -> work orders, per ward --------------------------------------------
def trail(wo, comp):
    out = {}
    for w, g in comp.groupby("g_ward"):
        fixed = wo[(wo.ward_code == w) & wo.linked_complaint_ids.notna()]
        open_issues = g[g.never_fixed].groupby(["road_id", "issue_type"], dropna=False).size()
        out[w] = dict(
            complaints=len(g), duplicates=int((g.status == "Closed - Duplicate").sum()),
            not_bmc=int(g.status.str.startswith(("Forwarded", "Rejected")).sum()),
            recategorised=int(g.recategorised.sum()),
            issues_fixed=len(fixed), held=int((fixed.reopened_within_30d == "N").sum()),
            failed=int((fixed.reopened_within_30d == "Y").sum()),
            issues_open=int(len(open_issues)), complaints_open=int(g.never_fixed.sum()),
            jobs_without_complaint=int(((wo.ward_code == w) & wo.linked_complaint_ids.isna()).sum()),
        )
    return out


POST_KINDS = [  # (kind, words) checked in order; social posts are a signal, never proof
    ("noise", ["unverified", "fwd as received", "good morning", "gm all", "school band"]),
    ("sarcasm", ["swimming pool", "😂", "mast ", "waah", "congratulations bmc"]),
    ("thanks", ["thank", "thanks", "dhanyavad", "धन्यवाद", "आभार", "shukriya", "👏"]),
    ("report", ["pothole", "gaddha", "gadda", "खड्डा", "खड्डे", "गड्ढा", "manhole", "paani", "pani", "पाणी", "पानी",
                "flood", "waterlog", "drain", "nala", "cave", "open", "broken", "phir se", "again"]),
]


def social(x, comp):
    s, loc = x["social"].copy(), x["loc"]
    def kind(t):
        t = str(t).lower()
        for k, words in POST_KINDS:
            if any(w in t for w in words):
                return k
        return "noise"
    s["kind"] = s.text.apply(kind)
    names = []
    for r in loc.itertuples():
        for a in [r.locality] + (str(r.aliases).split(";") if isinstance(r.aliases, str) else []):
            a = a.strip()
            if len(a) > 3:
                names.append((a.lower(), r.locality, r.ward_code))
    names.sort(key=lambda n: -len(n[0]))
    def place(t):
        t = str(t).lower()
        return next(((l, w) for a, l, w in names if a in t), (None, None))
    s[["locality", "ward_code"]] = s.text.apply(lambda t: pd.Series(place(t)))
    s["posted"] = pd.to_datetime(s.posted_at)
    # a problem post with no complaint from the same locality within 3 days = BMC may never have heard of it
    comp_loc = comp.assign(loc_lc=comp.locality_text.str.lower())
    def unreported(r):
        if r.kind not in ("report", "sarcasm") or not r.locality:
            return False
        near = comp_loc[(comp_loc.g_ward == r.ward_code) & (comp_loc.loc_lc.str.contains(r.locality.lower(), regex=False, na=False))]
        return not ((near.received_at - r.posted).abs() <= pd.Timedelta(days=3)).any()
    s["unreported"] = s.apply(unreported, axis=1)
    out = {}
    for w, g in s[s.ward_code.notna()].groupby("ward_code"):
        top = g[g.kind != "noise"].sort_values("likes_or_forwards", ascending=False).head(4)
        out[w] = dict(posts=len(g), reports=int((g.kind == "report").sum()), sarcasm=int((g.kind == "sarcasm").sum()),
                      thanks=int((g.kind == "thanks").sum()), noise=int((g.kind == "noise").sum()),
                      unreported=int(g.unreported.sum()), reach=int(g.likes_or_forwards.sum()),
                      top=[dict(kind=r.kind, source=r.source, text=r.text, reach=int(r.likes_or_forwards),
                                date=str(r.posted_at)[:10], unreported=bool(r.unreported)) for r in top.itertuples()])
    stats = dict(total=len(s), kinds=s.kind.value_counts().to_dict(), placed=int(s.ward_code.notna().sum()),
                 unreported=int(s.unreported.sum()), sources=s.source.value_counts().to_dict())
    return out, stats


def lookups(wo, comp, flags):
    fl = flags.groupby("work_order_id").flag.apply(lambda s: ", ".join(sorted(set(s))))
    first = comp.dropna(subset=["work_order_id"]).sort_values("received_at").drop_duplicates("work_order_id").set_index("work_order_id")
    t = lambda v: str(v)[:16] if pd.notna(v) else ""
    W = {r.work_order_id: [r.ward_code, r.road_name, r.repair_method, r.contractor_name.replace(" (synthetic)", ""),
                           int(r.cost_inr), str(r.completed_at)[:10], r.sla_met, r.reopened_within_30d,
                           fl.get(r.work_order_id, ""),
                           # timeline: first complaint, assigned, started, completed; proof = photo description
                           t(first.received_at.get(r.work_order_id)), t(r.assigned_at), t(r.work_started_at), t(r.completed_at),
                           str(first.photo_description.get(r.work_order_id, "") or ""), r.sla_hours, str(r.engineer_remark or "")]
         for r in wo.itertuples()}
    C = {r.complaint_id: [r.g_ward if isinstance(r.g_ward, str) else "", str(r.received_at)[:10], r.issue_type,
                          r.language, r.status, str(r.description)[:160], r.work_order_id if isinstance(r.work_order_id, str) else ""]
         for r in comp.itertuples()}
    return W, C


# --- 5. next rupee ----------------------------------------------------------------------------
# --- cross-file connections -------------------------------------------------------------------
RAIN_EXCUSE_MM = 15          # "Rain delayed work" but no day of the job had more than this


def connections(x, wo, comp):
    """Links across files that are not obvious from any one CSV."""
    acc, rain, tides, flood, roads, wards, fac = x["acc"], x["rain"], x["tides"], x["flood"], x["roads"], x["wards"], x["fac"]
    R = rain.groupby("date").rainfall_mm.max()

    # 1. accidents (accidents.csv) on a road while a citizen complaint (complaints.csv) waited for its repair (work_orders.csv)
    first = comp.set_index("complaint_id").received_at
    wc = wo.dropna(subset=["linked_complaint_ids"])[["work_order_id", "road_id", "linked_complaint_ids", "completed_at",
                                                      "sla_met", "contractor_name", "ward_code"]].copy()
    wc["waiting_since"] = wc.linked_complaint_ids.str.split("|").apply(lambda ids: min(first.get(i, pd.NaT) for i in ids))
    a = acc.assign(occurred=pd.to_datetime(acc.occurred_at))
    a = a[a.probable_cause.str.contains("Pothole|Waterlog|Uneven", case=False, na=False)]
    m = a.merge(wc, on="road_id", suffixes=("", "_wo"))
    m = m[(m.occurred >= m.waiting_since) & (m.occurred <= m.completed_at)]
    m = m.sort_values("waiting_since").drop_duplicates("accident_id")
    m = m.merge(roads[["road_id", "road_name"]], on="road_id", how="left")
    m["days_waiting"] = ((m.occurred - m.waiting_since).dt.total_seconds() / 86400).round(1)
    pending = [dict(accident_id=r.accident_id, date=str(r.occurred)[:10], ward_code=r.ward_code_wo, road_id=r.road_id, road=r.road_name,
                    severity=r.severity, vehicle=r.vehicle_type, cause=r.probable_cause, work_order_id=r.work_order_id,
                    waiting_since=str(r.waiting_since)[:10], days_waiting=float(r.days_waiting), sla_met=r.sla_met,
                    contractor=r.contractor_name.replace(" (synthetic)", "")) for r in m.itertuples()]

    # 2. "Rain delayed work" remarks (work_orders.csv) checked against rainfall_daily.csv
    rd = wo[wo.engineer_remark.str.contains("Rain delayed", na=False)].copy()
    rd["max_rain_mm"] = rd.apply(lambda r: max(R.get(d, 0) for d in pd.date_range(r.assigned_at.normalize(), r.completed_at.normalize())), axis=1)
    weak = rd[(rd.max_rain_mm < RAIN_EXCUSE_MM) & (rd.sla_met == "N")]
    excuses = [dict(work_order_id=r.work_order_id, ward_code=r.ward_code, contractor=r.contractor_name.replace(" (synthetic)", ""),
                    assigned=str(r.assigned_at)[:10], completed=str(r.completed_at)[:10], max_rain_mm=float(r.max_rain_mm))
               for r in weak.itertuples()]

    # 3. flood watch: rainfall x tides.csv x flood_hotspots.csv; pump spend nearby from work_orders.csv + roads.csv
    T = tides.groupby("date").agg(height=("height_m", "max"), big=("big_tide_flag", lambda s: (s == "Y").any()))
    rs = rain.pivot_table(index="date", columns="station", values="rainfall_mm")
    big_days = T[T.big].index
    roads_mid = roads.assign(mid_lat=(roads.start_lat + roads.end_lat) / 2, mid_lon=(roads.start_lon + roads.end_lon) / 2)
    pumpish = wo[wo.repair_method.isin(["Dewatering pump deployed", "Pump + debris removal"])]
    hotspots = []
    for h in flood.itertuples():
        st = "Colaba" if h.lat < 19.0 else "Santacruz"
        heavy = rs[st] >= h.flood_threshold_mm_per_day
        compound = int((heavy & heavy.index.isin(big_days)).sum()) if h.tide_sensitive == "Y" else 0
        near = roads_mid[haversine_m(h.lat, h.lon, roads_mid.mid_lat, roads_mid.mid_lon) <= 600].road_id
        spend = pumpish[pumpish.road_id.isin(near)]
        hotspots.append(dict(name=h.name, ward_code=h.ward_code, tide_sensitive=h.tide_sensitive == "Y",
                             pump_station=str(h.pumping_station_nearby).upper().startswith("Y"),
                             threshold_mm=float(h.flood_threshold_mm_per_day), flood_days=int(heavy.sum()),
                             flood_days_with_big_tide=compound, avg_depth_cm=float(h.avg_water_depth_cm),
                             recession_h=float(h.avg_recession_hours), years_flagged=int(h.years_flagged_last_5),
                             pump_jobs=len(spend), pump_spend_inr=int(spend.cost_inr.sum())))
    calendar = [dict(date=str(d)[:10], height_m=float(T.at[d, "height"])) for d in big_days]
    wl = comp[comp.issue_type == "Waterlogging"].received_at.dt.normalize().value_counts()
    day = pd.DataFrame({"rain": R, "big": T.big}).fillna({"big": False})
    day["wl"] = day.index.map(wl).fillna(0)
    day["heavy"] = day.rain >= HEAVY_RAIN_MM
    tide_effect = dict(heavy_only=round(float(day[day.heavy & ~day.big].wl.mean()), 1),
                       heavy_and_big_tide=round(float(day[day.heavy & day.big].wl.mean()), 1),
                       dry=round(float(day[~day.heavy].wl.mean()), 1))

    # 4. crew capacity (wards.csv engineering_crews) vs deadlines met
    load = wo.groupby("ward_code").agg(jobs=("work_order_id", "size")).join(wards.set_index("ward_code").engineering_crews)
    load["jobs_per_crew"] = (load.jobs / load.engineering_crews).round(1)

    # 5. emergency hospitals (facilities.csv) -> ambulance roads
    em = fac[(fac.type == "Hospital") & fac.emergency_services.astype(str).str.upper().str.startswith("Y")]
    return dict(pending=pending, excuses=excuses, hotspots=hotspots, calendar=calendar, tide_effect=tide_effect,
                jobs_per_crew=load.jobs_per_crew.to_dict(), crews=load.engineering_crews.to_dict(),
                emergency_roads=set(em.ambulance_entry_road), emergency_names=em.groupby("ambulance_entry_road").name.apply("; ".join).to_dict())


def next_rupee(x, wo, comp, flags, cx):
    roads, flood, traffic, acc, fac, wards = x["roads"].copy(), x["flood"], x["traffic"], x["acc"], x["fac"], x["wards"]
    roads["mid_lat"] = (roads.start_lat + roads.end_lat) / 2
    roads["mid_lon"] = (roads.start_lon + roads.end_lon) / 2
    open_c = comp[comp.never_fixed & comp.road_id.notna() & ~comp.issue_type.isin(["Road related", "Other"])]
    oc = open_c.groupby("road_id").agg(open_complaints=("complaint_id", "size"), upvotes=("upvotes", "sum"),
                                        top_category=("issue_type", lambda s: s.mode().iat[0]))
    r = roads.merge(oc, left_on="road_id", right_index=True, how="inner")
    r = r.merge(traffic, on="road_id", how="left")
    d = haversine_m(r.mid_lat.values[:, None], r.mid_lon.values[:, None], flood.lat.values[None, :], flood.lon.values[None, :])
    r["near_flood_hotspot"] = np.where(d.min(axis=1) <= 500, flood.name.values[d.argmin(axis=1)], "")
    bad = acc[acc.probable_cause.str.contains("Pothole|Waterlog|Uneven", case=False, na=False)]
    r["road_accidents"] = r.road_id.map(bad.groupby("road_id").size()).fillna(0).astype(int)
    r["fatal_or_grievous"] = r.road_id.map(bad[bad.severity.isin(["Fatal", "Grievous"])].groupby("road_id").size()).fillna(0).astype(int)
    fa = fac.groupby("ambulance_entry_road").agg(facilities=("name", lambda s: "; ".join(s)),
                                                  hospital=("type", lambda s: (s == "Hospital").any()))
    r = r.merge(fa, left_on="road_id", right_index=True, how="left")
    r["facilities"] = r.facilities.fillna("")
    r["hospital"] = r.hospital.fillna(False).astype(bool)
    r["reopen_history"] = r.road_id.map(wo[wo.reopened_within_30d == "Y"].groupby("road_id").size()).fillna(0).astype(int)
    norm = lambda s: (s - s.min()) / (s.max() - s.min() + 1e-9)
    hs = {h["name"]: h for h in cx["hotspots"]}
    r["emergency_road"] = r.road_id.isin(cx["emergency_roads"])
    pend_roads = {}
    for p in cx["pending"]:
        pend_roads[p["road_id"]] = pend_roads.get(p["road_id"], 0) + 1
    r["accidents_while_pending"] = r.road_id.map(pend_roads).fillna(0).astype(int)
    r["tide_no_pump"] = r.near_flood_hotspot.map(lambda n: bool(n) and hs[n]["tide_sensitive"] and not hs[n]["pump_station"])
    base = (25 * norm(np.log1p(r.open_complaints + r.upvotes / 10))
            + 15 * (r.near_flood_hotspot != "") + 5 * r.tide_no_pump
            + 15 * norm(r.congestion_index_0_10.fillna(0)) + 5 * (r.bus_route == "Y")
            + 15 * norm(r.road_accidents + 2 * r.fatal_or_grievous)
            + 10 * r.hospital + 5 * (r.facilities != "")
            + 10 * norm(r.reopen_history))
    # non-linear: some risks multiply the rest instead of adding to them
    mult = np.where(r.emergency_road, 2.0, 1.0) * np.where(r.accidents_while_pending > 0, 1.5, 1.0)
    raw = base * mult
    r["risk"] = (100 * raw / raw.max()).round(1)
    r["multiplier"] = mult

    # method: most durable proven method for the issue; cost from typical job size x rate card
    m = wo.groupby(["work_type", "repair_method"]).agg(n=("work_order_id", "size"),
                                                        reopen=("reopened_within_30d", lambda s: (s == "Y").mean()),
                                                        area=("area_sqm", "median")).reset_index()
    m = m[m.n >= 30].merge(x["rc"], on="repair_method")
    m["est_cost"] = m.standard_rate_inr * np.where(m.unit == "per sqm", m.area, 1)
    best = m.sort_values("reopen").groupby("work_type").head(1).set_index("work_type")
    r["issue_type"] = r.top_category
    r["method"] = r.issue_type.map(best.repair_method)
    r["method_reopen_pct"] = (100 * r.issue_type.map(best.reopen)).round()
    r["est_cost_inr"] = r.issue_type.map(best.est_cost).round(-2)
    r.loc[r.under_dlp == "Y", ["est_cost_inr"]] = 0
    r["action"] = np.where(r.under_dlp == "Y", "Send to original contractor (under DLP, ₹0 to BMC)",
                           "Fix with " + r.method.str.lower())
    # repeated failures: patching keeps failing, so flag the segment for resurfacing in the capital budget
    surface = r.issue_type.isin(list(SURFACE_TYPES))
    r.loc[surface & (r.reopen_history >= 3) & (r.under_dlp != "Y"), "action"] = (
        r.action + "; failed " + r.reopen_history.astype(str) + "x before, so list it for resurfacing")
    def why(row):
        bits = [f"{row.open_complaints} open complaint{'s' if row.open_complaints != 1 else ''}"]
        if row.emergency_road: bits.append(f"ambulance road to {cx['emergency_names'].get(row.road_id, 'an emergency hospital')} (priority x2)")
        if row.accidents_while_pending: bits.append(f"{row.accidents_while_pending} accident(s) while a complaint waited for repair (priority x1.5)")
        if row.near_flood_hotspot: bits.append(f"near {row.near_flood_hotspot} flood spot" + (" (tide-sensitive, no pump)" if row.tide_no_pump else ""))
        if row.road_accidents: bits.append(f"{row.road_accidents} road-condition accident{'s' if row.road_accidents != 1 else ''}")
        if row.hospital and not row.emergency_road: bits.append("access road to a hospital")
        elif row.facilities and not row.emergency_road: bits.append("access road to a school")
        if row.congestion_index_0_10 and row.congestion_index_0_10 >= 7: bits.append(f"congestion {row.congestion_index_0_10:.0f}/10")
        if row.reopen_history: bits.append(f"fixed before and failed {row.reopen_history}x")
        return "; ".join(bits)
    r["why"] = r.apply(why, axis=1)

    spend = wo.groupby("ward_code").cost_inr.sum()
    # money that could come back: per job, the largest recoverable amount across its flags
    rec = flags.groupby(["ward_code", "work_order_id"]).inr_at_risk.max().groupby("ward_code").sum()
    plans = {}
    for w in wards.itertuples():
        rr = r[r.ward_code == w.ward_code].sort_values("risk", ascending=False)
        left = int(w.monsoon_repair_budget_inr_2025 - spend.get(w.ward_code, 0))
        recoverable = int(rec.get(w.ward_code, 0))
        running, items = 0, []
        for q in rr.head(10).itertuples():
            running += q.est_cost_inr
            fund = ("budget" if running <= max(left, 0) else
                    "recovered money" if running <= max(left, 0) + recoverable else "next allocation")
            items.append(dict(road_id=q.road_id, road=f"{q.road_name} (seg {q.segment_no})", risk=float(q.risk),
                              issue=q.issue_type, action=q.action, est_cost_inr=int(q.est_cost_inr),
                              running_inr=int(running), funded_by=fund, why=q.why,
                              act="dlp" if q.under_dlp == "Y" else ("resurface" if "resurfacing" in q.action else "fix"),
                              method=q.method, open_complaints=int(q.open_complaints), emergency=bool(q.emergency_road),
                              accidents_pending=int(q.accidents_while_pending), flood_spot=q.near_flood_hotspot,
                              tide_no_pump=bool(q.tide_no_pump), accidents=int(q.road_accidents),
                              hospital=bool(q.hospital), school=bool(q.facilities != "" and not q.hospital),
                              congestion=float(q.congestion_index_0_10 or 0), failed_before=int(q.reopen_history)))
        plans[w.ward_code] = dict(budget_left_inr=left, recoverable_inr=recoverable,
                                  plan_total_inr=int(running), items=items)
    return plans


# --- 6. ward money trail ----------------------------------------------------------------------
def actions(w, f, plan, tr):
    """What the ward officer can do this week, in plain words."""
    a = []
    hi = f[(f.confidence == "High") & (f.flag != "Paid during DLP")].drop_duplicates("work_order_id")
    if len(hi):
        a.append(f"Hold payment and verify {len(hi)} high-confidence billing flag{'s' if len(hi) != 1 else ''} "
                 f"(₹{hi.inr_at_risk.sum():,.0f} at stake) before the next bill is cleared.")
    dl = f[f.flag == "Paid during DLP"]
    if len(dl):
        a.append(f"Write to the original contractors of {dl.road_id.nunique()} road(s) still under DLP: "
                 f"{len(dl)} repairs were paid for (₹{dl.cost_inr.sum():,.0f}) that they owed for free. Recover or adjust.")
    fixes = [i for i in plan["items"] if i["funded_by"] != "next allocation"][:5]
    if fixes:
        a.append(f"Fix these {len(fixes)} roads first: " + "; ".join(i["road"] for i in fixes)
                 + f" (about ₹{sum(i['est_cost_inr'] for i in fixes):,.0f}).")
    if tr.get("complaints_open"):
        a.append(f"Reply to {tr['complaints_open']} citizens whose complaints are still open with no repair "
                 f"({tr['issues_open']} distinct problems once duplicates are grouped).")
    return a


def more_actions(w, pend, exc, hot, jpc, city_jpc):
    a = []
    serious = [p for p in pend if p["severity"] in ("Fatal", "Grievous")]
    if pend:
        a.append(f"Review {len(pend)} road accident(s) that happened while a citizen complaint was waiting for repair"
                 + (f", {len(serious)} of them fatal or grievous" if serious else "") + ". Find out why those repairs waited.")
    if exc:
        a.append(f"Ask for evidence on {len(exc)} late job(s) explained as 'Rain delayed work' when no day of the job had more than {RAIN_EXCUSE_MM} mm of rain.")
    watch = [h for h in hot if h["tide_sensitive"] and not h["pump_station"]]
    if watch:
        a.append("On big-tide days with heavy rain, put pumps at " + ", ".join(h["name"] for h in watch)
                 + " in advance (tide-sensitive, no pumping station).")
    if jpc and city_jpc and jpc > 1.25 * city_jpc:
        a.append(f"Ask the zone for more repair crews: {jpc:.0f} jobs per crew here against {city_jpc:.0f} across the city. Late repairs here are partly a capacity problem.")
    return a


def ward_trail(x, wo, flags, comp, plans, trails, cx):
    wards = x["wards"]
    out = []
    fl = flags.drop_duplicates("work_order_id")
    city_jpc = float(np.median(list(cx["jobs_per_crew"].values())))
    for w in wards.itertuples():
        g = wo[wo.ward_code == w.ward_code]
        f = flags[flags.ward_code == w.ward_code]
        c = comp[comp.g_ward == w.ward_code]
        tr = trails.get(w.ward_code, {})
        pend = [p for p in cx["pending"] if p["ward_code"] == w.ward_code]
        exc = [e for e in cx["excuses"] if e["ward_code"] == w.ward_code]
        hot = [h for h in cx["hotspots"] if h["ward_code"] == w.ward_code]
        jpc = cx["jobs_per_crew"].get(w.ward_code)
        out.append(dict(
            pending_accidents=pend, rain_excuses=exc, hotspots=hot,
            crews=int(cx["crews"].get(w.ward_code, 0)), jobs_per_crew=jpc, city_jobs_per_crew=city_jpc,
            extra_actions=more_actions(w, pend, exc, hot, jpc, city_jpc),
            reopen_pct=round(100 * (g.reopened_within_30d == "Y").mean()), reopen_expected_pct=round(100 * g.exp_reopen.mean()),
            sla_expected_pct=round(100 * g.exp_sla.mean()), heavy_rain_share_pct=round(100 * g.heavy_rain_after.mean()),
            trail=tr, actions=actions(w, f, plans[w.ward_code], tr),
            ward_code=w.ward_code, ward_name=w.ward_name, zone=w.zone, office=w.assistant_commissioner_office,
            low_lying_index=w.low_lying_index, population=int(w.population_est),
            budget_inr=int(w.monsoon_repair_budget_inr_2025), spent_inr=int(g.cost_inr.sum()), jobs=len(g),
            by_method={k: int(v) for k, v in g.groupby("repair_method").cost_inr.sum().sort_values(ascending=False).items()},
            by_contractor={k: int(v) for k, v in g.groupby("contractor_name").cost_inr.sum().sort_values(ascending=False).items()},
            failed_30d_inr=int(g[g.reopened_within_30d == "Y"].cost_inr.sum()),
            failed_30d_jobs=int((g.reopened_within_30d == "Y").sum()),
            sla_met_pct=round(100 * (g.sla_met == "Y").mean()) if len(g) else None,
            flagged_inr=int(fl[fl.ward_code == w.ward_code].cost_inr.sum()),
            flag_counts=f.flag.value_counts().to_dict(),
            complaints=len(c), complaints_open_not_fixed=int(c.never_fixed.sum()),
            next_rupee=plans[w.ward_code],
        ))
    return out


def main():
    OUT.mkdir(exist_ok=True)
    x = load()
    wo, flags = audit(x)
    wo = add_context(x, wo)
    sc = scorecards(x, wo, flags)
    comp, cstats = connect(x, wo)
    cx = connections(x, wo, comp)
    plans = next_rupee(x, wo, comp, flags, cx)
    trails = trail(wo, comp)
    wards = ward_trail(x, wo, flags, comp, plans, trails, cx)
    for w in wards:
        w["actions"] = w["actions"] + w.pop("extra_actions")
    # contractors.csv: context only (80% of jobs fall outside the listed wards for every contractor,
    # with no difference in failure rate, so it is a data-quality note, not an audit flag)
    con = x["con"].set_index("contractor_id")
    listed = {k: {s.strip() for s in v.split(";")} for k, v in con.active_wards.items()}
    out_share = wo.assign(o=[wd not in listed[c] for wd, c in zip(wo.ward_code, wo.contractor_id)]).groupby("contractor_id").o.mean()
    sc["empanelled_since"] = sc.contractor_id.map(con.empanelled_since)
    sc["listed_wards"] = sc.contractor_id.map(lambda c: sorted(listed[c]))
    sc["outside_listed_pct"] = sc.contractor_id.map((100 * out_share).round())
    # roads.geojson: per-segment status for the map
    rs = wo.groupby("road_id").agg(jobs=("work_order_id", "size"), spend=("cost_inr", "sum"),
                                    failed=("reopened_within_30d", lambda s: int((s == "Y").sum())))
    rs["flagged"] = rs.index.map(flags.drop_duplicates("work_order_id").groupby("road_id").size()).fillna(0).astype(int)
    rs["open"] = rs.index.map(comp[comp.never_fixed].groupby("road_id").size()).fillna(0).astype(int)
    road_geo = json.loads((D / "roads.geojson").read_text())
    for f in road_geo["features"]:
        s = rs.loc[f["properties"]["road_id"]] if f["properties"]["road_id"] in rs.index else None
        f["properties"].update(dict(jobs=int(s.jobs), spend=int(s.spend), failed=int(s.failed), flagged=int(s.flagged), open=int(s.open))
                               if s is not None else dict(jobs=0, spend=0, failed=0, flagged=0, open=0))
        f["properties"]["emergency"] = f["properties"]["road_id"] in cx["emergency_roads"]
    W, C = lookups(wo, comp, flags)
    soc, soc_stats = social(x, comp)
    for w in wards:
        w["social"] = soc.get(w["ward_code"], {})
        w["money_at_issue_pct"] = round(100 * (w["flagged_inr"] + w["failed_30d_inr"]) / max(w["spent_inr"], 1))
        g = wo[wo.ward_code == w["ward_code"]]
        flagged_ids = set(flags[flags.ward_code == w["ward_code"]].work_order_id)
        fl_m = g.work_order_id.isin(flagged_ids)
        w["outcome_inr"] = dict(flagged=int(g[fl_m].cost_inr.sum()),
                                failed=int(g[~fl_m & (g.reopened_within_30d == "Y")].cost_inr.sum()),
                                held=int(g[~fl_m & (g.reopened_within_30d == "N")].cost_inr.sum()))
    heat = comp[comp.g_lat.notna()][["g_lat", "g_lon", "never_fixed"]]
    points = [[round(a, 4), round(b, 4), int(c)] for a, b, c in heat.itertuples(index=False)]
    geo = json.loads((D / "wards.geojson").read_text())
    flags.sort_values(["flag", "inr_at_risk"], ascending=[True, False]).to_csv(OUT / "audit_flags.csv", index=False)
    fl_u = flags.drop_duplicates("work_order_id")
    summary = dict(
        total_spend_inr=int(wo.cost_inr.sum()), total_budget_inr=int(x["wards"].monsoon_repair_budget_inr_2025.sum()),
        jobs=len(wo), contractors=int(wo.contractor_id.nunique()),
        flagged_jobs=int(fl_u.shape[0]), flagged_inr=int(fl_u.cost_inr.sum()),
        flag_counts=flags.flag.value_counts().to_dict(),
        flag_inr={k: int(v) for k, v in flags.groupby("flag").inr_at_risk.sum().items()},
        failed_30d_inr=int(wo[wo.reopened_within_30d == "Y"].cost_inr.sum()),
        failed_30d_jobs=int((wo.reopened_within_30d == "Y").sum()),
        method_reopen_pct={k: round(100 * v) for k, v in wo.groupby("repair_method").reopened_within_30d.apply(lambda s: (s == "Y").mean()).items()},
        complaints=cstats,
        rules=dict(overbill_ratio=OVERBILL_RATIO, double_bill_days=DOUBLE_BILL_DAYS, heavy_rain_mm=HEAVY_RAIN_MM),
    )
    flag_rows = flags.sort_values("inr_at_risk", ascending=False)[
        ["work_order_id", "ward_code", "road_name", "contractor_name", "flag", "confidence", "reason", "cost_inr", "inr_at_risk",
         "method", "work_type", "ratio", "expected_inr", "twin", "gap_days", "resurfaced"]]
    summary["flag_confidence"] = flags.confidence.value_counts().to_dict()
    summary["social"] = soc_stats
    summary["spend_by_method"] = {k: int(v) for k, v in wo.groupby("repair_method").cost_inr.sum().sort_values(ascending=False).items()}
    # cost per fix that lasts 30 days, by method, for each issue type (shown on the Next rupee page)
    econ = {}
    for wt, g in wo.groupby("work_type"):
        rows = []
        for m, h in g.groupby("repair_method"):
            if len(h) < 30:
                continue
            fail = float((h.reopened_within_30d == "Y").mean())
            rows.append(dict(method=m, jobs=len(h), avg_cost_inr=int(h.cost_inr.mean()), fail_pct=round(100 * fail),
                             cost_per_lasting_fix_inr=int(h.cost_inr.mean() / max(1e-9, 1 - fail))))
        if len(rows) > 1:
            econ[wt] = sorted(rows, key=lambda r: r["cost_per_lasting_fix_inr"])
    summary["method_economics"] = econ
    pend = cx["pending"]
    summary["connections"] = dict(
        accidents_while_pending=len(pend), pending_fatal=sum(p["severity"] == "Fatal" for p in pend),
        pending_grievous=sum(p["severity"] == "Grievous" for p in pend), pending_sla_missed=sum(p["sla_met"] == "N" for p in pend),
        rain_excuses=len(cx["excuses"]), rain_excuse_mm=RAIN_EXCUSE_MM,
        tide_effect=cx["tide_effect"], big_tide_days=len(cx["calendar"]),
        hotspots=len(cx["hotspots"]), tide_sensitive=sum(h["tide_sensitive"] for h in cx["hotspots"]),
        tide_no_pump=sum(h["tide_sensitive"] and not h["pump_station"] for h in cx["hotspots"]),
        emergency_roads=len(cx["emergency_roads"]),
        jobs_per_crew_vs_sla_corr=round(float(pd.Series(cx["jobs_per_crew"]).corr(
            wo.groupby("ward_code").sla_met.apply(lambda s: (s == "Y").mean()))), 2),
        outside_listed_wards_pct=round(float(100 * np.mean([wd not in listed[c] for wd, c in zip(wo.ward_code, wo.contractor_id)]))),
    )
    summary["files_used"] = sorted(p.name for p in D.glob("*.csv") if p.name != "complaints_sample_200.csv") + ["roads.geojson", "wards.geojson"]
    import sys; sys.path.insert(0, str(Path(__file__).resolve().parent))
    from scorecard_text import SCORECARD_TEXT  # plain-language text written by Claude
    sc["text"] = sc.contractor.map(SCORECARD_TEXT).fillna("")
    sc["short"] = sc.contractor.str.replace(" (synthetic)", "", regex=False)
    data = dict(summary=summary, contractors=json.loads(sc.to_json(orient="records")), wards=wards,
                flags=json.loads(flag_rows.to_json(orient="records")), W=W, C=C, heat=points, geo=geo,
                roads_geo=road_geo, calendar=cx["calendar"], pending=pend)
    (OUT / "follow_the_rupee.json").write_text(json.dumps(data, ensure_ascii=False, indent=1, default=str))
    print(json.dumps(summary, indent=1, ensure_ascii=False, default=str))
    print(sc[["contractor", "jobs", "billed_inr", "sla_met_pct", "sla_expected_pct", "reopen_pct",
              "reopen_expected_pct", "median_cost_ratio", "cold_mix_share_pct", "flags", "grade"]].to_string(index=False))


if __name__ == "__main__":
    main()
