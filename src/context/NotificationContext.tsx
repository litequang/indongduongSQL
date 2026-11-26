import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { NotificationItem } from '../types';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/storageUtils';
import { useConfig } from './ConfigContext';
import { notificationService } from '../services/notificationService';

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadNotifsCount: number;
  setNotifications: React.Dispatch<React.SetStateAction<NotificationItem[]>>;
  addNotification: (notif: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>) => void;
  markNotificationRead: (notifId: string) => void;
  markAllNotificationsRead: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isDemoActive, settings } = useConfig();

  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    const key = isDemoActive ? 'flexo_notifications_demo_v1' : 'flexo_notifications_prod_v1';
    const saved = safeLocalStorageGet(key) || (!isDemoActive ? safeLocalStorageGet('flexo_notifications_v1') : null);
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    const key = isDemoActive ? 'flexo_notifications_demo_v1' : 'flexo_notifications_prod_v1';
    safeLocalStorageSet(key, JSON.stringify(notifications));
  }, [notifications, isDemoActive]);

  const addNotification = useCallback((notif: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>) => {
    const newNotif = notificationService.createNotification(notif, settings);
    setNotifications(prev => [newNotif, ...prev]);
  }, [settings]);

  const markNotificationRead = useCallback((notifId: string) => {
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const unreadNotifsCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  return (
    <NotificationContext.Provider value={{
      notifications,
      setNotifications,
      unreadNotifsCount,
      addNotification,
      markNotificationRead,
      markAllNotificationsRead
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
