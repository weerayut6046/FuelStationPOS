"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type PumpState = "ONLINE" | "FILLING" | "PAYMENT" | "FAULT";
type DocumentMode = "thermal" | "full";
type WorkspaceFilter = "ALL" | "ONLINE" | "ATTENTION";
type ConnectionState = "connecting" | "live" | "fallback";
type SaleEntryUnit = "BAHT" | "LITER";

type Pump = {
  id: string;
  name: string;
  fuel: string;
  state: PumpState;
  liters: string;
  amount: string;
  price: string;
  totalizer: string;
  salesToday: number;
  volumeToday: number;
  operator: string;
  total: string;
  className: string;
};

type OperationsSummary = {
  activeNozzles: number;
  totalNozzles: number;
  shiftRevenue: number;
  volumeSold: number;
  openEvents: number;
};

type OperationsResponse = {
  summary: OperationsSummary;
  dispensers: Array<{
    id: string;
    name: string;
    fuel: string;
    state: PumpState;
    currentSaleLiters: number | null;
    currentSaleAmount: number | null;
    pricePerLiter: number;
    totalizerLiters: number;
    salesTodayCount: number;
    volumeToday: number;
    revenueToday: number;
    operatorName: string | null;
  }>;
  updatedAt: string;
};

type DocumentSummary = {
  id: string;
  document_number: string;
  document_type: string;
  status: string;
  issued_at: string;
  grand_total: string;
  print_count: number;
  transaction_number: string;
};

type DocumentDetail = DocumentSummary & {
  seller_snapshot: { legalName?: string; taxId?: string; branchCode?: string; branchLabel?: string; address?: string };
  buyer_snapshot: { legalName?: string; taxId?: string; branchLabel?: string; address?: string } | null;
  subtotal: string;
  vat_rate: string;
  vat_amount: string;
  operator_name: string;
  dispenser_code: string;
  sold_at: string;
  items: Array<{ description_th: string; product_code: string; quantity: string; unit: string; unit_price: string; line_total: string }>;
  payments: Array<{ method: string; amount: string; reference_masked: string | null }>;
  print_history: Array<{ id: string; copyType: string; printedBy: string; printedAt: string }>;
};

const initialPumps: Pump[] = [
  { id: "P01", name: "Dispenser 01", fuel: "Diesel B7", state: "FILLING", liters: "18.42", amount: "฿612.50", price: "฿33.25", totalizer: "428,912.44", salesToday: 34, volumeToday: 2050, operator: "สมชาย · กะเช้า", total: "฿36,840", className: "hotspot-p01" },
  { id: "P02", name: "Dispenser 02", fuel: "Gasohol 95", state: "ONLINE", liters: "—", amount: "—", price: "฿36.50", totalizer: "391,205.18", salesToday: 29, volumeToday: 1840, operator: "วราภรณ์ · กะเช้า", total: "฿29,120", className: "hotspot-p02" },
  { id: "P03", name: "Dispenser 03", fuel: "Gasohol 91", state: "PAYMENT", liters: "32.08", amount: "฿1,174.00", price: "฿35.75", totalizer: "512,884.62", salesToday: 41, volumeToday: 2760, operator: "สมชาย · กะเช้า", total: "฿41,305", className: "hotspot-p03" },
  { id: "P04", name: "Dispenser 04", fuel: "Diesel B7", state: "FAULT", liters: "—", amount: "—", price: "฿33.25", totalizer: "287,994.77", salesToday: 22, volumeToday: 1776, operator: "Gateway ไม่ตอบสนอง", total: "฿22,480", className: "hotspot-p04" },
];

const initialSummary: OperationsSummary = {
  activeNozzles: 6,
  totalNozzles: 8,
  shiftRevenue: 129745,
  volumeSold: 8426,
  openEvents: 3,
};

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const hotspotById: Record<string, string> = {
  P01: "hotspot-p01",
  P02: "hotspot-p02",
  P03: "hotspot-p03",
  P04: "hotspot-p04",
};

const formatNumber = (value: number, digits = 0) => value.toLocaleString("en-US", {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
});
const formatMoney = (value: number, digits = 0) => `฿${formatNumber(value, digits)}`;

const stateThai: Record<PumpState, string> = {
  ONLINE: "พร้อมใช้งาน",
  FILLING: "กำลังจ่าย",
  PAYMENT: "รอชำระ",
  FAULT: "ขัดข้อง",
};

