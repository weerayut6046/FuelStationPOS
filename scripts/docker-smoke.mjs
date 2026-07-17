import assert from "node:assert/strict";

const apiUrl = process.env.SMOKE_API_URL ?? "http://127.0.0.1:3001";
const webUrl = process.env.SMOKE_WEB_URL ?? "http://127.0.0.1:3000";

async function json(path, options) {
  const response = await fetch(`${apiUrl}${path}`, options);
  const payload = await response.json();
  assert.ok(response.ok, `${options?.method ?? "GET"} ${path} returned ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

const health = await json("/health");
assert.equal(health.status, "ok");

const sale = await json("/api/sales", {
  method: "POST",
  headers: { "content-type": "application/json", "x-user-id": "ci-smoke-test" },
  body: JSON.stringify({
    stationCode: "PT-001",
    terminalCode: "POS-01",
    operatorName: "CI Operator",
    dispenserCode: "P01",
    documentType: "ABBREVIATED_TAX_INVOICE",
    items: [{ productCode: "DIESEL-B7", description: "HIDIESEL B7", quantity: 26.667, unit: "L", unitPrice: 37.5, lineTotal: 1000 }],
    payments: [{ method: "CASH", amount: 1000 }],
  }),
});
assert.equal(sale.grandTotal, 1000);
assert.equal(round(sale.subtotal + sale.vatAmount), sale.grandTotal);

const documents = await json(`/api/documents?search=${encodeURIComponent(sale.transactionNumber)}&limit=2`);
assert.equal(documents.items.length, 1);
assert.equal(documents.items[0].id, sale.documentId);

const document = await json(`/api/documents/${documents.items[0].id}`);
assert.equal(document.id, documents.items[0].id);
assert.ok(Array.isArray(document.items));
assert.ok(Array.isArray(document.payments));

const printJob = await json(`/api/documents/${document.id}/prints`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-user-id": "ci-smoke-test" },
  body: JSON.stringify({ printerName: "CI Virtual Printer", printReason: "Docker smoke test" }),
});
assert.ok(Number(printJob.print_count) >= 1);

const verified = await json(`/api/documents/${document.id}`);
assert.ok(verified.print_history.some((item) => item.printedBy === "ci-smoke-test"));

const taxId = String(Date.now()).slice(0, 13);
const customer = await json("/api/customers", {
  method: "POST",
  headers: { "content-type": "application/json", "x-user-id": "ci-smoke-test" },
  body: JSON.stringify({
    legalName: "บริษัท ทดสอบระบบ จำกัด",
    taxId,
    branchCode: "00000",
    address: "99 ถนนทดสอบ เขตทดสอบ กรุงเทพมหานคร 10000",
  }),
});
assert.equal(customer.tax_id, taxId);
const customerSearch = await json(`/api/customers?search=${taxId}`);
assert.equal(customerSearch.items[0].id, customer.id);

const fullInvoiceSale = await json("/api/sales", {
  method: "POST",
  headers: { "content-type": "application/json", "x-user-id": "ci-smoke-test" },
  body: JSON.stringify({
    stationCode: "PT-001",
    terminalCode: "POS-01",
    operatorName: "CI Operator",
    dispenserCode: "P02",
    documentType: "FULL_TAX_INVOICE",
    customerId: customer.id,
    items: [{ productCode: "GASOHOL-95", description: "Gasohol 95", quantity: 10, unit: "L", unitPrice: 50 }],
    payments: [{ method: "QR", amount: 500 }],
  }),
});
const fullInvoice = await json(`/api/documents/${fullInvoiceSale.documentId}`);
assert.equal(fullInvoice.document_type, "FULL_TAX_INVOICE");
assert.equal(fullInvoice.buyer_snapshot.taxId, taxId);
assert.equal(fullInvoice.buyer_snapshot.legalName, "บริษัท ทดสอบระบบ จำกัด");

const webResponse = await fetch(webUrl);
assert.equal(webResponse.status, 200);
assert.match(await webResponse.text(), /บันทึกการขายน้ำมัน/);

console.log(`Docker smoke test passed for ${document.document_number}`);

function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
