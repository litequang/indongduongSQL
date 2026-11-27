# Bàn giao Phase 03

Cloud, 27/11/2026. Nhánh Phase 02C là `codex/phase-02c-fulfillment`. Checkpoint và kết quả xác minh nằm trong [HANDOFF.md](HANDOFF.md) và [PHASE_02C_TEST_REPORT.md](PHASE_02C_TEST_REPORT.md).

## Nền tảng tiếp nhận

- Schema SQL 001–006. Handoff in, gia công và nghiệm thu, sổ kho, phiếu xuất nguyên đơn và vận đơn đều có mã nhận diện bền vững.
- Lưu nháp metadata lệnh in vào SQL có xác nhận từ server. Các ảnh thiết kế/in hiện chỉ có metadata hoặc vị trí tham chiếu registry. Phiên đăng nhập và dữ liệu riêng dùng cache bộ nhớ; service worker bỏ qua API.
- Mọi mutation nghiệp vụ đi qua xác thực, CSRF, optimistic version, audit và change feed sắp theo thứ tự commit. README và [SQL_ARCHITECTURE.md](SQL_ARCHITECTURE.md) mô tả môi trường và runtime dùng trên shared hosting.

## Các quyết định còn mở

- Xác nhận bước tiếp nhận vật lý cho sản phẩm không cần in, cả hai trường hợp cần gia công và vào kho trực tiếp.
- Xác nhận đối soát sản lượng gốc, hàng thiếu/hỏng và sản lượng in lại trước khi mở nhập kho cho REPRINT.
- Xác nhận cách xử lý tiếp cho phiếu xuất có hàng hỏng hoặc giữ riêng sau kiểm tra hoàn.
- Chốt định danh khách chung số điện thoại và thời hạn lưu chi tiết import.

## Phạm vi khi có yêu cầu Phase 03

Triển khai private R2 và kiểm tra registry/định dạng, Blob nháp đính kèm theo thiết bị, backup/restore có kiểm chứng, notifications và đồng bộ tăng dần. Dùng cấu hình và tài khoản thử riêng. Giữ API riêng tư ngoài service worker. Tích hợp vận chuyển bên ngoài, triển khai Hawk Host và nghiệm thu thiết bị thực tế thuộc yêu cầu riêng.

## Tiếp nhận trên PC

```powershell
git fetch origin refs/heads/codex/phase-02c-fulfillment:refs/remotes/origin/codex/phase-02c-fulfillment
git status --short
git log -5 --oneline origin/codex/phase-02c-fulfillment
npm ci
npm run db:migrate
```

Checkout nhánh theo hướng dẫn trong HANDOFF. Chạy lại các bộ kiểm thử trên DB tổng hợp riêng và walkthrough trước khi chốt checkpoint tiếp theo. Chỉ mở nhánh Phase 03 khi chủ dự án giao việc.
