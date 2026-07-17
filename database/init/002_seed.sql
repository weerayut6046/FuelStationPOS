BEGIN;

INSERT INTO stations (id, code, name_th, legal_name_th, tax_id, branch_code, branch_label, address_th, phone)
VALUES ('00000000-0000-4000-8000-000000000001', 'PT-001', 'สถานี Fuel Ops ปทุมธานี', 'บริษัท ฟิวเอล โอพีเอส จำกัด', '0105567000001', '00001', 'สาขา', '88/8 หมู่ 4 ถนนรังสิต–นครนายก อำเภอธัญบุรี จังหวัดปทุมธานี 12110', '02-000-0000');

INSERT INTO pos_terminals (id, station_id, code, display_name)
VALUES ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'POS-01', 'จุดขาย 1');

INSERT INTO customers (id, customer_type, legal_name_th, tax_id, branch_code, branch_label, address_th, vehicle_registration, vehicle_province)
VALUES ('00000000-0000-4000-8000-000000000021', 'COMPANY', 'บริษัท เอส พี เพาเวอร์ เซอร์วิส 2015 จำกัด', '0135558009925', '00000', 'สำนักงานใหญ่', '60/599 หมู่ 7 ตำบลลำลูกกา อำเภอลำลูกกา จังหวัดปทุมธานี 12150', '3ขธ 1955', 'กรุงเทพมหานคร');

INSERT INTO tax_rates (code, rate, effective_from, effective_to)
VALUES ('VAT', 7.00, '2025-10-01', '2026-09-30');

INSERT INTO sales (id, station_id, pos_terminal_id, customer_id, transaction_number, dispenser_code, operator_name, sold_at, subtotal, vat_amount, grand_total, status)
VALUES ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000021', '11260717080100080', 'P03', 'สมชาย', '2026-07-17T08:39:27+07:00', 934.58, 65.42, 1000.00, 'COMPLETED');

INSERT INTO sale_items (id, sale_id, line_number, product_code, description_th, quantity, unit, unit_price, line_total, tax_rate)
VALUES ('00000000-0000-4000-8000-000000000041', '00000000-0000-4000-8000-000000000031', 1, 'DIESEL-B7', 'ผลิตภัณฑ์ HIDIESEL B7', 26.667, 'L', 37.5000, 1000.00, 7.00);

INSERT INTO payments (id, sale_id, method, amount, reference_masked, paid_at)
VALUES ('00000000-0000-4000-8000-000000000051', '00000000-0000-4000-8000-000000000031', 'QR', 1000.00, 'xxxx-5151', '2026-07-17T08:39:27+07:00');

INSERT INTO tax_documents (id, station_id, sale_id, document_type, document_number, status, issued_at, seller_snapshot, buyer_snapshot, subtotal, vat_rate, vat_amount, grand_total)
VALUES
  ('00000000-0000-4000-8000-000000000061', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000031', 'ABBREVIATED_TAX_INVOICE', 'TI2607-00459', 'ISSUED', '2026-07-17T08:43:48+07:00', '{"legalName":"บริษัท ฟิวเอล โอพีเอส จำกัด","taxId":"0105567000001","branchCode":"00001","branchLabel":"สาขา","address":"88/8 หมู่ 4 ถนนรังสิต–นครนายก อำเภอธัญบุรี จังหวัดปทุมธานี 12110"}', NULL, 934.58, 7.00, 65.42, 1000.00),
  ('00000000-0000-4000-8000-000000000062', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000031', 'FULL_TAX_INVOICE', 'TX2607-000128', 'ISSUED', '2026-07-17T08:40:02+07:00', '{"legalName":"บริษัท ฟิวเอล โอพีเอส จำกัด","taxId":"0105567000001","branchCode":"00001","branchLabel":"สาขา","address":"88/8 หมู่ 4 ถนนรังสิต–นครนายก อำเภอธัญบุรี จังหวัดปทุมธานี 12110"}', '{"legalName":"บริษัท เอส พี เพาเวอร์ เซอร์วิส 2015 จำกัด","taxId":"0135558009925","branchCode":"00000","branchLabel":"สำนักงานใหญ่","address":"60/599 หมู่ 7 ตำบลลำลูกกา อำเภอลำลูกกา จังหวัดปทุมธานี 12150"}', 934.58, 7.00, 65.42, 1000.00);

COMMIT;

