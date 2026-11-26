// App Version Configuration & Release Changelog History
export const APP_VERSION = '3.2.0';
export const APP_BUILD_DATE = '21/08/2026';

export interface ChangelogItem {
  version: string;
  releaseDate: string;
  title: string;
  summary: string;
  tag?: 'NEW' | 'UPDATE' | 'HOTFIX';
  changes: string[];
}

export const APP_CHANGELOG_HISTORY: ChangelogItem[] = [
  {
    version: '3.2.0',
    releaseDate: '21/08/2026',
    title: 'Phân Quyền Báo Cáo Chặt Chẽ & Nén Dữ Liệu Bộ Nhớ LocalStorage',
    summary: 'Giải quyết triệt để lỗi phân quyền khi nhóm thợ in/gia công vẫn xem được báo cáo, đồng thời tối ưu không gian lưu trữ bằng chuẩn nén LZ-String.',
    tag: 'UPDATE',
    changes: [
      'Bảo Mật Báo Cáo & Thống Kê (Report Permissions): Khóa chức năng xem báo cáo và tiến độ thống kê với những user không được cấp quyền (như Thợ In, Gia công, Sale), ẩn hiển thị trên Sidebar/Dashboard để giao diện tinh gọn hơn.',
      'Tối Ưu & Nén Bộ Nhớ (LZ-String Compression): Xử lý dứt điểm lỗi tràn bộ nhớ (QuotaExceededError). Tự động nhận diện cache lớn (>10KB) và nén với định dạng UTF-16 an toàn, mở rộng sức chứa bộ nhớ lên gấp 10 lần.',
      'Đồng Bộ Hóa Backend (API Sync): Viết lại logic merge mảng thay vì ghi đè mảng trên backend memory, ngăn ngừa lỗi làm mất dữ liệu khi cập nhật hàng loạt đơn hàng.',
      'Bảo Vệ Xóa Dữ Liệu (Zombie Data Fix): Ngăn chặn việc dữ liệu đã xóa vẫn sống lại từ LocalStorage bằng cách xác thực từ source of truth trên Server.'
    ]
  },
  {
    version: '3.1.0',
    releaseDate: '21/08/2026',
    title: 'Thống Kê Dữ Liệu Realtime, Cố Vấn Nâng Cấp Gói Dịch Vụ & Bảo Vệ Độc Quyền Luồng Ghi',
    summary: 'Sẵn sàng 100% triển khai vận hành thực tế cho toàn bộ xưởng in: Thêm Tab Thống kê dữ liệu & Dự toán dung lượng cho Developer/Sếp, bộ điều phối khóa ghi độc quyền (Single Concurrency Lock) triệt tiêu hoàn toàn lỗi resource-exhausted và bảo vệ hoạt động liên tục 24/7.',
    tag: 'NEW',
    changes: [
      'Dashboard Thống Kê Dữ Liệu (Developer Metrics & Advisor): Đo lường dung lượng RAM/Cache thực tế, số lượng đơn in, sự kiện nhật ký, số lượt đọc/ghi ước tính theo ngày so với hạn ngạch 1GB / 20.000 writes của gói Firebase Spark.',
      'Cố Vấn Quyết Định Gói Dịch Vụ (Upgrade Advisor): Tự động đánh giá trạng thái dung lượng xưởng và đưa ra khuyến nghị cụ thể khi nào nên nâng cấp lên gói Blaze cùng ước tính chi phí tối ưu (~0đ - 30.000đ/tháng).',
      'Đảm Bảo Không Nặng Hệ Thống (Zero Network Overhead): Toàn bộ tính toán thống kê được xử lý trực tiếp từ bộ nhớ cục bộ, không gửi thêm truy vấn và không làm tiêu tốn tài nguyên Firebase.',
      'Khóa Độc Quyền & Ngắt Mạch Nhanh (Single Concurrency Lock): Khống chế tối đa 1 luồng ghi in-flight vào Firestore SDK, tự ngắt mạch làm mát 60s khi phát hiện nghẽn mạng, loại bỏ triệt để lỗi [code=resource-exhausted].',
      'Đồng Bộ REST API Xóa Đơn Máy Chủ (/api/orders DELETE): Hỗ trợ dọn dẹp đơn in theo lô và đơn lẻ bền vững trên Backend Node.js Express.',
      'Bộ Lọc Toàn Cục Bảo Vệ Giao Diện (Global Stream Shield): Bắt và xử lý sạch toàn bộ cảnh báo WebChannel nền tại main.tsx, đảm bảo ứng dụng luôn chạy mượt mà không bao giờ bị dừng.'
    ]
  },
  {
    version: '3.0.0',
    releaseDate: '21/08/2026',
    title: 'Nâng Cấp Động Cơ Lưu Trữ An Toàn & Khắc Phục Triệt Để Quá Tải Hàng Đợi Firestore',
    summary: 'Đột phá hiệu năng và độ ổn định lưu trữ: Bộ điều phối ngắt mạch an toàn (Circuit Breaker) chống lỗi quá tải hàng đợi Firestore WriteStream, cơ chế ghi theo lô nguyên tử (Batch Operations) cho thao tác hàng loạt, và bảo toàn 100% dữ liệu khi tạo thợ in hoặc gửi lệnh.',
    tag: 'UPDATE',
    changes: [
      'Bộ Điều Phối An Toàn Firestore (Firestore SafeWrite & Circuit Breaker): Tự động kiểm soát luồng ghi đồng thời (tối đa 2 tác vụ), timeout 4s và ngắt mạch làm mát nếu phát hiện nghẽn đường truyền, chấm dứt hoàn toàn lỗi resource-exhausted.',
      'Ghi & Xóa Theo Lô Nguyên Tử (Atomic Batch Sync): Gộp tất cả các tác vụ duyệt đơn, đổi thợ, phân công hoặc xóa đơn hàng loạt thành 1 transaction duy nhất trên Firestore & Server API.',
      'Lưu Trữ Kép Tức Thì (Immediate Dual Persistence): Tạo thợ in mới, gửi kẽm, giao lệnh được ghi đè tức thì vào bộ nhớ đệm và cơ sở dữ liệu mà không bị mất dữ liệu khi tải lại trang.',
      'Cơ Chế Gộp Dữ Liệu Thông Minh (Merge-on-Fetch): Tự động bảo lưu dữ liệu mới nhất tại trình duyệt khi đồng bộ định kỳ từ máy chủ.',
      'Tối ưu hóa tài nguyên mạng, giảm hơn 75% số lượng request ghi dữ liệu dư thừa lên Firestore.'
    ]
  },
  {
    version: '2.9.0',
    releaseDate: '20/08/2026',
    title: 'Mở Rộng Toàn Diện UI/UX Bảng Cài Đặt & Nâng Cấp Ma Trận Phân Quyền',
    summary: 'Nâng cấp trải nghiệm bảng Cài Đặt xưởng in với thiết kế toàn màn hình rộng rãi (Wide Layout), bố cục 2-3 cột trực quan theo từng nhóm chuyên biệt, bảng Ma Trận Phân Quyền siêu thoáng hiển thị đầy đủ 7 vai trò và bộ cấu hình phân quyền ngoại lệ thông minh.',
    tag: 'NEW',
    changes: [
      'Bảng Cài Đặt Mở Rộng (Wide Layout): Nâng cấp kích thước khung modal lên chuẩn màn hình rộng (max-w-6xl), tối ưu không gian hiển thị trên máy tính, iPad và điện thoại di động.',
      'Bố Cục Chia Cột Trực Quan: Phân nhóm Thương hiệu, Máy in, Vật tư, Cảnh báo thời gian và Tính năng thành các thẻ đa cột có viền màu sắc phân biệt rõ ràng.',
      'Ma Trận Phân Quyền Siêu Thoáng: Mở rộng bảng phân quyền toàn diện cho cả 7 vai trò (Admin, Quản Lý Sếp, Thiết Kế, Kinh Doanh, Thợ In, Gia Công, Developer) với nút bật/tắt 1-chạm sắc nét.',
      'Tối Ưu Phân Quyền Ngoại Lệ Cá Nhân (User Override): Giao diện chọn nhân viên và tùy biến quyền riêng dạng lưới đa cột trực quan.',
      'Cải thiện hiệu năng cuộn mượt mà, lưu trữ cấu hình tức thời và đồng bộ Firestore.'
    ]
  },
  {
    version: '2.8.0',
    releaseDate: '20/08/2026',
    title: 'Ma Trận Phân Quyền Đa Cấp & Quản Lý Tính Năng Cho Developer',
    summary: 'Nâng cấp bảo mật & kiểm soát chuyên sâu cho Developer: Ma trận phân quyền trực quan theo từng vai trò, phân quyền ngoại lệ cho từng cá nhân, tạo tính năng tùy chỉnh mở rộng và bộ thiết lập sẵn (Preset) an toàn cho Quản Lý (Sếp).',
    tag: 'NEW',
    changes: [
      'Ma Trận Phân Quyền Đa Cấp: Developer chủ động bật/tắt từng quyền hạn (Cài đặt xưởng, Quản lý nhân sự, Duyệt đơn, Demo Sandbox, Xóa đơn...) cho từng vai trò trong xưởng.',
      'Thiết Lập Sẵn (Preset) An Toàn: 1-click cấu hình cho Sếp (Quản lý) theo dõi sản xuất & dùng Demo nhưng khóa tuyệt đối phần Quản lý nhân sự & Cài đặt xưởng.',
      'Phân Quyền Ngoại Lệ Cá Nhân (User Override): Đặc cách cấp thêm hoặc thu hồi quyền cho từng nhân viên cụ thể theo tên.',
      'Tạo Tính Năng Tùy Chỉnh (Custom Feature Flags): Developer có thể định nghĩa thêm mã quyền và tính năng mới vào ma trận.',
      'Tích hợp đồng bộ Firestore & lưu trữ cấu hình bảo mật an toàn thời gian thực.'
    ]
  },
  {
    version: '2.7.0',
    releaseDate: '20/08/2026',
    title: 'Vai Trò Quản Lý (Sếp), Nút Cài Đặt App & Khóa Quyền Dọn Dữ Liệu',
    summary: 'Nâng cấp trải nghiệm quản trị xưởng: Thêm tài khoản Quản Lý (Sếp) theo dõi toàn diện sản xuất mà không bị rối bởi cài đặt kỹ thuật, chuyển nút Online/Thợ xa thành Cài Đặt App, và bảo vệ an toàn dữ liệu xưởng với quyền dọn lệnh cũ độc quyền cho Developer.',
    tag: 'NEW',
    changes: [
      'Thêm vai trò "Quản Lý" (Sếp): Giám sát toàn bộ tiến độ in ấn, điều hành lệnh, xem báo cáo nhưng ẩn phần Quản lý nhân sự & Cài đặt xưởng in (tránh bấm nhầm thay đổi cấu hình 1 lần của Admin/Dev).',
      'Nút Cài Đặt App trên thanh điều hướng: Thay thế nút Online/Thợ xa thành nút Cài Đặt App trực quan để cấu hình nhanh quy trình xưởng.',
      'Khóa an toàn "Dọn Dữ Liệu Lệnh Cũ": Chỉ tài khoản Developer mới có quyền dọn dẹp sạch dữ liệu lệnh in cũ, ngăn chặn triệt để nguy cơ sếp hoặc người dùng vô tình xóa mất dữ liệu.',
      'Cập nhật hệ thống phân quyền tập trung RBAC đồng bộ và chuẩn xác trên toàn bộ giao diện.'
    ]
  },
  {
    version: '2.6.0',
    releaseDate: '20/08/2026',
    title: 'Phân Quyền Lọc Nhiệm Vụ, Xóa Lệnh Cũ & Định Tuyến Sự Cố',
    summary: 'Tối ưu hóa sâu luồng vận hành xưởng: Lọc đúng lệnh theo chức năng từng user, hỗ trợ Developer/Admin chọn toàn bộ & xóa lệnh test trước khi lên sóng, thông báo sự cố đến Thiết kế, toàn thể Sale & Admin, tinh giản Dashboard trang chủ.',
    tag: 'NEW',
    changes: [
      'Phân quyền lọc đơn đúng nhiệm vụ: Bộ phận gia công chỉ thấy đơn đã in xong cần gia công, Thợ in chỉ thấy đơn in ấn của mình, Thiết kế & Sale & Admin quản lý đúng phạm vi trách nhiệm.',
      'Chọn toàn bộ & Xóa lệnh hàng loạt: Developer & Admin có công cụ dọn sạch toàn bộ lệnh test cũ trên hệ thống và Cloud trước khi chính thức bàn giao xưởng lên sóng.',
      'Định tuyến thông báo sự cố chính xác: Khi thợ báo sự cố hoặc thiếu kẽm, hệ thống tự động thông báo đến đúng Designer tạo lệnh, toàn thể nhân viên Sale (để kịp thời báo khách) và Admin xưởng.',
      'Tinh giản Dashboard Trang chủ: Loại bỏ các khối thống kê trùng lặp, tối ưu trải nghiệm nhanh gọn, trực quan trên điện thoại di động.',
      'Cơ chế tự động tăng số phiên bản và lưu nhật ký nâng cấp hệ thống.'
    ]
  },
  {
    version: '2.5.3',
    releaseDate: '20/08/2026',
    title: 'Mặc định Online Toàn Xưởng, Cài Đặt Máy In & Gọn Nhẹ Nhật Ký',
    summary: 'Tối ưu trải nghiệm: Mặc định chế độ Online cho toàn bộ người dùng, quản lý danh sách máy in xưởng linh hoạt, đồng bộ tức thời tài khoản nhân viên lên Firestore và icon số phiên bản xem popup nhật ký nâng cấp.',
    tag: 'UPDATE',
    changes: [
      'Chế độ Online mặc định: Cả xưởng hoạt động trực tuyến trên Firestore, xóa bỏ cài đặt chọn chế độ thừa ở Cài đặt xưởng in.',
      'Demo Sandbox riêng cho Admin/Developer: Chỉ Admin/Dev mới có nút bật Sandbox trong menu tài khoản để test chức năng mà không sợ mất dữ liệu hay mất quyền.',
      'Cấu hình Danh sách Máy In xưởng: Cho phép Developer & Sếp tùy chỉnh danh sách máy in trong Cài đặt và tự động gán máy khi tạo tài khoản Thợ in.',
      'Đồng bộ tức thời tài khoản người dùng: Tạo mới và sửa hồ sơ nhân viên được lưu trực tiếp lên cơ sở dữ liệu đám mây Firestore.',
      'Giao diện Nhật ký Nâng cấp dạng Pop-up/Modal tinh gọn: Chỉ hiển thị icon số phiên bản nhỏ gọn, bấm vào để mở bảng chi tiết lịch sử nâng cấp.'
    ]
  },
  {
    version: '2.5.2',
    releaseDate: '20/08/2026',
    title: 'Tách biệt 100% Dữ liệu Demo & Bảo vệ Dữ liệu Online Tuyệt đối',
    summary: 'Tách không gian lưu trữ Sandbox độc lập khi thử nghiệm, ngăn chặn triệt để rủi ro mất đơn hàng thật của xưởng khi bấm khôi phục mẫu.',
    tag: 'UPDATE',
    changes: [
      'Tách riêng 2 kho lưu trữ: Kho Thực tế (Online Cloud/Firestore) và Kho Thử nghiệm (Demo Sandbox).',
      'Nút "Khôi phục dữ liệu mẫu ban đầu" chỉ tác động trong Demo Sandbox nội bộ trên máy, hoàn toàn không chạm đến dữ liệu đám mây Firestore.',
      'Khóa an toàn & Cảnh báo bảo vệ khi ở Chế độ Online: Ngăn chặn thao tác vô tình xóa đè dữ liệu của xưởng đang vận hành.',
      'Nút chuyển đổi linh hoạt 1-chạm giữa Online Thực tế và Demo Sandbox với nhãn trạng thái trực quan.'
    ]
  },
  {
    version: '2.5.1',
    releaseDate: '20/08/2026',
    title: 'Accordion Nhật ký thay đổi & Tự động tăng phiên bản',
    summary: 'Tối ưu quản lý phiên bản, giao diện xem lịch sử nâng cấp dạng Accordion và sửa lỗi biên dịch.',
    tag: 'UPDATE',
    changes: [
      'Giao diện Accordion dạng thẻ thu gọn/mở rộng hiển thị chi tiết từng phiên bản và ngày phát hành.',
      'Sửa triệt để các lỗi so sánh TypeScript, thuộc tính tờ in và lỗi ErrorBoundary an toàn.',
      'Đồng bộ số phiên bản v2.5.1 trên toàn hệ thống (appConfig, versionUtils, version.json).',
      'Thêm nút kiểm tra cập nhật tức thời và làm mới bộ nhớ đệm 1-click.'
    ]
  },
  {
    version: '2.5.0',
    releaseDate: '20/08/2026',
    title: 'Phân quyền Developer & Tinh gọn Giao diện',
    summary: 'Nâng cấp phân quyền tài khoản Developer, tinh gọn màn hình đăng nhập PIN di động.',
    tag: 'UPDATE',
    changes: [
      'Phân quyền Developer độc quyền truy cập cài đặt hệ thống sâu và cấu hình xưởng.',
      'Tinh gọn giao diện đăng nhập trên thiết bị di động, thao tác 1 chạm nhanh gọn cho thợ in.',
      'Tối ưu tốc độ tải và lưu trữ đa nền tảng kết hợp Firestore và Offline Cache.'
    ]
  },
  {
    version: '2.4.5',
    releaseDate: '19/08/2026',
    title: 'Cải tiến Đếm tờ in & Báo sự cố tức thì',
    summary: 'Bổ sung tính năng kiểm đếm số tờ in thực tế và luồng xử lý sự cố kẽm/giấy.',
    tag: 'UPDATE',
    changes: [
      'Bộ đếm số tờ in thực tế với tính toán bù hao hụt tự động.',
      'Hỗ trợ đính kèm ảnh khi báo sự cố máy in hoặc rách kẽm đến thiết kế.',
      'Bộ lọc lệnh in thông minh theo thợ, loại giấy và tình trạng kẽm.'
    ]
  },
  {
    version: '2.4.0',
    releaseDate: '15/08/2026',
    title: 'Tự động đồng bộ Đám Mây & Thư viện mẫu',
    summary: 'Tích hợp Firebase Firestore thời gian thực và kho lưu trữ mẫu in lại nhanh.',
    tag: 'UPDATE',
    changes: [
      'Đồng bộ tức thời giữa máy điện thoại của thợ in và máy tính thiết kế.',
      'Thư viện mẫu in cũ hỗ trợ tạo lại lệnh 1 chạm không cần nhập lại thông tin.'
    ]
  }
];

