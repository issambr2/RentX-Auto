import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, deleteDoc, doc, addDoc, updateDoc, orderBy } from '../lib/api';
import { db, auth } from '../lib/api';
import { AppNotification } from '../types';
import { Bell, X, Trash2, CheckCircle, AlertCircle, Info, Plus, Wrench, Globe, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx } from 'clsx';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { useOffice } from '../contexts/OfficeContext';

export function NotificationCenter({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const { currentOffice } = useOffice();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [newNotification, setNewNotification] = useState({
    title: '',
    message: '',
    type: 'info' as AppNotification['type']
  });

  const fetchNotifications = async () => {
    if (!auth.currentUser || !currentOffice) return;
    
    const q = query(
      collection(db, 'notifications'), 
      where('officeId', '==', currentOffice.id),
      where('type', '==', 'website_reservation'),
      orderBy('createdAt', 'desc')
    );
    
    // We stick to snapshot for real-time, but we also want a manual refresh for sync
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AppNotification[]);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'notifications');
    });
    return unsubscribe;
  };

  useEffect(() => {
    let unsubscribe: any;
    fetchNotifications().then(unsub => unsubscribe = unsub);
    return () => unsubscribe && unsubscribe();
  }, [currentOffice]);

  const handleSyncNotifications = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/notifications/sync', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      if (!res.ok) throw new Error('Erreur de synchronisation');
      const data = await res.json();
      console.log('Notifications sync result:', data);
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notifications/${id}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `notifications/${id}`);
    }
  };

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'notifications'), {
        ...newNotification,
        timestamp: new Date().toISOString(),
        read: false,
        isManual: true,
        officeId: currentOffice?.id
      });
      setIsAddingManual(false);
      setNewNotification({ title: '', message: '', type: 'info' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'notifications');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-end p-4 bg-stone-900/20 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200 mt-16"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-stone-900">Notifications</h3>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleSyncNotifications}
              disabled={isSyncing}
              className={clsx(
                "p-2 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-all",
                isSyncing && "animate-spin"
              )}
              title="Actualiser les alertes d'expiration"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setIsAddingManual(true)}
              className="p-2 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-all"
              title="Ajouter une notification manuelle"
            >
              <Plus className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-stone-200 rounded-lg text-stone-400">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4 space-y-3">
          {isAddingManual && (
            <form onSubmit={handleAddManual} className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-3 animate-in fade-in slide-in-from-top duration-200">
              <input
                required
                placeholder="Titre"
                value={newNotification.title}
                onChange={e => setNewNotification({...newNotification, title: e.target.value})}
                className="w-full px-3 py-2 bg-white border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
              />
              <textarea
                required
                placeholder="Message"
                value={newNotification.message}
                onChange={e => setNewNotification({...newNotification, message: e.target.value})}
                className="w-full px-3 py-2 bg-white border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 min-h-[80px]"
              />
              <div className="flex gap-2">
                <select
                  value={newNotification.type}
                  onChange={e => setNewNotification({...newNotification, type: e.target.value as any})}
                  className="flex-1 px-3 py-2 bg-white border-none rounded-xl text-xs font-bold uppercase tracking-widest focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="info">Info</option>
                  <option value="success">Succès</option>
                  <option value="warning">Avertissement</option>
                  <option value="error">Erreur</option>
                  <option value="maintenance">Entretien</option>
                  <option value="website_reservation">Site Web</option>
                </select>
                <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-500 transition-all">Ajouter</button>
                <button type="button" onClick={() => setIsAddingManual(false)} className="bg-stone-200 text-stone-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-stone-300 transition-all">Annuler</button>
              </div>
            </form>
          )}

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
                    notification.type === 'info' && "bg-emerald-50 text-emerald-600",
                    notification.type === 'maintenance' && "bg-indigo-50 text-indigo-600",
                    notification.type === 'website_reservation' && "bg-pink-50 text-pink-600"
                  )}>
                    {notification.type === 'success' && <CheckCircle className="w-5 h-5" />}
                    {notification.type === 'error' && <AlertCircle className="w-5 h-5" />}
                    {notification.type === 'warning' && <AlertCircle className="w-5 h-5" />}
                    {notification.type === 'info' && <Info className="w-5 h-5" />}
                    {notification.type === 'maintenance' && <Wrench className="w-5 h-5" />}
                    {notification.type === 'website_reservation' && <Globe className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0 pr-8">
                    <h4 className="font-bold text-stone-900 text-sm mb-0.5">{notification.title}</h4>
                    <p className="text-xs text-stone-500 leading-relaxed">{notification.message}</p>
                    <p className="text-[10px] text-stone-400 mt-2 font-medium">
                      {(notification.createdAt || notification.timestamp) ? (
                        (() => {
                          try {
                            return format(new Date(notification.createdAt || notification.timestamp || ''), 'dd MMM yyyy HH:mm', { locale: fr });
                          } catch (e) {
                            return 'Date invalide';
                          }
                        })()
                      ) : 'Date manquante'}
                    </p>
                  </div>
                </div>
                
                <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  {!notification.read && (
                    <button 
                      onClick={() => handleMarkAsRead(notification.id!)}
                      className="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded-lg"
                      title="Marquer comme lu"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  )}
                  <button 
                    onClick={() => handleDelete(notification.id!)}
                    className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
