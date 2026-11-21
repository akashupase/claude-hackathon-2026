"""Builds web/index.html (one self-contained page) from out/follow_the_rupee.json.

Usage:  python analysis/build_page.py
"""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / "out" / "follow_the_rupee.json").read_text())

# Plain-language scorecards written by Claude from the numbers in out/follow_the_rupee.json
# (prompt: prompts/contractor_scorecard.md). Keyed by contractor_id.
SCORECARD_TEXT = {
    "Deccan Paving Solutions (synthetic)": "The most durable work in the city: only 9% of its repairs broke again within a month, against about 24% expected for the same kind of jobs. It met its deadline on 60% of jobs, better than the 49% expected, and its prices sit right on the rate card. To improve: explain the 5 repeat jobs billed with no complaint behind them.",
    "Sahyadri Infra Works (synthetic)": "Fast and long-lasting. It met 62% of deadlines (50% expected) and only 14% of its fixes failed within 30 days (25% expected). Prices are close to the rate card. To improve: 8 jobs were billed a few days after an identical job on the same road with no complaint linked; these need paperwork showing they were separate work.",
    "Mithi Infra Projects (synthetic)": "Repairs hold up well: 12% failed within a month, about half the expected rate. Deadlines are about average. To improve: 10 jobs were billed at more than 1.35 times the rate card and should be checked against measurements on site.",
    "Konkan Roadcon Pvt Ltd (synthetic)": "The largest contractor by money billed. Its speed and durability are close to what is expected for its mix of jobs (46% of deadlines met, 27% of fixes failed). To improve: a few over-billed and repeat jobs, and slightly more fixes failing than expected.",
    "Shivneri Construction (synthetic)": "Average on both speed and durability for the work it was given. To improve: 8 jobs look like repeat billing (same road, same method, a few days apart, no complaint), which is a high share for its size.",
    "Western Coast Asphalt Co (synthetic)": "Prices are mostly fair, but its repairs do not last: 39% failed within 30 days, against 25% expected for the same methods, wards and rain. That means the city paid twice for many roads. To improve: durability, starting with the roads where its patches failed more than once.",
    "Arabian Sea Engineering (synthetic)": "Slower than expected (44% of deadlines met, 53% expected) and less durable (32% of fixes failed, 25% expected). 38 jobs were billed at more than 1.35 times the rate card. To improve: billing accuracy first, then repair quality.",
    "Mahalaxmi Civil Contractors (synthetic)": "The weakest record on this data. It met 39% of deadlines (52% expected), 38% of its fixes failed within a month (25% expected), and 44 jobs were billed well above the rate card, plus 10 possible repeat bills. To improve: every flagged job should be checked before further payments.",
}

S = DATA["summary"]


def cr(n):
    return f"₹{n / 1e7:.2f} cr" if abs(n) >= 1e7 else f"₹{n / 1e5:.1f} lakh"


for c in DATA["contractors"]:
    c["text"] = SCORECARD_TEXT.get(c["contractor"], "")
    c["short"] = c["contractor"].replace(" (synthetic)", "")

