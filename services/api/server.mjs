import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createLogger, serializeError } from "./logger.mjs";

const { Pool } = pg;
const port = Number(process.env.PORT ?? 3001);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const logger = createLogger();
const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";

function requestIdFrom(request) {
  const candidate = request.headers["x-request-id"];
  return typeof candidate === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(candidate) ? candidate : randomUUID();
}

function send(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": corsOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-user-id,x-request-id",
    "cache-control": "no-store",
    vary: "origin",
  });
  response.end(status === 204 ? undefined : JSON.stringify(payload));
}

async function readJson(request, maximumBytes = 32_768) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maximumBytes) {
      const error = new Error("request body is too large");
      error.statusCode = 413;
      error.code = "payload_too_large";
      throw error;
    }
  }
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error("request body must be valid JSON");
    error.statusCode = 400;
    error.code = "invalid_json";
    throw error;
  }
}

function requiredText(value, field, maximumLength) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maximumLength) {
    const error = new Error(`${field} is required and must be at most ${maximumLength} characters`);
    error.statusCode = 422;
    error.code = "validation_error";
    error.field = field;
    throw error;
  }
  return text;
}

function positiveNumber(value, field, decimals = 2) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    const error = new Error(`${field} must be a positive number`);
    error.statusCode = 422;
    error.code = "validation_error";
    error.field = field;
    throw error;
  }
  return Number(number.toFixed(decimals));
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

async function health(response) {
  const result = await pool.query("select current_database() as database, now() as time");
  send(response, 200, { status: "ok", service: "fuel-ops-api", ...result.rows[0] });
}

async function sampleDocument(response, url) {
  const documentType = url.searchParams.get("type") === "full" ? "FULL_TAX_INVOICE" : "ABBREVIATED_TAX_INVOICE";
  const result = await pool.query(
    `select td.document_number, td.document_type, td.status, td.issued_at,
            td.subtotal, td.vat_amount, td.grand_total, td.seller_snapshot,
            td.buyer_snapshot, td.print_count, s.transaction_number
       from tax_documents td
       join sales s on s.id = td.sale_id
      where td.document_type = $1
      order by td.issued_at desc
      limit 1`,
    [documentType],
  );

  if (!result.rowCount) {
    send(response, 404, { error: "sample_document_not_found" });
    return;
  }
  send(response, 200, result.rows[0]);
}

async function listDocuments(response, url) {
  const search = url.searchParams.get("search")?.trim() ?? "";
  const documentType = url.searchParams.get("type")?.trim() ?? "";
  const status = url.searchParams.get("status")?.trim() ?? "";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
  const result = await pool.query(
    `select td.id, td.document_number, td.document_type, td.status, td.issued_at,
            td.grand_total, td.print_count, s.transaction_number,
            coalesce(td.buyer_snapshot->>'legal_name_th', '') as buyer_name
       from tax_documents td
       join sales s on s.id = td.sale_id
      where ($1 = '' or td.document_number ilike '%' || $1 || '%' or s.transaction_number ilike '%' || $1 || '%')
        and ($2 = '' or td.document_type = $2)
        and ($3 = '' or td.status = $3)
      order by td.issued_at desc
      limit $4 offset $5`,
    [search, documentType, status, limit, offset],
  );
  send(response, 200, { items: result.rows, limit, offset });
}

async function documentDetails(response, documentId) {
  const result = await pool.query(
    `select td.*, s.transaction_number, s.operator_name, s.dispenser_code, s.sold_at,
            (select jsonb_agg(to_jsonb(si) order by si.line_number) from sale_items si where si.sale_id = s.id) as items,
            (select jsonb_agg(to_jsonb(p) order by p.paid_at) from payments p where p.sale_id = s.id) as payments,
            coalesce(
              jsonb_agg(jsonb_build_object(
                'id', pj.id,
                'copyType', pj.copy_type,
                'printerName', pj.printer_name,
                'printedBy', pj.printed_by,
                'printReason', pj.print_reason,
                'printedAt', pj.printed_at
              ) order by pj.printed_at desc) filter (where pj.id is not null),
              '[]'::jsonb
            ) as print_history
       from tax_documents td
       join sales s on s.id = td.sale_id
       left join print_jobs pj on pj.tax_document_id = td.id
      where td.id = $1
      group by td.id, s.id, s.transaction_number, s.operator_name, s.dispenser_code, s.sold_at`,
    [documentId],
  );
  if (!result.rowCount) return send(response, 404, { error: "document_not_found" });
  send(response, 200, result.rows[0]);
}

