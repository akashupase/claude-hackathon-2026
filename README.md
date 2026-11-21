# Follow the Rupee: Claude Hackathon 2026

Prototype for **Claude Impact Lab Mumbai** (21 Nov 2026): shows where each ward's monsoon
road-repair money went, whether the fixes lasted, and where the next rupee should go.

> All data is synthetic (from [Claude-Impact-Labs-data-2](https://github.com/SumeetGDoshi/Claude-Impact-Labs-data-2), CC BY 4.0).
> It is not BMC data and every contractor is fictional.

## See it

Open **`web/index.html`** in a browser (one self-contained file, no server needed).

## How it maps to the judging criteria

| Criterion | Where on the page |
|---|---|
| Audit accuracy (25%) | "Jobs to check": over-billed vs rate card, repeat bills, paid during DLP, each with confidence and the work order behind it |
| Fair accountability (20%) | Ward report card and contractor scorecards: actual vs *expected* for the same methods, low-lying wards and rain |
| Budget smarts (20%) | "Where the next rupee should go": risk-ranked roads, most durable method, funded from budget left or recovered money |
| Connects the trail (15%) | "From complaints to repairs" funnel per ward, and "What happened to my complaint?" lookup |
| Usable + demo (20%) | "This week, the ward officer can" actions, CSV download for the ward office, citizen complaint tracker |

## Citizen features

- **Search** any complaint (`BMC25-000295`), work order (`WO25-00117`), road, contractor or ward. Links work too: `web/index.html?q=BMC25-000295`
- **Work order timeline**: complaint → assigned → started → completed (on time or late) → held or failed, with the citizen's photo description and the engineer's remark as proof
- **Ward map** shaded by share of money on failed or flagged jobs, click a ward for its summary, complaints heatmap (all or never fixed)
- **Charts**: where a ward's money went (held / failed / flagged), budget used by ward (click a bar to open the ward)
- **What people are saying**: social media posts per ward sorted into problem reports, sarcasm, thank-yous and noise; problems posted with no matching complaint
- **Contractor ranking** and **Good work** section where citizens can endorse a contractor (stored in the browser only; no database)
- **Language switch**: English, हिंदी, मराठी for headings and buttons

## Rebuild

```bash
python analysis/follow_rupee.py   # checks and scores -> out/follow_the_rupee.json, out/audit_flags.csv
python analysis/build_page.py     # page -> web/index.html
```

Needs Python 3 with pandas and numpy.

## Layout

| Path | What |
|---|---|
| `data/` | Hackathon dataset (synthetic) and `DATA_DICTIONARY.md` |
| `analysis/follow_rupee.py` | Audit rules, fair scorecards, complaint linking, next-rupee plan |
| `analysis/build_page.py` | Fills `web/template.html` with the data -> `web/index.html` |
| `analysis/scorecard_text.py` | Contractor scorecard text written by Claude |
| `web/template.html` | Page layout and interactivity (edit this, not index.html) |
| `prompts/` | Prompts for Claude (scorecard text) |
| `out/` | Generated JSON and `audit_flags.csv` |
| `web/index.html` | The page |

## Secrets

Never commit API keys. Put them in `.env`, which git ignores. `.env.example` lists the variable names.

## Team

| Name | GitHub |
|------|--------|
| Akash Upase | [@akashupase](https://github.com/akashupase) |
| | [@dmelloaries](https://github.com/dmelloaries) |
| | [@shetty-ansh](https://github.com/shetty-ansh) |
| | [@Aasifshaikh-00000](https://github.com/Aasifshaikh-00000) |
