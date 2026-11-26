# SECURITY SPECIFICATION & THREAT MATRIX (V2.0A)

## 1. Data Invariants & Zero-Trust Architecture

1. **Identity & Role Invariant (Anti-Privilege Escalation)**:
   - Users cannot modify their own `role` or elevate permissions to `ADMIN` / `DEVELOPER`.
   - Only users with verified `DEVELOPER` or `ADMIN` roles can modify employee roles, machine assignments, or active flags in `/users/{userId}`.
   - PIN codes cannot be harvested by unauthenticated or unauthorized clients.

2. **Order Lifecycle & Field Integrity Invariant**:
   - Order creation requires valid structure, `id`, `code` (format `LIN-XXXX`), `totalSheets > 0`, `paperType`, and `createdById`.
   - **Thợ In (PRINTER)** cannot modify engineering/financial specifications (`paperType`, `paperGsm`, `paperWidth`, `paperHeight`, `printerId`, `totalSheets`, `items`, `createdById`). They are strictly restricted to updating production state fields (`status`, `plateStatus`, `actualPrintedSheets`, `spoilageSheets`, `printedNote`, `printedImageUrl`, `printingCompletedAt`, `timeline`, `issues`, `updatedAt`).
   - **Tổ Gia Công (FINISHER)** cannot modify printing specs or reassign printers. They can only update finishing fields (`finishingStatus`, `finishingCompletedAt`, `status`, `timeline`, `issues`, `comments`, `updatedAt`).
   - **Thiết Kế (DESIGNER)** can create, dispatch, mark plate ready, update plate note/status, request cancellation, or delete orders only while in `DRAFT` status. Once an order is dispatched to printing, non-administrative deletion is strictly forbidden.
   - **Kinh Doanh (SALE)** can create orders, toggle urgency flags (`isUrgent`, `urgentReason`), add comments, and request cancellation.
   - **Developer / Admin (Master Override)**: Full management and emergency dispute resolution.

3. **Workshop Settings Invariant**:
   - `/settings/app` is readable by authenticated workshop staff for offline-ready parameter syncing.
   - `/settings/app` can ONLY be modified by `DEVELOPER` or `ADMIN`.

4. **Storage Asset Invariant**:
   - File uploads in `orders/{orderId}/*` and `issues/{orderId}/*` are restricted to images (`image/*`) and documents (`application/pdf`) with a maximum size limit of 15MB.
   - Users cannot overwrite or delete files belonging to other workshop orders without appropriate permissions.

---

## 2. The "Dirty Dozen" Malicious Payloads (TDD Test Suite)

| Test Case | Description | Attempted Action | Expected Result |
|---|---|---|---|
| **PAYLOAD 1** | **Role Escalation Attack** | Non-admin user tries to update `/users/u-printer-1` with `role: "DEVELOPER"` | `PERMISSION_DENIED` |
| **PAYLOAD 2** | **Printer Spec Tampering** | `PRINTER` tries to reduce `totalSheets` from 10,000 to 5,000 or change `paperType` | `PERMISSION_DENIED` |
| **PAYLOAD 3** | **Unauthorized Order Deletion** | `PRINTER` or `SALE` attempts to hard-delete an active production order `/orders/order-1` | `PERMISSION_DENIED` |
| **PAYLOAD 4** | **Dispatched Order Deletion by Designer** | `DESIGNER` tries to delete order `/orders/order-1` whose status is `PRINTING` (not `DRAFT`) | `PERMISSION_DENIED` |
| **PAYLOAD 5** | **Settings Hijack** | `FINISHER` or anonymous user attempts to update `/settings/app` (e.g. modify `adminPin` or system config) | `PERMISSION_DENIED` |
| **PAYLOAD 6** | **Anonymous / Unauthenticated Order Creation** | Unauthenticated attacker tries to inject fake order `/orders/evil-1` | `PERMISSION_DENIED` |
| **PAYLOAD 7** | **ID Poisoning / Denial of Wallet** | Attacker tries to write to document ID exceeding 128 chars or containing path injection (`orders/../../root`) | `PERMISSION_DENIED` |
| **PAYLOAD 8** | **Negative Quantity / Corrupt Order Payload** | User tries to create order with `totalSheets: -500` or missing mandatory `paperType` | `PERMISSION_DENIED` |
| **PAYLOAD 9** | **Terminal State Tampering** | User attempts to overwrite a completed order's immutable fields or reset `createdAt` timestamp | `PERMISSION_DENIED` |
| **PAYLOAD 10** | **PIN Backdoor Bypass** | User attempts login using hardcoded `9999` backdoor PIN | `REJECTED (Backdoor Removed)` |
| **PAYLOAD 11** | **Storage Executable Upload** | User attempts to upload `.exe` or `.sh` script to `/orders/order-1/malware.exe` | `STORAGE_PERMISSION_DENIED` |
| **PAYLOAD 12** | **Storage Giant File Attack** | User attempts to upload 100MB file to storage bucket exceeding 15MB limit | `STORAGE_PERMISSION_DENIED` |

---

## 3. Storage Security Spec
- **Path structure**:
  - `orders/{orderId}/{fileName}`: Order artwork and completion photos
  - `issues/{orderId}/{fileName}`: Issue report incident photos
  - `avatars/{userId}/{fileName}`: Employee profile avatars
- **Rules**:
  - Content type: `image/.*` or `application/pdf`
  - Max file size: `15 * 1024 * 1024` (15MB)
  - Write access: Authenticated workshop accounts
  - Delete access: Order creator, Admin or Developer
