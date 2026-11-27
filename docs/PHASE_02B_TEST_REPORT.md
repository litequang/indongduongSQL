# Báo cáo kiểm thử Phase 02B trên PC

PC, 27/11/2026. Nhánh `codex/phase-02b-production`, tiếp nhận Phase 02A tại `f6490410d9c8b3cf0deb47c527622a8df6384740`. Checkpoint mã đã kiểm thử: **d5383080644b06a34cc3f09db78de3196f098e55**. Nghiệm thu đầu vào: [PHASE_02A_PC_ACCEPTANCE.md](PHASE_02A_PC_ACCEPTANCE.md).

Môi trường Windows, Node 22.22.2, npm 10.9.7, MariaDB 11.4.9 riêng tại 127.0.0.1:3307; database và tài khoản dev/test khác nhau. Kiểm tra schema mới/nâng cấp dùng thêm một MariaDB tạm trên cổng loopback ngẫu nhiên với thông tin đăng nhập tổng hợp, rồi tắt instance đó. Không DROP/TRUNCATE database hiện có; không truy cập Firebase/R2/hosting production hay database dự án khác.

## Kết quả thực thi

| Kiểm tra đã chạy                                                        | Kết quả                                                                           | Exit |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---- |
| `npm ci`                                                                | PASS, dùng lockfile, 0 advisory                                                   | 0    |
| `npm run typecheck`, `npm run lint`                                     | PASS                                                                              | 0    |
| `npm test`                                                              | PASS 4/4                                                                          | 0    |
| `npm run test:legacy`                                                   | PASS 5/5 nhóm đã chọn                                                             | 0    |
| `ALLOW_TEST_DATABASE=1; npm run test:integration`                       | PASS 30/30 kết quả TAP, MariaDB/HTTP thật                                         | 0    |
| `npm run db:migrate` và chạy lại                                        | PASS nâng cấp dev qua 003/004/005; chạy lại no-op                                 | 0    |
| Schema Windows mới, nâng cấp từ 001/002, hai migration runner đồng thời | PASS 001–005 và 003–005 tương ứng; giữ dữ liệu checkpoint, chạy lại no-op         | 0    |
| `npm run build`, `npm run check:runtime`                                | PASS, loại legacy/Firebase khỏi runtime, API network-only                         | 0    |
| Shutdown/start MariaDB thật                                             | PASS, snapshot SHA-256 các bảng khách/đơn/mẫu/sản xuất và số phiên không đổi      | 0    |
| `ALLOW_TEST_DATABASE=1; npm run test:restart`                           | PASS, hai tiến trình Node đã biên dịch giữ phiên và toàn bộ chi tiết nghiệp vụ    | 0    |
| `ALLOW_TEST_DATABASE=1; npm run test:e2e`                               | PASS 14/14 suite Foundation/02A/02B; 6 viewport × Light/Dark                      | 0    |
| Gitleaks lịch sử nhánh/staged và `git diff --check`                     | PASS, không phát hiện secret/lỗi khoảng trắng                                     | 0    |
| Legacy độc lập `prompt14-permission-helpers.test.ts`                    | FAIL đã biết: kỳ vọng MANAGER xuất kho đã lỗi thời; giữ quyền WAREHOUSE chính xác | 1    |
| Firebase emulator suites                                                | SKIP, không thuộc runtime SQL được nghiệm thu                                     | —    |
| Thiết bị vật lý, Hawk Host, R2 live                                     | LOCAL_VALIDATION_REQUIRED / ngoài phạm vi được duyệt                              | —    |

## Nghiệp vụ và phân quyền đã xác minh

- Nháp SQL riêng theo người tạo; khôi phục sau F5/restart; retry cùng ID/nội dung trả lại bản đã lưu; chặn giả mạo role/status và trường không hợp lệ. Parser và nhận diện thợ duy nhất dùng logic đã port từ nguồn. Số túi không suy từ tờ in.
- Hai người tranh cùng sản lượng: một thành công, một nhận ALLOCATION_EXCEEDED, rollback đầy đủ. Hai lượt phát độc lập nhận mã khác nhau. Có ca chia một sản phẩm ra nhiều lệnh, ghép nhiều đơn vào một lệnh và một production item nối nhiều sales product.
- Batch tối đa 20 dòng, commit riêng từng dòng và trả kết quả riêng. Retry giữ mã thành công; sửa nháp lỗi rồi gửi lại không tạo trùng. Trình duyệt chủ động làm mất phản hồi HTTP sau khi backend đã commit: nội dung vẫn giữ, không báo nháp/thành công giả, khôi phục đúng một lệnh chính thức.
- Chỉ đúng PRINTER được giao mới nhận/ACK/bắt đầu/hoàn thành/phản hồi hủy. Admin không thao tác thay. Revision mới khóa bắt đầu tới khi ACK đúng phiên bản; chuyển thợ đặt lại nhận việc/ACK. Thợ cũ mất quyền API và nhận tombstone để cập nhật giao diện; thợ không liên quan không nhận ID riêng tư.
- Kẽm chưa gửi, gửi/nhận, hỏng và ra lại có lịch sử riêng. Kẽm SENT và sự cố OPEN không chặn in. Kiểm tra người báo/người nhận, phân công lại, giải quyết/hủy báo cáo và bình luận không thay ACK. Giữ cổng role của callable nguồn: WAREHOUSE chỉ đọc sản xuất, thao tác kho để 02C; FINISHER không được bình luận lệnh.
- Yêu cầu hủy đang chờ chặn bắt đầu. Thợ được giao phản hồi; đồng ý hủy chỉ hoàn trả phân bổ của chính lệnh đó, giữ nguyên các lệnh khác. Từ chối hủy bỏ cổng đang chờ. Hủy đơn bán không vượt qua công việc sản xuất đang hiệu lực.
- Lưu số tờ thực in/tờ hỏng và lịch sử in xong. Sản phẩm không yêu cầu gia công vẫn có handoff chờ xác nhận không gia công ở 02C. In lại là sản lượng thay thế, không cộng vào OUTPUT của đơn; retry không tăng số lần dùng mẫu. In bổ sung nằm trong phần yêu cầu còn lại. TRACE luôn bằng 0, không tạo handoff sản lượng bán hàng.
- Gắn đơn vào sản phẩm độc lập đã PRINTED giữ handoff cũ dưới dạng superseded, tạo handoff theo phân bổ mới, cập nhật tiến độ bán hàng và tính dùng mẫu đúng một lần với thợ/thời điểm in thật. Không tạo tồn kho, shipment hoặc hoàn thành gia công giả.