async function createPrintJob(request, response, documentId) {
  const actor = requiredText(request.headers["x-user-id"], "x-user-id", 200);
  const body = await readJson(request);
  const printerName = requiredText(body.printerName, "printerName", 200);
  const printReason = typeof body.printReason === "string" && body.printReason.trim()
    ? requiredText(body.printReason, "printReason", 500)
    : null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const documentResult = await client.query(
      `select id, station_id, document_number, status, print_count
         from tax_documents
        where id = $1
        for update`,
      [documentId],
    );
    if (!documentResult.rowCount) {
      await client.query("rollback");
      return send(response, 404, { error: "document_not_found" });
    }
    const document = documentResult.rows[0];
    if (document.status !== "ISSUED") {
      await client.query("rollback");
      return send(response, 409, { error: "document_not_printable", status: document.status });
    }
    const copyType = Number(document.print_count) === 0 ? "ORIGINAL" : "COPY";
    const printJobResult = await client.query(
      `insert into print_jobs (id, tax_document_id, copy_type, printer_name, printed_by, print_reason)
       values (gen_random_uuid(), $1, $2, $3, $4, $5)
       returning id, copy_type, printer_name, printed_by, print_reason, printed_at`,
      [documentId, copyType, printerName, actor, printReason],
    );
    const countResult = await client.query(
      `update tax_documents set print_count = print_count + 1 where id = $1 returning print_count`,
      [documentId],
    );
    await client.query(
      `insert into audit_logs (station_id, actor, action, entity_type, entity_id, after_data)
       values ($1, $2, 'DOCUMENT_PRINTED', 'TAX_DOCUMENT', $3, $4)`,
      [document.station_id, actor, String(documentId), JSON.stringify({
        documentNumber: document.document_number,
        copyType,
        printerName,
        printCount: countResult.rows[0].print_count,
      })],
    );
    await client.query("commit");
    send(response, 201, { ...printJobResult.rows[0], print_count: countResult.rows[0].print_count });
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function listCustomers(response, url) {
  const search = url.searchParams.get("search")?.trim() ?? "";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 25) || 25, 1), 100);
  const result = await pool.query(
    `select id, customer_type, legal_name_th, tax_id, branch_code, branch_label,
            address_th, vehicle_registration, vehicle_province
       from customers
      where ($1 = '' or legal_name_th ilike '%' || $1 || '%' or coalesce(tax_id, '') ilike '%' || $1 || '%')
      order by legal_name_th
      limit $2`,
    [search, limit],
  );
  send(response, 200, { items: result.rows });
}

