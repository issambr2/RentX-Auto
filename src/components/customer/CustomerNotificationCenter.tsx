import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, deleteDoc, doc, updateDoc, orderBy } from '../../lib/api';
import { db, auth } from '../../lib/api';
import { AppNotification } from '../../types';
import { Bell, X, Trash2, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx } from 'clsx';
import { handleFirestoreError, OperationType } from '../../utils/errorHandling';

export function CustomerNotificationCenter({ isOpen, onClose, userId }: { isOpen: boolean, onClose: () => void, userId: string }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!userId) return;
    
    const q = query(
      collection(db, 'notifications'), 
      where('userId', '==', userId),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AppNotification[]);
    }, (error) => {
      // Silently handle error if it's permission issues (user might not have doc yet)
      if (error.code !== 'permission-denied') {
        console.error("Error fetching customer notifications:", error);
      }
    });
    return () => unsubscribe();
  }, [userId]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notifications/${id}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-end p-4 bg-stone-900/20 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200 mt-16"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-emerald-600 text-white">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-white" />
            <h3 className="font-bold">Mes Notifications</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4 space-y-3">
          {notifications.length === 0 ? (
            <div className="py-12 text-center">
              <Bell className="w-12 h-12 text-stone-200 mx-auto mb-4" />
              <p className="text-stone-400 text-sm italic serif">Aucune notification pour le moment.</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div 
                key={notification.id} 
                className={clsx(
                  "p-4 rounded-2xl border transition-all group relative",
                  notification.read ? "bg-stone-50 border-stone-100 opacity-75" : "bg-white border-stone-200 shadow-sm"
                )}
              >
                <div className="flex gap-4">
                  <div className={clsx(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
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
                  <div className="flex-1 min-w-0 pr-8">
                    <h4 className="font-bold text-stone-900 text-sm mb-0.5">{notification.title}</h4>
                    <p className="text-xs text-stone-500 leading-relaxed">{notification.message}</p>
                    <p className="text-[10px] text-stone-400 mt-2 font-medium">
                      {notification.timestamp ? format(new Date(notification.timestamp), 'dd MMM HH:mm', { locale: fr }) : ''}
                    </p>
                  </div>
                </div>
                
                {!notification.read && (
                  <button 
                    onClick={() => handleMarkAsRead(notification.id!)}
                    className="absolute top-4 right-4 p-1.5 hover:bg-emerald-50 text-emerald-600 rounded-lg"
                    title="Marquer comme lu"
                  >
                    <CheckCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