## Bằng chứng giao diện

Viewport: 360×800, 390×844, 768×1024, 1024×768, 1366×768, 1920×1080. Mỗi lượt responsive 02B chụp 72 ảnh: queue, danh sách sản xuất, kẽm, composer, chi tiết và workspace thợ × 12 tổ hợp viewport/theme. Foundation và 02A giữ bộ 90 và 48 ảnh tương ứng. Axe kiểm tra các màn hình mới ở 1366 px trong cả hai theme. Hai browser context đăng nhập riêng xác minh invalidation, revision và hoàn thành in. CSV/XLSX thật, nhân viên/phân quyền, PWA và phiên đăng nhập được regression tuần tự.

Ảnh/trace/log chỉ chứa fixture tổng hợp, nằm trong `.local/`, `test-results/`, `playwright-report/` đã ignore; CI lưu artifact browser-evidence ngắn hạn. PC đã xem ảnh desktop Light và mobile Dark của 02A, bảng sản xuất desktop và workspace thợ mobile 02B. Sau khi xem ảnh, phần thông số phụ được thu gọn để nút thao tác 48px dễ tiếp cận hơn. Mô phỏng trình duyệt không thay nghiệm thu thiết bị thật.

## Lỗi phát hiện và xử lý

Lần đầu gọi kiểm tra 02A quá sớm khi MariaDB chưa mở cổng; helper local:db đã được thêm chờ readiness. DDL 004 chưa phát hành ban đầu lỗi ở statement 14 do generated column tham chiếu cột FK không được MariaDB chấp nhận. Đã đọc completed_statements=13 và information_schema, giữ checkpoint/checksum lỗi cũ ở local, xác nhận 13 statement đã chạy không đổi, rồi sửa phần chưa áp dụng thành pending slot nullable với unique theo order. Không sửa migrations 001–003, không xóa schema hoặc tự sửa DDL một cách âm thầm. Kiểm tra schema trống 001–005 xác minh SQL cuối cùng từ đầu.

Phát lệnh ban đầu cập nhật mã trước status, vi phạm CHECK nháp/mã; hai trường nay thay cùng câu lệnh. Test 02A được sửa để kiểm tra xác nhận bán hàng không tự tạo production row, thay vì giả định production schema chưa tồn tại. Dialog kỹ thuật thiếu class căn vị trí chung đã được phát hiện qua ảnh và sửa. Một lượt thử trung gian chạy trong lúc thêm migration nhận readiness 503 đúng thiết kế; các lượt cuối dùng bộ file ổn định và DB tuần tự. Windows cold-start cần thời gian chờ named lock hữu hạn 60 giây thay cho 10 giây để runner thứ hai chờ xong DDL. Các cảnh báo vendor chunk/Zod annotation, ESLint 9 deprecated và biến màu console Playwright không chặn build/test.

## GitHub Actions

**PASS** trên đúng checkpoint `d5383080644b06a34cc3f09db78de3196f098e55`: [Run 45926107238](https://github.com/litequang/indongduongSQL/actions/runs/45926107238), completed/success. Ubuntu chạy MariaDB 11.4.9 riêng, npm ci, typecheck/lint/unit/legacy, migration và HTTP integration thật, build/runtime, restart tiến trình đã biên dịch, toàn bộ Playwright Foundation/02A/02B và upload artifact browser-evidence. Đã xác minh trạng thái bằng GitHub API sau khi run kết thúc; không tự merge PR #1 hoặc main.

## Giới hạn và quyết định cần chủ dự án chốt

Device Blob/offline draft và upload thật để Phase 03; nháp metadata chỉ bền vững sau khi máy chủ xác nhận Save. Dữ liệu lịch sử được giữ trong SQL, mỗi phản hồi đọc có giới hạn; chưa thêm chính sách purge. Quy tắc nhiều khách chung điện thoại, thời hạn lưu import và sản phẩm không in đi thẳng gia công/kho vẫn giữ như 02A. Trước khi 02C tạo tồn kho, cần chốt thao tác nghiệm thu/loại bỏ sản lượng gốc khi in lại, giữ giới hạn số lượng đặt và nguồn gốc. 02B dừng rõ tại PENDING_02C.
