import { ProductionOrder, TimelineEvent, User } from '../types';

/**
 * Builds the complete persisted payload for both urgent controls. Keeping this
 * in one place prevents the order-card and detail-modal flows from drifting.
 */
export function buildUrgentOrderUpdate(
  order: ProductionOrder,
  actor: User,
  isUrgent: boolean,
  reason?: string,
  at = new Date(),
): ProductionOrder {
  const roleTitle = actor.role === 'SALE' ? 'Sale' : actor.role === 'DESIGNER' ? 'Thiết kế' : 'Quản lý';
  const timeline: TimelineEvent[] = [
    ...order.timeline,
    {
      id: `tl-${at.getTime()}`,
      time: `${at.getHours().toString().padStart(2, '0')}:${at.getMinutes().toString().padStart(2, '0')} – ${at.getDate()}/${at.getMonth() + 1}`,
      author: actor.name,
      content: isUrgent
        ? `🔥 ${actor.name} (${roleTitle}) đánh dấu: ĐƠN CẦN GẤP – Ưu tiên in trước cho khách!${reason ? ` (${reason})` : ''}`
        : `Đã gỡ trạng thái gấp: ${actor.name} (${roleTitle})`,
      type: 'urgent',
    },
  ];

  return {
    ...order,
    isUrgent,
    urgentReason: isUrgent ? (reason || 'Khách cần gấp') : undefined,
    urgentSetBy: isUrgent ? actor.id : undefined,
    urgentSetName: isUrgent ? actor.name : undefined,
    timeline,
    updatedAt: at.toISOString(),
  };
}
