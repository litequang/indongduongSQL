# Workflow V2 — Canonical Permission Matrix

## Quy ước

- Role thực tế: `SALE`, `DESIGNER`, `PRINTER`, `FINISHER`, `WAREHOUSE`, `MANAGER`, `ADMIN`, `DEVELOPER`.
- `MANAGEMENT` = `MANAGER` + `ADMIN` + `DEVELOPER`; management chỉ có quyền khi ô ghi `MANAGEMENT`, không được impersonate specialist.
- `ASSIGNED ONLY`, `CLAIM OWNER`, `RECIPIENT ONLY`, `OWNER ONLY` là điều kiện bắt buộc. UI không mở rộng quyền của Cloud Function/Rules.
- `CF` = callable Cloud Function/transaction; `FR` = Firestore Rules; `UI` = helper/guard frontend; `LOCAL` = draft trên máy.

## Customer, Sales Order và Product

| ACTION | SALE | DESIGNER | PRINTER | FINISHER | WAREHOUSE | MANAGER | ADMIN | DEVELOPER | CONDITION / ENFORCEMENT |
|---|---|---|---|---|---|---|---|---|---|
| View Customer, Sales Order, Product | ALLOW | ALLOW | READ ONLY | READ ONLY | READ ONLY | ALLOW | ALLOW | ALLOW | Active identity; FR read, UI workspace filter |
| Create/Edit Customer | ALLOW | DENY | DENY | DENY | DENY | MANAGEMENT | MANAGEMENT | MANAGEMENT | Valid data; FR + UI |
| Create/Edit/Confirm Sales Order | ALLOW / DRAFT | DRAFT ONLY | DENY | DENY | DENY | MANAGEMENT | MANAGEMENT | MANAGEMENT | State guard; confirm qua CF |
| Create/Edit Product technical fields | ALLOW | ALLOW | DENY | DENY | DENY | MANAGEMENT | MANAGEMENT | MANAGEMENT | Không đổi lifecycle trực tiếp |
| Mark Product urgent | ALLOW | ALLOW | DENY | DENY | DENY | MANAGEMENT | MANAGEMENT | MANAGEMENT | CF + UI |

## Production và Printer

| ACTION | SALE | DESIGNER | PRINTER | FINISHER | WAREHOUSE | MANAGER | ADMIN | DEVELOPER | CONDITION / ENFORCEMENT |
|---|---|---|---|---|---|---|---|---|---|
| Create/Edit local Production Draft | ALLOW | ALLOW | DENY | DENY | DENY | MANAGEMENT | MANAGEMENT | MANAGEMENT | LOCAL; official order khác Draft |
| Send/Revision/Choose Printer | CONDITIONAL | ALLOW | DENY | DENY | DENY | MANAGEMENT | MANAGEMENT | MANAGEMENT | Pre-start; target exact active PRINTER; CF/UI |
| Link Product/Sales Order (incl. late/supplemental) | ALLOW | ALLOW | DENY | DENY | DENY | MANAGEMENT | MANAGEMENT | MANAGEMENT | Product và Production Order tồn tại, caller có authority, relation hợp lệ, không duplicate; **không dùng Product quantity, allocation hay print-sheet sum làm gate** |
| NHẬN LỆNH | DENY | DENY | ASSIGNED ONLY | DENY | DENY | DENY | DENY | DENY | `WAITING_ACCEPTANCE`; UI + state/assignment guard |
| ACK revision / Receive Plate / BẮT ĐẦU IN | DENY | DENY | ASSIGNED ONLY | DENY | DENY | DENY | DENY | DENY | Pre-print, latest ACK, không pending cancellation |
| IN XONG | DENY | DENY | ASSIGNED ONLY | DENY | DENY | DENY | DENY | DENY | `PRINTING`; CF transaction; print sheets từ `printImages.sheetCount` |
| Request production cancellation | ALLOW | ALLOW | DENY | DENY | DENY | MANAGEMENT | MANAGEMENT | MANAGEMENT | Pre-start, không pending; CF |
| Respond production cancellation | DENY | DENY | ASSIGNED ONLY | DENY | DENY | DENY | DENY | DENY | Assigned Printer, pending request; CF |

## Finishing và Warehouse

