# Báo cáo kiểm thử Phase 02C

Cloud, 27/11/2026. Base `54e14508acb40033ac5005eb64990007b22c1632` từ `codex/phase-02b-production`. Nhánh `codex/phase-02c-fulfillment`. [PR #2](https://github.com/litequang/indongduongSQL/pull/2).

Checkpoint code `ddf3e88f415a7df0a499bb011c3a2a1b0ef56a95`. Commit tài liệu bàn giao được ghi sau SHA này.

## Môi trường

Linux Cloud, Node.js 22.22.2, npm 10.9.7, MariaDB 11.4.9 thực trong container kiểm thử riêng, Chromium qua Playwright. Các bộ kiểm thử chung database chạy tuần tự. Các lượt chạy song song dùng cơ sở dữ liệu tổng hợp khác nhau. Dev database và tài khoản kết nối tách khỏi test. Migration 001–005 giữ checksum đã phát hành.

## Kết quả

| Kiểm tra | Trạng thái và exit code | Bằng chứng |
| --- | --- | --- |
| npm ci | PASS · 0 | Cài đúng package-lock trên Node/npm được yêu cầu. |
| npm run db:migrate | PASS · 0 | Schema trống 001–006. Rerun trả schema đã cập nhật. |
| Nâng cấp 001–005 lên 006 | PASS · 0 | Migration cạnh tranh được tuần tự hóa. Handoff từ schema 005 và sequence giữ nguyên. Kho vẫn rỗng trước nghiệm thu. |
| npm run typecheck | PASS · 0 | TypeScript kiểm tra cả server, UI và tests. |
| npm run lint | PASS · 0 | ESLint với ngưỡng 0 cảnh báo. |
| npm test | PASS · 0 | 4/4 unit. |
| npm run test:legacy | PASS · 0 | 5/5 nhóm legacy được giữ trong pipeline. |
| npm run test:integration | PASS · 0 | 37/37 ca trên MariaDB 11.4.9 và HTTP thật. |
| npm run build | PASS · 0 | Build frontend/PWA và server. |
| npm run check:runtime | PASS · 0 | Đồ thị runtime SQL, loại trừ Firebase và hợp đồng cache API. |
| npm run test:restart | PASS · 0 | Hai tiến trình Node đã build đọc cùng session, dữ liệu bán/thiết kế/in và snapshot lô, phiếu xuất, vận đơn. |
| npm run test:e2e | PASS · 0 | GitHub Actions 16/16 ca Chromium từ Foundation đến 02C. Hai ca 02C cũng PASS cục bộ. |
| Helper legacy prompt14 riêng lẻ | FAIL · 1 | Assertion cũ yêu cầu MANAGER xuất kho. Chính sách Phase 02C dùng WAREHOUSE. |
| Emulator Firebase, thiết bị vật lý, Hawk Host và R2 live | SKIP · — | Môi trường hoặc hạng mục riêng. |

## GitHub Actions

[Run 45933985370](https://github.com/litequang/indongduongSQL/actions/runs/45933985370) kết thúc thành công trên chính SHA code `ddf3e88f415a7df0a499bb011c3a2a1b0ef56a95`. Tất cả bước từ cài đặt đến upload bằng chứng đã hoàn tất. [Artifact browser-evidence](https://github.com/litequang/indongduongSQL/actions/runs/45933985370/artifacts/15169812304) chứa Playwright report, ảnh tổng hợp và kết quả của lượt chạy. Runner ghi cảnh báo deprecation cho runtime nội bộ của các GitHub Action v4. Ứng dụng và test dùng Node 22.22.2.

## Nghiệp vụ kiểm tra

- Nguồn đúng gồm một bàn giao tiếp nhận một lần, claim của hai FINISHER, quyền theo người được giao và ghi yêu cầu/phản hồi hủy. Xác nhận không gia công là bước trước nghiệm thu.
- Nghiệm thu đối chiếu đạt/không đạt/thiếu, retry, lệnh độc lập, nhiều lệnh một đơn, lệnh ghép nhiều đơn, TRACE bằng 0, RELEASED, bổ sung trong giới hạn, REPRINT bị chặn và rollback liên kết muộn với lô đã tiếp nhận.
- Xuất nguyên đơn kiểm tra tất cả sản phẩm còn hiệu lực, kiểm tra thiếu hàng, chống gửi cùng hoặc khác UUID đồng thời, trừ tồn trong transaction và chặn MANAGER. Giao thành công cập nhật đơn và giữ lịch sử.
- Giao thất bại, chuyển hoàn, nhận kiện, kiểm tra từng dòng và nhập lại một lần. Hàng hỏng giữ ngoài tồn khả dụng. Các bản ghi được đọc lại sau mở lại HTTP app và compiled process.
- Chromium thao tác thật từ tạo khách/đơn qua thiết kế và in, rồi gia công, xác nhận không cần gia công, nghiệm thu, xuất kho và giao. Hai browser context kiểm tra cửa sổ kho đổi theo nghiệm thu. Cỡ kiểm tra 360×800, 390×844, 768×1024, 1024×768, 1366×768 và 1920×1080, cả Light và Dark, kèm 48 ảnh tổng hợp cho 02C và các lượt quét axe.

## Lỗi phát hiện khi chạy

- Chuẩn hóa version được tổng hợp bằng SQL sang số và đọc JSON người nhận theo kiểu do driver MariaDB trả về. Ca claim cạnh tranh và quyền đóng sự cố xác minh hai sửa đổi này.
- Probe restart cần mẫu thiết kế đã lưu. Dữ liệu tổng hợp của bộ 02C tạo mẫu qua API và giữ phiên bản đó trong sản phẩm và lệnh in.
- Bỏ dòng sản phẩm lặp trong chi tiết đơn, đặt số liệu tiến độ vào dòng đã có. Điều chỉnh độ tương phản kiểu tab và thêm khả năng cuộn lịch sử bằng bàn phím, sau khi axe phát hiện ở màn hình có nhiều trạng thái.

- Một lượt browser cục bộ bị gián đoạn do build ghi lại `dist` cùng lúc. Các lượt nghiệm thu chạy build xong trước khi mở Chromium.

## Chính sách còn mở

Sản phẩm không cần in có trạng thái chờ xác nhận nguồn vật lý. Nghiệm thu REPRINT chờ quyết định xử lý sản lượng gốc và hàng không đạt trước khi ghi tăng kho. Phiếu hàng hoàn có dòng hỏng hoặc giữ riêng tiếp tục theo dõi sau kiểm tra. Chưa kiểm thử trên thiết bị vật lý hoặc môi trường Hawk Host.
