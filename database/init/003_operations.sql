BEGIN;

CREATE TABLE IF NOT EXISTS fuel_products (
  id uuid PRIMARY KEY,
  code varchar(30) NOT NULL UNIQUE,
  name_th varchar(120) NOT NULL,
  name_en varchar(120) NOT NULL,
  unit varchar(20) NOT NULL DEFAULT 'L',
  current_price numeric(14,4) NOT NULL CHECK (current_price >= 0),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispensers (
  id uuid PRIMARY KEY,
  station_id uuid NOT NULL REFERENCES stations(id),
  code varchar(20) NOT NULL,
  display_name varchar(100) NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('ONLINE','FILLING','PAYMENT','FAULT')),
  current_sale_liters numeric(14,3),
  current_sale_amount numeric(14,2),
  totalizer_liters numeric(16,3) NOT NULL DEFAULT 0,
  sales_today_count integer NOT NULL DEFAULT 0 CHECK (sales_today_count >= 0),
  volume_today numeric(14,3) NOT NULL DEFAULT 0 CHECK (volume_today >= 0),
  revenue_today numeric(14,2) NOT NULL DEFAULT 0 CHECK (revenue_today >= 0),
  operator_name varchar(200),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_id, code),
  CHECK (
    (current_sale_liters IS NULL AND current_sale_amount IS NULL)
    OR (current_sale_liters >= 0 AND current_sale_amount >= 0)
  )
);

CREATE TABLE IF NOT EXISTS nozzles (
  id uuid PRIMARY KEY,
  dispenser_id uuid NOT NULL REFERENCES dispensers(id),
  nozzle_number integer NOT NULL CHECK (nozzle_number > 0),
  fuel_product_id uuid NOT NULL REFERENCES fuel_products(id),
  status varchar(20) NOT NULL CHECK (status IN ('ONLINE','FILLING','PAYMENT','FAULT')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dispenser_id, nozzle_number)
);

CREATE TABLE IF NOT EXISTS operational_events (
  id bigserial PRIMARY KEY,
  station_id uuid NOT NULL REFERENCES stations(id),
  dispenser_id uuid REFERENCES dispensers(id),
  severity varchar(20) NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  event_code varchar(50) NOT NULL,
  message_th text NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS dispensers_station_status_idx
  ON dispensers (station_id, status, code);
CREATE INDEX IF NOT EXISTS nozzles_dispenser_status_idx
  ON nozzles (dispenser_id, status);
CREATE INDEX IF NOT EXISTS operational_events_open_idx
  ON operational_events (station_id, status, occurred_at DESC);

INSERT INTO fuel_products (id, code, name_th, name_en, current_price)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'DIESEL-B7', 'ดีเซล B7', 'Diesel B7', 33.2500),
  ('10000000-0000-4000-8000-000000000002', 'GASOHOL-95', 'แก๊สโซฮอล์ 95', 'Gasohol 95', 36.5000),
  ('10000000-0000-4000-8000-000000000003', 'GASOHOL-91', 'แก๊สโซฮอล์ 91', 'Gasohol 91', 35.7500)
ON CONFLICT (code) DO UPDATE SET
  name_th = EXCLUDED.name_th,
  name_en = EXCLUDED.name_en,
  current_price = EXCLUDED.current_price,
  active = true,
  updated_at = now();

INSERT INTO dispensers (
  id, station_id, code, display_name, status, current_sale_liters,
  current_sale_amount, totalizer_liters, sales_today_count, volume_today,
  revenue_today, operator_name, last_seen_at, updated_at
)
VALUES
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'P01', 'Dispenser 01', 'FILLING', 18.420, 612.50, 428912.440, 34, 2050.000, 36840.00, 'สมชาย · กะเช้า', now(), now()),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'P02', 'Dispenser 02', 'ONLINE', NULL, NULL, 391205.180, 29, 1840.000, 29120.00, 'วราภรณ์ · กะเช้า', now(), now()),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'P03', 'Dispenser 03', 'PAYMENT', 32.080, 1174.00, 512884.620, 41, 2760.000, 41305.00, 'สมชาย · กะเช้า', now(), now()),
  ('20000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'P04', 'Dispenser 04', 'FAULT', NULL, NULL, 287994.770, 22, 1776.000, 22480.00, 'Gateway ไม่ตอบสนอง', now() - interval '3 minutes', now())
ON CONFLICT (station_id, code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  status = EXCLUDED.status,
  current_sale_liters = EXCLUDED.current_sale_liters,
  current_sale_amount = EXCLUDED.current_sale_amount,
  totalizer_liters = EXCLUDED.totalizer_liters,
  sales_today_count = EXCLUDED.sales_today_count,
  volume_today = EXCLUDED.volume_today,
  revenue_today = EXCLUDED.revenue_today,
  operator_name = EXCLUDED.operator_name,
  last_seen_at = EXCLUDED.last_seen_at,
  updated_at = now();

INSERT INTO nozzles (id, dispenser_id, nozzle_number, fuel_product_id, status, last_seen_at)
VALUES
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1, '10000000-0000-4000-8000-000000000001', 'FILLING', now()),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 2, '10000000-0000-4000-8000-000000000001', 'ONLINE', now()),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 1, '10000000-0000-4000-8000-000000000002', 'ONLINE', now()),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', 2, '10000000-0000-4000-8000-000000000002', 'ONLINE', now()),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000003', 1, '10000000-0000-4000-8000-000000000003', 'PAYMENT', now()),
  ('30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000003', 2, '10000000-0000-4000-8000-000000000003', 'ONLINE', now()),
  ('30000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000004', 1, '10000000-0000-4000-8000-000000000001', 'FAULT', now() - interval '3 minutes'),
  ('30000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000004', 2, '10000000-0000-4000-8000-000000000001', 'FAULT', now() - interval '3 minutes')
ON CONFLICT (dispenser_id, nozzle_number) DO UPDATE SET
  fuel_product_id = EXCLUDED.fuel_product_id,
  status = EXCLUDED.status,
  last_seen_at = EXCLUDED.last_seen_at;

INSERT INTO operational_events (
  station_id, dispenser_id, severity, event_code, message_th, status, occurred_at
)
SELECT * FROM (VALUES
  ('00000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000004'::uuid, 'CRITICAL', 'GATEWAY_TIMEOUT', 'ตู้จ่าย P04 ไม่ตอบสนอง', 'OPEN', now() - interval '3 minutes'),
  ('00000000-0000-4000-8000-000000000001'::uuid, NULL::uuid, 'WARNING', 'LOW_INVENTORY', 'ระดับน้ำมัน Gasohol 91 ต่ำกว่าเกณฑ์', 'OPEN', now() - interval '18 minutes'),
  ('00000000-0000-4000-8000-000000000001'::uuid, NULL::uuid, 'INFO', 'SHIFT_REVIEW', 'มีกะที่รอตรวจสอบยอด', 'OPEN', now() - interval '42 minutes')
) AS seed(station_id, dispenser_id, severity, event_code, message_th, status, occurred_at)
WHERE NOT EXISTS (
  SELECT 1
  FROM operational_events existing
  WHERE existing.station_id = seed.station_id
    AND existing.event_code = seed.event_code
    AND existing.status IN ('OPEN','ACKNOWLEDGED')
);

COMMIT;
