import React, { useState } from 'react';
import { AlertTriangle, ArrowDown, BarChart3, CheckCircle2, ChevronRight, CircleHelp, Clock3, Factory, Package, Radio, ShieldCheck, Sparkles, UsersRound, Workflow, type LucideIcon } from 'lucide-react';
import { guideRoles, productRoutes } from '../data/userGuideContent';
import { UserRole } from '../types';

const roleClass: Record<UserRole, string> = {
  SALE: 'bg-emerald-50 text-emerald-800 border-emerald-200', DESIGNER: 'bg-blue-50 text-blue-800 border-blue-200', PRINTER: 'bg-amber-50 text-amber-800 border-amber-200', FINISHER: 'bg-purple-50 text-purple-800 border-purple-200', WAREHOUSE: 'bg-sky-50 text-sky-800 border-sky-200', MANAGER: 'bg-rose-50 text-rose-800 border-rose-200', ADMIN: 'bg-neutral-100 text-neutral-800 border-neutral-300', DEVELOPER: 'bg-neutral-100 text-neutral-800 border-neutral-300',
};

const valueCards: Array<[string, string, LucideIcon]> = [
  ['Một nguồn dữ liệu chung', 'Không cần mỗi bộ phận tự giữ danh sách riêng.', UsersRound],
  ['Realtime giữa các bộ phận', 'Designer gửi lệnh → Printer nhận; hoàn tất → bước kế tiếp thấy ngay.', Radio],
  ['Phân quyền rõ ràng', 'Mỗi nhân viên chỉ thao tác đúng phạm vi công việc của mình.', ShieldCheck],
  ['Sự cố và việc khẩn cấp', 'Issue đến đúng người/bộ phận và có trạng thái rõ ràng.', AlertTriangle],
];

const executiveCards = [
  ['Giảm gọi điện và nhắn tin rời rạc', 'Thông tin chính thức nằm trên Product và Production Order.'],
  ['Biết đơn hàng đang ở đâu', 'Theo dõi Product từ chờ sản xuất, đang in, gia công, trong kho đến đã xuất.'],
  ['Không bỏ sót việc', 'Mỗi role có workspace riêng và thấy đúng việc cần làm.'],
  ['Sự cố có người xử lý', 'Issue gửi tới đúng user hoặc department.'],
  ['Có lịch sử thao tác', 'Biết ai tạo, ai nhận, ai xử lý và thời điểm thay đổi.'],
  ['Không cần F5', 'Trạng thái được cập nhật realtime cho các bộ phận liên quan.'],
];

