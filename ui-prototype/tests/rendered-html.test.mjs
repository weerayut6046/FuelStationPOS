import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Fuel Ops command center", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="th">/i);
  assert.match(html, /<title>Fuel Ops — 3D Digital Twin Command Center<\/title>/i);
  assert.match(html, /3D COMMAND/);
  assert.match(html, /2D WORKSPACE/);
  assert.match(html, /DOCUMENTS/);
  assert.match(html, /บันทึกการขายน้ำมัน/);
  assert.match(html, /Dispenser 01/);
  assert.match(html, /ใบเสร็จรับเงิน\/ใบกำกับภาษีอย่างย่อ/);
});

test("keeps API polling and safe demo fallback available", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /NEXT_PUBLIC_API_URL/);
  assert.match(page, /\/api\/operations\/overview\?station=PT-001/);
  assert.match(page, /cache:\s*"no-store"/);
  assert.match(page, /window\.setInterval\(loadOperations,\s*5000\)/);
  assert.match(page, /setConnectionState\("live"\)/);
  assert.match(page, /setConnectionState\("fallback"\)/);
  assert.match(page, /API OFFLINE · USING SAFE DEMO DATA/);
  assert.match(page, /\/api\/documents\?search=/);
  assert.match(page, /\/api\/sales/);
  assert.match(page, /useState<SaleEntryUnit>\("BAHT"\)/);
  assert.match(page, /<option value="BAHT">บาท<\/option><option value="LITER">ลิตร<\/option>/);
  assert.match(page, /\/api\/documents\/\$\{selectedDocument\.id\}\/prints/);
  assert.match(page, /<ThermalReceipt copyLabel="สำเนา" document=\{selectedDocument\} \/>/);
  assert.match(page, /<FullTaxInvoice copyLabel="สำเนา" document=\{selectedDocument\} \/>/);
  assert.doesNotMatch(page, /เอกสารฉบับนี้สร้างจากระบบคอมพิวเตอร์/);
});
