# Bàn giao PC / Cloud

PC, 27/11/2026. Nhánh **codex/phase-03-private-operations**, base Cloud 02C **5d5af17c26ad08fc844ece0c1a6f22e00692248e**. Code Cloud đã test `ddf3e88f415a7df0a499bb011c3a2a1b0ef56a95`. Checkpoint code PC **9231886544ec92415e7d9b8dce36f070a76c2489** đã push; commit bàn giao tài liệu đi sau SHA code bất biến này. PC là writer duy nhất, không dùng agent song song và giải phóng ownership sau commit bàn giao. Không merge main/PR #1/#2, không sửa repo Firebase gốc/Thờ Phượng Pro, không deploy.

Chủ dự án giao làm phần tiếp theo sau Cloud 02C và xác nhận **chưa có R2 dev — làm và kiểm thử cục bộ, ghi rõ bước R2 còn chờ**. Triển khai Phase 03 cục bộ hoàn tất; nghiệm thu bucket thật vẫn **LOCAL_VALIDATION_REQUIRED**. Phase 04 và deployment cần nhiệm vụ mới.

## Đã bàn giao

- Tiếp nhận GitHub/PR #2/CI và hồi quy 02C Windows, giữ nguyên quy tắc gia công/nghiệm thu, xuất nguyên đơn, giao hàng/hàng hoàn và các quyết định nghiệp vụ còn mở.
- Ticket ảnh owner/target, giải mã/normalize ảnh thực, SHA-256, ghi R2 có điều kiện, registry ACTIVE và FK. Phiên bản thiết kế/lệnh in giữ tham chiếu; ảnh lệnh chính thức bất biến, thợ cũ mất quyền đọc sau đổi phân công.
- Nháp File thiết bị theo tài khoản/target/slot, F5 khi mở lại cùng nháp SQL đã lưu, xóa khi logout/session hết hạn. API/session vẫn memory-only, ngoài SW. Lỗi dung lượng giữ File; verified upload vẫn thành công nếu dọn nháp thiết bị lỗi. Tải ảnh không ghi đè nội dung vừa nhập.
- Thông báo transactional theo người nhận, read-state riêng, phân trang, polling visible/focus/reconnect, tùy chọn âm báo/giọng đọc. Không gửi tin ngoài ứng dụng.
- Developer backup/coverage/verify/khôi phục ảnh thiếu, <=500 ID/nhóm có tiếp nhóm, một ảnh/lượt, xem kết quả từng ảnh, retry/resume và dọn ảnh không tham chiếu. Không ghi đè ảnh đang có hoặc backup sai checksum. Backup ảnh không thay thế backup MariaDB.
- Files: server/storage/, routes/private-operations.ts, services/notifications.ts, shared image references, src/components/private/, services/device-drafts.ts, thiết kế/composer/lệnh in, frontend startup, tests/API/HTTP transport/browser và CI. [PRIVATE_OPERATIONS.md](PRIVATE_OPERATIONS.md), API_CONTRACT, DATABASE_SCHEMA, AUTHORIZATION_MATRIX và DECISIONS mô tả hợp đồng.

## Migration, môi trường và kiểm thử

Thêm **007_private_operations.sql**; **001–006 không đổi checksum**. Dev nâng 001–005 lên 006/007, giữ setup/tài khoản/dữ liệu. Test DB riêng có 001–007; instance MariaDB mới riêng, nâng 001/002, concurrent runners và rerun no-op đều PASS. Lần đầu 007 chưa publish lỗi tại inline CHECK sau statement 1; đã kiểm tra checkpoint/schema, giữ DDL hoàn thành và sửa rõ phần còn lại. Không DROP/TRUNCATE/reset database để sửa. [PHASE_03_TEST_REPORT.md](PHASE_03_TEST_REPORT.md)

Windows PowerShell; Node **22.22.2**, npm **10.9.7**, MariaDB **11.4.9** riêng **127.0.0.1:3307**, dev/test khác DB/account. `.env`, option file admin, logs, snapshots, ảnh/object fixtures đều riêng/ignored. Cloud phải tự tạo môi trường, không giả định có DB PC. Không dùng production Firebase/R2/DB/hosting.