export default function Home() {
  const [pumps, setPumps] = useState<Pump[]>(initialPumps);
  const [summary, setSummary] = useState<OperationsSummary>(initialSummary);
  const [connectionState, setConnectionState] = useState<ConnectionState>(apiUrl ? "connecting" : "fallback");
  const [workspaceFilter, setWorkspaceFilter] = useState<WorkspaceFilter>("ALL");
  const [selectedId, setSelectedId] = useState("P01");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [saleQuantity, setSaleQuantity] = useState("1000");
  const [saleEntryUnit, setSaleEntryUnit] = useState<SaleEntryUnit>("BAHT");
  const [saleUnitPrice, setSaleUnitPrice] = useState("50");
  const [salePaymentMethod, setSalePaymentMethod] = useState("CASH");
  const [saleSubmitting, setSaleSubmitting] = useState(false);
  const [documentMode, setDocumentMode] = useState<DocumentMode>("thermal");
  const [documentSearch, setDocumentSearch] = useState("");
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<DocumentDetail | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [notice, setNotice] = useState("DIGITAL TWIN CONNECTED · 12 MS");

  const selected = useMemo(() => pumps.find((pump) => pump.id === selectedId) ?? pumps[0] ?? initialPumps[0], [pumps, selectedId]);
  const filteredPumps = useMemo(() => pumps.filter((pump) => {
    if (workspaceFilter === "ONLINE") return pump.state === "ONLINE" || pump.state === "FILLING";
    if (workspaceFilter === "ATTENTION") return pump.state === "PAYMENT" || pump.state === "FAULT";
    return true;
  }), [pumps, workspaceFilter]);

  useEffect(() => {
    if (!apiUrl) return;
    let cancelled = false;
    let firstLoad = true;

    const loadOperations = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/operations/overview?station=PT-001`, { cache: "no-store" });
        if (!response.ok) throw new Error(`operations_api_${response.status}`);
        const data = await response.json() as OperationsResponse;
        if (cancelled) return;

        setSummary(data.summary);
        setPumps(data.dispensers.map((pump) => ({
          id: pump.id,
          name: pump.name,
          fuel: pump.fuel,
          state: pump.state,
          liters: pump.currentSaleLiters === null ? "—" : formatNumber(pump.currentSaleLiters, 2),
          amount: pump.currentSaleAmount === null ? "—" : formatMoney(pump.currentSaleAmount, 2),
          price: formatMoney(pump.pricePerLiter, 2),
          totalizer: formatNumber(pump.totalizerLiters, 2),
          salesToday: pump.salesTodayCount,
          volumeToday: pump.volumeToday,
          operator: pump.operatorName ?? "ไม่ได้ระบุผู้ปฏิบัติงาน",
          total: formatMoney(pump.revenueToday),
          className: hotspotById[pump.id] ?? "",
        })));
        setConnectionState("live");
        if (firstLoad) setNotice("POSTGRESQL LIVE · DISPENSER DATA SYNCED");
      } catch {
        if (cancelled) return;
        setConnectionState("fallback");
        if (firstLoad) setNotice("API OFFLINE · USING SAFE DEMO DATA");
      } finally {
        firstLoad = false;
      }
    };

    void loadOperations();
    const refreshTimer = window.setInterval(loadOperations, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, []);

  useEffect(() => {
    if (!documentOpen || !apiUrl) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setDocumentsLoading(true);
      try {
        const response = await fetch(`${apiUrl}/api/documents?search=${encodeURIComponent(documentSearch)}&limit=25`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`documents_api_${response.status}`);
        const data = await response.json() as { items: DocumentSummary[] };
        setDocuments(data.items);
        const preferred = data.items.find((item) => documentMode === "full"
          ? item.document_type === "FULL_TAX_INVOICE"
          : item.document_type === "ABBREVIATED_TAX_INVOICE") ?? data.items[0];
        if (preferred) {
          const detailResponse = await fetch(`${apiUrl}/api/documents/${preferred.id}`, { cache: "no-store", signal: controller.signal });
          if (!detailResponse.ok) throw new Error(`document_api_${detailResponse.status}`);
          setSelectedDocument(await detailResponse.json() as DocumentDetail);
        } else {
          setSelectedDocument(null);
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") setNotice("DOCUMENT API ERROR · RETRY REQUIRED");
      } finally {
        setDocumentsLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [documentOpen, documentSearch, documentMode]);

  const selectPump = (id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
    setNotice(`${id} SELECTED · REALTIME DATA UPDATED`);
  };

  const exportDispenserReport = () => {
    const escapeCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const rows = [
      ["Dispenser", "Fuel", "Status", "Current litres", "Current amount", "Operator", "Sales today", "Revenue today"],
      ...pumps.map((pump) => [pump.id, pump.fuel, pump.state, pump.liters, pump.amount, pump.operator, pump.salesToday, pump.total]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fuel-ops-dispensers-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("DISPENSER REPORT EXPORTED · CSV READY");
  };

  const openDocuments = (mode: DocumentMode = "thermal") => {
    setDocumentMode(mode);
    setDocumentOpen(true);
    setWorkspaceOpen(false);
    setDrawerOpen(false);
    setNotice("DOCUMENT CENTER · POSTGRESQL RECORD READY");
  };

  const submitSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!apiUrl || saleSubmitting) return;
    const enteredValue = Number(saleQuantity);
    const unitPrice = Number(saleUnitPrice);
    const amount = saleEntryUnit === "BAHT"
      ? Math.round((enteredValue + Number.EPSILON) * 100) / 100
      : Math.round((enteredValue * unitPrice + Number.EPSILON) * 100) / 100;
    const quantity = saleEntryUnit === "BAHT"
      ? Math.round((enteredValue / unitPrice + Number.EPSILON) * 1000) / 1000
      : enteredValue;
    if (!Number.isFinite(amount) || !Number.isFinite(quantity) || amount <= 0 || quantity <= 0 || unitPrice <= 0) {
      setNotice("SALE VALIDATION FAILED · CHECK QUANTITY AND PRICE");
      return;
    }
    setSaleSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/api/sales`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "pos-ui-operator" },
        body: JSON.stringify({
          stationCode: "PT-001",
          terminalCode: "POS-01",
          operatorName: "พนักงาน POS",
          dispenserCode: selected.id,
          documentType: "ABBREVIATED_TAX_INVOICE",
          items: [{
            productCode: selected.fuel.toUpperCase().replaceAll(" ", "-"),
            description: selected.fuel,
            quantity,
            unit: "L",
            unitPrice,
            ...(saleEntryUnit === "BAHT" ? { lineTotal: amount } : {}),
          }],
          payments: [{ method: salePaymentMethod, amount }],
        }),
      });
      const result = await response.json() as { transactionNumber?: string; documentNumber?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? `sale_api_${response.status}`);
      setSaleOpen(false);
      setDrawerOpen(false);
      setDocumentSearch(result.transactionNumber ?? "");
      setDocumentMode("thermal");
      setDocumentOpen(true);
      setNotice(`SALE COMPLETED · ${result.documentNumber}`);
    } catch (error) {
      setNotice(`SALE FAILED · ${(error as Error).message.toUpperCase()}`);
    } finally {
      setSaleSubmitting(false);
    }
  };

  const selectDocumentRecord = async (document: DocumentSummary) => {
    if (!apiUrl) return;
    setDocumentsLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/documents/${document.id}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`document_api_${response.status}`);
      const detail = await response.json() as DocumentDetail;
      setSelectedDocument(detail);
      setDocumentMode(detail.document_type === "FULL_TAX_INVOICE" ? "full" : "thermal");
    } catch {
      setNotice("DOCUMENT LOAD FAILED · RETRY REQUIRED");
    } finally {
      setDocumentsLoading(false);
    }
  };

  const printSelectedDocument = async () => {
    if (!apiUrl || !selectedDocument) {
      setNotice("SELECT A LIVE DOCUMENT BEFORE PRINTING");
      return;
    }
    const response = await fetch(`${apiUrl}/api/documents/${selectedDocument.id}/prints`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": "pos-ui-operator" },
      body: JSON.stringify({ printerName: "Browser Print", printReason: selectedDocument.print_count > 0 ? "Reprint requested from Document Center" : undefined }),
    });
    if (!response.ok) {
      setNotice(`PRINT AUDIT FAILED · HTTP ${response.status}`);
      return;
    }
    const printJob = await response.json() as { print_count: number };
    setSelectedDocument((current) => current ? { ...current, print_count: printJob.print_count } : current);
    const cleanup = () => document.body.removeAttribute("data-print-mode");
    document.body.dataset.printMode = documentMode;
    window.addEventListener("afterprint", cleanup, { once: true });
    window.requestAnimationFrame(() => window.print());
    setNotice(`PRINT RECORDED · COPY ${printJob.print_count}`);
  };

  return (
    <main className="immersive-console">
      <div className="reference-stage" aria-label="Fuel Ops 3D Digital Twin">
        <img className="station-visual" src="/station-command.png" alt="สถานีบริการน้ำมันแบบ 3D Digital Twin" />
        <div className="cinematic-shade" />
        <div className="scanlines" />

        {pumps.map((pump) => (
          <button
            key={pump.id}
            className={`asset-hotspot ${pump.className} state-${pump.state.toLowerCase()} ${selectedId === pump.id && drawerOpen ? "selected" : ""}`}
            onClick={() => selectPump(pump.id)}
            aria-label={`เปิดรายละเอียด ${pump.name}`}
          >
            <span className="hotspot-ring"><i /></span>
            <span className="hotspot-label"><b>{pump.id}</b><small>{pump.state}</small></span>
          </button>
        ))}

        <button className="tank-zone" onClick={() => setNotice("TANK TELEMETRY · B7 95% · G95 72% · G91 38%") } aria-label="ดูข้อมูลระดับถัง" />
        <button className="alert-zone" onClick={() => selectPump("P04")} aria-label="ดูเหตุแจ้งเตือน" />
      </div>

      <header className="floating-console-bar">
        <div className="connection-chip"><span /> {connectionState === "live" ? "DB LIVE" : connectionState === "connecting" ? "CONNECTING" : "DEMO SAFE"} · PT-001</div>
        <div className="command-switch">
          <button className={!workspaceOpen && !documentOpen ? "active" : ""} onClick={() => { setWorkspaceOpen(false); setDocumentOpen(false); }}>◇ 3D COMMAND</button>
          <button className={workspaceOpen ? "active" : ""} onClick={() => { setWorkspaceOpen(true); setDocumentOpen(false); }}>☷ 2D WORKSPACE</button>
          <button className={documentOpen ? "active" : ""} onClick={() => openDocuments("thermal")}>▤ DOCUMENTS</button>
        </div>
        <button className="user-orb" aria-label="ข้อมูลผู้ใช้">วก</button>
      </header>

      <div className="interaction-hint"><span>＋</span><div><b>INTERACTIVE DIGITAL TWIN</b><small>คลิกหัวจ่ายเพื่อเปิดข้อมูล Realtime</small></div></div>

      <aside className={`asset-drawer ${drawerOpen ? "open" : ""}`} aria-hidden={!drawerOpen}>
        <div className="drawer-head">
          <div><span>SELECTED ASSET</span><h2>{selected.name}</h2><p>{selected.fuel}</p></div>
          <button onClick={() => setDrawerOpen(false)} aria-label="ปิดรายละเอียด">×</button>
        </div>

        <div className="asset-hero">
          <div className={`pump-model state-${selected.state.toLowerCase()}`}><i /><span>{selected.id.slice(1)}</span><b /></div>
          <div><span>CURRENT SALE</span><strong>{selected.amount}</strong><p>{selected.liters} {selected.liters !== "—" ? "LITRES" : ""}</p></div>
        </div>

        <div className={`asset-state state-${selected.state.toLowerCase()}`}><i />{selected.state}<span>{stateThai[selected.state]}</span></div>

        <div className="asset-grid">
          <div><span>PRICE / LITRE</span><b>{selected.price}</b></div>
          <div><span>TOTALIZER</span><b>{selected.totalizer}</b></div>
          <div><span>SALES TODAY</span><b>{selected.salesToday}</b></div>
          <div><span>REVENUE</span><b>{selected.total}</b></div>
        </div>

        <div className="flow-chart">
          <div><span>THROUGHPUT / HOUR</span><b>1,284 L</b></div>
          <div className="flow-bars">{[22,31,27,48,42,62,54,77,68,92,76,84].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
          <div className="flow-axis"><span>06:00</span><span>NOW</span></div>
        </div>

        <div className="operator-row"><span>สช</span><div><small>OPERATOR</small><b>{selected.operator}</b></div><button>•••</button></div>
        <div className="drawer-actions">
          <button className="open-workspace" onClick={() => { setWorkspaceOpen(true); setDocumentOpen(false); }}>OPEN 2D DETAILS <span>→</span></button>
          <button className="issue-document" onClick={() => setSaleOpen(true)}>NEW SALE / ISSUE RECEIPT <span>▤</span></button>
        </div>
        <p className="readonly"><i>i</i> Digital Twin เป็น Read-only การแก้ไขข้อมูลจะทำใน 2D Workspace</p>
      </aside>

      <section className={`workspace-layer ${workspaceOpen ? "open" : ""}`} aria-hidden={!workspaceOpen}>
        <div className="workspace-window">
          <div className="workspace-head">
            <div><span>FUEL OPS / OPERATIONS</span><h2>Dispenser Workspace</h2><p>สถานะหัวจ่ายและธุรกรรมแบบ Realtime · PT-001</p></div>
            <div><button className="export-button" onClick={exportDispenserReport}>EXPORT REPORT</button><button className="close-workspace" onClick={() => setWorkspaceOpen(false)}>×</button></div>
          </div>
          <div className="workspace-kpis">
            <article><span>ACTIVE NOZZLES</span><strong>{String(summary.activeNozzles).padStart(2, "0")}<small>/{String(summary.totalNozzles).padStart(2, "0")}</small></strong><i className="green" /></article>
            <article><span>SHIFT REVENUE</span><strong>{formatMoney(summary.shiftRevenue)}</strong><i className="lime" /></article>
            <article><span>VOLUME SOLD</span><strong>{formatNumber(summary.volumeSold)}<small>L</small></strong><i className="cyan" /></article>
            <article><span>OPEN EVENTS</span><strong>{String(summary.openEvents).padStart(2, "0")}</strong><i className="amber" /></article>
          </div>
          <div className="table-toolbar"><div><button className={workspaceFilter === "ALL" ? "active" : ""} onClick={() => setWorkspaceFilter("ALL")}>ALL {pumps.length}</button><button className={workspaceFilter === "ONLINE" ? "active" : ""} onClick={() => setWorkspaceFilter("ONLINE")}>ONLINE {pumps.filter((pump) => pump.state === "ONLINE" || pump.state === "FILLING").length}</button><button className={workspaceFilter === "ATTENTION" ? "active" : ""} onClick={() => setWorkspaceFilter("ATTENTION")}>ATTENTION {pumps.filter((pump) => pump.state === "PAYMENT" || pump.state === "FAULT").length}</button></div><label>⌕ <span>ตัวกรองสถานะตู้จ่าย</span></label></div>
          <div className="table-scroll"><table><thead><tr><th>DISPENSER</th><th>FUEL PRODUCT</th><th>STATUS</th><th>VOLUME</th><th>AMOUNT</th><th>OPERATOR</th><th>TODAY</th><th /></tr></thead><tbody>{filteredPumps.map((pump) => <tr key={pump.id} className={selectedId === pump.id ? "selected" : ""} onClick={() => setSelectedId(pump.id)}><td><b>{pump.id}</b><small>{pump.name}</small></td><td>{pump.fuel}</td><td><span className={`table-state state-${pump.state.toLowerCase()}`}><i />{pump.state}</span></td><td>{pump.liters}{pump.liters !== "—" ? " L" : ""}</td><td><strong>{pump.amount}</strong></td><td>{pump.operator}</td><td>{pump.total}</td><td>›</td></tr>)}</tbody></table></div>
          <div className="workspace-foot"><span>{connectionState === "live" ? "ข้อมูล PostgreSQL · อัปเดตทุก 5 วินาที" : "ข้อมูลสำรอง · API ยังไม่เชื่อมต่อ"}</span><div><b>1</b></div></div>
        </div>
      </section>

      <section className={`sale-layer ${saleOpen ? "open" : ""}`} aria-hidden={!saleOpen}>
        <form className="sale-dialog" onSubmit={(event) => void submitSale(event)}>
          <div className="sale-dialog-head"><div><span>POS-01 / {selected.id}</span><h2>บันทึกการขายน้ำมัน</h2><p>{selected.fuel} · VAT คำนวณจากอัตราที่มีผลในฐานข้อมูล</p></div><button type="button" onClick={() => setSaleOpen(false)} aria-label="ปิดหน้าบันทึกขาย">×</button></div>
          <div className="sale-fields">
            <label className="sale-amount-field"><span>จำนวน</span><div><input type="number" min={saleEntryUnit === "BAHT" ? "0.01" : "0.001"} step={saleEntryUnit === "BAHT" ? "0.01" : "0.001"} value={saleQuantity} onChange={(event) => setSaleQuantity(event.target.value)} required /><select value={saleEntryUnit} onChange={(event) => { const nextUnit = event.target.value as SaleEntryUnit; const currentValue = Number(saleQuantity) || 0; const price = Number(saleUnitPrice) || 0; setSaleEntryUnit(nextUnit); setSaleQuantity(price > 0 ? (nextUnit === "BAHT" ? String(Math.round(currentValue * price * 100) / 100) : String(Math.round((currentValue / price) * 1000) / 1000)) : "0"); }} aria-label="หน่วยจำนวน"><option value="BAHT">บาท</option><option value="LITER">ลิตร</option></select></div></label>
            <label><span>ราคาต่อลิตร (บาท)</span><input type="number" min="0.0001" step="0.0001" value={saleUnitPrice} onChange={(event) => setSaleUnitPrice(event.target.value)} required /></label>
            <label><span>วิธีชำระเงิน</span><select value={salePaymentMethod} onChange={(event) => setSalePaymentMethod(event.target.value)}><option value="CASH">เงินสด</option><option value="CARD">บัตร</option><option value="QR">QR</option><option value="FLEET">Fleet</option><option value="CREDIT">เครดิต</option></select></label>
          </div>
          <div className="sale-total"><span>ยอดชำระ</span><strong>{formatMoney(saleEntryUnit === "BAHT" ? (Number(saleQuantity) || 0) : (Number(saleQuantity) || 0) * (Number(saleUnitPrice) || 0), 2)}</strong></div>
          <p className="sale-safety">ระบบจะบันทึกการขาย การชำระเงิน เลขเอกสาร และ Audit Log พร้อมกัน หากขั้นตอนใดล้มเหลวจะไม่บันทึกทั้งรายการ</p>
          <div className="sale-actions"><button type="button" onClick={() => setSaleOpen(false)}>ยกเลิก</button><button type="submit" disabled={saleSubmitting || connectionState !== "live"}>{saleSubmitting ? "กำลังบันทึก…" : "บันทึกและออกใบเสร็จ"}</button></div>
        </form>
      </section>

      <section className={`document-layer ${documentOpen ? "open" : ""}`} aria-hidden={!documentOpen}>
        <div className="document-center">
          <div className="document-center-head">
            <div>
              <span>FUEL OPS / DOCUMENT CENTER</span>
              <h2>ใบเสร็จรับเงินและใบกำกับภาษี</h2>
              <p>ข้อมูลจากธุรกรรมเดียวกัน · เลขเอกสารควบคุมโดยฐานข้อมูล</p>
            </div>
            <div className="document-head-actions">
              <button className="print-document" onClick={printSelectedDocument}>พิมพ์เอกสาร</button>
              <button className="close-workspace" onClick={() => setDocumentOpen(false)} aria-label="ปิดศูนย์เอกสาร">×</button>
            </div>
          </div>

          <div className="document-body">
            <aside className="document-sidebar">
              <div className="document-tabs" role="tablist" aria-label="รูปแบบเอกสาร">
                <button className={documentMode === "thermal" ? "active" : ""} onClick={() => setDocumentMode("thermal")}>
                  <b>80 มม.</b><span>ใบเสร็จ/ใบกำกับภาษีอย่างย่อ</span>
                </button>
                <button className={documentMode === "full" ? "active" : ""} onClick={() => setDocumentMode("full")}>
                  <b>A4 / Dot Matrix</b><span>ใบกำกับภาษีเต็มรูป</span>
                </button>
              </div>
              <div className="document-search">
                <input value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} placeholder="ค้นหาเลขเอกสาร/ธุรกรรม" aria-label="ค้นหาเอกสาร" />
                <div className="document-results">
                  {documentsLoading && <span>กำลังโหลดข้อมูล…</span>}
                  {!documentsLoading && documents.map((document) => (
                    <button key={document.id} className={selectedDocument?.id === document.id ? "active" : ""} onClick={() => void selectDocumentRecord(document)}>
                      <b>{document.document_number}</b><small>{document.transaction_number} · พิมพ์ {document.print_count} ครั้ง</small>
                    </button>
                  ))}
                  {!documentsLoading && documents.length === 0 && <span>ไม่พบเอกสาร</span>}
                </div>
              </div>
              <div className="document-record">
                <div><span>DOCUMENT NO.</span><b>{selectedDocument?.document_number ?? "—"}</b></div>
                <div><span>TRANSACTION</span><b>{selectedDocument?.transaction_number ?? "—"}</b></div>
                <div><span>DATABASE</span><b className="record-ok"><i /> POSTGRESQL SYNCED</b></div>
                <div><span>PRINT COUNT</span><b>{selectedDocument?.print_count ?? 0} ครั้ง</b></div>
              </div>
              <div className="print-profile">
                <span>PRINT PROFILE</span>
                <b>{documentMode === "thermal" ? "กระดาษ 80 มม. · แนวตั้ง" : "A4 · แนวนอน"}</b>
                <small>Scale 100% · ปิด Header/Footer ของ Browser</small>
              </div>
              <p className="document-note">ทุกคำสั่งพิมพ์จะสร้างต้นฉบับและสำเนาในงานพิมพ์เดียวกัน โดยหน้าที่สองระบุคำว่า “สำเนา” อัตโนมัติ</p>
            </aside>

            <div className={`paper-stage mode-${documentMode}`}>
              <div className="print-batch">
                {documentMode === "thermal" ? <ThermalReceipt copyLabel="ต้นฉบับ" document={selectedDocument} /> : <FullTaxInvoice copyLabel="ต้นฉบับ" document={selectedDocument} />}
                <div className="automatic-copy" aria-hidden="true">
                  {documentMode === "thermal" ? <ThermalReceipt copyLabel="สำเนา" document={selectedDocument} /> : <FullTaxInvoice copyLabel="สำเนา" document={selectedDocument} />}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="console-footer"><span><i /> {notice}</span><span>DOCKER READY · {connectionState === "live" ? "POSTGRESQL LIVE" : "SAFE FALLBACK"} · PHASE 2</span></footer>
    </main>
  );
}

