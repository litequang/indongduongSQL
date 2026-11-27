import { PageHeader } from "./common";
const steps = [
  [
    "Kinh doanh",
    "Tạo hoặc chọn khách hàng; nhập đơn bán với số lượng từng sản phẩm, yêu cầu in và gia công. Kiểm tra mẫu/phiên bản trước khi xác nhận. Số lượng túi, hộp không phải số tờ in.",
  ],
  [
    "Thiết kế",
    "Mở hàng đợi thiết kế, bổ sung hướng dẫn rồi soạn lệnh. Một lượt in có thể ghép nhiều sản phẩm; một sản phẩm có thể chia nhiều lượt. Kiểm tra phân bổ, thợ in, số tờ và bình bài trước khi gửi. Lưu nháp lên máy chủ để mở lại trên thiết bị khác.",
  ],
  [
    "Thợ in và kẽm",
    "Mở lệnh được giao, nhận lệnh và xác nhận phiên bản mới nhất. Theo dõi kẽm song song. Yêu cầu hủy đang chờ phải được phản hồi trước khi bắt đầu. Khi xong, ghi đúng tờ thực in và tờ hỏng; báo sự cố cho người nhận phù hợp.",
  ],
  [
    "Gia công",
    "Tiếp nhận sản lượng theo từng sản phẩm, nhận hoặc được giao việc, bắt đầu và ghi kết quả hoàn tất. Sản phẩm không cần thao tác vẫn phải xác nhận không gia công. Chỉ nghiệm thu sản lượng hợp lệ mới tạo thành phẩm.",
  ],
  [
    "Kho và giao hàng",
    "Kiểm tra toàn bộ sản phẩm cùng đơn đã sẵn sàng rồi xuất kho nguyên đơn. Tạo chuyến giao từ phiếu xuất, cập nhật đúng trạng thái. Hàng trả cần kiểm từng dòng; chỉ hàng xác nhận nhập lại mới tăng tồn. Giữ nguyên chứng từ khi có phần hỏng hoặc còn chờ xử lý.",
  ],
  [
    "Ảnh và hồ sơ",
    "Chọn JPEG/PNG/WebP, tải và xác minh, sau đó lưu bản ghi để gắn ảnh. Khi kho ảnh chưa được mở, có thể chủ động lưu File nháp trên thiết bị. Nháp thiết bị bị xóa khi đăng xuất; nháp đã lưu lên máy chủ vẫn còn. Avatar được thay trong Hồ sơ cá nhân.",
  ],
  [
    "Báo cáo",
    "Chọn ngày tạo lệnh theo giờ Việt Nam, thợ in, giấy hoặc trạng thái. Tờ dự kiến, tờ thực in và tờ hỏng là ba chỉ số riêng. CSV dùng cùng bộ lọc, tối đa 2.000 lệnh; thu hẹp khoảng ngày nếu vượt giới hạn. Báo cáo không suy ra doanh thu hay sản lượng sản phẩm từ số tờ.",
  ],
  [
    "Quản trị và quyền",
    "Quản trị viên quản lý nhân viên trong phạm vi vai trò. Kỹ thuật hệ thống cấu hình quyền cá nhân/vai trò và phân hệ. Quyền được đổi sẽ kết thúc các phiên bị ảnh hưởng. Phân hệ tạm dừng ghi vẫn cho tra cứu dữ liệu lịch sử. Đổi mật khẩu cũng kết thúc các phiên đăng nhập.",
  ],
];
export function UserGuide() {
  return (
    <>
      <PageHeader
        eyebrow="TRỢ GIÚP"
        title="Hướng dẫn sử dụng"
        description="Thao tác theo chứng từ và công việc được giao. Mỗi thay đổi trạng thái cần đúng người phụ trách."
      />
      <div className="settings-content">
        {steps.map(([title, text]) => (
          <section className="surface settings-section" key={title}>
            <h2>{title}</h2>
            <p>{text}</p>
          </section>
        ))}
        <section className="surface settings-section">
          <h2>Khi gặp lỗi</h2>
          <p>
            Nếu mất kết nối sau khi gửi, mở lại bản ghi để kiểm tra kết quả rồi
            thử lại cùng thao tác; tránh tạo một chứng từ mới để thay thế. Nếu
            có thông báo phiên bản đã thay đổi, tải bản mới trước khi sửa tiếp.
            Khi chưa có quyết định cho hàng không qua in, in lại thay thế hoặc
            hàng trả chưa phân loại, giữ trạng thái chờ và chuyển người quản lý
            quyết định.
          </p>
        </section>
      </div>
    </>
  );
}
