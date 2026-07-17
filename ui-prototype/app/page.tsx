"use client";

import { useEffect, useMemo, useState } from "react";

type PumpState = "ONLINE" | "FILLING" | "PAYMENT" | "FAULT";
type DocumentMode = "thermal" | "full";
type WorkspaceFilter = "ALL" | "ONLINE" | "ATTENTION";
type ConnectionState = "connecting" | "live" | "fallback";

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
  const [documentMode, setDocumentMode] = useState<DocumentMode>("thermal");
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

  const printSelectedDocument = () => {
    const cleanup = () => document.body.removeAttribute("data-print-mode");
    document.body.dataset.printMode = documentMode;
    window.addEventListener("afterprint", cleanup, { once: true });
    window.requestAnimationFrame(() => window.print());
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
          <button className="issue-document" onClick={() => openDocuments("thermal")}>ISSUE RECEIPT / TAX INVOICE <span>▤</span></button>
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
              <div className="document-record">
                <div><span>DOCUMENT NO.</span><b>{documentMode === "thermal" ? "TI2607-00459" : "TX2607-000128"}</b></div>
                <div><span>TRANSACTION</span><b>11260717080100080</b></div>
                <div><span>DATABASE</span><b className="record-ok"><i /> POSTGRESQL SYNCED</b></div>
                <div><span>PRINT PROFILE</span><b>ต้นฉบับ + สำเนาอัตโนมัติ</b></div>
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
                {documentMode === "thermal" ? <ThermalReceipt copyLabel="ต้นฉบับ" /> : <FullTaxInvoice copyLabel="ต้นฉบับ" />}
                <div className="automatic-copy" aria-hidden="true">
                  {documentMode === "thermal" ? <ThermalReceipt copyLabel="สำเนา" /> : <FullTaxInvoice copyLabel="สำเนา" />}
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

function ThermalReceipt({ copyLabel }: { copyLabel: "ต้นฉบับ" | "สำเนา" }) {
  return (
    <article className="thermal-paper printable-document">
      <div className="paper-copy">{copyLabel} <span>TI2607-00459</span></div>
      <h3>ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ</h3>
      <h4>บริษัท ฟิวเอล โอพีเอส จำกัด</h4>
      <p className="paper-center">88/8 หมู่ 4 ถนนรังสิต–นครนายก<br />อำเภอธัญบุรี จังหวัดปทุมธานี 12110<br />โทร. 02-000-0000</p>
      <p className="paper-center"><b>สาขาที่ 00001</b><br />เลขประจำตัวผู้เสียภาษี 0105567000001</p>
      <div className="paper-rule" />
      <dl className="receipt-meta">
        <dt>รหัสสถานี</dt><dd>PT-001</dd><dt>POS ID</dt><dd>POS-01</dd>
        <dt>Tran No.</dt><dd>11260717080100080</dd><dt>เลขที่อ้างอิง</dt><dd>AB01260717664</dd>
        <dt>วันที่ขาย</dt><dd>17/07/2569</dd><dt>พนักงาน</dt><dd>สมชาย</dd>
        <dt>วันที่พิมพ์</dt><dd>17/07/2569 08:43:48</dd>
      </dl>
      <div className="paper-rule" />
      <div className="receipt-item"><b>HIDIESEL B7</b><span>26.667 L × 37.50</span><strong>1,000.00</strong></div>
      <dl className="receipt-total">
        <dt>มูลค่าสินค้า</dt><dd>934.58</dd><dt>ภาษีมูลค่าเพิ่ม 7%</dt><dd>65.42</dd><dt className="grand">รวมเป็นเงิน</dt><dd className="grand">1,000.00</dd>
      </dl>
      <p><b>รวมเป็นเงินตัวอักษร</b><br />(หนึ่งพันบาทถ้วน)</p>
      <p className="vat-included">ราคานี้รวมภาษีมูลค่าเพิ่มแล้ว</p>
      <div className="paper-rule" />
      <p><b>ชำระโดย</b> QR Payment · xxxx-5151<br /><b>ทะเบียนรถ</b> 3ขธ 1955 กรุงเทพมหานคร</p>
      <div className="receipt-sign">ได้รับสินค้าและเอกสารถูกต้องครบถ้วน<br /><span>ลงชื่อผู้รับเงิน</span></div>
      <p className="paper-thanks">ขอบคุณที่มาใช้บริการ</p>
    </article>
  );
}

function FullTaxInvoice({ copyLabel }: { copyLabel: "ต้นฉบับ" | "สำเนา" }) {
  return (
    <article className="invoice-paper printable-document">
      <header className="invoice-header">
        <div className="invoice-brand"><div className="brand-mark">F</div><div><h3>บริษัท ฟิวเอล โอพีเอส จำกัด</h3><p>เลขประจำตัวผู้เสียภาษี 0105567000001</p><p>สาขาที่ 00001 (สาขา) · 88/8 หมู่ 4 ถนนรังสิต–นครนายก<br />อำเภอธัญบุรี จังหวัดปทุมธานี 12110 · โทร. 02-000-0000</p></div></div>
        <div className="invoice-title"><small>{copyLabel}</small><h3>ใบเสร็จรับเงิน/ใบกำกับภาษี</h3><b>RECEIPT / TAX INVOICE</b></div>
      </header>
      <section className="invoice-info">
        <div><h4>ข้อมูลลูกค้า</h4><p><b>บริษัท เอส พี เพาเวอร์ เซอร์วิส 2015 จำกัด</b></p><p>เลขประจำตัวผู้เสียภาษี 0135558009925 · สำนักงานใหญ่</p><p>60/599 หมู่ 7 ตำบลลำลูกกา อำเภอลำลูกกา จังหวัดปทุมธานี 12150</p><p>ทะเบียนรถ 3ขธ 1955 · กรุงเทพมหานคร</p></div>
        <dl><dt>เลขที่เอกสาร</dt><dd>TX2607-000128</dd><dt>POS / หัวจ่าย</dt><dd>POS-01 / P03</dd><dt>เลขที่อ้างอิง</dt><dd>E041310003A0338</dd><dt>วันที่ขาย</dt><dd>17/07/2569 08:39:27</dd><dt>วันที่พิมพ์</dt><dd>17/07/2569 08:40:02</dd></dl>
      </section>
      <table className="invoice-table"><thead><tr><th>ลำดับ</th><th>รายการ</th><th>ราคา/หน่วย</th><th>ปริมาณ</th><th>จำนวนเงิน (บาท)</th></tr></thead><tbody><tr><td>1</td><td><b>ผลิตภัณฑ์ HIDIESEL B7</b><small>รหัสสินค้า DIESEL-B7 · หัวจ่าย P03</small></td><td>37.50</td><td>26.667 L</td><td>1,000.00</td></tr></tbody></table>
      <section className="invoice-summary">
        <div><p><b>รวมเป็นเงินตัวอักษร</b> (หนึ่งพันบาทถ้วน)</p><p><b>ชำระโดย</b> QR Payment · xxxx-5151 · 1,000.00 บาท</p></div>
        <dl><dt>มูลค่าสินค้า</dt><dd>934.58</dd><dt>ภาษีมูลค่าเพิ่ม 7%</dt><dd>65.42</dd><dt className="grand">รวมเป็นเงิน</dt><dd className="grand">1,000.00</dd></dl>
      </section>
      <footer className="invoice-footer"><p>ได้รับสินค้าและเอกสารตามรายการข้างต้นถูกต้องและครบถ้วน</p><div className="signature-lines"><span>ผู้รับเงิน / Cashier</span><span>ผู้รับสินค้า / Customer</span></div></footer>
    </article>
  );
}
