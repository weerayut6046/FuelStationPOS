# FuelStationPOS

ระบบต้นแบบ POS และศูนย์ควบคุมสำหรับสถานีบริการน้ำมัน รองรับหน้าจอปฏิบัติการแบบ 3D/2D, Station API และ PostgreSQL โดยออกแบบให้รันเป็นชุดบริการผ่าน Docker Compose

## ส่วนประกอบ

- `ui-prototype/` — Command Center และหน้าจอปฏิบัติการ
- `services/api/` — Station API สำหรับข้อมูลเอกสารและภาพรวมสถานี
- `database/init/` — PostgreSQL schema, seed data และ operations
- `docker-compose.yml` — Database, API และ Web สำหรับสภาพแวดล้อมสถานี
- `PLAN.md` และ `todolist.md` — แผนงานและสถานะการพัฒนา

## ความต้องการ

- Docker Desktop หรือ Docker Engine พร้อม Compose plugin
- Node.js 22 ขึ้นไป หากต้องการรันและทดสอบโดยไม่ใช้ Docker

## เริ่มใช้งานด้วย Docker

คัดลอกไฟล์ environment ตัวอย่างก่อนเริ่มระบบ:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

เมื่อทุก service พร้อมแล้ว:

- Web: http://localhost:3000
- API health check: http://localhost:3001/health
- PostgreSQL: `localhost:5432`

หยุดระบบด้วย `docker compose down` ข้อมูล PostgreSQL จะยังคงอยู่ใน named volume

> เปลี่ยน `POSTGRES_PASSWORD` ใน `.env` ก่อนใช้งานนอกเครื่องพัฒนา และห้าม commit ไฟล์ `.env`

## ทดสอบในเครื่อง

```powershell
Set-Location ui-prototype
npm ci
npm run lint
npm test
```

ตรวจ syntax ของ API และ Docker configuration:

```powershell
Set-Location services/api
npm ci
npm test
Set-Location ../..
docker compose config --quiet
```

Station API เขียน log เป็น JSON หนึ่งรายการต่อบรรทัด โดยมี request ID, path, status code และระยะเวลาตอบกลับ กำหนดระดับ log ผ่าน `LOG_LEVEL` (`debug`, `info`, `warn`, `error`) ได้

API หลักสำหรับ POS MVP:

- `POST /api/sales` — บันทึกการขาย การชำระเงิน ออกเลขเอกสาร และ audit log ใน transaction เดียว
- `GET /api/customers?search=...` — ค้นหาลูกค้าจากชื่อหรือเลขประจำตัวผู้เสียภาษี
- `POST /api/customers` — เพิ่มลูกค้าใหม่พร้อมตรวจเลขผู้เสียภาษี/สาขาและ audit log
- `GET /api/documents?search=...` — ค้นหาจากเลขเอกสารหรือเลขธุรกรรม
- `GET /api/documents/{id}` — อ่านเอกสาร รายการสินค้า การชำระ และประวัติพิมพ์
- `POST /api/documents/{id}/prints` — บันทึกงานพิมพ์ต้นฉบับ/สำเนาและ audit log

GitHub Actions จะรันการตรวจทั้งหมดนี้อัตโนมัติเมื่อ push หรือเปิด pull request ไปยัง branch `main`

## สำรองและทดสอบกู้คืนฐานข้อมูล

เมื่อ Database container ทำงานอยู่ ให้สร้างไฟล์สำรองและทดสอบกู้คืนลงฐานข้อมูลชั่วคราวด้วย:

```powershell
$backupFile = ./scripts/backup.ps1
./scripts/restore-test.ps1 -BackupFile $backupFile
```

ไฟล์สำรองจะอยู่ใน `outputs/backups/` ซึ่งถูก Git ignore ส่วน restore test จะสร้างและลบเฉพาะฐานข้อมูล `fuelstation_restore_test` โดยไม่แก้ไขฐานข้อมูลหลัก

## สถานะโครงการ

ขณะนี้อยู่ในช่วง prototype และวางโครงสร้างพื้นฐาน ยังต้องยืนยันข้อกำหนดหน้างาน การเชื่อมตู้จ่าย TMJ รูปแบบเอกสาร และผ่าน UAT/Pilot ก่อนนำไปใช้จริง ดูรายละเอียดล่าสุดใน [todolist.md](todolist.md)