async function createCustomer(request, response) {
  const actor = requiredText(request.headers["x-user-id"], "x-user-id", 200);
  const body = await readJson(request);
  const customerType = ["PERSON", "COMPANY", "GOVERNMENT"].includes(body.customerType) ? body.customerType : "COMPANY";
  const legalName = requiredText(body.legalName, "legalName", 250);
  const taxId = requiredText(body.taxId, "taxId", 13);
  if (!/^\d{13}$/.test(taxId)) {
    const error = new Error("taxId must contain exactly 13 digits");
    error.statusCode = 422; error.code = "validation_error"; error.field = "taxId"; throw error;
  }
  const branchCode = body.branchCode ? requiredText(body.branchCode, "branchCode", 5) : "00000";
  if (!/^\d{5}$/.test(branchCode)) {
    const error = new Error("branchCode must contain exactly 5 digits");
    error.statusCode = 422; error.code = "validation_error"; error.field = "branchCode"; throw error;
  }
  const branchLabel = body.branchLabel ? requiredText(body.branchLabel, "branchLabel", 100) : (branchCode === "00000" ? "สำนักงานใหญ่" : "สาขา");
  const address = requiredText(body.address, "address", 1000);
  const customerId = randomUUID();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const duplicate = await client.query(
      "select id from customers where tax_id = $1 and coalesce(branch_code, '00000') = $2 limit 1",
      [taxId, branchCode],
    );
    if (duplicate.rowCount) {
      await client.query("rollback");
      return send(response, 409, { error: "customer_already_exists", customerId: duplicate.rows[0].id });
    }
    const result = await client.query(
      `insert into customers (id, customer_type, legal_name_th, tax_id, branch_code, branch_label, address_th, vehicle_registration, vehicle_province)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       returning id, customer_type, legal_name_th, tax_id, branch_code, branch_label, address_th, vehicle_registration, vehicle_province`,
      [customerId, customerType, legalName, taxId, branchCode, branchLabel, address,
        body.vehicleRegistration ? requiredText(body.vehicleRegistration, "vehicleRegistration", 30) : null,
        body.vehicleProvince ? requiredText(body.vehicleProvince, "vehicleProvince", 100) : null],
    );
    await client.query(
      `insert into audit_logs (actor, action, entity_type, entity_id, after_data)
       values ($1,'CUSTOMER_CREATED','CUSTOMER',$2,$3)`,
      [actor, customerId, JSON.stringify({ legalName, taxId, branchCode })],
    );
    await client.query("commit");
    send(response, 201, result.rows[0]);
  } catch (error) {
    await client.query("rollback");
    if (error.code === "23505") {
      const existing = await client.query(
        "select id from customers where tax_id = $1 and coalesce(branch_code, '00000') = $2 limit 1",
        [taxId, branchCode],
      );
      return send(response, 409, { error: "customer_already_exists", customerId: existing.rows[0]?.id });
    }
    throw error;
  } finally {
    client.release();
  }
}

