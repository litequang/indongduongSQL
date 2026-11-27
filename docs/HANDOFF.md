# Bàn giao PC / Cloud — Phase 04

PC, 27/11/2026. Nhánh **codex/phase-04-parity-cleanup**, base Phase 03 **aacd3fb329a8f0828df6a3b71316b33746968310**. Checkpoint code đã push và kiểm thử: **7a8750a6009a977a0b74c5779e37b255db46fdbf**. Commit bàn giao chỉ sửa tài liệu, tham chiếu SHA code đi trước này. PC là writer duy nhất, không dùng agent song song; giải phóng ownership sau commit bàn giao. Không merge main/PR, không sửa repo Firebase gốc/Thờ Phượng Pro, không deploy.

Chủ dự án giao phần tiếp theo sau Phase 03; nhiệm vụ này triển khai Phase 04. Lựa chọn **chưa có R2 dev — làm và kiểm thử cục bộ, ghi rõ bước R2 còn chờ** tiếp tục có hiệu lực. Phần triển khai/parity đã xác định hoàn tất; các chính sách nghiệp vụ còn mở và nghiệm thu bên ngoài chưa được gắn PASS. Phase 05 deployment cần cho phép riêng.

## Đã hoàn thành

- Báo cáo SQL thực theo ngày tạo UTC+7, lọc thợ/giấy/trạng thái, không nhân đôi theo sản phẩm/bình bài. Tách tờ dự kiến, thực in, hỏng, giá trị 0 và chưa ghi nhận. Recharts/bảng chi tiết, CSV tối đa 2.000 dòng có bảo vệ công thức; không suy ra tiền hoặc số túi từ số tờ.
- Developer sửa quyền vai trò/cá nhân trong giới hạn vai trò và đối tượng hiện có; cá nhân ưu tiên vai trò, đổi quyền thu hồi phiên bị ảnh hưởng. Phân hệ có kiểm tra phụ thuộc, dừng lệnh ghi trực tiếp nhưng giữ lịch sử và đối soát của quy trình lõi; sản xuất/gia công luôn bật. API chặn biến thể URL và thay đổi khẩn qua trường mặc định bị bỏ trống.
- Avatar xác minh qua registry riêng tư, FK đúng người, proxy no-store, quyền quản lý nhân viên và kiểm tra tham chiếu khi dọn ảnh. Hướng dẫn sử dụng trong menu cho tám vai trò. Phản hồi hết phiên đến muộn không xóa phiên đăng nhập mới.
- Gỡ 211 file Firebase tham khảo và tooling riêng; giữ nguồn gốc/tree Git bất biến và bảng kiểm thử thay thế. `test:regression` là lệnh chính; `test:legacy` chỉ là alias SQL. Demo/giả vai trò, purge lệnh và localStorage làm nguồn dữ liệu được loại bỏ rõ trong matrix.
- Files chính: migration 008; server/routes/{access,reports,users,private-operations}.ts; server/services/access.ts; storage/registry.ts; shared/{access,reports,submission-lock}; frontend Reports/AccessSettings/UserGuide/Avatar/Profile; AuthContext/api; regression/API/Playwright, runtime/restart và CI. [PHASE_04_PARITY.md](PHASE_04_PARITY.md) ghi hợp đồng và giới hạn.

## Migrations và môi trường

001–007 giữ nguyên checksum; **008_access_profiles.sql** thêm AVATAR, users.avatar_registry_id FK, policy versioned và index báo cáo. Dev/test đã áp dụng; dev chạy lại no-op. Không quan sát thấy DDL lỗi hoặc checkpoint dang dở. Fresh 001–008 và nâng cấp 001/002 → 008 đã chạy concurrent/rerun trên instance Windows mới riêng.

Windows Node **22.22.2**, npm **10.9.7**, MariaDB **11.4.9** riêng tại loopback **3307**, pool có giới hạn. `.env`, DB, tài khoản, khóa và tệp thật không ở Git và không tự tồn tại ở Cloud. App dev đang chạy bằng phiên terminal được quản lý tại **http://localhost:4100**, ready 200; setup đã đóng (`initialized=true`, `setupEnabled=false`). Tài khoản/mật khẩu dev cũ được giữ nguyên. `.local/app-process.json` ghi PID/phiên cục bộ; kiểm tra ownership thực trước khi dừng.

