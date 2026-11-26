import { UserRole } from '../types';

export type GuideRole = {
  role: UserRole;
  label: string;
  title: string;
  summary: string;
  steps: string[];
  note?: string;
};

export const guideRoles: GuideRole[] = [
  {
    role: 'SALE', label: 'SALE', title: 'SALE — TỪ KHÁCH HÀNG ĐẾN ĐƠN HÀNG',
    summary: 'Tạo đúng Product, chọn đúng tuyến và theo dõi tiến độ cho khách hàng.',
    steps: ['Tìm hoặc tạo Customer.', 'Tạo Sales Order và các Product.', 'Chọn độc lập “Cần in” và “Cần gia công” cho từng Product.', 'Theo dõi Product tại Production, Finishing hoặc Warehouse.', 'Đánh dấu cần gấp khi cần và xử lý Issue được gửi đến Sale.'],
  },
  {
    role: 'DESIGNER', label: 'DESIGNER', title: 'DESIGNER — TẠO LỆNH SẢN XUẤT NHANH',
    summary: 'Biến yêu cầu thành lệnh in rõ ràng để Printer nhận việc realtime.',
    steps: ['Nhập nhanh hướng dẫn, ví dụ: “Mỗi màu 2600 tờ BB58 42x56 @Thoin”.', 'Paste hoặc tải ảnh ghép in thực tế.', 'Khai báo số tờ cho từng ảnh ghép; tổng tờ là tổng các ảnh.', 'Liên kết 0, 1 hoặc nhiều Product chỉ để truy vết.', 'Lưu Draft nhanh hoặc chọn nhiều Draft để gửi sản xuất.'],
    note: 'Ảnh ghép in không phải ảnh Product; số lượng Product không dùng để tính số tờ in.',
  },
  {
    role: 'PRINTER', label: 'PRINTER', title: 'THỢ IN — CHỈ NHÌN THẤY VIỆC ĐƯỢC GIAO',
    summary: 'Nhận đúng lệnh được giao và hoàn thành theo hướng dẫn hiện tại.',
    steps: ['Nhận lệnh assigned được gửi realtime.', 'Nếu có revision trước khi Start, xác nhận đã nhận thông tin mới.', 'Bắt đầu in; không có bước Receive Plate bắt buộc.', 'Xác nhận in xong theo instruction hiện tại.', 'Báo nhanh sự cố: chưa có kẽm, kẽm hỏng, máy lỗi, thiếu mực, lỗi in hoặc khác.'],
  },
  {
    role: 'FINISHER', label: 'FINISHER', title: 'GIA CÔNG — XỬ LÝ THEO TỪNG PRODUCT',
    summary: 'Nhận Product cần gia công, claim và hoàn thành để bàn giao kho.',
    steps: ['Nhận Product sau in hoặc Product đi thẳng từ Sale.', 'Claim một task — mỗi Product chỉ có một Finisher tại một thời điểm.', 'Ưu tiên các Product gấp.', 'Hoàn thành để Product vào kho; với Product không cần gia công sau in, xác nhận checkpoint để vào kho.', 'Báo thiếu số lượng, lỗi/sai sản phẩm hoặc sự cố khác.'],
    note: 'Nếu task đã được claim, Sale/Designer gửi request cancel; Finisher chấp nhận hoặc từ chối.',
  },
  {
    role: 'WAREHOUSE', label: 'WAREHOUSE', title: 'KHO — THEO DÕI ĐƠN HÀNG THEO TỪNG PRODUCT',
    summary: 'Chỉ xuất khi hàng đã vào kho và theo đúng quyền nhân viên kho.',
    steps: ['Theo dõi từng Product đã trong kho hay còn ở in/gia công.', 'Kiểm tra cả Order đã đủ hàng trước khi xuất.', 'Tạo phiếu xuất kho.', 'Xác nhận xuất kho.', 'Báo thiếu số lượng, hỏng, sai hàng hoặc sự cố khác.'],
  },
  {
    role: 'MANAGER', label: 'MANAGER', title: 'QUẢN LÝ — THEO DÕI VÀ ĐIỀU PHỐI',
    summary: 'Theo dõi Sales, Production, Printer, Finishing, Warehouse, Issue và hàng gấp.',
    steps: ['Xem tiến độ theo Product và Order.', 'Theo dõi việc cần xử lý và Issue.', 'Điều phối bằng dữ liệu realtime.', 'Xem lịch sử thao tác để hỗ trợ quyết định.'],
    note: 'Manager không làm thay Printer, Finisher hoặc Warehouse khi permission không cho phép.',
  },
  {
    role: 'ADMIN', label: 'ADMIN / DEVELOPER', title: 'QUẢN TRỊ HỆ THỐNG',
    summary: 'Duy trì tài khoản, role và cấu hình một cách có kiểm soát.',
    steps: ['Tạo/quản lý tài khoản và phân role.', 'Bật hoặc tắt hồ sơ nhân sự.', 'Quản lý cấu hình được cấp quyền.', 'Developer có thể xem role preview khi khả dụng.'],
    note: 'ADMIN/DEVELOPER không phải god role; các thao tác theo assignment vẫn được bảo vệ.',
  },
];

export const productRoutes = [
  ['Cần in + Cần gia công', 'Sale → Designer → Printer → Finisher → Warehouse'],
  ['Cần in + Không gia công', 'Sale → Designer → Printer → Finishing Confirm → Warehouse'],
  ['Không in + Cần gia công', 'Sale → Finisher → Warehouse'],
  ['Không in + Không gia công', 'Sale → Warehouse'],
] as const;