async function createSale(request, response) {
  const actor = requiredText(request.headers["x-user-id"], "x-user-id", 200);
  const body = await readJson(request);
  const stationCode = requiredText(body.stationCode, "stationCode", 20);
  const terminalCode = requiredText(body.terminalCode, "terminalCode", 30);
  const operatorName = requiredText(body.operatorName, "operatorName", 200);
  const dispenserCode = body.dispenserCode ? requiredText(body.dispenserCode, "dispenserCode", 20) : null;
  const documentType = body.documentType === "FULL_TAX_INVOICE" ? "FULL_TAX_INVOICE" : "ABBREVIATED_TAX_INVOICE";
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
    const error = new Error("items must contain between 1 and 20 entries");
    error.statusCode = 422; error.code = "validation_error"; error.field = "items"; throw error;
  }
  if (!Array.isArray(body.payments) || body.payments.length < 1 || body.payments.length > 5) {
    const error = new Error("payments must contain between 1 and 5 entries");
    error.statusCode = 422; error.code = "validation_error"; error.field = "payments"; throw error;
  }
  const items = body.items.map((item, index) => {
    const quantity = positiveNumber(item.quantity, `items[${index}].quantity`, 3);
    const unitPrice = positiveNumber(item.unitPrice, `items[${index}].unitPrice`, 4);
    const calculatedTotal = roundMoney(quantity * unitPrice);
    const lineTotal = item.lineTotal === undefined
      ? calculatedTotal
      : positiveNumber(item.lineTotal, `items[${index}].lineTotal`);
    if (Math.abs(lineTotal - calculatedTotal) > 0.05) {
      const error = new Error(`items[${index}].lineTotal differs from quantity multiplied by unit price`);
      error.statusCode = 422; error.code = "line_total_mismatch"; error.field = `items[${index}].lineTotal`; throw error;
    }
    return {
      productCode: requiredText(item.productCode, `items[${index}].productCode`, 50),
      description: requiredText(item.description, `items[${index}].description`, 250),
      quantity,
      unit: requiredText(item.unit ?? "L", `items[${index}].unit`, 20),
      unitPrice,
      lineTotal,
    };
  });
  const allowedPaymentMethods = new Set(["CASH", "CARD", "QR", "FLEET", "CREDIT"]);
  const payments = body.payments.map((payment, index) => {
    const method = requiredText(payment.method, `payments[${index}].method`, 30).toUpperCase();
    if (!allowedPaymentMethods.has(method)) {
      const error = new Error(`unsupported payment method: ${method}`);
      error.statusCode = 422; error.code = "validation_error"; error.field = `payments[${index}].method`; throw error;
    }
    return {
      method,
      amount: positiveNumber(payment.amount, `payments[${index}].amount`),
      referenceMasked: payment.referenceMasked ? requiredText(payment.referenceMasked, `payments[${index}].referenceMasked`, 100) : null,
    };
  });
  const grandTotal = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
  const paymentTotal = roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0));
  if (paymentTotal !== grandTotal) {
    const error = new Error("payment total must equal sale total");
    error.statusCode = 422; error.code = "payment_total_mismatch"; error.field = "payments"; throw error;
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    const taxRateResult = await client.query(
      `select rate from tax_rates
        where code = 'VAT' and effective_from <= current_date
          and (effective_to is null or effective_to >= current_date)
        order by effective_from desc limit 1`,
    );
    if (!taxRateResult.rowCount) {
      await client.query("rollback");
      return send(response, 422, { error: "active_tax_rate_not_found" });
    }
    const vatRate = Number(taxRateResult.rows[0].rate);
    const subtotal = roundMoney(grandTotal / (1 + vatRate / 100));
    const vatAmount = roundMoney(grandTotal - subtotal);
    const stationResult = await client.query(
      `select st.*, pt.id as terminal_id
         from stations st
         join pos_terminals pt on pt.station_id = st.id and pt.code = $2
        where st.code = $1`,
      [stationCode, terminalCode],
    );
    if (!stationResult.rowCount) {
      await client.query("rollback");
      return send(response, 404, { error: "station_or_terminal_not_found" });
    }
    let buyerSnapshot = null;
    let customerId = null;
    if (body.customerId) {
      const customerResult = await client.query("select * from customers where id = $1", [body.customerId]);
      if (!customerResult.rowCount) {
        await client.query("rollback");
        return send(response, 404, { error: "customer_not_found" });
      }
      const customer = customerResult.rows[0];
      customerId = customer.id;
      buyerSnapshot = {
        legalName: customer.legal_name_th,
        taxId: customer.tax_id,
        branchCode: customer.branch_code,
        branchLabel: customer.branch_label,
        address: customer.address_th,
        vehicleRegistration: body.vehicleRegistration
          ? requiredText(body.vehicleRegistration, "vehicleRegistration", 30)
          : customer.vehicle_registration,
        vehicleProvince: body.vehicleProvince
          ? requiredText(body.vehicleProvince, "vehicleProvince", 100)
          : customer.vehicle_province,
      };
    }
    if (documentType === "FULL_TAX_INVOICE" && !buyerSnapshot) {
      await client.query("rollback");
      return send(response, 422, { error: "customer_required_for_full_tax_invoice", field: "customerId" });
    }
    const station = stationResult.rows[0];
    const saleId = randomUUID();
    const documentId = randomUUID();
    const transactionNumber = `TXN-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const sequenceResult = await client.query(
      `insert into document_sequences (station_id, document_type, period, last_number)
       values ($1, $2, to_char(current_timestamp at time zone 'Asia/Bangkok', 'YYMM'), 1)
       on conflict (station_id, document_type, period)
       do update set last_number = document_sequences.last_number + 1
       returning period, last_number`,
      [station.id, documentType],
    );
    const sequence = sequenceResult.rows[0];
    const prefix = documentType === "FULL_TAX_INVOICE" ? "TX" : "TI";
    const documentNumber = `${prefix}${sequence.period}-${String(sequence.last_number).padStart(6, "0")}`;
    await client.query(
      `insert into sales (id, station_id, pos_terminal_id, customer_id, transaction_number, dispenser_code, operator_name, sold_at, subtotal, vat_amount, grand_total, status)
       values ($1,$2,$3,$4,$5,$6,$7,now(),$8,$9,$10,'COMPLETED')`,
      [saleId, station.id, station.terminal_id, customerId, transactionNumber, dispenserCode, operatorName, subtotal, vatAmount, grandTotal],
    );
    for (const [index, item] of items.entries()) {
      await client.query(
        `insert into sale_items (id, sale_id, line_number, product_code, description_th, quantity, unit, unit_price, line_total, tax_rate)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [randomUUID(), saleId, index + 1, item.productCode, item.description, item.quantity, item.unit, item.unitPrice, item.lineTotal, vatRate],
      );
    }
    for (const payment of payments) {
      await client.query(
        `insert into payments (id, sale_id, method, amount, reference_masked, paid_at) values ($1,$2,$3,$4,$5,now())`,
        [randomUUID(), saleId, payment.method, payment.amount, payment.referenceMasked],
      );
    }
    const sellerSnapshot = { legalName: station.legal_name_th, taxId: station.tax_id, branchCode: station.branch_code, branchLabel: station.branch_label, address: station.address_th };
    await client.query(
      `insert into tax_documents (id, station_id, sale_id, document_type, document_number, status, issued_at, seller_snapshot, buyer_snapshot, subtotal, vat_rate, vat_amount, grand_total)
       values ($1,$2,$3,$4,$5,'ISSUED',now(),$6,$7,$8,$9,$10,$11)`,
      [documentId, station.id, saleId, documentType, documentNumber, JSON.stringify(sellerSnapshot), buyerSnapshot ? JSON.stringify(buyerSnapshot) : null, subtotal, vatRate, vatAmount, grandTotal],
    );
    await client.query(
      `insert into audit_logs (station_id, actor, action, entity_type, entity_id, after_data)
       values ($1,$2,'SALE_COMPLETED','SALE',$3,$4)`,
      [station.id, actor, saleId, JSON.stringify({ transactionNumber, documentId, documentNumber, grandTotal, payments: payments.map(({ method, amount }) => ({ method, amount })) })],
    );
    await client.query("commit");
    send(response, 201, { saleId, transactionNumber, documentId, documentNumber, documentType, subtotal, vatAmount, grandTotal });
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function operationsOverview(response, url) {
  const stationCode = url.searchParams.get("station") ?? "PT-001";
  const [summaryResult, dispensersResult] = await Promise.all([
    pool.query(
      `select st.code as station_code,
              st.name_th as station_name,
              count(distinct n.id) as total_nozzles,
              count(distinct n.id) filter (where n.status <> 'FAULT') as active_nozzles,
              coalesce((select sum(d2.revenue_today) from dispensers d2 where d2.station_id = st.id), 0) as shift_revenue,
              coalesce((select sum(d2.volume_today) from dispensers d2 where d2.station_id = st.id), 0) as volume_sold,
              (select count(*) from operational_events oe where oe.station_id = st.id and oe.status in ('OPEN','ACKNOWLEDGED')) as open_events,
              max(d.last_seen_at) as updated_at
         from stations st
         left join dispensers d on d.station_id = st.id
         left join nozzles n on n.dispenser_id = d.id
        where st.code = $1
        group by st.id, st.code, st.name_th`,
      [stationCode],
    ),
    pool.query(
      `select d.code,
              d.display_name,
              d.status,
              d.current_sale_liters,
              d.current_sale_amount,
              d.totalizer_liters,
              d.sales_today_count,
              d.volume_today,
              d.revenue_today,
              d.operator_name,
              d.last_seen_at,
              coalesce(min(fp.name_en), 'Unassigned') as fuel,
              coalesce(min(fp.current_price), 0) as price_per_liter,
              count(n.id) as nozzle_count
         from dispensers d
         join stations st on st.id = d.station_id
         left join nozzles n on n.dispenser_id = d.id
         left join fuel_products fp on fp.id = n.fuel_product_id
        where st.code = $1
        group by d.id
        order by d.code`,
      [stationCode],
    ),
  ]);

  if (!summaryResult.rowCount) {
    send(response, 404, { error: "station_not_found", stationCode });
    return;
  }

  const summary = summaryResult.rows[0];
  send(response, 200, {
    station: {
      code: summary.station_code,
      name: summary.station_name,
    },
    summary: {
      activeNozzles: Number(summary.active_nozzles),
      totalNozzles: Number(summary.total_nozzles),
      shiftRevenue: toNumber(summary.shift_revenue),
      volumeSold: toNumber(summary.volume_sold),
      openEvents: Number(summary.open_events),
    },
    dispensers: dispensersResult.rows.map((row) => ({
      id: row.code,
      name: row.display_name,
      fuel: row.fuel,
      state: row.status,
      currentSaleLiters: toNumber(row.current_sale_liters),
      currentSaleAmount: toNumber(row.current_sale_amount),
      pricePerLiter: toNumber(row.price_per_liter),
      totalizerLiters: toNumber(row.totalizer_liters),
      salesTodayCount: Number(row.sales_today_count),
      volumeToday: toNumber(row.volume_today),
      revenueToday: toNumber(row.revenue_today),
      operatorName: row.operator_name,
      nozzleCount: Number(row.nozzle_count),
      lastSeenAt: row.last_seen_at,
    })),
    updatedAt: summary.updated_at,
  });
}

