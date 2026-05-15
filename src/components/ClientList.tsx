import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, getToken, logout } from '../lib/api';
import { db, auth } from '../lib/api';
import { Client, Rental, Maintenance } from '../types';
import { Plus, Search, Trash2, Edit2, X, User, Phone, Mail, CreditCard, Image as ImageIcon, Printer, ShieldAlert, ShieldCheck, Ban, AlertTriangle, Clock, Award, Star, Download, FileSpreadsheet, Globe, Info, Car, Wrench } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useLanguage } from '../contexts/LanguageContext';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import { ImageUpload } from './ImageUpload';
import { logActivity } from '../services/logService';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { DeleteModal } from './DeleteModal';
import { BlockClientModal } from './BlockClientModal';
import { useNotifications } from './NotificationContext';
import { GuideModal } from './GuideModal';
import { useOffice } from '../contexts/OfficeContext';

export function ClientList() {
  const { currentOffice } = useOffice();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [selectedClientForDocs, setSelectedClientForDocs] = useState<Client | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id: string }>({ isOpen: false, id: '' });
  const [blockModal, setBlockModal] = useState<{ isOpen: boolean, client: Client | null }>({ isOpen: false, client: null });
  const [rentals, setRentals] = useState<Rental[]>([]);
  const { addNotification } = useNotifications();
  const { t } = useLanguage();

  const [filterSource, setFilterSource] = useState<'all' | 'website' | 'admin' | 'blocked' | 'active'>('all');

  useEffect(() => {
    if (!currentOffice) return;

    const unsubscribe = onSnapshot(query(collection(db, 'clients'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      const clientData = snapshot.docs.map(doc => {
        const data = doc.data() as Client;
        return {
          ...data,
          id: doc.id,
          // Ensure isBlocked is a boolean
          isBlocked: !!data.isBlocked
        };
      });
      setClients(clientData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'clients');
    });
    return () => unsubscribe();
  }, [currentOffice]);

  useEffect(() => {
    if (!currentOffice) return;

    const unsubscribe = onSnapshot(query(collection(db, 'rentals'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setRentals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Rental[]);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'rentals');
    });
    return () => unsubscribe();
  }, [currentOffice]);

  const getClientPendingReservations = (clientId: string) => {
    return rentals.filter(r => r.clientId === clientId && r.status === 'pending_confirmation');
  };

  const handleConfirmReservation = async (rental: Rental) => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'rentals', rental.id), {
        status: 'reserved'
      });
      
      // Notify client
      const client = clients.find(c => c.id === rental.clientId);
      await addDoc(collection(db, 'notifications'), {
        title: 'Réservation Confirmée',
        message: `Votre réservation pour le véhicule ${rentals.find(r => r.id === rental.id)?.vehicleId} a été confirmée.`,
        type: 'success',
        timestamp: new Date().toISOString(),
        read: false,
        userId: client?.authUid || rental.clientId
      });

      addNotification('success', 'Réservation confirmée', 'Le client a été notifié.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rentals/${rental.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredClients = clients.filter(client => {
    const matchesSearch = 
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (client.cin && client.cin.toLowerCase().includes(searchTerm.toLowerCase())) ||
      client.phone.includes(searchTerm) ||
      (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesSource = filterSource === 'all' || 
                         (filterSource === 'blocked' ? client.isBlocked : 
                          filterSource === 'active' ? !client.isBlocked :
                          client.source === filterSource);
    
    return matchesSearch && matchesSource;
  });

  const handleCloseModal = (closeFn: () => void) => {
    closeFn();
  };

  const handleDelete = async (id: string) => {
    setIsSaving(true);
    try {
      const token = getToken();
      if (!token) throw new Error('Authentification requise');

      const response = await fetch('/api/admin/delete-client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ clientId: id })
      });

      if (!response.ok) {
        if (response.status === 401) {
          logout();
          return;
        }
        let errorMsg = 'Erreur lors de la suppression';
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) {
          // If not JSON, use status text or generic message
          errorMsg = response.statusText || errorMsg;
        }
        throw new Error(errorMsg);
      }

      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'delete_client', `Client supprimé: ${id}`, auth.currentUser.displayName || undefined);
      }
      addNotification('success', 'Client supprimé', 'Le client et son compte associé ont été supprimés.');
      setDeleteModal({ isOpen: false, id: '' });
    } catch (error: any) {
      addNotification('error', 'Erreur', error.message || 'Une erreur est survenue lors de la suppression.');
      handleFirestoreError(error, OperationType.DELETE, `clients/${id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleBlock = async (client: Client, reason?: string) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const newBlockedStatus = !client.isBlocked;
      
      const updateData = {
        isBlocked: newBlockedStatus,
        blockReason: newBlockedStatus ? (reason || '') : '',
        status: (newBlockedStatus ? 'blocked' : 'active') as 'active' | 'blocked',
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'clients', client.id), updateData);

      // FORCE immediate local update
      setClients(prev => prev.map(c => c.id === client.id ? { ...c, ...updateData } : c));
      
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'block_client', `Client ${client.name} ${newBlockedStatus ? 'bloqué' : 'débloqué'}`, auth.currentUser.displayName || undefined);
      }
      addNotification('info', newBlockedStatus ? 'Client bloqué' : 'Client débloqué', `Le client ${client.name} a été ${newBlockedStatus ? 'bloqué' : 'débloqué'}.`);
      setBlockModal({ isOpen: false, client: null });
    } catch (error) {
      addNotification('error', 'Erreur', 'Impossible de modifier le statut du client');
      handleFirestoreError(error, OperationType.UPDATE, `clients/${client.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'platinum': return 'text-indigo-600 bg-indigo-50 border-indigo-100';
      case 'gold': return 'text-amber-600 bg-amber-50 border-amber-100';
      case 'silver': return 'text-stone-600 bg-stone-50 border-stone-100';
      default: return 'text-orange-600 bg-orange-50 border-orange-100';
    }
  };

  const handleExport = () => {
    const headers = ['Nom', 'CIN', 'Téléphone', 'Email', 'Catégorie', 'Points', 'Statut'];
    const data = filteredClients.map(c => [
      c.name,
      c.cin || '',
      c.phone,
      c.email || '',
      c.category,
      c.loyaltyPoints,
      c.isBlocked ? 'Bloqué' : 'Actif'
    ]);

    const csvContent = [
      headers.join(','),
      ...data.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `liste_clients_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addNotification('success', 'Export réussi', 'La liste des clients a été exportée en CSV.');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-3xl font-bold text-stone-900 tracking-tight">{t('clients')}</h2>
            <p className="text-stone-500 italic serif">{t('manage_clients_desc')}</p>
          </div>
          <button 
            onClick={() => setIsHelpOpen(true)}
            className="p-2 bg-emerald-50 text-emerald-600 rounded-full hover:bg-emerald-100 transition-colors"
            title="Guide d'utilisation"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="flex items-center justify-center gap-2 bg-white border border-stone-200 text-stone-700 py-3 px-6 rounded-2xl font-semibold hover:bg-stone-50 transition-all shadow-sm"
          >
            <Download className="w-5 h-5" />
            Exporter
          </button>
          <button
            onClick={() => { setEditingClient(null); setIsModalOpen(true); }}
            className="flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 px-6 rounded-2xl font-semibold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20"
          >
            <Plus className="w-5 h-5" />
            {t('new_client')}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="text"
              placeholder={t('search_clients_placeholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mr-2">Source:</span>
            <button 
              onClick={() => setFilterSource('all')}
              className={clsx(
                "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all",
                filterSource === 'all' ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              )}
            >
              Tous
            </button>
            <button 
              onClick={() => setFilterSource('website')}
              className={clsx(
                "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-1.5",
                filterSource === 'website' ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
              )}
            >
              <Globe className="w-3 h-3" /> Site Web
            </button>
            <button 
              onClick={() => setFilterSource('admin')}
              className={clsx(
                "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all",
                filterSource === 'admin' ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              )}
            >
              Admin
            </button>
            <button 
              onClick={() => setFilterSource('active')}
              className={clsx(
                "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-1.5",
                filterSource === 'active' ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
              )}
            >
              <ShieldCheck className="w-3 h-3" /> Actifs
            </button>
            <button 
              onClick={() => setFilterSource('blocked')}
              className={clsx(
                "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-1.5",
                filterSource === 'blocked' ? "bg-red-600 text-white" : "bg-red-50 text-red-600 hover:bg-red-100"
              )}
            >
              <Ban className="w-3 h-3" /> Bloqués
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50/50 border-b border-stone-100">
                <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Client</th>
                <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Contact</th>
                <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Identité</th>
                <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Agent</th>
                <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Réservations</th>
                <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Statut</th>
                <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredClients.map((client) => (
                <tr key={client.id} className={clsx(
                  "hover:bg-stone-50/50 transition-colors group",
                  client.isBlocked && "bg-red-50/30"
                )}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        client.isBlocked ? "bg-red-100 text-red-600" : "bg-emerald-50 text-emerald-600"
                      )}>
                        <User className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-stone-900">{client.name}</p>
                          {client.source === 'website' && (
                            <div className="w-4 h-4 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center" title="Inscrit via Site Web">
                              <Globe className="w-2.5 h-2.5" />
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={clsx(
                            "text-[8px] font-bold uppercase tracking-tighter px-1.5 py-0.5 rounded-full border",
                            getStatusColor(client.loyaltyStatus)
                          )}>
                            {client.loyaltyStatus}
                          </span>
                          <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">{client.category}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-stone-600">
                        <Phone className="w-3 h-3 text-stone-400" />
                        {client.phone}
                      </div>
                      {client.email && (
                        <div className="flex items-center gap-2 text-xs text-stone-600">
                          <Mail className="w-3 h-3 text-stone-400" />
                          {client.email}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-sm font-medium text-stone-900">{client.agentName || 'Inconnu'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-xs text-stone-600">
                        <CreditCard className="w-3 h-3 text-stone-400" />
                        CIN: {client.cin}
                      </div>
                      <button 
                        onClick={() => setSelectedClientForDocs(client)}
                        className="text-[10px] font-bold text-emerald-600 hover:underline flex items-center gap-1 mt-1 bg-emerald-50 px-2 py-1 rounded-lg w-fit"
                      >
                        <User className="w-3 h-3" /> Digital Folder
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-2">
                      {getClientPendingReservations(client.id).length > 0 ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-emerald-600">
                            <Clock className="w-4 h-4" />
                            <span className="text-xs font-bold">{getClientPendingReservations(client.id).length} en attente</span>
                          </div>
                          {getClientPendingReservations(client.id).map(rental => (
                            <button
                              key={rental.id}
                              onClick={() => handleConfirmReservation(rental)}
                              className="text-[10px] bg-emerald-600 text-white px-2 py-1 rounded-lg font-bold hover:bg-emerald-500 transition-all w-fit"
                            >
                              Confirmer
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-stone-400 italic">Aucune</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {client.isBlocked ? (
                      <button
                        onClick={() => handleToggleBlock(client)}
                        disabled={isSaving}
                        className="flex flex-col gap-1 items-start group/toggle"
                        title="Cliquer pour débloquer (Mettre actif)"
                      >
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-sm group-hover/toggle:bg-red-700 transition-colors">
                          <ShieldAlert className="w-3.5 h-3.5" /> Bloqué
                        </div>
                        {client.blockReason && (
                          <p className="text-[10px] text-red-600 font-medium italic max-w-[150px] leading-tight">
                            Raison: {client.blockReason}
                          </p>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => setBlockModal({ isOpen: true, client })}
                        disabled={isSaving}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-sm hover:bg-emerald-700 transition-colors"
                        title="Cliquer pour bloquer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" /> Actif
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button 
                        onClick={() => { setEditingClient(client); setIsModalOpen(true); }}
                        className="p-2 hover:bg-stone-100 text-stone-400 hover:text-stone-600 rounded-lg transition-colors"
                        title="Modifier"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setHistoryClient(client)}
                        className="p-2 hover:bg-emerald-50 text-stone-400 hover:text-emerald-600 rounded-lg transition-colors"
                        title="Historique des locations"
                      >
                        <Clock className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setDeleteModal({ isOpen: true, id: client.id })}
                        className="p-2 hover:bg-red-50 text-stone-400 hover:text-red-600 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <ClientModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          onCloseWithConfirm={() => handleCloseModal(() => setIsModalOpen(false))}
          client={editingClient}
          clients={clients}
        />
      )}

      {historyClient && (
        <ClientHistoryModal 
          client={historyClient}
          onClose={() => setHistoryClient(null)}
        />
      )}

      {selectedClientForDocs && (
        <DocumentViewer 
          client={selectedClientForDocs} 
          onClose={() => setSelectedClientForDocs(null)} 
        />
      )}

      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '' })}
        onConfirm={() => handleDelete(deleteModal.id)}
        title="Supprimer le client"
        message="Êtes-vous sûr de vouloir supprimer ce client ? Cette action supprimera définitivement toutes ses données."
      />

      {blockModal.client && (
        <BlockClientModal
          isOpen={blockModal.isOpen}
          onClose={() => setBlockModal({ isOpen: false, client: null })}
          onConfirm={(reason) => blockModal.client && handleToggleBlock(blockModal.client, reason)}
          client={blockModal.client}
        />
      )}

      <GuideModal 
        isOpen={isHelpOpen} 
        onClose={() => setIsHelpOpen(false)} 
        activeTab="clients"
      />

    </div>
  );
}

function DocumentViewer({ client, onClose }: { client: Client, onClose: () => void }) {
  const [activeFolder, setActiveFolder] = useState<'cin' | 'permit' | 'contracts'>('cin');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-md overflow-hidden">
      <div className="bg-white w-full max-w-5xl h-[85vh] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col">
        {/* Dossier Header */}
        <div className="p-8 bg-stone-50 border-b border-stone-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-600/30">
              <User className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-2xl font-bold text-stone-900">Dossier Client: {client.name}</h3>
                <span className="text-[10px] font-bold uppercase tracking-widest bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Organisé</span>
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-stone-500 italic serif">
                <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {client.phone}</span>
                <span className="flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> CIN: {client.cin}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="p-3 bg-white border border-stone-200 text-stone-600 rounded-xl hover:bg-stone-50 transition-all print:hidden"
              title="Imprimer tout le dossier"
            >
              <Printer className="w-6 h-6" />
            </button>
            <button onClick={onClose} className="p-3 hover:bg-stone-200 rounded-full text-stone-400 bg-stone-100 transition-all">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar Navigation (Folders) */}
          <div className="w-64 border-r border-stone-100 p-6 space-y-2 bg-stone-50/30 shrink-0">
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-4">Sous-Dossiers</p>
            <button 
              onClick={() => setActiveFolder('cin')}
              className={clsx(
                "w-full flex items-center gap-3 p-3 rounded-xl font-bold text-sm transition-all text-left",
                activeFolder === 'cin' ? "bg-stone-900 text-white shadow-lg" : "text-stone-600 hover:bg-stone-100"
              )}
            >
              <CreditCard className="w-5 h-5" />
              Pièce d'Identité
            </button>
            <button 
              onClick={() => setActiveFolder('permit')}
              className={clsx(
                "w-full flex items-center gap-3 p-3 rounded-xl font-bold text-sm transition-all text-left",
                activeFolder === 'permit' ? "bg-stone-900 text-white shadow-lg" : "text-stone-600 hover:bg-stone-100"
              )}
            >
              <ShieldCheck className="w-5 h-5" />
              Permis de Conduire
            </button>
            <button 
              onClick={() => setActiveFolder('contracts')}
              className={clsx(
                "w-full flex items-center gap-3 p-3 rounded-xl font-bold text-sm transition-all text-left",
                activeFolder === 'contracts' ? "bg-stone-900 text-white shadow-lg" : "text-stone-600 hover:bg-stone-100"
              )}
            >
              <FileSpreadsheet className="w-5 h-5" />
              Historique / Contrats
            </button>

            <div className="pt-8 space-y-4">
               <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-1">Status du Dossier</p>
                  <p className="text-sm font-bold text-emerald-800">Conforme</p>
                  <div className="w-full h-1.5 bg-emerald-200 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-emerald-600 w-full" />
                  </div>
               </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-white">
            <AnimatePresence mode="wait">
              {activeFolder === 'cin' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-bold text-stone-900">Carte d'Identité Nationale</h4>
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">2 fichiers</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-stone-500 flex items-center gap-2 uppercase tracking-widest">
                        <ImageIcon className="w-4 h-4" /> Recto
                      </p>
                      {client.cinRecto ? (
                        <div className="group relative">
                          <img src={client.cinRecto} alt="CIN Recto" className="w-full rounded-2xl border border-stone-200 shadow-sm transition-all group-hover:shadow-xl" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-stone-900/40 opacity-0 group-hover:opacity-100 transition-all rounded-2xl flex items-center justify-center gap-2">
                             <button onClick={() => window.open(client.cinRecto, '_blank')} className="p-2 bg-white rounded-lg text-stone-900"><Download className="w-5 h-5" /></button>
                          </div>
                        </div>
                      ) : (
                        <div className="aspect-[1.6/1] bg-stone-50 rounded-2xl border-2 border-dashed border-stone-200 flex items-center justify-center text-stone-400 text-sm italic">Pièce manquante</div>
                      )}
                    </div>
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-stone-500 flex items-center gap-2 uppercase tracking-widest">
                        <ImageIcon className="w-4 h-4" /> Verso
                      </p>
                      {client.cinVerso ? (
                        <div className="group relative">
                          <img src={client.cinVerso} alt="CIN Verso" className="w-full rounded-2xl border border-stone-200 shadow-sm transition-all group-hover:shadow-xl" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-stone-900/40 opacity-0 group-hover:opacity-100 transition-all rounded-2xl flex items-center justify-center gap-2">
                             <button onClick={() => window.open(client.cinVerso, '_blank')} className="p-2 bg-white rounded-lg text-stone-900"><Download className="w-5 h-5" /></button>
                          </div>
                        </div>
                      ) : (
                        <div className="aspect-[1.6/1] bg-stone-50 rounded-2xl border-2 border-dashed border-stone-200 flex items-center justify-center text-stone-400 text-sm italic">Pièce manquante</div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeFolder === 'permit' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-bold text-stone-900">Permis de Conduire</h4>
                    <div className="flex items-center gap-2 text-stone-500 text-xs">
                      <Clock className="w-4 h-4" />
                      Expire le: {client.licenseExpiry || 'Non renseigné'}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-stone-500 flex items-center gap-2 uppercase tracking-widest">
                        <ImageIcon className="w-4 h-4" /> Recto
                      </p>
                      {client.licenseRecto ? (
                        <div className="group relative">
                          <img src={client.licenseRecto} alt="Permis Recto" className="w-full rounded-2xl border border-stone-200 shadow-sm transition-all group-hover:shadow-xl" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-stone-900/40 opacity-0 group-hover:opacity-100 transition-all rounded-2xl flex items-center justify-center gap-2">
                             <button onClick={() => window.open(client.licenseRecto, '_blank')} className="p-2 bg-white rounded-lg text-stone-900"><Download className="w-5 h-5" /></button>
                          </div>
                        </div>
                      ) : (
                        <div className="aspect-[1.6/1] bg-stone-50 rounded-2xl border-2 border-dashed border-stone-200 flex items-center justify-center text-stone-400 text-sm italic">Pièce manquante</div>
                      )}
                    </div>
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-stone-500 flex items-center gap-2 uppercase tracking-widest">
                        <ImageIcon className="w-4 h-4" /> Verso
                      </p>
                      {client.licenseVerso ? (
                        <div className="group relative">
                          <img src={client.licenseVerso} alt="Permis Verso" className="w-full rounded-2xl border border-stone-200 shadow-sm transition-all group-hover:shadow-xl" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-stone-900/40 opacity-0 group-hover:opacity-100 transition-all rounded-2xl flex items-center justify-center gap-2">
                             <button onClick={() => window.open(client.licenseVerso, '_blank')} className="p-2 bg-white rounded-lg text-stone-900"><Download className="w-5 h-5" /></button>
                          </div>
                        </div>
                      ) : (
                        <div className="aspect-[1.6/1] bg-stone-50 rounded-2xl border-2 border-dashed border-stone-200 flex items-center justify-center text-stone-400 text-sm italic">Pièce manquante</div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeFolder === 'contracts' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-bold text-stone-900">Historique des Documents</h4>
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Contrats & Factures</span>
                  </div>
                  
                  <div className="p-12 bg-stone-50 rounded-3xl border border-dashed border-stone-200 flex flex-col items-center justify-center text-center">
                    <FileSpreadsheet className="w-12 h-12 text-stone-300 mb-4" />
                    <p className="text-stone-500 italic serif">L'archivage automatique des contrats signés est en cours de déploiement.</p>
                    <p className="text-xs text-stone-400 mt-2">Vous pouvez consulter l'historique des locations via le bouton "Clock" dans la liste des clients.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="p-6 bg-stone-50 border-t border-stone-100 flex justify-between items-center shrink-0">
          <p className="text-xs text-stone-400">Ce dossier est strictement confidentiel et réservé à l'usage interne de l'agence.</p>
          <div className="flex items-center gap-4">
             <button
              onClick={onClose}
              className="px-6 py-3 bg-stone-200 text-stone-700 rounded-xl font-bold hover:bg-stone-300 transition-all"
            >
              Fermer le Dossier
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientHistoryModal({ client, onClose }: { client: Client, onClose: () => void }) {
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'rentals' | 'maintenances'>('rentals');

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const rentalsQ = query(
          collection(db, 'rentals'),
          where('clientId', '==', client.id)
        );
        const rentalsUnsubscribe = onSnapshot(rentalsQ, (snapshot) => {
          const rentalsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Rental));
          setRentals(rentalsData.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()));
        });

        // Use email for maintenances as it was added recently
        const maintenancesQ = query(
          collection(db, 'maintenances'),
          where('clientEmail', '==', client.email)
        );
        const maintUnsubscribe = onSnapshot(maintenancesQ, (snapshot) => {
          const maintData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Maintenance));
          setMaintenances(maintData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        });

        setLoading(false);
        return () => {
          rentalsUnsubscribe();
          maintUnsubscribe();
        };
      } catch (err) {
        console.error("Error fetching history:", err);
        setLoading(false);
      }
    };

    fetchHistory();
  }, [client.id, client.email]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
        <div className="p-8 border-b border-stone-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-2xl font-bold text-stone-900">Historique de {client.name}</h3>
            <p className="text-stone-500 text-sm italic serif">Locations et interventions effectuées.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-stone-100 p-1 rounded-xl flex gap-1">
              <button
                onClick={() => setActiveTab('rentals')}
                className={clsx(
                  "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                  activeTab === 'rentals' ? "bg-stone-900 text-white shadow-md" : "text-stone-500 hover:bg-stone-200"
                )}
              >
                Locations ({rentals.length})
              </button>
              <button
                onClick={() => setActiveTab('maintenances')}
                className={clsx(
                  "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                  activeTab === 'maintenances' ? "bg-stone-900 text-white shadow-md" : "text-stone-500 hover:bg-stone-200"
                )}
              >
                Interventions ({maintenances.length})
              </button>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-10 h-10 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin" />
            </div>
          ) : activeTab === 'rentals' ? (
            rentals.length > 0 ? (
              <div className="space-y-4">
                {rentals.map((rental) => (
                  <div key={rental.id} className="p-6 bg-stone-50 rounded-2xl border border-stone-100 flex items-center justify-between group hover:border-emerald-200 transition-all">
                    <div className="flex items-center gap-6">
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-stone-100">
                        <Clock className={clsx(
                          "w-6 h-6",
                          rental.status === 'completed' ? "text-emerald-500" : "text-amber-500"
                        )} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-stone-900">{rental.contractNumber}</p>
                          <span className={clsx(
                            "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full",
                            rental.status === 'completed' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                          )}>
                            {rental.status === 'completed' ? 'Terminée' : 'Confirmée'}
                          </span>
                        </div>
                        <p className="text-xs text-stone-500 mt-1">
                          Du {format(new Date(rental.startDate), 'dd MMM yyyy', { locale: fr })} au {format(new Date(rental.endDate), 'dd MMM yyyy', { locale: fr })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-emerald-600">{rental.totalAmount?.toLocaleString()} TND</p>
                      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                        {rental.paymentStatus === 'paid' ? 'Payé' : 'En attente'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <Car className="w-12 h-12 text-stone-200 mx-auto mb-4" />
                <p className="text-stone-400 italic serif">Aucune location enregistrée pour ce client.</p>
              </div>
            )
          ) : (
            maintenances.length > 0 ? (
              <div className="space-y-4">
                {maintenances.map((m) => (
                  <div key={m.id} className="p-6 bg-stone-50 rounded-2xl border border-stone-100 flex items-center justify-between group hover:border-amber-200 transition-all">
                    <div className="flex items-center gap-6">
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-stone-100 text-amber-500">
                        <Wrench className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-stone-900">{m.type.toUpperCase()}</p>
                          <span className="text-[10px] font-bold bg-amber-100 text-amber-700 uppercase tracking-widest px-2 py-0.5 rounded-full">
                            Intervention
                          </span>
                        </div>
                        <p className="text-xs text-stone-500 mt-1">
                          Effectuée le {format(new Date(m.date), 'dd MMM yyyy', { locale: fr })}
                          {m.mileageAtService ? ` à ${m.mileageAtService} KM` : ''}
                        </p>
                        {m.description && <p className="text-[10px] text-stone-400 mt-1 italic">{m.description}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-amber-600">{(m.cost || 0).toLocaleString()} TND</p>
                      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Technique</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <Wrench className="w-12 h-12 text-stone-200 mx-auto mb-4" />
                <p className="text-stone-400 italic serif">Aucune intervention enregistrée pour ce client.</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function ClientModal({ isOpen, onClose, onCloseWithConfirm, client, clients }: { isOpen: boolean, onClose: () => void, onCloseWithConfirm?: () => void, client: Client | null, clients: Client[] }) {
  const { addNotification } = useNotifications();
  const { t } = useLanguage();
  const { currentOffice } = useOffice();
  const [isSaving, setIsSaving] = useState(false);

  const handleClose = onCloseWithConfirm || onClose;
  const [formData, setFormData] = useState({
    name: client?.name || '',
    cin: client?.cin || '',
    licenseNumber: client?.licenseNumber || '',
    phone: client?.phone || '',
    email: client?.email || '',
    category: client?.category || 'regular' as 'regular' | 'vip',
    cinRecto: client?.cinRecto || '',
    cinVerso: client?.cinVerso || '',
    licenseRecto: client?.licenseRecto || '',
    licenseVerso: client?.licenseVerso || '',
    passportPhoto: client?.passportPhoto || '',
    passportNumber: client?.passportNumber || '',
    birthDate: client?.birthDate || '',
    nationality: client?.nationality || '',
    isBlocked: !!client?.isBlocked,
    blockReason: client?.blockReason || '',
    status: client?.status || 'active',
    loyaltyPoints: client?.loyaltyPoints || 0,
    loyaltyStatus: client?.loyaltyStatus || 'bronze' as 'bronze' | 'silver' | 'gold' | 'platinum'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Duplicate check
    if (!client) {
      const duplicateByName = clients.find(c => c.name.toLowerCase() === formData.name.toLowerCase());
      const duplicateByCin = formData.cin ? clients.find(c => c.cin === formData.cin) : null;
      const duplicateByLicense = clients.find(c => c.licenseNumber === formData.licenseNumber);
      const duplicateByPhone = clients.find(c => c.phone === formData.phone);

      if (duplicateByName) {
        addNotification('error', 'Doublage détecté', `Un client avec le nom "${formData.name}" existe déjà.`);
        return;
      }
      if (duplicateByCin) {
        addNotification('error', 'Doublage détecté', `Un client avec le CIN "${formData.cin}" existe déjà.`);
        return;
      }
      if (duplicateByLicense) {
        addNotification('error', 'Doublage détecté', `Un client avec le numéro de permis "${formData.licenseNumber}" existe déjà.`);
        return;
      }
      if (duplicateByPhone) {
        addNotification('error', 'Doublage détecté', `Un client avec le numéro de téléphone "${formData.phone}" existe déjà.`);
        return;
      }
    }

    try {
      setIsSaving(true);
      if (client) {
        const updateData = {
          ...formData,
          status: formData.isBlocked ? 'blocked' : 'active',
          agentName: auth.currentUser?.displayName || 'Agent'
        };
        await updateDoc(doc(db, 'clients', client.id), updateData);

        // Sync user isActive if isBlocked changed
        if (client.isBlocked !== formData.isBlocked && client.authUid) {
          try {
            await updateDoc(doc(db, 'users', client.authUid), {
              isActive: !formData.isBlocked
            });
            const token = getToken();
            if (token) {
              await fetch('/api/admin/update-user', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                  uid: client.authUid,
                  disabled: formData.isBlocked
                })
              });
            }
          } catch (syncError) {
            console.error('Error syncing status change:', syncError);
          }
        }

        if (auth.currentUser) {
          logActivity(auth.currentUser.uid, 'update_client', `Client modifié: ${formData.name}`, auth.currentUser.displayName || undefined);
        }
      } else {
        await addDoc(collection(db, 'clients'), {
          ...formData,
          status: formData.isBlocked ? 'blocked' : 'active',
          agentName: auth.currentUser?.displayName || 'Agent',
          createdAt: new Date().toISOString(),
          officeId: currentOffice?.id
        });
        if (auth.currentUser) {
          logActivity(auth.currentUser.uid, 'add_client', `Nouveau client ajouté: ${formData.name}`, auth.currentUser.displayName || undefined);
        }
      }
      onClose();
    } catch (error) {
      handleFirestoreError(error, client ? OperationType.UPDATE : OperationType.CREATE, client ? `clients/${client.id}` : 'clients');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200 resizable-modal" onClick={e => e.stopPropagation()}>
        <div className="p-8 border-b border-stone-100 flex items-center justify-between shrink-0">
          <h3 className="text-2xl font-bold text-stone-900">
            {client ? t('edit_client') : t('new_client')}
          </h3>
          <button onClick={handleClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <X className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-8 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">{t('general_info')}</label>
                <div className="space-y-4">
                  <input
                    required
                    placeholder={t('full_name')}
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      required
                      placeholder="CIN"
                      value={formData.cin}
                      onChange={(e) => setFormData({...formData, cin: e.target.value})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                    <input
                      required
                      placeholder={t('license_number')}
                      value={formData.licenseNumber}
                      onChange={(e) => setFormData({...formData, licenseNumber: e.target.value})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      placeholder="N° Passeport"
                      value={formData.passportNumber}
                      onChange={(e) => setFormData({...formData, passportNumber: e.target.value})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                    <input
                      type="date"
                      placeholder="Date de naissance"
                      value={formData.birthDate}
                      onChange={(e) => setFormData({...formData, birthDate: e.target.value})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <input
                    placeholder="Nationalité"
                    value={formData.nationality}
                    onChange={(e) => setFormData({...formData, nationality: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    required
                    placeholder={t('phone')}
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({...formData, category: e.target.value as 'regular' | 'vip'})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="regular">{t('regular')}</option>
                      <option value="vip">VIP</option>
                    </select>
                    <select
                      value={formData.loyaltyStatus}
                      onChange={(e) => setFormData({...formData, loyaltyStatus: e.target.value as any})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="bronze">Bronze</option>
                      <option value="silver">Silver</option>
                      <option value="gold">Gold</option>
                      <option value="platinum">Platinum</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest shrink-0">{t('loyalty_points')}</label>
                    <input
                      type="number"
                      value={formData.loyaltyPoints}
                      onChange={(e) => setFormData({...formData, loyaltyPoints: parseInt(e.target.value) || 0})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {formData.isBlocked && (
                    <div className="p-4 bg-red-50 rounded-2xl border border-red-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-red-600">
                          <Ban className="w-4 h-4" />
                          <span className="text-xs font-bold uppercase tracking-widest">Client Bloqué</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, isBlocked: false, blockReason: '', status: 'active' })}
                          className="text-[10px] font-bold text-emerald-600 hover:text-emerald-500 uppercase tracking-widest bg-white px-2 py-1 rounded-lg border border-emerald-100"
                        >
                          Débloquer maintenant
                        </button>
                      </div>
                      {formData.blockReason && (
                        <p className="text-sm text-red-500 italic">Raison: {formData.blockReason}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Documents (CIN)</label>
                <div className="grid grid-cols-2 gap-4">
                  <ImageUpload 
                    label="CIN Recto" 
                    value={formData.cinRecto} 
                    onChange={(val) => setFormData({...formData, cinRecto: val})} 
                  />
                  <ImageUpload 
                    label="CIN Verso" 
                    value={formData.cinVerso} 
                    onChange={(val) => setFormData({...formData, cinVerso: val})} 
                  />
                </div>
              </div>
              <div className="space-y-4">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Documents (Permis)</label>
                <div className="grid grid-cols-2 gap-4">
                  <ImageUpload 
                    label="Permis Recto" 
                    value={formData.licenseRecto} 
                    onChange={(val) => setFormData({...formData, licenseRecto: val})} 
                  />
                  <ImageUpload 
                    label="Permis Verso" 
                    value={formData.licenseVerso} 
                    onChange={(val) => setFormData({...formData, licenseVerso: val})} 
                  />
                </div>
              </div>
              <div className="space-y-4">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Document (Passeport)</label>
                <ImageUpload 
                  label="Photo Passeport" 
                  value={formData.passportPhoto} 
                  onChange={(val) => setFormData({...formData, passportPhoto: val})} 
                />
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
            >
              {isSaving ? 'Enregistrement...' : (client ? 'Mettre à jour' : 'Enregistrer le client')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
