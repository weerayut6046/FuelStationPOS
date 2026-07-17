import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createLogger, serializeError } from "./logger.mjs";

const { Pool } = pg;
const port = Number(process.env.PORT ?? 3001);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const logger = createLogger();

function requestIdFrom(request) {
  const candidate = request.headers["x-request-id"];
  return typeof candidate === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(candidate) ? candidate : randomUUID();
}

function send(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-user-id,x-request-id",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
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

async function listDocuments(response) {
  const result = await pool.query(
    `select document_number, document_type, status, issued_at, grand_total, print_count
       from tax_documents
      order by issued_at desc
      limit 50`,
  );
  send(response, 200, { items: result.rows });
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
    if (request.method === "GET" && url.pathname === "/health") return await health(response);
    if (request.method === "GET" && url.pathname === "/api/documents/sample") return await sampleDocument(response, url);
    if (request.method === "GET" && url.pathname === "/api/documents") return await listDocuments(response);
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
    if (!response.headersSent) send(response, 500, { error: "internal_error", requestId });
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