export const UserGuidePage: React.FC = () => {
  const [selectedRole, setSelectedRole] = useState<UserRole>('SALE');
  const selected = guideRoles.find((item) => item.role === selectedRole) || guideRoles[0];

  return (
    <main className="mx-auto max-w-7xl space-y-8 pb-8">
      <section className="relative overflow-hidden rounded-3xl bg-neutral-950 px-6 py-10 text-white shadow-xl sm:px-10 sm:py-14">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-400/10 px-3 py-1 text-xs font-black tracking-wider text-amber-300"><CircleHelp className="h-4 w-4" /> HƯỚNG DẪN VẬN HÀNH</span>
          <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">XƯỞNG IN</h1>
          <h2 className="mt-2 text-xl font-bold text-amber-300 sm:text-3xl">Một luồng làm việc duy nhất cho toàn bộ xưởng</h2>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-neutral-300 sm:text-base">Từ lúc Sale nhận đơn đến khi hàng được xuất kho, mỗi bộ phận nhìn thấy đúng việc của mình, cập nhật realtime và giữ được lịch sử xử lý.</p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {valueCards.map(([title, description, Icon]) => <article key={title} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><Icon className="h-6 w-6 text-amber-600" /><h3 className="mt-4 font-black text-neutral-900">{title}</h3><p className="mt-2 text-sm leading-6 text-neutral-600">{description}</p></article>)}
      </section>

      <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex items-start gap-3"><Workflow className="mt-0.5 h-6 w-6 text-amber-600" /><div><h2 className="text-xl font-black text-neutral-900">WORKFLOW TỔNG QUAN</h2><p className="mt-1 text-sm text-neutral-600">Từ đơn hàng → sản xuất → gia công → kho trên một hệ thống realtime.</p></div></div>
        <div className="mt-6 grid gap-3 lg:grid-cols-4">
          {productRoutes.map(([title, path], index) => <div key={title} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"><span className="text-xs font-black text-amber-700">ROUTE {index + 1}</span><h3 className="mt-2 font-black text-neutral-900">{title}</h3><p className="mt-2 text-sm font-semibold leading-6 text-neutral-600">{path}</p></div>)}
        </div>
        <div className="mt-7 flex flex-col items-center gap-2 text-center text-sm font-black text-neutral-700 sm:flex-row sm:justify-center"><span>SALE / PRODUCT</span><ArrowDown className="h-4 w-4 sm:rotate-[-90deg]" /><span>CẦN IN?</span><ChevronRight className="h-4 w-4" /><span>PRODUCTION</span><ChevronRight className="h-4 w-4" /><span>CẦN GIA CÔNG?</span><ChevronRight className="h-4 w-4" /><span>WAREHOUSE / XUẤT KHO</span></div>
      </section>

      <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-8">
        <span className="text-xs font-black tracking-wider text-amber-700">THEO VAI TRÒ</span><h2 className="mt-2 text-xl font-black text-neutral-900">Bạn làm gì trong hệ thống?</h2>
        <div className="mt-5 flex gap-2 overflow-x-auto pb-2">{guideRoles.map((item) => <button type="button" key={item.role} onClick={() => setSelectedRole(item.role)} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-black transition ${selectedRole === item.role ? roleClass[item.role] : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300'}`}>{item.label}</button>)}</div>
        <div className="mt-5 grid gap-6 rounded-2xl bg-neutral-50 p-5 lg:grid-cols-[1fr_1.4fr]"><div><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${roleClass[selected.role]}`}>{selected.label}</span><h3 className="mt-3 text-lg font-black text-neutral-900">{selected.title}</h3><p className="mt-3 leading-7 text-neutral-600">{selected.summary}</p>{selected.note && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-900">{selected.note}</p>}</div><div><h4 className="font-black text-neutral-900">Các bước sử dụng</h4><ol className="mt-3 space-y-3">{selected.steps.map((step, index) => <li key={step} className="flex gap-3 text-sm leading-6 text-neutral-700"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-black text-amber-300">{index + 1}</span>{step}</li>)}</ol></div></div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-3xl bg-amber-400 p-6 text-neutral-950 shadow-sm sm:p-8"><AlertTriangle className="h-7 w-7" /><h2 className="mt-4 text-xl font-black">BÁO SỰ CỐ — GỬI ĐÚNG NGƯỜI XỬ LÝ</h2><p className="mt-3 text-sm leading-6">Báo sự cố → chọn loại → chọn user/bộ phận → thường hoặc khẩn cấp → người nhận xử lý → đã xử lý.</p><div className="mt-5 grid gap-2 text-sm font-black"><span className="rounded-xl bg-white/60 p-3">Reporter: ĐÃ BÁO — ĐANG CHỜ XỬ LÝ</span><span className="rounded-xl bg-white/60 p-3">Recipient: CẦN XỬ LÝ</span><span className="rounded-xl bg-red-600 p-3 text-white">Urgent: CẦN XỬ LÝ NGAY</span></div></article>
        <article className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8"><Clock3 className="h-7 w-7 text-purple-600" /><h2 className="mt-4 text-xl font-black text-neutral-900">HUỶ CÓ XÁC NHẬN</h2><p className="mt-3 text-sm leading-6 text-neutral-600">Huỷ Production trước Start Print: request → Printer được giao xác nhận hoặc từ chối. Huỷ Finishing khi đã claim: request → Finisher xác nhận hoặc từ chối.</p><p className="mt-4 rounded-xl bg-neutral-100 p-3 text-sm font-bold text-neutral-700">Cancellation không phải Issue.</p></article>
      </section>

      <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-8"><div className="flex gap-3"><BarChart3 className="h-6 w-6 text-amber-600" /><div><h2 className="text-xl font-black text-neutral-900">TỪ QUẢN LÝ BẰNG TRÍ NHỚ → QUẢN LÝ BẰNG DỮ LIỆU</h2><p className="mt-1 text-sm text-neutral-600">Góc nhìn dành cho Ban Giám Đốc.</p></div></div><div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{executiveCards.map(([title, content]) => <article key={title} className="rounded-2xl border border-neutral-200 p-4"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><h3 className="mt-3 font-black text-neutral-900">{title}</h3><p className="mt-1 text-sm leading-6 text-neutral-600">{content}</p></article>)}</div></section>

      <section className="grid gap-5 lg:grid-cols-3"><article className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm"><Radio className="h-6 w-6 text-blue-600" /><h2 className="mt-3 font-black text-neutral-900">KHÔNG CẦN F5</h2><p className="mt-2 text-sm leading-6 text-neutral-600">Designer gửi → Printer thấy ngay. Printer hoàn thành → Finishing thấy Product. Finishing hoàn thành → Warehouse thấy hàng. Issue và urgent đến realtime.</p></article><article className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm"><ShieldCheck className="h-6 w-6 text-emerald-600" /><h2 className="mt-3 font-black text-neutral-900">MỖI NGƯỜI ĐÚNG VIỆC</h2><p className="mt-2 text-sm leading-6 text-neutral-600">Tài khoản riêng, role riêng, assignment, backend permission và audit/history bảo vệ vận hành.</p></article><article className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm"><Package className="h-6 w-6 text-sky-600" /><h2 className="mt-3 font-black text-neutral-900">5 PHÚT ĐỂ BẮT ĐẦU</h2><p className="mt-2 text-sm leading-6 text-neutral-600">Sale: Customer → Order → Product. Designer: Instruction → Print Images → Send. Printer: Accept → Start → Complete. Finisher: Receive → Complete. Kho: Receive → Ready → Export.</p></article></section>

      <section className="rounded-3xl bg-neutral-950 p-6 text-white shadow-xl sm:p-10"><Sparkles className="h-7 w-7 text-amber-300" /><h2 className="mt-4 text-2xl font-black">GIÁ TRỊ KHI ĐƯA VÀO VẬN HÀNH</h2><ul className="mt-5 grid gap-2 text-sm leading-6 text-neutral-300 sm:grid-cols-2">{['Một hệ thống chung cho toàn xưởng.', 'Giảm thông tin rời rạc và theo dõi được trách nhiệm.', 'Biết Product đang ở đâu và ưu tiên được hàng gấp.', 'Issue tới đúng người, có lịch sử xử lý.', 'Có thể mở rộng thống kê/báo cáo sau này.'].map((item) => <li key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />{item}</li>)}</ul><p className="mt-7 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-center text-sm font-black text-amber-200">MỖI NGƯỜI MỞ APP VÀ BIẾT NGAY VIỆC MÌNH CẦN LÀM.</p></section>

      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8"><Factory className="h-7 w-7 text-amber-600" /><h2 className="mt-4 text-xl font-black text-neutral-900">ĐỀ XUẤT ÁP DỤNG</h2><div className="mt-5 grid gap-4 md:grid-cols-3">{[['Giai đoạn 1', 'Pilot với 1–2 Sale, Designer, 1–2 Printer, Finisher, Warehouse và Manager.'], ['Giai đoạn 2', 'Ghi nhận UX thực tế và chỉnh các chi tiết cần thiết.'], ['Giai đoạn 3', 'Mở rộng toàn xưởng, không làm gián đoạn quy trình hiện tại.']].map(([title, content], index) => <article key={title} className="rounded-2xl bg-neutral-50 p-4"><span className="text-xs font-black text-amber-700">0{index + 1}</span><h3 className="mt-2 font-black text-neutral-900">{title}</h3><p className="mt-2 text-sm leading-6 text-neutral-600">{content}</p></article>)}</div></section>
    </main>
  );
};