function ThermalReceipt({ copyLabel, document }: { copyLabel: "ต้นฉบับ" | "สำเนา"; document: DocumentDetail | null }) {
  const item = document?.items?.[0];
  const payment = document?.payments?.[0];
  return (
    <article className="thermal-paper printable-document">
      <div className="paper-copy">{copyLabel} <span>{document?.document_number ?? "เลือกเอกสาร"}</span></div>
      <h3>ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ</h3>
      <h4>{document?.seller_snapshot.legalName ?? "บริษัท ฟิวเอล โอพีเอส จำกัด"}</h4>
      <p className="paper-center">{document?.seller_snapshot.address ?? "ข้อมูลที่อยู่ผู้ขาย"}</p>
      <p className="paper-center"><b>สาขาที่ {document?.seller_snapshot.branchCode ?? "00001"}</b><br />เลขประจำตัวผู้เสียภาษี {document?.seller_snapshot.taxId ?? "—"}</p>
      <div className="paper-rule" />
      <dl className="receipt-meta">
        <dt>รหัสสถานี</dt><dd>PT-001</dd><dt>POS ID</dt><dd>POS-01</dd>
        <dt>Tran No.</dt><dd>{document?.transaction_number ?? "—"}</dd><dt>หัวจ่าย</dt><dd>{document?.dispenser_code ?? "—"}</dd>
        <dt>วันที่ขาย</dt><dd>{document ? new Date(document.sold_at).toLocaleString("th-TH") : "—"}</dd><dt>พนักงาน</dt><dd>{document?.operator_name ?? "—"}</dd>
        <dt>วันที่ออก</dt><dd>{document ? new Date(document.issued_at).toLocaleString("th-TH") : "—"}</dd>
      </dl>
      <div className="paper-rule" />
      <div className="receipt-item"><b>{item?.description_th ?? "รายการสินค้า"}</b><span>{item ? `${item.quantity} ${item.unit} × ${Number(item.unit_price).toFixed(2)}` : "—"}</span><strong>{Number(item?.line_total ?? 0).toFixed(2)}</strong></div>
      <dl className="receipt-total">
        <dt>มูลค่าสินค้า</dt><dd>{Number(document?.subtotal ?? 0).toFixed(2)}</dd><dt>ภาษีมูลค่าเพิ่ม {Number(document?.vat_rate ?? 0)}%</dt><dd>{Number(document?.vat_amount ?? 0).toFixed(2)}</dd><dt className="grand">รวมเป็นเงิน</dt><dd className="grand">{Number(document?.grand_total ?? 0).toFixed(2)}</dd>
      </dl>
      <p><b>รวมเป็นเงินตัวอักษร</b><br />(หนึ่งพันบาทถ้วน)</p>
      <p className="vat-included">ราคานี้รวมภาษีมูลค่าเพิ่มแล้ว</p>
      <div className="paper-rule" />
      <p><b>ชำระโดย</b> {payment?.method ?? "—"} · {payment?.reference_masked ?? "—"}</p>
      <div className="receipt-sign">ได้รับสินค้าและเอกสารถูกต้องครบถ้วน<br /><span>ลงชื่อผู้รับเงิน</span></div>
      <p className="paper-thanks">ขอบคุณที่มาใช้บริการ</p>
    </article>
  );
}