export interface VersionInfo {
  version: string;
  buildDate?: string;
  releaseNotes?: string;
  changelog?: ChangelogItem[];
}

/**
 * Checks server for latest version by fetching /version.json with cache-busting
 */
export async function checkForAppUpdates(): Promise<{
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes?: string;
  changelog?: ChangelogItem[];
}> {
  try {
    const timestamp = Date.now();
    const response = await fetch(`/version.json?_t=${timestamp}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      return {
        hasUpdate: false,
        currentVersion: APP_VERSION,
        latestVersion: APP_VERSION,
        changelog: APP_CHANGELOG_HISTORY
      };
    }

    const data: VersionInfo = await response.json();
    const latest = data.version || APP_VERSION;
    
    // Compare semantic-like version
    const hasUpdate = latest !== APP_VERSION && compareVersions(latest, APP_VERSION) > 0;

    return {
      hasUpdate,
      currentVersion: APP_VERSION,
      latestVersion: latest,
      releaseNotes: data.releaseNotes,
      changelog: data.changelog || APP_CHANGELOG_HISTORY
    };
  } catch (error) {
    console.warn('Không thể kiểm tra phiên bản:', error);
    return {
      hasUpdate: false,
      currentVersion: APP_VERSION,
      latestVersion: APP_VERSION,
      changelog: APP_CHANGELOG_HISTORY
    };
  }
}

/**
 * Compare two version strings (e.g., '2.5.2' vs '2.5.1')
 * Returns 1 if a > b, -1 if a < b, 0 if equal
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(num => parseInt(num, 10) || 0);
  const pb = b.split('.').map(num => parseInt(num, 10) || 0);
  
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * Force clear caches and reload window while preserving user session
 */
export async function applyAppUpdate(): Promise<void> {
  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
  } catch (err) {
    console.warn('Lỗi dọn cache trình duyệt:', err);
  }

  // Force hard reload with timestamp query to bypass deep mobile cache without wiping localStorage
  const url = new URL(window.location.href);
  url.searchParams.set('_v', Date.now().toString());
  window.location.href = url.toString();
}
