import type { Role } from "../../shared/contracts";
export interface WorkspaceModule {
  id: string;
  label: string;
  description: string;
  stage: string;
  roles: readonly Role[];
}
const management: Role[] = ["DEVELOPER", "ADMIN", "MANAGER"];
export const MODULES: WorkspaceModule[] = [
  {
    id: "customers",
    label: "Khách hàng",
    description: "Thông tin khách hàng, lịch sử giao dịch và nhập Excel/CSV.",
    stage: "02A",
    roles: [...management, "SALE"],
  },
  {
    id: "sales",
    label: "Đơn bán hàng",
    description:
      "Đơn hàng, sản phẩm và tiến độ thực hiện theo từng khách hàng.",
    stage: "02A",
    roles: [...management, "SALE"],
  },
  {
    id: "design",
    label: "Hàng đợi thiết kế",
    description:
      "Thiết kế, mẫu và bình bài; chuẩn bị lệnh trước khi giao xuống xưởng.",
    stage: "02A / 02B",
    roles: [...management, "DESIGNER"],
  },
  {
    id: "production",
    label: "Lệnh sản xuất",
    description:
      "Lệnh in, hướng dẫn kỹ thuật, phân công và theo dõi từng lượt in.",
    stage: "02B",
    roles: [...management, "DESIGNER", "PRINTER"],
  },
  {
    id: "plates",
    label: "Quản lý kẽm",
    description: "Kẽm mới, kẽm cũ, giao nhận và xử lý sự cố kẽm.",
    stage: "02B",
    roles: [...management, "DESIGNER", "PRINTER"],
  },
  {
    id: "finishing",
    label: "Gia công",
    description:
      "Công việc gia công theo sản phẩm; nhận việc và xác nhận hoàn tất.",
    stage: "02C",
    roles: [...management, "FINISHER"],
  },
  {
    id: "warehouse",
    label: "Kho thành phẩm",
    description: "Thành phẩm, mức sẵn sàng của cả đơn hàng và xuất kho.",
    stage: "02C",
    roles: [...management, "WAREHOUSE"],
  },
  {
    id: "shipping",
    label: "Giao hàng",
    description: "Phiếu xuất, vận chuyển, trạng thái giao hàng và hàng trả.",
    stage: "02C",
    roles: [...management, "SALE", "WAREHOUSE"],
  },
  {
    id: "reports",
    label: "Báo cáo",
    description: "Số liệu hoạt động xưởng in và hiệu quả thực hiện đơn hàng.",
    stage: "02 / 03",
    roles: [...management, "SALE", "DESIGNER"],
  },
  {
    id: "storage",
    label: "Lưu trữ hình ảnh",
    description: "Ảnh riêng tư, quản lý lưu trữ và sao lưu có kiểm chứng.",
    stage: "03",
    roles: ["DEVELOPER"],
  },
];
export const WORKSPACE: Record<
  Role,
  { title: string; description: string; focus: string[] }
> = {
  DEVELOPER: {
    title: "Không gian hệ thống",
    description: "Một nền tảng rõ ràng cho toàn bộ xưởng in.",
    focus: ["users", "settings", "storage"],
  },
  ADMIN: {
    title: "Không gian quản trị",
    description: "Quản lý đội ngũ và giữ mọi hoạt động nhất quán.",
    focus: ["users", "settings", "production"],
  },
  MANAGER: {
    title: "Trung tâm điều hành",
    description: "Theo dõi nhịp vận hành và kết nối các bộ phận.",
    focus: ["production", "finishing", "warehouse"],
  },
  SALE: {
    title: "Không gian kinh doanh",
    description: "Theo sát khách hàng, đơn hàng và tiến độ giao nhận.",
    focus: ["customers", "sales", "shipping"],
  },
  DESIGNER: {
    title: "Không gian thiết kế",
    description: "Từ yêu cầu khách hàng đến lệnh in rõ ràng.",
    focus: ["design", "production", "plates"],
  },
  PRINTER: {
    title: "Công việc được giao",
    description: "Nhận đúng lệnh. Xác nhận đúng phiên bản. In đúng yêu cầu.",
    focus: ["production", "plates"],
  },
  FINISHER: {
    title: "Không gian gia công",
    description: "Nhận việc và hoàn thiện từng sản phẩm.",
    focus: ["finishing"],
  },
  WAREHOUSE: {
    title: "Không gian kho vận",
    description: "Kiểm soát thành phẩm, xuất kho và giao hàng.",
    focus: ["warehouse", "shipping"],
  },
};