page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Follow the Rupee</title>
<style>
:root{{--ink:#1b1f24;--soft:#5a636e;--line:#e3e6ea;--bg:#ffffff;--tint:#f5f7f8;--accent:#0f766e;
--red:#c2410c;--amber:#b45309;--green:#15803d;--chip:#eef2f3}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}}
.wrap{{max-width:1040px;margin:0 auto;padding:0 16px}}
header{{padding:36px 0 20px;border-bottom:1px solid var(--line)}}
h1{{font-size:clamp(26px,5vw,38px);margin:0 0 6px;letter-spacing:-.02em}}
h2{{font-size:22px;margin:40px 0 6px}}
.sub{{color:var(--soft);margin:0}}
.warn{{background:#fff7ed;border:1px solid #fed7aa;color:#7c2d12;padding:10px 14px;border-radius:8px;font-size:14px;margin:16px 0 0}}
.kpis{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:20px 0 0}}
.kpi{{background:var(--tint);border-radius:10px;padding:14px 16px}}
.kpi b{{display:block;font-size:26px;letter-spacing:-.01em}}
.kpi span{{color:var(--soft);font-size:14px}}
.kpi.bad b{{color:var(--red)}}
select{{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;max-width:100%}}
.card{{border:1px solid var(--line);border-radius:12px;padding:18px;margin:14px 0}}
.muted{{color:var(--soft);font-size:14px}}
table{{width:100%;border-collapse:collapse;font-size:14px}}
th,td{{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:top}}
th{{color:var(--soft);font-weight:600}}
td.n{{text-align:right;white-space:nowrap}}
.tbl{{overflow-x:auto}}
.chip{{display:inline-block;background:var(--chip);border-radius:999px;padding:1px 9px;font-size:12px;white-space:nowrap}}
.chip.ob{{background:#fde8e1;color:#9a3412}}.chip.db{{background:#fef3c7;color:#92400e}}.chip.dlp{{background:#e0f2fe;color:#075985}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}}
.grade{{float:right;font-size:28px;font-weight:700;width:44px;height:44px;border-radius:10px;display:grid;place-items:center;color:#fff}}
.gA{{background:var(--green)}}.gB{{background:#65a30d}}.gC{{background:var(--amber)}}.gD{{background:var(--red)}}
.m{{display:flex;justify-content:space-between;font-size:14px;border-top:1px dashed var(--line);padding:5px 0}}
.m i{{font-style:normal;color:var(--soft)}}
.ok{{color:var(--green)}}.no{{color:var(--red)}}
ol.plan{{padding-left:20px}} ol.plan li{{margin:0 0 10px}}
.bar{{height:10px;background:var(--chip);border-radius:6px;overflow:hidden;margin:6px 0 2px}}
.bar i{{display:block;height:100%;background:var(--accent)}}
.bar i.over{{background:var(--red)}}
footer{{margin:48px 0 40px;padding-top:16px;border-top:1px solid var(--line);color:var(--soft);font-size:13px}}
button.more,a.btn{{font:inherit;font-size:14px;background:none;border:1px solid var(--line);border-radius:8px;padding:6px 12px;cursor:pointer;margin-top:8px;color:var(--ink);text-decoration:none;display:inline-block}}
.two{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}}
.todo{{border-left:4px solid var(--accent)}} .todo li{{margin:0 0 8px}}
.funnel{{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:10px 0}}
.funnel div{{background:var(--tint);border-radius:8px;padding:8px 10px;font-size:14px}} .funnel b{{display:block;font-size:20px}}
.funnel .arrow{{background:none;padding:0;color:var(--soft)}}
.track{{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}}
.track input{{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;min-width:0;flex:1 1 220px}}
.track button{{font:inherit;padding:8px 14px;border:0;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer}}
.conf{{font-size:12px;font-weight:600}} .conf.High{{color:var(--red)}} .conf.Medium{{color:var(--amber)}}
.fund{{font-size:12px;border-radius:999px;padding:1px 8px;white-space:nowrap}}
.fund.budget{{background:#dcfce7;color:#166534}} .fund.recovered{{background:#e0f2fe;color:#075985}} .fund.next{{background:var(--chip);color:var(--soft)}}
code{{font-size:13px;background:var(--chip);padding:1px 5px;border-radius:4px}}
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>Follow the Rupee</h1>
  <p class="sub">Where Mumbai's 2025 monsoon road-repair money went, whether the fixes lasted, and where the next rupee should go.</p>
  <p class="warn"><b>Synthetic data.</b> This is a hackathon prototype built on the Claude Impact Lab Mumbai dataset. It is not BMC data, and every contractor is fictional. Do not use it to judge any real person, contractor or department.</p>
  <div class="kpis">
    <div class="kpi"><b>{cr(S['total_spend_inr'])}</b><span>spent on {S['jobs']:,} repair jobs (budget {cr(S['total_budget_inr'])})</span></div>
    <div class="kpi bad"><b>{cr(S['failed_30d_inr'])}</b><span>spent on {S['failed_30d_jobs']} fixes that failed within 30 days</span></div>
    <div class="kpi bad"><b>{S['flagged_jobs']}</b><span>jobs flagged for review ({cr(S['flagged_inr'])} billed)</span></div>
    <div class="kpi"><b>{S['complaints']['open_not_fixed']}</b><span>citizen complaints still open with no repair linked</span></div>
  </div>
</header>

<h2>What happened to my complaint?</h2>
<p class="muted">For citizens. Enter a complaint number to follow it to the repair, the contractor, the cost and whether the fix lasted. Try <code>BMC25-000295</code> or <code>BMC25-000812</code>.</p>
<div class="track"><input id="cid" placeholder="BMC25-000295" aria-label="Complaint number"><button id="go">Track</button></div>
<div id="trackout"></div>

<h2>Your ward</h2>
<p class="muted">Pick a ward to see its money trail, the jobs to check, and where to spend next.</p>
<select id="ward" aria-label="Ward"></select>
<div id="wardview"></div>

<h2>Contractor scorecards</h2>
<p class="muted">Fair comparison: each contractor is measured against what an average contractor would get on the <i>same</i> mix of repair methods, low-lying wards and heavy-rain weeks. Grades use durability, speed and billing accuracy. DLP payments are not counted against contractors: they are a BMC payment check.</p>
<div class="grid" id="contractors"></div>

<h2>How we checked</h2>
<div class="card">
<p><span class="chip ob">Over-billed</span> Cost is more than {S['rules']['overbill_ratio']}× the rate card for that method and area. Normal jobs vary 20 to 30% around the rate; in this data no job sits between 1.30× and 1.35×, so the line is clean.</p>
<p><span class="chip db">Possible double billing</span> A job with no complaint linked, on the same road, same method and same contractor as a real job completed within {S['rules']['double_bill_days']} days.</p>
<p><span class="chip dlp">Paid during DLP</span> BMC paid for a repair on a road still under its Defect Liability Period, when the original contractor should fix it for free.</p>
<p><b>Confidence.</b> <span class="conf High">High</span>: billed 1.5× or more, a repeat bill, or a surface repair paid during DLP. <span class="conf Medium">Medium</span>: billed 1.35 to 1.5×, or drainage work on a DLP road (worth checking whether the road contract covers it). We do <i>not</i> flag missed deadlines or failed fixes as wrongdoing: rain and low-lying wards explain much of that, so they go into the fair scorecards instead.</p>
<p><b>Next rupee.</b> Roads with open, unfixed complaints are ranked by risk: complaints and upvotes, nearby flood spots, traffic and bus routes, road-condition accidents, hospital and school access, and past failed fixes. The suggested method is the most durable one in the data for that issue (for potholes, hot mix fails {S['method_reopen_pct']['Hot mix patch']}% of the time vs {S['method_reopen_pct']['Cold mix patch']}% for cold mix). Roads under DLP go back to the original contractor at no cost.</p>
<p><b>Connecting the trail.</b> {S['complaints']['total']:,} complaints in English, Hinglish, Marathi and Hindi. Each is placed on a road (by GPS for {S['complaints']['geocoded'].get('gps',0):,}, by locality name or Devanagari alias for {S['complaints']['geocoded'].get('locality',0):,}), its issue is re-read from the text ({S['complaints']['recategorised']:,} were filed under the wrong or a vague category), {S['complaints']['duplicates']:,} duplicates are set aside, and the rest are followed to the {S['complaints']['linked_to_work_order']:,} complaints BMC linked to a work order, or marked as never fixed. Open complaints on the same road and issue count as one problem.</p>
<p class="muted">Prototype note: the issue re-reading uses English, Hindi and Marathi keywords here; with an API key, Claude does this step and writes the scorecard text (prompt in <code>prompts/</code>).</p>
</div>

<footer>Data: <a href="https://github.com/SumeetGDoshi/Claude-Impact-Labs-data-2">Claude Impact Lab Mumbai dataset</a> (CC BY 4.0), synthetic. Checks run in Python; scorecard text written by Claude. Prototype, 21 November 2026.</footer>
</div>

<script>
const D = {json.dumps(DATA, ensure_ascii=False)};
const SC = {json.dumps({c['contractor']: c['text'] for c in DATA['contractors']}, ensure_ascii=False)};
const inr = n => n >= 1e7 ? '₹' + (n/1e7).toFixed(2) + ' cr' : n >= 1e5 ? '₹' + (n/1e5).toFixed(1) + ' lakh' : '₹' + Math.round(n).toLocaleString('en-IN');
const esc = s => String(s).replace(/[&<>"]/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}})[c]);
const chip = f => `<span class="chip ${{f.startsWith('Over')?'ob':f.startsWith('Possible')?'db':'dlp'}}">${{f}}</span>`;
const short = s => s.replace(' (synthetic)', '');

const sel = document.getElementById('ward');
D.wards.forEach(w => sel.add(new Option(`${{w.ward_code}}: ${{w.ward_name}}`, w.ward_code)));

function renderWard(code) {{
  const w = D.wards.find(x => x.ward_code === code);
  const pct = Math.round(100 * w.spent_inr / w.budget_inr);
  const flags = D.flags.filter(f => f.ward_code === code);
  const plan = w.next_rupee;
  const left = plan.budget_left_inr;
  const topC = Object.entries(w.by_contractor).slice(0, 4).map(([k, v]) => `${{short(k)}} ${{inr(v)}}`).join(' · ');
  const t = w.trail || {{}};
  const vs = (a, e, hi) => `<span class="${{(hi ? a >= e : a <= e) ? 'ok' : 'no'}}">${{a}}%</span> <span class="muted">(expected ${{e}}%)</span>`;
  const fundLabel = {{'budget': ['budget', 'from budget left'], 'recovered money': ['recovered', 'if flagged money is recovered'], 'next allocation': ['next', 'next allocation']}};
  const csv = 'data:text/csv;charset=utf-8,' + encodeURIComponent(['work_order_id,flag,confidence,contractor,road,cost_inr,reason']
      .concat(flags.map(f => [f.work_order_id, f.flag, f.confidence, short(f.contractor_name), f.road_name, f.cost_inr, '"' + f.reason.replace(/"/g, "'") + '"'].join(','))).join('\\n'));
  document.getElementById('wardview').innerHTML = `
  <div class="two">
  <div class="card">
    <b>Ward report card: ${{esc(w.ward_name)}}</b>
    <div class="muted">${{esc(w.zone)}} · ${{esc(w.office)}}</div>
    <div class="bar"><i class="${{pct > 100 ? 'over' : ''}}" style="width:${{Math.min(pct, 100)}}%"></i></div>
    <div class="muted">${{inr(w.spent_inr)}} spent of ${{inr(w.budget_inr)}} budget (${{pct}}%) on ${{w.jobs}} jobs.</div>
    <div class="m" style="margin-top:8px"><i>Deadlines met</i><span>${{vs(w.sla_met_pct, w.sla_expected_pct, true)}}</span></div>
    <div class="m"><i>Fixes failed in 30 days</i><span>${{vs(w.reopen_pct, w.reopen_expected_pct, false)}}</span></div>
    <div class="m"><i>Spent on fixes that failed</i><span>${{inr(w.failed_30d_inr)}}</span></div>
    <div class="m"><i>Billed on flagged jobs</i><span>${{inr(w.flagged_inr)}}</span></div>
    <p class="muted">Context: low-lying index ${{w.low_lying_index}} (0 to 1), ${{w.heavy_rain_share_pct}}% of jobs had heavy rain within a week. "Expected" is what this ward's mix of jobs, flooding and rain would normally give.</p>
    <p class="muted">Who was paid: ${{topC}}</p>
  </div>
  <div class="card todo">
    <b>This week, the ward officer can</b>
    <ol>${{w.actions.map(a => `<li>${{esc(a)}}</li>`).join('') || '<li class="muted">Nothing urgent.</li>'}}</ol>
  </div>
  </div>

  <div class="card">
    <b>From complaints to repairs</b> <span class="muted">· how this ward's complaints were followed to work orders</span>
    <div class="funnel">
      <div><b>${{t.complaints ?? 0}}</b>complaints</div><span class="arrow">→</span>
      <div><b>${{t.duplicates ?? 0}}</b>duplicates set aside</div>
      <div><b>${{t.not_bmc ?? 0}}</b>not BMC roads / other dept</div><span class="arrow">→</span>
      <div><b>${{(t.issues_fixed ?? 0) + (t.issues_open ?? 0)}}</b>distinct problems</div><span class="arrow">→</span>
      <div><b>${{t.held ?? 0}}</b>fixed and held</div>
      <div><b class="no">${{t.failed ?? 0}}</b>fixed but failed in 30 days</div>
      <div><b class="no">${{t.issues_open ?? 0}}</b>never fixed (${{t.complaints_open ?? 0}} complaints)</div>
    </div>
    <div class="muted">${{t.recategorised ?? 0}} complaints were filed under the wrong or a vague category and re-read from their text. ${{t.jobs_without_complaint ?? 0}} paid job(s) here have no complaint behind them.</div>
  </div>

  <div class="card">
    <b>Jobs to check</b> <span class="muted">(${{flags.length}}, largest first; each points to its work order)</span>
    <div class="tbl"><table><thead><tr><th>Work order</th><th>Flag</th><th>Why</th><th>Contractor</th><th class="n">Billed</th></tr></thead>
    <tbody id="flagrows"></tbody></table></div>
    ${{flags.length > 8 ? '<button class="more" id="more">Show all</button> ' : ''}}${{flags.length ? `<a class="btn" download="flags_${{code.replace('/', '-')}}.csv" href="${{csv}}">Download CSV for the ward office</a>` : ''}}
  </div>

  <div class="card">
    <b>Where the next rupee should go</b>
    <div class="muted">Budget left: ${{left >= 0 ? inr(left) : 'none (over by ' + inr(-left) + ')'}} · Could be recovered from flagged jobs: ${{inr(plan.recoverable_inr)}} · This plan: ${{inr(plan.plan_total_inr)}}</div>
    <ol class="plan">${{plan.items.map(i => `<li><b>${{esc(i.road)}}</b>: ${{esc(i.action)}}${{i.est_cost_inr ? ', about ' + inr(i.est_cost_inr) : ''}} <span class="fund ${{fundLabel[i.funded_by][0]}}">${{fundLabel[i.funded_by][1]}}</span><br><span class="muted">${{esc(i.issue)}}. Why: ${{esc(i.why)}}. Risk ${{i.risk}}/100.</span></li>`).join('') || '<li class="muted">No open, unfixed complaints mapped to roads in this ward.</li>'}}</ol>
    <div class="muted">Methods are the most durable in the data for each issue, not the cheapest. Roads under DLP cost BMC nothing.</div>
  </div>`;
  const rows = (all) => flags.slice(0, all ? flags.length : 8).map(f => `<tr><td>${{f.work_order_id}}</td><td>${{chip(f.flag)}}<br><span class="conf ${{f.confidence}}">${{f.confidence}}</span></td><td>${{esc(f.reason)}}</td><td>${{esc(short(f.contractor_name))}}</td><td class="n">${{inr(f.cost_inr)}}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No flags in this ward.</td></tr>';
  document.getElementById('flagrows').innerHTML = rows(false);
  const m = document.getElementById('more');
  if (m) m.onclick = () => {{ document.getElementById('flagrows').innerHTML = rows(true); m.remove(); }};
}}

function track() {{
  const id = document.getElementById('cid').value.trim().toUpperCase();
  const out = document.getElementById('trackout');
  const c = D.C[id];
  if (!c) {{ out.innerHTML = `<div class="card muted">No complaint found with number ${{esc(id || '(blank)')}}. Numbers look like BMC25-000295.</div>`; return; }}
  const [ward, date, issue, lang, status, text, woId] = c;
  let html = `<div class="card"><b>${{id}}</b> <span class="muted">· ${{date}} · ward ${{esc(ward || 'unknown')}} · ${{esc(issue)}}</span><p>“${{esc(text)}}”</p>`;
  if (woId && D.W[woId]) {{
    const [wc, road, method, con, cost, done, sla, reopened, fl] = D.W[woId];
    html += `<div class="m"><i>Repair</i><span>${{woId}}: ${{esc(method)}} on ${{esc(road)}}</span></div>
      <div class="m"><i>Contractor</i><span>${{esc(con)}}</span></div>
      <div class="m"><i>Cost</i><span>${{inr(cost)}}</span></div>
      <div class="m"><i>Completed</i><span>${{done}} · ${{sla === 'Y' ? '<span class="ok">on time</span>' : '<span class="no">late</span>'}}</span></div>
      <div class="m"><i>Did it last?</i><span>${{reopened === 'Y' ? '<span class="no">No, it failed within 30 days</span>' : '<span class="ok">Yes, held 30+ days</span>'}}</span></div>
      ${{fl ? `<div class="m"><i>Audit</i><span class="no">${{esc(fl)}}</span></div>` : ''}}`;
  }} else {{
    html += `<div class="m"><i>Status</i><span>${{esc(status)}}</span></div><p class="muted">${{
      status.startsWith('Closed - Duplicate') ? 'Marked as a duplicate of another complaint about the same problem.' :
      status.startsWith('Forwarded') || status.startsWith('Rejected') ? 'Not handled by BMC road repairs. Ask the ward office which department now owns it.' :
      'No repair has been linked to this complaint. Follow up at the ward office, on 1916, or raise it with your corporator.'}}</p>`;
  }}
  out.innerHTML = html + '</div>';
}}
document.getElementById('go').onclick = track;
document.getElementById('cid').onkeydown = e => {{ if (e.key === 'Enter') track(); }};

sel.onchange = () => renderWard(sel.value);
sel.value = 'R/N'; renderWard('R/N');

document.getElementById('contractors').innerHTML = D.contractors.map(c => {{
  const f = c.flags || {{}};
  const better = (a, e, higherIsBetter) => (higherIsBetter ? a >= e : a <= e) ? 'ok' : 'no';
  return `<div class="card"><span class="grade g${{c.grade}}">${{c.grade}}</span>
  <b>${{esc(c.short)}}</b><div class="muted">${{c.jobs}} jobs · ${{inr(c.billed_inr)}} · ${{c.wards.length}} wards</div>
  <p style="font-size:15px">${{esc(SC[c.contractor] || '')}}</p>
  <div class="m"><i>Deadlines met</i><span class="${{better(c.sla_met_pct, c.sla_expected_pct, true)}}">${{c.sla_met_pct}}% <i>(expected ${{c.sla_expected_pct}}%)</i></span></div>
  <div class="m"><i>Fixes failed in 30 days</i><span class="${{better(c.reopen_pct, c.reopen_expected_pct, false)}}">${{c.reopen_pct}}% <i>(expected ${{c.reopen_expected_pct}}%)</i></span></div>
  <div class="m"><i>Typical cost vs rate card</i><span>${{c.median_cost_ratio}}×</span></div>
  <div class="m"><i>Over-billed / repeat bills</i><span>${{f['Over-billed'] || 0}} / ${{f['Possible double billing'] || 0}}</span></div>
  <p class="muted" style="margin:8px 0 0">Context: ${{c.low_lying_share_pct}}% of jobs in highly flood-prone wards, ${{c.heavy_rain_share_pct}}% with heavy rain within a week, ${{c.cold_mix_share_pct}}% cold-mix patches.${{c.evidence.length ? ' Evidence: ' + c.evidence.join(', ') + '.' : ''}}</p>
  </div>`;
}}).join('');
</script>
</body>
</html>
"""

out = ROOT / "web" / "index.html"
out.parent.mkdir(exist_ok=True)
out.write_text(page)
print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KB)")
