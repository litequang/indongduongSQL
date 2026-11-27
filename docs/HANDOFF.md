# Bàn giao PC / Cloud

Cloud thực hiện Phase 02C ngày 27/11/2026 trên `codex/phase-02c-fulfillment`. Base `codex/phase-02b-production` tại `54e14508acb40033ac5005eb64990007b22c1632` bao gồm tài liệu sau checkpoint PC đã nghiệm thu. [PR #2](https://github.com/litequang/indongduongSQL/pull/2) là bản nháp cho chủ dự án xem xét. Checkpoint code `ddf3e88f415a7df0a499bb011c3a2a1b0ef56a95`. [GitHub Actions](https://github.com/litequang/indongduongSQL/actions/runs/45933985370) PASS 37/37 ca MariaDB/HTTP và 16/16 ca Chromium. Báo cáo có exit code, kết quả restart và giới hạn kiểm thử. [PHASE_02C_TEST_REPORT.md](PHASE_02C_TEST_REPORT.md)

## Phần đã triển khai

- Gia công theo bàn giao in và sản phẩm. Nhận việc có phân công hoặc claim, bắt đầu, hoàn thành, xác nhận không gia công, ghi chú, ưu tiên, hoàn tất yêu cầu hủy và sự cố.
- Nghiệm thu theo số đạt, không đạt và thiếu. Kho ghi một lô theo lần nghiệm thu có số đạt dương và theo dõi biến động. Handoff cũ, nguồn sản xuất độc lập, lệnh tách/ghép và liên kết muộn giữ được truy xuất.
- Xuất nguyên đơn bởi WAREHOUSE, có phiếu và các dòng nguồn. Bán hàng tạo vận đơn, xác nhận bàn giao, giao thành công, thất bại hoặc chuyển hoàn; có kiểm tra hàng hoàn theo từng dòng.
- Tiến độ đơn bán dẫn xuất từ thiết kế, phân bổ, in, gia công, kho và giao hàng. Lịch sử sau khi xuất kho được bảo toàn.
- `006_fulfillment.sql` đi tiếp sau 005. Dùng lại session, CSRF, audit và sequence theo thứ tự commit. API và quyền trong [API_CONTRACT.md](API_CONTRACT.md) và [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md). Schema trong [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

## Tiếp nhận trên PC

```powershell
git fetch origin refs/heads/codex/phase-02c-fulfillment:refs/remotes/origin/codex/phase-02c-fulfillment
git status --short
git log -6 --oneline origin/codex/phase-02c-fulfillment
git rev-parse origin/codex/phase-02c-fulfillment
```

Khi thư mục làm việc sạch và nhánh chưa có cục bộ, dùng `git switch --track origin/codex/phase-02c-fulfillment`. Nếu đã có nhánh, kiểm tra các commit cục bộ rồi `git switch codex/phase-02c-fulfillment` và `git pull --ff-only`. Đối chiếu SHA từ báo cáo. Dùng Node 22.22.2, npm 10.9.7 và MariaDB 11.4.9. Dev và test dùng tên database, tài khoản và mật khẩu riêng. Giữ bí mật cấu hình PC trong tệp `.env` bị bỏ qua bởi Git.

```powershell
npm ci
npm run db:migrate
npm run typecheck
npm run lint
npm test
npm run test:legacy
$env:ALLOW_TEST_DATABASE = "1"
npm run test:integration
npm run build
npm run check:runtime
npm run test:restart
npx playwright install chromium
npm run test:e2e
```

Cấu hình `TEST_DB_NAME`, `TEST_DB_USER`, `TEST_DB_PASSWORD` trỏ tới dữ liệu tổng hợp riêng. Chạy integration, restart và browser theo thứ tự nếu dùng chung test DB. Dùng `npm run local:db` nếu sử dụng MariaDB dev theo cấu hình của dự án. Khởi động `npm run dev` và mở `http://localhost:4100`.

## Chạy thử từ đơn đến giao hàng

1. SALE tạo khách thử có điện thoại và địa chỉ, tạo đơn có ít nhất hai sản phẩm cần in. Chọn một sản phẩm cần gia công, một sản phẩm không cần gia công. Xác nhận đơn.
2. DESIGNER nhập và xác nhận kỹ thuật, tạo lệnh từ sản phẩm, gửi cho PRINTER. Có thể chia một sản phẩm thành nhiều lệnh hoặc ghép các sản phẩm của nhiều đơn. Nhập số lượng sản phẩm theo túi và số tờ in theo thông số in.
3. PRINTER nhận lệnh, xác nhận revision đúng, bắt đầu in rồi ghi số tờ thực in và tờ hỏng. FINISHER mở Gia công, tiếp nhận từng bàn giao. Với dòng cần gia công, nhận việc, bắt đầu và hoàn thành. Với dòng còn lại, bấm **Xác nhận không cần gia công**.
4. Người có quyền nghiệm thu nhập số túi đạt, không đạt, thiếu. Kiểm tra kho chỉ ghi nhận số đạt. Để một sản phẩm chưa nghiệm thu và xác nhận WAREHOUSE thấy lý do chưa xuất.
5. Nghiệm thu đủ các dòng còn hiệu lực. WAREHOUSE kiểm tra checklist, chọn phương thức và địa chỉ rồi xác nhận **Xuất nguyên đơn**. Mở phiếu đối chiếu nguồn và tồn. SALE mở **Giao hàng**, tạo vận đơn, xác nhận bàn giao, bắt đầu giao và giao thành công. Đơn phải chuyển **Hoàn thành**.
6. Với đơn thử riêng, báo giao thất bại, chuyển hoàn rồi nhận hàng. Kiểm tra tồn vẫn giữ nguyên đến khi ghi nhận kiểm tra hàng hoàn. Chọn tình trạng cho từng dòng và đối chiếu lượng nhập lại trên sổ kho.

## Quyết định còn mở

Nguồn vật lý của sản phẩm không cần in và quy tắc đối soát nghiệm thu REPRINT vẫn chờ quyết định. Hàng hoàn hỏng hoặc giữ riêng cần xử lý nghiệp vụ tiếp theo để giải phóng phiếu đang mở. Chính sách khách hàng dùng chung số điện thoại và thời hạn lưu chi tiết import vẫn chờ chủ dự án. Xem [PHASE_03_HANDOFF.md](PHASE_03_HANDOFF.md) khi Phase 03 được giao.