async function listOperationalEvents(response, url) {
  const stationCode = url.searchParams.get("station") ?? "PT-001";
  const result = await pool.query(
    `select oe.id, oe.severity, oe.event_code, oe.message_th, oe.status,
            oe.occurred_at, d.code as dispenser_code
       from operational_events oe
       join stations st on st.id = oe.station_id
       left join dispensers d on d.id = oe.dispenser_id
      where st.code = $1
        and oe.status in ('OPEN','ACKNOWLEDGED')
      order by oe.occurred_at desc
      limit 50`,
    [stationCode],
  );
  send(response, 200, { items: result.rows });
}

const server = createServer(async (request, response) => {
  const startedAt = process.hrtime.bigint();
  const requestId = requestIdFrom(request);
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  response.setHeader("x-request-id", requestId);
  response.once("finish", () => {
    logger.info("request_completed", {
      requestId,
      method: request.method,
      path: requestUrl.pathname,
      statusCode: response.statusCode,
      durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
    });
  });

  if (request.method === "OPTIONS") {
    send(response, 204, {});
    return;
  }

  try {
    const url = requestUrl;
    const documentPath = url.pathname.match(/^\/api\/documents\/([0-9a-f-]{36})$/i);
    const printPath = url.pathname.match(/^\/api\/documents\/([0-9a-f-]{36})\/prints$/i);
    if (request.method === "GET" && url.pathname === "/health") return await health(response);
    if (request.method === "GET" && url.pathname === "/api/documents/sample") return await sampleDocument(response, url);
    if (request.method === "GET" && url.pathname === "/api/documents") return await listDocuments(response, url);
    if (request.method === "GET" && url.pathname === "/api/customers") return await listCustomers(response, url);
    if (request.method === "POST" && url.pathname === "/api/customers") return await createCustomer(request, response);
    if (request.method === "POST" && url.pathname === "/api/sales") return await createSale(request, response);
    if (request.method === "GET" && documentPath) return await documentDetails(response, documentPath[1]);
    if (request.method === "POST" && printPath) return await createPrintJob(request, response, printPath[1]);
    if (request.method === "GET" && url.pathname === "/api/operations/overview") return await operationsOverview(response, url);
    if (request.method === "GET" && url.pathname === "/api/operations/events") return await listOperationalEvents(response, url);
    send(response, 404, { error: "not_found" });
  } catch (error) {
    logger.error("request_failed", {
      requestId,
      method: request.method,
      path: requestUrl.pathname,
      error: serializeError(error),
    });
    if (!response.headersSent) {
      const statusCode = Number(error.statusCode) || 500;
      send(response, statusCode, {
        error: statusCode < 500 ? error.code ?? "bad_request" : "internal_error",
        ...(error.field ? { field: error.field } : {}),
        requestId,
      });
    }
    else response.destroy();
  }
});

async function shutdown() {
  logger.info("service_stopping", { signal: "shutdown" });
  server.close();
  await pool.end();
  process.exit(0);
}

pool.on("error", (error) => logger.error("database_pool_error", { error: serializeError(error) }));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
server.listen(port, "0.0.0.0", () => logger.info("service_started", { port }));
