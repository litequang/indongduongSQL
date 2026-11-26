# Cài đặt local Windows

Yêu cầu: Git, Node 22.22.2, npm 10.9.7, MariaDB 11.4.x. Không cần Firebase Console hoặc tài khoản Google. `npm ci` dùng lockfile chung với Cloud/CI; không chép node_modules giữa các hệ điều hành.

1. Clone repository đích, `git fetch origin`, kiểm tra `git status --short`, chọn branch nhiệm vụ. Không ghi đè thay đổi chưa commit và không dùng chung branch với agent đang làm việc.
2. `npm ci`. Sao chép `.env.example` thành `.env` riêng trên máy. Không commit tệp này.
3. Dùng MariaDB riêng cho dự án. Nếu cài portable ZIP, xác minh checksum do MariaDB công bố, chạy mariadb-install-db với datadir/port riêng, đặt mật khẩu root ngẫu nhiên, bind 127.0.0.1 và khởi động với my.ini riêng. Không thay đổi service MySQL hoặc database dự án khác. Máy đã kiểm thử dùng MariaDB 11.4.9 ở 3307; MySQL đang có ở cổng khác được giữ nguyên.
4. Dùng tài khoản quản trị DB để tạo `indongduong_sql_dev` và tài khoản riêng chỉ được truy cập database đó. Tạo `indongduong_sql_test` và tài khoản test khác nếu chạy tests. Charset utf8mb4 / collation utf8mb4_unicode_ci. Không sử dụng root làm tài khoản ứng dụng. Đặt mật khẩu ngẫu nhiên riêng, không dùng ví dụ công khai làm mật khẩu thật.
5. Quyền migration cần SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES trên đúng database. Tài khoản runtime có thể hạ về SELECT/INSERT/UPDATE/DELETE sau migration, thông qua cấu hình riêng của môi trường; không hạ quyền test trước khi chạy kiểm thử migrations.
6. Điền DB_HOST/PORT/NAME/USER/PASSWORD và DB_EXPECTED_NAME trùng chính xác DB_NAME. APP_ORIGIN phải là `http://localhost:4100`, không có dấu `/` cuối. Giữ TRUST_PROXY_HOPS=0 khi local trực tiếp.
7. `npm run setup:secret` tạo khóa ngẫu nhiên trong .env, từ chối ghi đè khóa đã có. Đọc khóa riêng trong editor; không dán vào issue, chat công khai hoặc GitHub. Nếu khóa đã được chuẩn bị thì không cần sinh lại.
8. `npm run db:migrate`, chạy lại một lần để kiểm tra no-op. `npm run dev`. Mở http://localhost:4100.
9. Hoàn thành ba bước: thông tin xưởng → tên/tên đăng nhập/mật khẩu Developer → khóa thiết lập một lần. Sau thành công đăng nhập bằng tài khoản vừa tạo. Bootstrap đóng bằng system_state và kiểm tra số user, kể cả khi hai request chạy đồng thời. Có thể xóa SETUP_SECRET khỏi cấu hình và restart sau setup; không reset system_state để mở lại.

Mật khẩu tài khoản tối thiểu 12 ký tự. Không có tài khoản/mật khẩu mặc định và không seed đơn hàng/khách hàng/nhân viên mẫu. Database dev được để trống cho chủ dự án thiết lập; kiểm thử dùng database test riêng.

## Khởi động lại

```powershell
Set-Location <thu-muc-repository>
npm run db:migrate
npm run dev
```

Nếu dùng portable MariaDB, khởi động đúng executable/my.ini riêng trước. Helper tùy chọn `npm run local:db` đọc MARIADB_EXECUTABLE/MARIADB_CONFIG từ .env riêng; không hardcode đường dẫn trong script. Bản build: `npm run build`, sau đó `npm start`. NODE_ENV quyết định môi trường: development dùng Vite middleware; test dùng static dist để kiểm thử; production yêu cầu APP_ORIGIN HTTPS, cookie Secure, cấu hình proxy đúng. Không dùng NODE_ENV=production với HTTP local để giả vờ kiểm thử HTTPS.

## Kiểm thử

```powershell
npm run typecheck
npm run lint
npm test
npm run test:legacy
$env:ALLOW_TEST_DATABASE='1'
npm run test:integration
npm run build
npm run check:runtime
npx playwright install chromium
npm run test:e2e
```

Điền TEST_DB_NAME/USER/PASSWORD riêng. Harness yêu cầu opt-in trên, tên DB bắt đầu `indongduong_sql_test`, khác DB/account ứng dụng, rồi mới xóa fixture tổng hợp bằng DELETE theo thứ tự FK. Không DROP/TRUNCATE. Playwright khởi động static backend thật tại 4173, reset test fixtures, tạo secret/password ngẫu nhiên mỗi lượt; không đụng DB dev. Không chạy integration và E2E cùng lúc trên cùng test DB. Ảnh nằm `.local/screenshots`; trace/report ở test-results/playwright-report, đều không commit.

Nếu lỗi kết nối: kiểm tra process, host/port, grant đúng host và cấu hình riêng; không thử database của Thờ Phượng Pro. Nếu migration failed/running: giữ nguyên evidence, xem schema_migrations/completed_statements và schema thực tế; không tự xóa metadata hay chạy lại mù quáng. README, HANDOFF và TEST_REPORT chỉ ghi đường dẫn/lệnh, không chứa secrets.

Cloud/Linux dùng cùng phiên bản Node/lockfile/scripts; MariaDB service riêng, biến môi trường tương tự; không dùng helper Windows hoặc đường dẫn local của PC.