function FullTaxInvoice({ copyLabel, document }: { copyLabel: "ต้นฉบับ" | "สำเนา"; document: DocumentDetail | null }) {
  const item = document?.items?.[0];
  const payment = document?.payments?.[0];
  return (
    <article className="invoice-paper printable-document">
      <header className="invoice-header">
        <div className="invoice-brand"><div className="brand-mark">F</div><div><h3>{document?.seller_snapshot.legalName ?? "บริษัท ฟิวเอล โอพีเอส จำกัด"}</h3><p>เลขประจำตัวผู้เสียภาษี {document?.seller_snapshot.taxId ?? "—"}</p><p>สาขาที่ {document?.seller_snapshot.branchCode ?? "—"} · {document?.seller_snapshot.address ?? "ข้อมูลที่อยู่ผู้ขาย"}</p></div></div>
        <div className="invoice-title"><small>{copyLabel}</small><h3>ใบเสร็จรับเงิน/ใบกำกับภาษี</h3><b>RECEIPT / TAX INVOICE</b></div>
      </header>
      <section className="invoice-info">
        <div><h4>ข้อมูลลูกค้า</h4><p><b>{document?.buyer_snapshot?.legalName ?? "ไม่ระบุผู้ซื้อ"}</b></p><p>เลขประจำตัวผู้เสียภาษี {document?.buyer_snapshot?.taxId ?? "—"} · {document?.buyer_snapshot?.branchLabel ?? "—"}</p><p>{document?.buyer_snapshot?.address ?? "—"}</p></div>
        <dl><dt>เลขที่เอกสาร</dt><dd>{document?.document_number ?? "—"}</dd><dt>หัวจ่าย</dt><dd>{document?.dispenser_code ?? "—"}</dd><dt>เลขธุรกรรม</dt><dd>{document?.transaction_number ?? "—"}</dd><dt>วันที่ขาย</dt><dd>{document ? new Date(document.sold_at).toLocaleString("th-TH") : "—"}</dd><dt>วันที่ออก</dt><dd>{document ? new Date(document.issued_at).toLocaleString("th-TH") : "—"}</dd></dl>
      </section>
      <table className="invoice-table"><thead><tr><th>ลำดับ</th><th>รายการ</th><th>ราคา/หน่วย</th><th>ปริมาณ</th><th>จำนวนเงิน (บาท)</th></tr></thead><tbody><tr><td>1</td><td><b>{item?.description_th ?? "รายการสินค้า"}</b><small>รหัสสินค้า {item?.product_code ?? "—"} · หัวจ่าย {document?.dispenser_code ?? "—"}</small></td><td>{Number(item?.unit_price ?? 0).toFixed(2)}</td><td>{item?.quantity ?? "0"} {item?.unit ?? ""}</td><td>{Number(item?.line_total ?? 0).toFixed(2)}</td></tr></tbody></table>
      <section className="invoice-summary">
        <div><p><b>ชำระโดย</b> {payment?.method ?? "—"} · {payment?.reference_masked ?? "—"} · {Number(payment?.amount ?? 0).toFixed(2)} บาท</p></div>
        <dl><dt>มูลค่าสินค้า</dt><dd>{Number(document?.subtotal ?? 0).toFixed(2)}</dd><dt>ภาษีมูลค่าเพิ่ม {Number(document?.vat_rate ?? 0)}%</dt><dd>{Number(document?.vat_amount ?? 0).toFixed(2)}</dd><dt className="grand">รวมเป็นเงิน</dt><dd className="grand">{Number(document?.grand_total ?? 0).toFixed(2)}</dd></dl>
      </section>
      <footer className="invoice-footer"><p>ได้รับสินค้าและเอกสารตามรายการข้างต้นถูกต้องและครบถ้วน</p><div className="signature-lines"><span>ผู้รับเงิน / Cashier</span><span>ผู้รับสินค้า / Customer</span></div></footer>
    </article>
  );
}