PASS exit **0**: npm ci (690 package, audit 691, zero vulnerability); typecheck/lint; unit **5/5** gồm AWS SDK qua HTTP localhost; legacy hỗ trợ **5/5 nhóm**; MariaDB/API **46/46**; build/runtime/PWA; fresh/upgrade/concurrency/rerun; compiled Node restart (fixture 02C riêng **7/7**, rồi hai process so session/business/fulfillment/registry/job/read-state); graceful MariaDB restart, SHA-256 **53 bảng test cùng session không đổi**. Respawn Windows lần đầu chưa sẵn sàng trong vòng chờ; local:db lại và auth/snapshot xác minh thành công, không phục hồi/reset dữ liệu.

Playwright full regression **18/18** và final Phase 03 **3/3**, exit 0. Sáu viewport × sáng/tối, 12 PNG Phase 03 cùng các matrix kế thừa, axe 1366 cả hai theme. Đã xem ảnh thực và sửa nút bị cắt ở 360 px; kiểm tra bounds từng nút, quota thiết bị, input trong lúc upload và HTTP 5xx. Gitleaks staged/history và git diff --check PASS. Artifacts tổng hợp ở ignored .local/test-results/playwright-report hoặc CI retention ngắn.

Remote CI [45964530282](https://github.com/litequang/indongduongSQL/actions/runs/45964530282), đúng code **9231886544ec92415e7d9b8dce36f070a76c2489**: **completed success**. Ubuntu/MariaDB riêng chạy PASS **46/46 API**, unit 5/5, legacy 5/5, build/runtime, compiled restart và **19/19 Playwright**, kèm upload browser artifacts. Commit bàn giao chỉ sửa docs, không đổi checkpoint code.

App PC hiện sẵn sàng **http://localhost:4100**, setup đã đóng; tài khoản/mật khẩu hiện có không bị đọc/đổi. R2 chưa cấu hình nên upload/backup dev báo chưa khả dụng, không fallback filesystem/provider khác. Live R2 dev/private backup, physical PWA/device/audio và Hawk Host/native sharp/proxy/memory còn LOCAL_VALIDATION_REQUIRED. Baseline legacy prompt14 MANAGER xuất kho là lỗi cũ không chạy lại; emulator SKIP; vendor/Zod/ESLint/Playwright color warnings không chặn build.

## Tiếp nhận

Fetch/status/branch/upstream/history trước khi switch. Giữ mọi thay đổi local; nhánh chưa có thì `git switch --track origin/codex/phase-03-private-operations`; nếu đã có, kiểm tra commit chưa push rồi `git switch` và `git pull --ff-only`. Không reset/force-push/auto-merge.

```powershell
npm ci
npm run db:migrate
npm run typecheck
npm run lint
npm test
npm run test:legacy
$env:ALLOW_TEST_DATABASE = '1'
npm run test:integration
npm run build
npm run check:runtime
npm run test:restart
npx playwright install chromium
npm run test:e2e
```

Không chạy integration/restart/E2E đồng thời trên một test DB. Restart tự chuẩn bị lại fixture 02C; không phụ thuộc suite cuối. Local PC dùng local:db và dev nếu cần khởi động lại; không đọc/đổi password chủ dự án để walkthrough.

Khi được cấp **hai bucket dev mới/token riêng** trong .env, làm theo [PRIVATE_OPERATIONS.md](PRIVATE_OPERATIONS.md): R2_ENVIRONMENT/runtime development, opt-in ALLOW_R2_DEV_SMOKE=1, `npm run test:r2-dev`, rồi UI ảnh/backup/verify/missing-only restore. Không thay bằng production. [PHASE_04_HANDOFF.md](PHASE_04_HANDOFF.md) chuẩn bị phần tiếp khi có task mới. Giữ mở chính sách nguồn hàng không cần in, REPRINT, hàng hoàn hỏng/hold, khách chung điện thoại, import/notification/change/backup retention. Không tự tạo nhập kho hoặc purge history.
