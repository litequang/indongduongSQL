import { NotificationItem } from '../types';
import { safeLocalStorageSet, safeLocalStorageGet } from '../utils/storageUtils';
import { soundManager } from '../utils/soundUtils';
import { WorkshopSettings } from '../types';

export const notificationService = {
  createNotification(
    notif: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>,
    settings: WorkshopSettings
  ): NotificationItem {
    const newNotif: NotificationItem = {
      ...notif,
      id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      read: false,
      createdAt: new Date().toISOString()
    };

    if (settings.soundAlerts) {
      if (notif.type === 'issue' || notif.type === 'warning') {
        soundManager.playAlert();
      } else if (notif.type === 'completed') {
        soundManager.playSuccess();
      } else {
        soundManager.playDing();
      }
    }

    return newNotif;
  }
};
