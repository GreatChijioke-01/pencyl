import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

interface NotificationState {
  notifications: AppNotification[];
  addNotification: (notification: { title: string; message: string }) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  removeNotification: (id: string) => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      notifications: [],

      addNotification: ({ title, message }) => {
        const newNotification: AppNotification = {
          id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          title,
          message,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          read: false,
        };

        set((state) => ({
          notifications: [newNotification, ...state.notifications],
        }));
      },

      markAsRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        }));
      },

      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        }));
      },

      clearNotifications: () => {
        set({ notifications: [] });
      },

      removeNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      },
    }),
    {
      name: "pencyl-notifications",
    }
  )
);
