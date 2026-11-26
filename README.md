# In Đông Dương SQL

Không gian quản lý xưởng in độc lập: **React + TypeScript + Vite/PWA, Express, MariaDB**. Design System shadcn/ui + Radix, Tailwind v4, TanStack Query/Table, Lucide. Mục tiêu Hawk Host/cPanel/Passenger; chưa triển khai hosting trong Phase 01.

Đã triển khai nền tảng: thiết lập Developer một lần bằng khóa riêng, đăng nhập/session, tám vai trò, nhân viên, hồ sơ/mật khẩu, cấu hình công ty/danh mục, nhật ký quản trị, đồng bộ thay đổi và UI desktop/tablet/mobile sáng/tối. Các phân hệ khách hàng, đơn hàng, thiết kế, sản xuất, gia công, kho/giao hàng, thông báo, R2 và báo cáo **chưa khả dụng**. Không có dữ liệu nghiệp vụ mẫu hoặc thao tác thành công giả.

Không cần Firebase Console. Không chuyển dữ liệu/tài khoản/mật khẩu Firebase cũ. Mã tham khảo đã được cô lập trong `legacy/firebase`, không chạy trong bản SQL.

## Cài mới

1. Dùng Node **22.22.2**, npm **10.9.7**, MariaDB **11.4.x** (đã kiểm thử 11.4.9). Clone repository đích và chọn branch nhiệm vụ; kiểm tra status trước khi sửa.
2. `npm ci`. Sao chép `.env.example` thành `.env` riêng.
3. Tạo database MariaDB mới và tài khoản riêng. Điền DB_*; DB_EXPECTED_NAME phải trùng DB_NAME. Không dùng root hoặc database dự án khác. Chi tiết quyền/Windows portable: [LOCAL_SETUP_WINDOWS](docs/LOCAL_SETUP_WINDOWS.md).
4. Đặt APP_ORIGIN=`http://localhost:4100`, `npm run setup:secret` nếu chưa có khóa. Khóa chỉ nằm trong `.env` riêng, không đưa vào Git/chat công khai.
5. `npm run db:migrate`, rồi `npm run dev`. Mở **http://localhost:4100**.
6. Thiết lập thông tin công ty, tài khoản Developer và nhập khóa riêng từ `.env`. Không có tài khoản/mật khẩu mặc định. Sau setup, đăng nhập bằng tài khoản vừa tạo; setup vĩnh viễn đóng.

Khởi động lại: đảm bảo MariaDB riêng đang chạy, mở thư mục repository và chạy `npm run dev`. Helper Windows tùy chọn `npm run local:db` đọc MARIADB_EXECUTABLE/MARIADB_CONFIG riêng của máy. Build: `npm run build`; start từ `app.cjs`: `npm start`. NODE_ENV=development dùng Vite; test dùng static build; production yêu cầu HTTPS và cấu hình hosting được xác minh.

## Kiểm tra chất lượng

```powershell
npm run typecheck
npm run lint
npm test
npm run test:legacy
$env:ALLOW_TEST_DATABASE='1'
npm run test:integration
npm run build
npm run check:runtime
npm run test:restart
npx playwright install chromium
npm run test:e2e
```

Test DB/account phải khác DB ứng dụng và tên bắt đầu indongduong_sql_test. Harness chỉ reset dữ liệu tổng hợp khi opt-in; không DROP/TRUNCATE. Không chạy integration/E2E đồng thời trên cùng test DB. CI dùng MariaDB service riêng, không kết nối production. Ảnh/trace ở `.local/screenshots`, test-results, playwright-report (không commit). Kết quả thực tế: [TEST_REPORT](docs/TEST_REPORT.md).

## Tài liệu và phối hợp PC/Cloud

- [AGENTS](AGENTS.md): quy tắc bắt buộc; [APP_MAP](docs/APP_MAP.md): chủ sở hữu module.
- [PROJECT_STATUS](docs/PROJECT_STATUS.md), [HANDOFF](docs/HANDOFF.md), [DECISIONS](docs/DECISIONS.md): trạng thái/điểm bàn giao/quyết định.
- [Roadmap](docs/SQL_MIGRATION_ROADMAP.md), [Feature parity](docs/FEATURE_PARITY_MATRIX.md), [Phase 02 handoff](docs/PHASE_02_HANDOFF.md).
- [SQL architecture](docs/SQL_ARCHITECTURE.md), [schema/ERD](docs/DATABASE_SCHEMA.md), [API](docs/API_CONTRACT.md), [authorization](docs/AUTHORIZATION_MATRIX.md).
- [UI architecture](docs/UI_UX_ARCHITECTURE.md), [Design System](docs/DESIGN_SYSTEM.md), [Role workspaces](docs/ROLE_WORKSPACES.md), [components](docs/UI_COMPONENT_INVENTORY.md).
- [Hawk Host preparation](docs/HAWKHOST_DEPLOYMENT.md), [third-party notices](THIRD_PARTY_NOTICES.md), [source provenance](docs/SOURCE_PROVENANCE.md).

GitHub là nguồn chính thức. Một writer mỗi branch; PC/Cloud song song dùng branch riêng. Không force push, không tự merge main, không thay đổi repo Firebase gốc/Thờ Phượng Pro. Branch triển khai hiện tại `codex/sql-foundation`; main hiện chỉ là baseline nguồn đã làm sạch, chưa phải bản SQL ổn định được duyệt. Không bắt đầu Phase 02 khi chưa có yêu cầu mới.
