# Báo cáo kiểm thử Phase 02A

Codex Cloud, 26/11/2026. Nhánh `codex/phase-02a-sales-design`. Base `2425a42cf0a6618dac653b2ebbb8010e29edcad1` trên `codex/sql-foundation`. Checkpoint mã `161d93a80a916ff0d92a0afab85a650d76260b6d`.

Môi trường Debian 13, Node.js 22.22.2, npm 10.9.7, MariaDB 11.4.9 trong container riêng, Chromium do Playwright cài. DB và tài khoản kiểm thử riêng. Các bộ integration, restart và browser chạy lần lượt trên DB kiểm thử.

## Kết quả Cloud

| Kiểm tra | Exit code | Bằng chứng |
|---|---|---|
| `npm ci` | 0 | Cài từ lockfile với đúng Node.js và npm |
| `npm run typecheck`, `npm run lint` | 0 | TypeScript và ESLint |
| `npm test` | 0 | 4/4 unit Foundation |
| `npm run test:legacy` | 0 | 5/5 nhóm legacy cục bộ đã đưa vào Foundation |
| `npm run db:migrate` | 0 | DB trống áp dụng 001/002/003. Lần chạy lại báo schema đã cập nhật |
| `npm run test:integration` | 0 | 19/19 kết quả TAP. Nâng cấp từ 001/002 giữ dữ liệu checkpoint, kiểm tra FK, unique, rollback và API thật |
| `npm run build`, `npm run check:runtime` | 0 | Vite và Node production build. PWA giữ /api network-only. Runtime cách ly Firebase và JSON store cũ |
| Khởi động lại MariaDB rồi chạy `npm run test:restart` | 0 | Hai tiến trình Node đã biên dịch, phiên và dữ liệu khách hàng/đơn/mẫu vẫn truy xuất được |
| `npm run test:e2e` | 0 | 8/8 suite Foundation và Phase 02A. 6 viewport × Light/Dark và axe ở 1366 px |
| `npm audit` | 0 | 0 advisory trong lockfile |
| Gitleaks và `git diff --check` | 0 | Staged content và các commit của nhánh nhiệm vụ |

Viewport kiểm tra là 360×800, 390×844, 768×1024, 1024×768, 1366×768 và 1920×1080. Phase 02A lưu 48 ảnh tổng hợp từ danh sách khách hàng, danh sách đơn, thư viện mẫu và bước chọn tệp nhập. Kiểm tra dialog gồm chiều rộng, phím Escape và axe trong hai theme. Các ảnh và trace dùng fixture tổng hợp, lưu cục bộ hoặc trong artifact CI.

## Đối chiếu mã nguồn

- CustomerRepository, customerService, customer-import và Customer/CustomerImportJob types xác định mã KH, trường liên hệ, khoá so trùng và nguồn import. Quy tắc import ghi rõ cách xử lý khi UI nguồn cho phép tạo thêm số trùng.
- SalesOrderRepository, SalesOrderService, SalesOrderWorkflowService, fulfillmentWorkflow và Firestore Rules xác định draft, quyền thương mại, các transition và điều kiện mở lại. Callable là nguồn chính khi UI và backend của bản tham chiếu khác nhau.
- SavedDesignRepository, savedDesignService và DesignerQueue xác định luồng mẫu, thông tin giấy/kẽm/khách, chọn phiên bản và quan hệ với dòng sản phẩm. Phần chọn mẫu đã nối sales, phần bình bài và sản xuất thuộc 02B. Tham chiếu thêm feature map và test workflow trong `legacy/firebase`.

## Các trường hợp Phần 02A đã kiểm tra

- Khách hàng. CRUD theo quyền, chuẩn hoá điện thoại, mã ngoài, tìm kiếm có dấu, lọc/phân trang, soft delete, 409 khi hai người sửa cùng phiên bản, rollback toàn bộ thao tác hàng loạt và giữ lịch sử.
- Nhập tệp. CSV UTF-8, workbook XLSX thật, XLSX hỏng, ô thiếu, trùng trong tệp và trong DB, owner scope, giới hạn lô 20, replay staging/confirm/process, và lỗi một dòng khi khách đã đổi sau preview. Có ca cập nhật duy nhất với chính sách UPDATE giữ nguyên ô trống.
- Đơn bán hàng. Nháp nhiều dòng, sửa số lượng túi, cạnh tranh mã SO, xác nhận, hủy, chặn transition sai, audit và lịch sử trạng thái. Ca mở lại hợp lệ dùng fixture đã giao chỉ trong DB test. Workflow xác nhận thương mại giữ yêu cầu cho giai đoạn hạ nguồn. Kiểm tra schema/API không có lệnh hoặc số lượng kho sinh từ 02A.
- Mẫu thiết kế. Tạo và phân quyền, append phiên bản, gắn mẫu vào dòng bán hàng, phiên bản cũ giữ nguyên sau lần sửa mẫu. Client chỉ gửi metadata. Đồng bộ invalidation từ trình duyệt thứ hai được xác minh.
- Dữ liệu giả lập thuộc các ca test. MariaDB, schema, API, ứng dụng trình duyệt và quy trình restart chạy thật.

## GitHub Actions

GitHub Actions **PASS** trên đúng checkpoint mã. Job Ubuntu chạy migration và API với MariaDB 11.4.9, build, restart đã biên dịch và Playwright Foundation/Phase 02A. Artifact **browser-evidence** lưu ảnh và báo cáo CI. [Run 45792134153](https://github.com/litequang/indongduongSQL/actions/runs/45792134153)

## Giới hạn và quyết định nghiệp vụ

- Test legacy độc lập `prompt14-permission-helpers.test.ts` tái hiện lỗi có sẵn, exit 1. Kỳ vọng MANAGER xác nhận xuất kho đã bị thay bằng quyền WAREHOUSE chính xác. Các Firebase emulator suite chưa chạy.
- SQL mặc định mỗi số điện thoại chuẩn hóa hoặc mã ngoài đang hoạt động khớp tối đa một khách. Nhập trùng có lựa chọn bỏ qua hoặc cập nhật có xác nhận. Cần xác nhận nghiệp vụ nếu xưởng cần nhiều khách dùng chung số điện thoại hoặc muốn đặt thời hạn lưu kết quả từng dòng nhập.
- Các sản phẩm đi thẳng gia công/kho đang ở mức xác nhận thương mại. Khi Phase 02C được duyệt, cần chốt xử lý tồn đọng và chuyển tiếp theo cờ sản xuất/gia công. Điều kiện Admin/Developer mở lại đơn là đơn đã giao hoặc đã hoàn thành.
- Kiểm thử Hawk Host, thiết bị vật lý, ảnh R2 và tích hợp Sapo thuộc phạm vi xác minh sau. Cloud dùng cơ sở dữ liệu riêng.

PC tiếp nhận theo [HANDOFF.md](HANDOFF.md). Phạm vi tiếp nối và bất biến sản xuất nằm trong [PHASE_02B_HANDOFF.md](PHASE_02B_HANDOFF.md).