## Kiểm thử và CI

Chi tiết lệnh/kết quả/exit: [PHASE_04_TEST_REPORT.md](PHASE_04_TEST_REPORT.md), index [TEST_REPORT.md](TEST_REPORT.md). Local: npm ci/typecheck/lint/build/runtime exit 0; unit 7/7, regression 2/2; real MariaDB API 54/54, focused final Phase 04 8/8; 19 luồng browser cũ đã qua, Phase 04 final 5/5. Lượt full trước sửa fixture interception SW có exit 1 (22 pass, một fixture timeout, một skip); đã sửa fixture và chạy lại Phase 04. 36 PNG mới, sáu viewport/hai theme, sáu axe scan; đã xem ảnh thực. Artifacts được ignore.

Restart MariaDB thật giữ nguyên hash cả 54 bảng, gồm avatar/policy/session: `58bff2a359b50dc6dc6f42387332e14e71cd999be8ea43fb2e97bbce02d2a56d`. Restart hai tiến trình Node compiled giữ policy và dữ liệu nghiệp vụ/fulfillment/registry/job/thông báo. Gitleaks staged và diff check exit 0, không phát hiện secret. Cảnh báo không chặn: vendor chunk, Zod annotation, ESLint dependency deprecated và màu Playwright.

CI [45973108251](https://github.com/litequang/indongduongSQL/actions/runs/45973108251) **completed / success** tại đúng SHA `7a8750a6009a977a0b74c5779e37b255db46fdbf`, xác nhận qua GitHub API. Tất cả bước, gồm API MariaDB thật, compiled restart và bộ Playwright đầy đủ, đều success. Commit bàn giao tài liệu không đổi code đã kiểm thử.

## AI tiếp theo

Fetch, kiểm tra status/upstream/history và đọc PROJECT_STATUS, HANDOFF, DECISIONS, FEATURE_PARITY_MATRIX, PHASE_04_PARITY trước sửa. Dùng nhánh/worktree riêng cho nhiệm vụ mới; không assume DB/env PC có ở Cloud. Reference cuối: `9231886:legacy/firebase`, tree `4c5333b6bf1311a5b6ae513ffb3b9847f7843470`; xem bằng `git show`, không đưa lại vào runtime.

```powershell
git fetch origin
git status --short
git log -5 --oneline
npm ci
npm run db:migrate
npm run typecheck
npm run lint
npm test
npm run test:regression
$env:ALLOW_TEST_DATABASE='1'
npm run test:integration
npm run build
npm run check:runtime
npm run test:restart
npm run test:e2e
```

Các suite đổi dữ liệu phải chạy tuần tự trên cùng DB test riêng. Không reset DB dev hoặc sửa tài khoản chủ dự án. `.local` là bằng chứng cục bộ bị ignore, không phải công cụ Cloud bắt buộc. Dừng dev server của đúng dự án nếu npm ci bị khóa DLL native trên Windows.

Nếu được cấp bucket dev mới qua môi trường riêng và được giao nghiệm thu: theo PRIVATE_OPERATIONS, dùng primary/backup riêng và `ALLOW_R2_DEV_SMOKE=1 npm run test:r2-dev`, kiểm tra UI upload/backup/verify/restore; không dùng production. R2 thật, Android/iOS/tablet/PWA/âm thanh, Hawk Host/Passenger/native sharp và backup/restore MariaDB vận hành vẫn **LOCAL_VALIDATION_REQUIRED**. Không có deployment trong nhiệm vụ này.

Giữ chờ quyết định chủ dự án: nguồn vật lý sản phẩm không qua in; đối soát REPRINT gốc/bị loại/thay thế; hàng trả hỏng/giữ chờ; điện thoại chung của khách; retention import, notification/change events và backup. Không tự tạo stock movement hoặc purge lịch sử. [PHASE_04_HANDOFF.md](PHASE_04_HANDOFF.md) là điểm bắt đầu sau Phase 04.