| ACTION | SALE | DESIGNER | PRINTER | FINISHER | WAREHOUSE | MANAGER | ADMIN | DEVELOPER | CONDITION / ENFORCEMENT |
|---|---|---|---|---|---|---|---|---|---|
| View Finishing task | READ ONLY | READ ONLY | READ ONLY | ALLOW | READ ONLY | READ ONLY | READ ONLY | READ ONLY | Active identity; read không cấp mutation |
| NHẬN VIỆC | DENY | DENY | DENY | ALLOW | DENY | DENY | DENY | DENY | Exact FINISHER, `READY`, task cần finishing; CF atomic |
| HOÀN THÀNH Finishing | DENY | DENY | DENY | CLAIM OWNER | DENY | DENY | DENY | DENY | Claimed cùng businessUserId; CF |
| Confirm no-finishing | DENY | DENY | DENY | ALLOW | DENY | DENY | DENY | DENY | Exact FINISHER, `READY`, không cần claim; CF |
| Request Finishing cancellation | ALLOW | ALLOW | DENY | DENY | DENY | MANAGEMENT | MANAGEMENT | MANAGEMENT | Direct cancel READY hoặc request claimed; CF |
| Respond Finishing cancellation | DENY | DENY | DENY | CLAIM OWNER | DENY | DENY | DENY | DENY | Claimed Finisher only; CF |
| View Warehouse readiness/sibling state | READ ONLY | READ ONLY | READ ONLY | READ ONLY | ALLOW | ALLOW | ALLOW | ALLOW | Monitor allowed; operational authority separate |
| Create draft dispatch / XUẤT KHO | DENY | DENY | DENY | DENY | ALLOW | DENY | DENY | DENY | Exact `WAREHOUSE`; all active Product warehouse-ready; CF transaction |
| Confirm / Reverse dispatch | DENY | DENY | DENY | DENY | ALLOW | DENY | DENY | DENY | Exact `WAREHOUSE`, valid DRAFT/DISPATCHED state; CF |

## Issue và Open-Issue Transition Choice

| ACTION | SALE | DESIGNER | PRINTER | FINISHER | WAREHOUSE | MANAGER | ADMIN | DEVELOPER | CONDITION / ENFORCEMENT |
|---|---|---|---|---|---|---|---|---|---|
| Report Issue | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | Valid context/type; CF |
| View Issue | READ ONLY | READ ONLY | READ ONLY | READ ONLY | READ ONLY | READ ONLY | READ ONLY | READ ONLY | Active identity; UI ưu tiên reporter/recipient |
| Resolve explicit recipient | RECIPIENT ONLY | RECIPIENT ONLY | RECIPIENT ONLY | RECIPIENT ONLY | RECIPIENT ONLY | RECIPIENT ONLY | RECIPIENT ONLY | RECIPIENT ONLY | `recipientUserIds` contains businessUserId; CF transaction |
| Resolve role recipient | RECIPIENT ONLY | RECIPIENT ONLY | RECIPIENT ONLY | RECIPIENT ONLY | RECIPIENT ONLY | CONDITIONAL | CONDITIONAL | CONDITIONAL | Exact role; management inheritance chỉ với management recipient hướng lên |
| Cancel own report | OWNER ONLY | OWNER ONLY | OWNER ONLY | OWNER ONLY | OWNER ONLY | OWNER ONLY | OWNER ONLY | OWNER ONLY | Reporter businessUserId khớp; CF |
| Major transition with OPEN Issue | CONDITIONAL | CONDITIONAL | CONDITIONAL | CONDITIONAL | CONDITIONAL | CONDITIONAL | CONDITIONAL | CONDITIONAL | UI hiện Issue liên quan; chỉ recipient hợp lệ được tick resolve; luôn có “vẫn còn sự cố — tiếp tục công việc”; status change không auto-resolve |

## Product link và print-sheet policy

- ProductionOrder ↔ Product là traceability relation: Product tồn tại, Production Order tồn tại nếu late-link, caller có authority, không duplicate và relation hợp lệ.
- Một Product có thể có nhiều Production Order (supplemental production). Không tồn tại restriction `remaining quantity`, `allocatedProductQuantity` hoặc reconciliation như một routing/permission gate.
- Legacy `allocatedProductQuantity`/history có thể còn trong document cũ để đọc audit; không viết mới như canonical gate.
- `printImages` là model kỹ thuật độc lập; mỗi ảnh có `sheetCount`, `totalSheets` là tổng `sheetCount`. Product quantity không tham gia toán học print sheets.
