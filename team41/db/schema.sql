-- Follow the Rupee — Neon Postgres schema (idempotent; applied by scripts/seed-neon.ts).
-- Source CSVs live in data/ and the pre-computed UI feeds in public/data/.

CREATE TABLE IF NOT EXISTS wards (
  ward_code                       TEXT PRIMARY KEY,
  ward_name                       TEXT NOT NULL,
  zone                            TEXT NOT NULL,
  assistant_commissioner_office   TEXT NOT NULL,
  centroid_lat                    DOUBLE PRECISION NOT NULL,
  centroid_lon                    DOUBLE PRECISION NOT NULL,
  approx_area_km2                 DOUBLE PRECISION NOT NULL,
  population_est                  BIGINT NOT NULL,
  low_lying_index                 DOUBLE PRECISION NOT NULL,
  engineering_crews               INTEGER NOT NULL,
  localities                      TEXT[] NOT NULL DEFAULT '{}',
  monsoon_repair_budget_inr_2025  BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS roads (
  road_id         TEXT PRIMARY KEY,
  road_name       TEXT NOT NULL,
  segment_no      INTEGER NOT NULL,
  ward_code       TEXT REFERENCES wards(ward_code),
  road_type       TEXT NOT NULL,
  surface         TEXT NOT NULL,
  lanes           INTEGER NOT NULL,
  length_m        INTEGER NOT NULL,
  start_lat       DOUBLE PRECISION NOT NULL,
  start_lon       DOUBLE PRECISION NOT NULL,
  end_lat         DOUBLE PRECISION NOT NULL,
  end_lon         DOUBLE PRECISION NOT NULL,
  last_resurfaced DATE,
  under_dlp       BOOLEAN NOT NULL DEFAULT FALSE,
  bus_route       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS contractors (
  contractor_id    TEXT PRIMARY KEY,
  contractor_name  TEXT NOT NULL,
  empanelled_since INTEGER NOT NULL,
  active_wards     TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS complaints (
  complaint_id      TEXT PRIMARY KEY,
  received_at       TIMESTAMP NOT NULL,
  channel           TEXT NOT NULL,
  category_reported TEXT NOT NULL,
  description       TEXT NOT NULL,
  language          TEXT NOT NULL,
  locality_text     TEXT NOT NULL,
  ward_code         TEXT REFERENCES wards(ward_code),
  lat               DOUBLE PRECISION,
  lon               DOUBLE PRECISION,
  gps_accuracy_m    DOUBLE PRECISION,
  photo_url         TEXT,
  photo_description TEXT,
  complainant_id    TEXT NOT NULL,
  upvotes           INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL,
  resolved_at       TIMESTAMP
);

CREATE TABLE IF NOT EXISTS work_orders (
  work_order_id         TEXT PRIMARY KEY,
  linked_complaint_ids  TEXT[] NOT NULL DEFAULT '{}',
  ward_code             TEXT REFERENCES wards(ward_code),
  road_id               TEXT REFERENCES roads(road_id),
  work_type             TEXT NOT NULL,
  repair_method         TEXT NOT NULL,
  contractor_id         TEXT REFERENCES contractors(contractor_id),
  contractor_name       TEXT NOT NULL,
  assigned_at           TIMESTAMP,
  work_started_at       TIMESTAMP,
  completed_at          TIMESTAMP,
  area_sqm              DOUBLE PRECISION,
  cost_inr              BIGINT NOT NULL DEFAULT 0,
  sla_hours             INTEGER,
  sla_met               BOOLEAN,
  reopened_within_30d   BOOLEAN,
  engineer_remark       TEXT
);

CREATE TABLE IF NOT EXISTS social_posts (
  post_id           TEXT PRIMARY KEY,
  posted_at         TIMESTAMP NOT NULL,
  source            TEXT NOT NULL,
  author_handle     TEXT NOT NULL,
  text              TEXT NOT NULL,
  has_media         BOOLEAN NOT NULL DEFAULT FALSE,
  likes_or_forwards INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_flags (
  work_order_id  TEXT NOT NULL,
  ward_code      TEXT NOT NULL,
  road_id        TEXT NOT NULL,
  road_name      TEXT NOT NULL,
  contractor_name TEXT NOT NULL,
  flag           TEXT NOT NULL,
  confidence     TEXT NOT NULL,
  reason         TEXT NOT NULL,
  cost_inr       BIGINT NOT NULL DEFAULT 0,
  inr_at_risk    BIGINT NOT NULL DEFAULT 0,
  method         TEXT NOT NULL,
  work_type      TEXT NOT NULL,
  ratio          DOUBLE PRECISION,
  expected_inr   DOUBLE PRECISION,
  twin           TEXT NOT NULL DEFAULT '',
  gap_days       DOUBLE PRECISION,
  resurfaced     TEXT,
  PRIMARY KEY (work_order_id, flag, reason, twin)
);

CREATE TABLE IF NOT EXISTS rate_card (
  repair_method     TEXT PRIMARY KEY,
  unit              TEXT NOT NULL,
  standard_rate_inr BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS flood_hotspots (
  hotspot_id                  TEXT PRIMARY KEY,
  name                        TEXT NOT NULL,
  ward_code                   TEXT REFERENCES wards(ward_code),
  lat                         DOUBLE PRECISION NOT NULL,
  lon                         DOUBLE PRECISION NOT NULL,
  flood_threshold_mm_per_day  DOUBLE PRECISION NOT NULL,
  tide_sensitive              BOOLEAN NOT NULL DEFAULT FALSE,
  avg_water_depth_cm          DOUBLE PRECISION NOT NULL,
  avg_recession_hours         DOUBLE PRECISION NOT NULL,
  pumping_station_nearby      BOOLEAN NOT NULL DEFAULT FALSE,
  years_flagged_last_5        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS accidents (
  accident_id    TEXT PRIMARY KEY,
  occurred_at    TIMESTAMP NOT NULL,
  ward_code      TEXT REFERENCES wards(ward_code),
  road_id        TEXT REFERENCES roads(road_id),
  lat            DOUBLE PRECISION,
  lon            DOUBLE PRECISION,
  vehicle_type   TEXT NOT NULL,
  severity       TEXT NOT NULL,
  probable_cause TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS facilities (
  facility_id          TEXT PRIMARY KEY,
  type                 TEXT NOT NULL,
  name                 TEXT NOT NULL,
  ward_code            TEXT REFERENCES wards(ward_code),
  lat                  DOUBLE PRECISION NOT NULL,
  lon                  DOUBLE PRECISION NOT NULL,
  beds_or_students     INTEGER NOT NULL DEFAULT 0,
  emergency_services   BOOLEAN NOT NULL DEFAULT FALSE,
  ambulance_entry_road TEXT REFERENCES roads(road_id)
);

CREATE TABLE IF NOT EXISTS rainfall_daily (
  date          DATE NOT NULL,
  station       TEXT NOT NULL,
  rainfall_mm   DOUBLE PRECISION NOT NULL DEFAULT 0,
  imd_category  TEXT NOT NULL,
  imd_alert     TEXT NOT NULL,
  PRIMARY KEY (date, station)
);

CREATE TABLE IF NOT EXISTS tides (
  date            DATE NOT NULL,
  high_tide_time  TIME NOT NULL,
  height_m        DOUBLE PRECISION NOT NULL,
  big_tide_flag   BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (date, high_tide_time)
);

CREATE TABLE IF NOT EXISTS traffic (
  road_id              TEXT PRIMARY KEY REFERENCES roads(road_id),
  peak_hour_vehicles   INTEGER NOT NULL DEFAULT 0,
  avg_peak_speed_kmph  DOUBLE PRECISION NOT NULL DEFAULT 0,
  congestion_index_0_10 DOUBLE PRECISION NOT NULL DEFAULT 0,
  bus_routes_count     INTEGER NOT NULL DEFAULT 0,
  two_wheeler_share_pct DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS localities (
  locality  TEXT PRIMARY KEY,
  ward_code TEXT REFERENCES wards(ward_code),
  lat       DOUBLE PRECISION NOT NULL,
  lon       DOUBLE PRECISION NOT NULL,
  aliases   TEXT[] NOT NULL DEFAULT '{}'
);

-- Pre-computed UI feeds produced by the analysis scripts
-- (data/follow_the_rupee.json and public/data/*.json, plus ward/road GeoJSON).
CREATE TABLE IF NOT EXISTS json_feeds (
  feed_key   TEXT PRIMARY KEY,
  payload    JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_complaints_ward_status ON complaints (ward_code, status);
CREATE INDEX IF NOT EXISTS idx_complaints_received_at ON complaints (received_at);
CREATE INDEX IF NOT EXISTS idx_work_orders_ward       ON work_orders (ward_code);
CREATE INDEX IF NOT EXISTS idx_work_orders_contractor ON work_orders (contractor_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_completed  ON work_orders (completed_at);
CREATE INDEX IF NOT EXISTS idx_audit_flags_ward       ON audit_flags (ward_code);
CREATE INDEX IF NOT EXISTS idx_accidents_road         ON accidents (road_id);
CREATE INDEX IF NOT EXISTS idx_wards_zone             ON wards (zone);
