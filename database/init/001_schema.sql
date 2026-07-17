BEGIN;

CREATE TABLE stations (
  id uuid PRIMARY KEY,
  code varchar(20) NOT NULL UNIQUE,
  name_th varchar(200) NOT NULL,
  legal_name_th varchar(250) NOT NULL,
  tax_id varchar(13) NOT NULL,
  branch_code varchar(5) NOT NULL,
  branch_label varchar(100) NOT NULL,
  address_th text NOT NULL,
  phone varchar(30),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pos_terminals (
  id uuid PRIMARY KEY,
  station_id uuid NOT NULL REFERENCES stations(id),
  code varchar(30) NOT NULL,
  display_name varchar(100) NOT NULL,
  UNIQUE (station_id, code)
);

CREATE TABLE customers (
  id uuid PRIMARY KEY,
  customer_type varchar(20) NOT NULL CHECK (customer_type IN ('PERSON','COMPANY','GOVERNMENT')),
  legal_name_th varchar(250) NOT NULL,
  tax_id varchar(13),
  branch_code varchar(5),
  branch_label varchar(100),
  address_th text,
  vehicle_registration varchar(30),
  vehicle_province varchar(100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tax_rates (
  id bigserial PRIMARY KEY,
  code varchar(20) NOT NULL,
  rate numeric(5,2) NOT NULL CHECK (rate >= 0),
  effective_from date NOT NULL,
  effective_to date,
  UNIQUE (code, effective_from),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE sales (
  id uuid PRIMARY KEY,
  station_id uuid NOT NULL REFERENCES stations(id),
  pos_terminal_id uuid NOT NULL REFERENCES pos_terminals(id),
  customer_id uuid REFERENCES customers(id),
  transaction_number varchar(40) NOT NULL UNIQUE,
  dispenser_code varchar(20),
  operator_name varchar(200) NOT NULL,
  sold_at timestamptz NOT NULL,
  subtotal numeric(14,2) NOT NULL,
  vat_amount numeric(14,2) NOT NULL,
  grand_total numeric(14,2) NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('COMPLETED','VOIDED','REFUNDED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sale_items (
  id uuid PRIMARY KEY,
  sale_id uuid NOT NULL REFERENCES sales(id),
  line_number integer NOT NULL,
  product_code varchar(50) NOT NULL,
  description_th varchar(250) NOT NULL,
  quantity numeric(14,3) NOT NULL,
  unit varchar(20) NOT NULL,
  unit_price numeric(14,4) NOT NULL,
  line_total numeric(14,2) NOT NULL,
  tax_rate numeric(5,2) NOT NULL,
  UNIQUE (sale_id, line_number)
);

CREATE TABLE payments (
  id uuid PRIMARY KEY,
  sale_id uuid NOT NULL REFERENCES sales(id),
  method varchar(30) NOT NULL CHECK (method IN ('CASH','CARD','QR','FLEET','CREDIT')),
  amount numeric(14,2) NOT NULL,
  reference_masked varchar(100),
  paid_at timestamptz NOT NULL
);

CREATE TABLE document_sequences (
  station_id uuid NOT NULL REFERENCES stations(id),
  document_type varchar(40) NOT NULL,
  period varchar(6) NOT NULL,
  last_number bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (station_id, document_type, period)
);

CREATE TABLE tax_documents (
  id uuid PRIMARY KEY,
  station_id uuid NOT NULL REFERENCES stations(id),
  sale_id uuid NOT NULL REFERENCES sales(id),
  original_document_id uuid REFERENCES tax_documents(id),
  document_type varchar(40) NOT NULL CHECK (document_type IN ('ABBREVIATED_TAX_INVOICE','FULL_TAX_INVOICE','RECEIPT','CREDIT_NOTE','DEBIT_NOTE','REPLACEMENT')),
  document_number varchar(40) NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('ISSUED','VOIDED','REPLACED')),
  issued_at timestamptz NOT NULL,
  seller_snapshot jsonb NOT NULL,
  buyer_snapshot jsonb,
  subtotal numeric(14,2) NOT NULL,
  vat_rate numeric(5,2) NOT NULL,
  vat_amount numeric(14,2) NOT NULL,
  grand_total numeric(14,2) NOT NULL,
  print_count integer NOT NULL DEFAULT 0 CHECK (print_count >= 0),
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_id, document_number)
);

CREATE TABLE print_jobs (
  id uuid PRIMARY KEY,
  tax_document_id uuid NOT NULL REFERENCES tax_documents(id),
  copy_type varchar(20) NOT NULL CHECK (copy_type IN ('ORIGINAL','COPY','REPLACEMENT')),
  printer_name varchar(200) NOT NULL,
  printed_by varchar(200) NOT NULL,
  print_reason text,
  printed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  station_id uuid REFERENCES stations(id),
  actor varchar(200) NOT NULL,
  action varchar(100) NOT NULL,
  entity_type varchar(100) NOT NULL,
  entity_id varchar(100) NOT NULL,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sales_sold_at_idx ON sales (station_id, sold_at DESC);
CREATE INDEX tax_documents_sale_idx ON tax_documents (sale_id);
CREATE INDEX tax_documents_issued_idx ON tax_documents (station_id, issued_at DESC);
CREATE INDEX print_jobs_document_idx ON print_jobs (tax_document_id, printed_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, occurred_at DESC);

COMMIT;

