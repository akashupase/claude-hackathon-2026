# DuckDB setup

The whole dataset lives in one file, `team41/data/followtherupee.duckdb`,
built from the CSVs and GeoJSON in `team41/data/`.

## Setup (once)

```powershell
pip install duckdb
```

The spatial extension downloads the first time the build runs, so you need internet access then.

## Build (or rebuild after changing a CSV)

From the repo root:

```powershell
python duckdb/build_db.py
```

It deletes the old `followtherupee.duckdb`, rebuilds every table, and checks the
row counts. It prints `OK` when everything matches, or the tables that differ.

## Look at the data

```powershell
python -c "import duckdb; c=duckdb.connect('team41/data/followtherupee.duckdb', read_only=True); print(c.sql('show tables'))"
```

Or open the file in the DuckDB CLI, or in DBeaver / DuckDB's VS Code extension.

## Tables

One per CSV, with the same column names. Changes from the CSVs:

- Y/N flags are booleans (`under_dlp`, `bus_route`, `emergency_services`, `tide_sensitive`, `pumping_station_nearby`, `has_media`, `big_tide_flag`, `sla_met`, `reopened_within_30d`).
- `geom` columns (WGS84 points or lines) on localities, facilities, flood_hotspots, accidents, complaints (NULL without GPS) and roads (start to end).
- `wards.boundary` polygon from `wards.geojson` (an approximation, not official boundaries).
- `work_order_complaints` and `contractor_wards` link tables, split from the pipe and semicolon lists.

## Example queries

```sql
-- which ward a point falls in
SELECT ward_code FROM wards WHERE ST_Contains(boundary, ST_Point(72.8332, 18.9217));

-- accidents within 500 m of a point (approximate, degrees x 111 km)
SELECT accident_id, severity FROM accidents
WHERE ST_Distance(geom, ST_Point(72.8347, 18.9220)) * 111000 < 500;

-- repair cost per ward
SELECT ward_code, sum(cost_inr) FROM work_orders GROUP BY 1 ORDER BY 2 DESC;
```

## Notes

- Edit the CSVs in `team41/data/`, then rerun the build. Nothing else needs changing.
- `team41/app` still reads the CSVs directly. It doesn't use this database yet.
- Vercel: the `.duckdb` file is about 5.5 MB. Commit it, or build it before deploy.
