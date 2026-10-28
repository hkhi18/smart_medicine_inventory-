-- Smart Medicine Inventory - PostgreSQL schema
-- Every number on the website is computed from these tables.

DROP TABLE IF EXISTS audit_log, purchase_orders, alerts, replenishment, forecasts, model_backtests,
  movements, lots, daily_demand, medicines, warehouses, app_settings CASCADE;

-- Global settings (as-of date of the data, training cutoff...)
CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE warehouses (
  code TEXT PRIMARY KEY,           -- e.g. WH-RUH
  name TEXT NOT NULL,
  city TEXT NOT NULL
);

CREATE TABLE medicines (
  id                SERIAL PRIMARY KEY,
  code              TEXT UNIQUE NOT NULL,      -- MED-00001
  name              TEXT NOT NULL,
  unit              TEXT NOT NULL,             -- TAB, CAP, VIAL, AMP, BAG, SYR
  therapeutic_class TEXT NOT NULL,
  criticality       TEXT NOT NULL CHECK (criticality IN ('Vital','Essential','Non-essential')),
  supplier          TEXT NOT NULL,
  unit_cost         NUMERIC(10,2) NOT NULL,
  lead_time_days    INT NOT NULL,
  service_level     NUMERIC(4,3) NOT NULL,     -- 0.98 = 98%
  service_z         NUMERIC(5,3) NOT NULL,     -- z-score for the service level (2.054 for 98%)
  first_demand_date DATE NOT NULL,
  base_demand       NUMERIC(10,2) NOT NULL     -- generator parameter (synthetic data only)
);

-- Big table: one row per medicine per day (~1M rows)
CREATE TABLE daily_demand (
  medicine_id INT  NOT NULL REFERENCES medicines(id),
  day         DATE NOT NULL,
  qty         INT  NOT NULL,
  PRIMARY KEY (medicine_id, day)
);
CREATE INDEX idx_demand_day ON daily_demand(day);

-- Stock is held in lots (batch number + expiry) per warehouse
CREATE TABLE lots (
  lot_no      TEXT PRIMARY KEY,
  medicine_id INT  NOT NULL REFERENCES medicines(id),
  warehouse   TEXT NOT NULL REFERENCES warehouses(code),
  qty         INT  NOT NULL CHECK (qty >= 0),
  expiry_date DATE NOT NULL
);
CREATE INDEX idx_lots_med ON lots(medicine_id);

-- Append-only stock ledger: rows are inserted, never updated or deleted
CREATE TABLE movements (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMP NOT NULL DEFAULT now(),
  medicine_id INT  NOT NULL REFERENCES medicines(id),
  warehouse   TEXT NOT NULL REFERENCES warehouses(code),
  lot_no      TEXT,
  type        TEXT NOT NULL CHECK (type IN ('RECEIPT','ISSUE','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT','RETURN')),
  qty         INT  NOT NULL,                  -- signed: + into stock, - out of stock
  actor       TEXT NOT NULL DEFAULT 'system',
  note        TEXT
);
CREATE INDEX idx_mov_med ON movements(medicine_id, ts DESC);
CREATE INDEX idx_mov_ts ON movements(ts DESC);

-- Backtest score of every model for every medicine
CREATE TABLE model_backtests (
  medicine_id     INT  NOT NULL REFERENCES medicines(id),
  model           TEXT NOT NULL,
  mape            NUMERIC(8,2),
  rmse            NUMERIC(10,2),
  mae             NUMERIC(10,2),
  status          TEXT NOT NULL,              -- computed | failed | insufficient_history
  is_selected     BOOLEAN NOT NULL DEFAULT false,
  params          TEXT,
  training_cutoff DATE NOT NULL,
  PRIMARY KEY (medicine_id, model)
);

-- 90-day forecast from the selected model
CREATE TABLE forecasts (
  medicine_id INT  NOT NULL REFERENCES medicines(id),
  day         DATE NOT NULL,
  qty         NUMERIC(10,2) NOT NULL,
  PRIMARY KEY (medicine_id, day)
);

-- Reorder point, coverage and status per medicine (recomputed by lib/replenishment)
CREATE TABLE replenishment (
  medicine_id        INT PRIMARY KEY REFERENCES medicines(id),
  on_hand            INT NOT NULL,
  model              TEXT,
  lt_demand          NUMERIC(12,2),
  rmse               NUMERIC(10,2),
  z                  NUMERIC(6,3),
  safety_stock       INT,
  rop                INT,
  suggested_order    INT,
  coverage_days      INT,
  projected_stockout DATE,
  status             TEXT NOT NULL,           -- stockout | below_rop | at_risk | insufficient_history | ok
  computed_at        TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE alerts (
  id          SERIAL PRIMARY KEY,
  medicine_id INT NOT NULL REFERENCES medicines(id),
  type        TEXT NOT NULL,                  -- stockout | below_rop | expiry | insufficient_history
  severity    TEXT NOT NULL,                  -- high | medium | low
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',   -- open | acknowledged | resolved
  created_at  TIMESTAMP NOT NULL DEFAULT now(),
  handled_by  TEXT,
  handled_at  TIMESTAMP
);

-- Purchase-order drafts: proposed by the system, approved by a pharmacist
CREATE TABLE purchase_orders (
  id          SERIAL PRIMARY KEY,
  medicine_id INT NOT NULL REFERENCES medicines(id),
  qty         INT NOT NULL,
  est_cost    NUMERIC(14,2) NOT NULL,
  reason      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'awaiting_pharmacist', -- awaiting_pharmacist | approved | rejected
  created_at  TIMESTAMP NOT NULL DEFAULT now(),
  decided_by  TEXT,
  decided_at  TIMESTAMP
);

CREATE TABLE audit_log (
  id      BIGSERIAL PRIMARY KEY,
  ts      TIMESTAMP NOT NULL DEFAULT now(),
  actor   TEXT NOT NULL,
  action  TEXT NOT NULL,
  entity  TEXT NOT NULL,
  details TEXT
);

-- On-hand per medicine = sum of its lots
CREATE VIEW v_on_hand AS
SELECT m.id AS medicine_id, COALESCE(SUM(l.qty), 0)::INT AS on_hand
FROM medicines m LEFT JOIN lots l ON l.medicine_id = m.id
GROUP BY m.id;

-- Ledger protection: block UPDATE and DELETE on movements
CREATE OR REPLACE FUNCTION forbid_ledger_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'movements is an append-only ledger: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_movements_append_only
BEFORE UPDATE OR DELETE ON movements
FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();
