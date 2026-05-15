import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, Bell } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'motion/react';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  action?: () => void;
  link?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (type: NotificationType, title: string, message: string, action?: () => void, link?: string) => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((type: NotificationType, title: string, message: string, action?: () => void, link?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications(prev => [{ id, type, title, message, timestamp: Date.now(), action, link }, ...prev]);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      removeNotification(id);
    }, 5000);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, removeNotification, clearAll }}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed bottom-8 right-8 z-[100] flex flex-col gap-4 w-full max-w-sm pointer-events-none">
        <AnimatePresence>
          {notifications.map((notification) => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95 }}
              onClick={() => {
                if (notification.action) notification.action();
                if (notification.link) window.location.hash = notification.link;
                removeNotification(notification.id);
              }}
              className={clsx(
                "pointer-events-auto p-4 rounded-2xl shadow-xl border flex gap-4 items-start cursor-pointer transition-all hover:scale-[1.02]",
                notification.type === 'success' && "bg-white border-emerald-100 text-emerald-900",
                notification.type === 'error' && "bg-white border-red-100 text-red-900",
                notification.type === 'warning' && "bg-white border-amber-100 text-amber-900",
                notification.type === 'info' && "bg-white border-emerald-100 text-emerald-900"
              )}
            >
              <div className={clsx(
                "p-2 rounded-xl shrink-0",
                notification.type === 'success' && "bg-emerald-50 text-emerald-600",
                notification.type === 'error' && "bg-red-50 text-red-600",
                notification.type === 'warning' && "bg-amber-50 text-amber-600",
                notification.type === 'info' && "bg-emerald-50 text-emerald-600"
              )}>
                {notification.type === 'success' && <CheckCircle className="w-5 h-5" />}
                {notification.type === 'error' && <AlertCircle className="w-5 h-5" />}
                {notification.type === 'warning' && <AlertCircle className="w-5 h-5" />}
                {notification.type === 'info' && <Info className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">{notification.title}</p>
                <p className="text-xs text-stone-500 mt-0.5">{notification.message}</p>
              </div>
              <button 
                onClick={() => removeNotification(notification.id)}
                className="p-1 hover:bg-stone-100 rounded-lg text-stone-400 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
