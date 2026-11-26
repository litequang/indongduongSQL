# Workflow V2 — Canonical Permission Policy

Tài liệu này là nguồn chuẩn cho quyết định quyền nghiệp vụ Workflow V2. UI chỉ phản ánh quyền; Cloud Functions, transaction và Firestore Rules là biên bảo mật.

## Danh tính và nhóm quyền

- `IDENTITY`: Firebase Auth UID → `auth_identities/{uid}` → `businessUserId` → `users/{businessUserId}` → `role`. Mọi assignment/ownership lưu `businessUserId`.
- `MANAGEMENT`: `MANAGER`, `ADMIN`, `DEVELOPER`. Kế thừa chỉ áp dụng cho hành động quản lý.
- `PRODUCTION_TECHNICAL`: `DESIGNER` hoặc `MANAGEMENT`.
- `COMMERCIAL`: `SALE` hoặc `MANAGEMENT`.
- `WAREHOUSE` là role vận hành Kho độc lập. Role này xem workspace Kho, sibling Product progress, báo/nhận/giải quyết Issue theo recipient, và tạo/xác nhận xuất kho khi toàn bộ Product đủ điều kiện. `WAREHOUSE` không có quyền kỹ thuật Production, nhận Gia công, commercial Sales Order hay sửa urgent.
- Không có “god role”: management không được đóng vai assigned Printer, claimed Finisher, owner hoặc recipient chuyên môn.

## Quy tắc hành động chuẩn

- `CUSTOMER_READ`: mọi user active.
- `CUSTOMER_CREATE_EDIT_IMPORT`: `SALE` hoặc `MANAGEMENT`.
- `CUSTOMER_DELETE`: `ADMIN` hoặc `DEVELOPER`.
- `SALES_ORDER_READ`: mọi user active.
- `SALES_ORDER_DRAFT_CREATE`: `SALE`, `DESIGNER` hoặc `MANAGEMENT`. `DESIGNER` chỉ chọn Customer có sẵn và lưu DRAFT.
- `SALES_ORDER_COMMERCIAL_EDIT_CONFIRM_CANCEL`: `SALE` hoặc `MANAGEMENT`, theo state hợp lệ. `DESIGNER` không có quyền commercial rộng và không confirm.
- `PRODUCT_TECHNICAL_EDIT`: `DESIGNER` hoặc `MANAGEMENT`; không tự cấp commercial parent edit.
- `PRODUCT_URGENT`: `SALE`, `DESIGNER` hoặc `MANAGEMENT`.

- `PRODUCTION_LOCAL_DRAFT`: theo quyền tạo Production hiện hành; official send/create yêu cầu role được phép và assigned Printer active.
- `PRODUCTION_TECHNICAL_EDIT_PRE_START`: `DESIGNER` hoặc `MANAGEMENT`, chỉ `WAITING_ACCEPTANCE`, `ACCEPTED`, `WAITING_PRINT`.
- `PRODUCTION_REASSIGN_PRINTER_PRE_START`: `DESIGNER` hoặc `MANAGEMENT`; target phải là active `PRINTER`; assignment dùng `businessUserId`.
- `PRODUCTION_TECHNICAL_EDIT_POST_START`: DENY cho mọi role.
- `PLATE_SEND_REISSUE`: `DESIGNER` hoặc `MANAGEMENT`.
- `PLATE_RECEIVE`: assigned `PRINTER` hoặc `PRODUCTION_TECHNICAL`, theo state hợp lệ.
- `PRODUCT_LINK_LATE`: `SALE`, `DESIGNER` hoặc `MANAGEMENT`, chỉ khi quan hệ và state hợp lệ.

- `PRINTER_ACCEPT`: active `PRINTER`, assigned đúng `businessUserId`, state `WAITING_ACCEPTANCE`.
- `PRINTER_REVISION_ACK`: assigned `PRINTER` only; ACK revision mới nhất.
- `PRINTER_START`: assigned `PRINTER` only; state `ACCEPTED`/`WAITING_PRINT`; latest revision đã ACK; không có cancellation pending.
- `PRINTER_COMPLETE`: assigned `PRINTER` only; state `PRINTING`; số lượng hợp lệ.
- `PRODUCTION_CANCEL_REQUEST`: `SALE`, `DESIGNER` hoặc `MANAGEMENT`; chỉ trước Start và không có request pending.
- `PRODUCTION_CANCEL_RESPONSE`: assigned `PRINTER` only.

- `ISSUE_REPORT`: mọi role active trong context Production/Finishing/Warehouse tương ứng; urgent không đổi authority.
- `ISSUE_RESOLVE`: explicit user recipient, exact role recipient, hoặc management inheritance hướng lên chỉ khi recipient cũng là management: `MANAGER → ADMIN → DEVELOPER`, `ADMIN → DEVELOPER`. Không kế thừa recipient `SALE`/`DESIGNER`/`PRINTER`/`FINISHER`.
- `ISSUE_CANCEL`: reporter owner only; chuyển `CANCELLED`, không hard delete.
- `ISSUE_VIEW`: mọi user active có quyền read dữ liệu Workflow; UI ưu tiên hiện reporter/recipient/management-recipient liên quan.

- `FINISHING_CLAIM`: active `FINISHER` only, task `READY`, `requiresFinishing=true`.
- `FINISHING_COMPLETE`: claim owner `FINISHER` only, task `CLAIMED`; no-finishing confirmation là exact `FINISHER` từ `READY`.
- `FINISHING_MANAGEMENT_IMPERSONATION`: DENY.

- `WAREHOUSE_VIEW`: mọi user active có read backend; màn hình vận hành chính dành cho `WAREHOUSE`.
- `WAREHOUSE_REPORT_ISSUE`: mọi role active trong context có thể report.
- `WAREHOUSE_CREATE_DISPATCH`: `WAREHOUSE` exact role; toàn bộ Product active trong Sales Order phải warehouse-ready và đủ accepted quantity. Không partial export.
- `WAREHOUSE_CONFIRM_REVERSE`: `WAREHOUSE` exact role.
- `DIRECT_TO_WAREHOUSE`: routing dựa trên `requiresProduction=false`, không phụ thuộc Printer permission.

- `CHAT_READ_SEND`: user active theo context hiện hành; chat/comment không cấp quyền ACK, resolve Issue, cancellation hoặc status mutation.

## Trạng thái UI chuẩn

Action chỉ `VISIBLE/ENABLED` khi đồng thời đúng role, object ownership/assignment/recipient và workflow state. Nếu object đang tải hợp lệ nhưng backend chắc chắn từ chối, UI phải `HIDDEN` hoặc `DISABLED`. Backend vẫn phải từ chối request giả mạo độc lập với UI.
