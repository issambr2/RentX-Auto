import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, where } from '../lib/api';
import { db, auth } from '../lib/api';
import { useOffice } from '../contexts/OfficeContext';
import { useNotifications } from './NotificationContext';
import { logActivity } from '../services/logService';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx } from 'clsx';
import { 
  Info, Plus, Search, Filter, Car, Calendar, CreditCard, 
  Edit2, Trash2, X, Clock, FileText, CheckCircle, 
  AlertCircle, Upload
} from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { compressImage } from '../utils/imageCompression';
import { Leasing, Vehicle, PaymentMethod } from '../types';
import { DeleteModal } from './DeleteModal';
import { GuideModal } from './GuideModal';

export function LeasingList() {
  const { currentOffice } = useOffice();
  const [leasings, setLeasings] = useState<Leasing[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubcontractorModalOpen, setIsSubcontractorModalOpen] = useState(false);
  const [isPaymentsModalOpen, setIsPaymentsModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [selectedLeasing, setSelectedLeasing] = useState<Leasing | null>(null);
  const [editingLeasing, setEditingLeasing] = useState<Leasing | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id: string }>({ isOpen: false, id: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'company' | 'subcontracted'>('all');
  const { addNotification } = useNotifications();

  useEffect(() => {
    if (!currentOffice) return;

    let leasingsLoaded = false;
    let vehiclesLoaded = false;

    const unsubLeasings = onSnapshot(query(collection(db, 'leasings'), where('officeId', '==', currentOffice.id), orderBy('startDate', 'desc')), (snapshot) => {
      const leasingData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Leasing[];
      setLeasings(leasingData);
      leasingsLoaded = true;
      if (vehiclesLoaded) setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'leasings');
      leasingsLoaded = true;
      if (vehiclesLoaded) setLoading(false);
    });

    const unsubVehicles = onSnapshot(query(collection(db, 'vehicles'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vehicle[]);
      vehiclesLoaded = true;
      if (leasingsLoaded) setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'vehicles');
      vehiclesLoaded = true;
      if (leasingsLoaded) setLoading(false);
    });

    return () => {
      unsubLeasings();
      unsubVehicles();
    };
  }, [currentOffice]);

  // Separate effect for notifications to avoid infinite loop with setLeasings/onSnapshot
  useEffect(() => {
    if (!currentOffice || leasings.length === 0) return;

    const today = new Date();
    const fifteenDaysFromNow = new Date();
    fifteenDaysFromNow.setDate(today.getDate() + 15);

    leasings.forEach(leasing => {
      (leasing.payments || []).forEach(async (payment, index) => {
        const dueDate = new Date(payment.dueDate);
        if (payment.status === 'pending' && !payment.isNotified && dueDate <= fifteenDaysFromNow && dueDate >= today) {
          const vehicle = vehicles.find(v => v.id === leasing.vehicleId);
          const notificationTitle = `Paiement Leasing Proche: ${vehicle?.brand} ${vehicle?.model}`;
          const notificationMessage = `Le paiement de ${payment.amount.toLocaleString()} TND pour le contrat ${leasing.contractNumber} est dû le ${format(dueDate, 'dd/MM/yyyy')}.`;
          
          try {
            await addDoc(collection(db, 'notifications'), {
              title: notificationTitle,
              message: notificationMessage,
              type: 'warning',
              timestamp: new Date().toISOString(),
              read: false,
              vehicleId: leasing.vehicleId,
              docName: 'Leasing',
              officeId: currentOffice.id
            });

            // Mark as notified in leasing doc
            const updatedPayments = [...leasing.payments];
            updatedPayments[index] = { ...payment, isNotified: true };
            await updateDoc(doc(db, 'leasings', leasing.id!), { payments: updatedPayments });
          } catch (error) {
            console.error('Error adding notification:', error);
          }
        }
      });
    });
  }, [leasings, vehicles, currentOffice]);

  const getVehicle = (id: string) => vehicles.find(v => v.id === id);

  const handleDelete = async (id: string) => {
    setIsSaving(true);
    try {
      const leasingToDelete = leasings.find(l => l.id === id);
      await deleteDoc(doc(db, 'leasings', id));
      
      // If the leasing was active, set vehicle back to available
      if (leasingToDelete && leasingToDelete.vehicleId) {
        await updateDoc(doc(db, 'vehicles', leasingToDelete.vehicleId), {
          status: 'available'
        });
      }

      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'delete_leasing', `Leasing supprimé: ${id}`, auth.currentUser.displayName || undefined);
      }
      addNotification('success', 'Supprimé', 'Le leasing a été supprimé avec succès.');
      setDeleteModal({ isOpen: false, id: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `leasings/${id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredLeasings = leasings.filter(leasing => {
    const vehicle = getVehicle(leasing.vehicleId);
    const matchesSearch = `${vehicle?.brand} ${vehicle?.model} ${leasing.provider} ${leasing.subcontractorName || ''}`.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || 
                       (filterType === 'company' && !leasing.isSubcontracted) || 
                       (filterType === 'subcontracted' && leasing.isSubcontracted);
    return matchesSearch && matchesType;
  });

  const getMonthsRemaining = (endDate: string) => {
    const today = new Date();
    const end = new Date(endDate);
    if (end < today) return 0;
    const months = (end.getFullYear() - today.getFullYear()) * 12 + (end.getMonth() - today.getMonth());
    return months > 0 ? months : 0;
  };

  const getStatusColor = (status: Leasing['status']) => {
    switch (status) {
      case 'active': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'completed': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'terminated': return 'bg-red-50 text-red-700 border-red-100';
      default: return 'bg-stone-50 text-stone-700 border-stone-100';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Gestion Leasing</h2>
            <p className="text-stone-500 italic serif">Suivi des contrats de leasing et paiements mensuels.</p>
          </div>
          <button 
            onClick={() => setIsHelpOpen(true)}
            className="p-2 bg-emerald-50 text-emerald-600 rounded-full hover:bg-emerald-100 transition-colors"
            title="Guide d'utilisation"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
        <button
          onClick={() => { setEditingLeasing(null); setIsModalOpen(true); }}
          className="flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 px-6 rounded-2xl font-semibold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20"
        >
          <Plus className="w-5 h-5" />
          Nouveau Contrat
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="text"
              placeholder="Rechercher par véhicule, fournisseur ou sous-traitant..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-stone-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="bg-stone-50 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 px-4 py-3"
            >
              <option value="all">Tous les types</option>
              <option value="company">Ma Société</option>
              <option value="subcontracted">Sous-traitance</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-stone-50/50 text-stone-400 text-[10px] font-bold uppercase tracking-widest">
                <th className="px-8 py-4">Véhicule & Fournisseur</th>
                <th className="px-8 py-4">Période</th>
                <th className="px-8 py-4">Mois Restants</th>
                <th className="px-8 py-4">Type</th>
                <th className="px-8 py-4">Mensualité</th>
                <th className="px-8 py-4">Paiements</th>
                <th className="px-8 py-4">Statut</th>
                <th className="px-8 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredLeasings.map((leasing) => {
                const vehicle = getVehicle(leasing.vehicleId);
                const payments = leasing.payments || [];
                const paidCount = payments.filter(p => p.status === 'paid').length;
                const totalCount = payments.length || 1;
                const progress = (paidCount / totalCount) * 100;
                const monthsRemaining = getMonthsRemaining(leasing.endDate);

                return (
                  <tr key={leasing.id} className="hover:bg-stone-50/50 transition-all group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center text-stone-500">
                          <Car className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-stone-900">{vehicle?.brand} {vehicle?.model}</p>
                          <p className="text-xs text-stone-500 italic serif">{leasing.provider}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2 text-sm text-stone-600">
                        <Calendar className="w-4 h-4 text-stone-400" />
                        <span>{format(new Date(leasing.startDate), 'dd MMM yyyy')} - {format(new Date(leasing.endDate), 'dd MMM yyyy')}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col">
                        <span className={clsx(
                          "font-bold text-stone-900",
                          monthsRemaining <= 3 ? "text-red-600" : "text-stone-900"
                        )}>
                          {monthsRemaining} mois
                        </span>
                        {monthsRemaining <= 3 && monthsRemaining > 0 && (
                          <span className="text-[9px] text-red-500 font-bold uppercase">Fin proche</span>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      {leasing.isSubcontracted ? (
                        <div 
                          className="flex flex-col cursor-pointer hover:text-emerald-600 transition-colors"
                          onClick={() => { setSelectedLeasing(leasing); setIsSubcontractorModalOpen(true); }}
                        >
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded text-[10px] font-bold uppercase w-fit">Sous-traitance</span>
                          <span className="text-xs font-medium mt-1">{leasing.subcontractorName}</span>
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 bg-stone-50 text-stone-600 border border-stone-100 rounded text-[10px] font-bold uppercase w-fit">Standard</span>
                      )}
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col">
                        <p className="font-bold text-stone-900">{(leasing.monthlyPayment || 0).toLocaleString()} TND</p>
                        <p className="text-[10px] text-stone-400 uppercase tracking-widest">TTC</p>
                        <p className="text-[10px] text-stone-500">HT: {((leasing.monthlyPayment / 1.19) || 0).toFixed(3)}</p>
                        {leasing.isSubcontracted && leasing.commissionAmount && (
                          <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest">+ {(leasing.commissionAmount || 0).toLocaleString()} DT Com.</p>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="w-32">
                        <div className="flex justify-between text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">
                          <span>{paidCount}/{totalCount}</span>
                          <span>{Math.round(progress)}%</span>
                        </div>
                        <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 transition-all duration-500" 
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col gap-2">
                        <span className={clsx("px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border w-fit", getStatusColor(leasing.status))}>
                          {leasing.status === 'active' ? 'En cours' : leasing.status === 'completed' ? 'Terminé' : 'Résilié'}
                        </span>
                        {(leasing.documents || []).length > 0 && (
                          <div className="flex gap-1">
                            {(leasing.documents || []).map((doc, idx) => (
                              <a 
                                key={idx}
                                href={doc.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 hover:bg-emerald-50 text-emerald-600 rounded transition-colors"
                                title={doc.name}
                              >
                                <FileText className="w-3 h-3" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button 
                          onClick={() => { setSelectedLeasing(leasing); setIsPaymentsModalOpen(true); }}
                          className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg"
                          title="Gérer les paiements"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => { setEditingLeasing(leasing); setIsModalOpen(true); }}
                          className="p-2 hover:bg-stone-100 text-stone-600 rounded-lg"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setDeleteModal({ isOpen: true, id: leasing.id! })}
                          className="p-2 hover:bg-red-50 text-red-600 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <LeasingModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          leasing={editingLeasing}
          vehicles={vehicles}
        />
      )}

      {isHelpOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-stone-100 flex items-center justify-between bg-emerald-600 text-white">
              <div className="flex items-center gap-3">
                <Info className="w-6 h-6" />
                <h3 className="text-xl font-bold">Guide: Gestion Leasing</h3>
              </div>
              <button onClick={() => setIsHelpOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-8 space-y-4 text-stone-600">
              <div className="space-y-2">
                <p className="font-bold text-stone-900">1. Types de Contrats</p>
                <p className="text-sm">• <span className="font-bold">Standard:</span> Véhicules appartenant à votre agence.</p>
                <p className="text-sm">• <span className="font-bold">Sous-traitance:</span> Véhicules gérés pour le compte de tiers (investisseurs).</p>
              </div>
              <div className="space-y-2">
                <p className="font-bold text-stone-900">2. Paiements & Commissions</p>
                <p className="text-sm">• La <span className="font-bold text-emerald-600">Commission</span> est le montant mensuel que vous gagnez sur les véhicules en sous-traitance.</p>
                <p className="text-sm">• L'<span className="font-bold">Apport</span> est le montant total versé au début du contrat.</p>
              </div>
              <div className="space-y-2">
                <p className="font-bold text-stone-900">3. Alertes</p>
                <p className="text-sm">• Le système vous notifie automatiquement <span className="font-bold text-amber-600">15 jours avant</span> chaque échéance de paiement.</p>
              </div>
            </div>
            <div className="p-8 bg-stone-50 border-t border-stone-100">
              <button
                onClick={() => setIsHelpOpen(false)}
                className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all"
              >
                J'ai compris
              </button>
            </div>
          </div>
        </div>
      )}

      {isSubcontractorModalOpen && selectedLeasing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-stone-900">Détails Sous-traitant</h3>
              <button onClick={() => setIsSubcontractorModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-stone-50 rounded-2xl">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-stone-400 shadow-sm">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Nom Complet</p>
                    <p className="font-bold text-stone-900">{selectedLeasing.subcontractorName}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-stone-50 rounded-2xl">
                    <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Téléphone</p>
                    <p className="font-bold text-stone-900">{selectedLeasing.subcontractorPhone}</p>
                  </div>
                  <div className="p-4 bg-stone-50 rounded-2xl">
                    <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Commission</p>
                    <p className="font-bold text-emerald-600">{selectedLeasing.commissionAmount?.toLocaleString()} TND</p>
                  </div>
                </div>

                <div className="p-4 bg-stone-50 rounded-2xl">
                  <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Email</p>
                  <p className="font-bold text-stone-900">{selectedLeasing.subcontractorEmail || 'Non renseigné'}</p>
                </div>
              </div>

              <button
                onClick={() => setIsSubcontractorModalOpen(false)}
                className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {isPaymentsModalOpen && selectedLeasing && (
        <LeasingPaymentsModal
          isOpen={isPaymentsModalOpen}
          onClose={() => { setIsPaymentsModalOpen(false); setSelectedLeasing(null); }}
          leasing={selectedLeasing}
          currentOffice={currentOffice}
          vehicles={vehicles}
        />
      )}

      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '' })}
        onConfirm={() => handleDelete(deleteModal.id)}
        title="Supprimer le contrat"
        message="Êtes-vous sûr de vouloir supprimer ce contrat de leasing ? Cette action est irréversible."
      />

      <GuideModal 
        isOpen={isHelpOpen} 
        onClose={() => setIsHelpOpen(false)} 
        activeTab="leasing"
      />
    </div>
  );
}

function LeasingPaymentsModal({ isOpen, onClose, leasing, currentOffice, vehicles }: { isOpen: boolean, onClose: () => void, leasing: Leasing, currentOffice: any, vehicles: any[] }) {
  const { addNotification } = useNotifications();
  const [payments, setPayments] = useState(leasing.payments);
  const [isSaving, setIsSaving] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('transfer');

  const handleUpdateStatus = async (paymentId: string, status: 'pending' | 'paid' | 'late') => {
    const updatedPayments = payments.map(p => 
      p.id === paymentId ? { ...p, status, paidDate: status === 'paid' ? new Date().toISOString() : undefined } : p
    );
    
    try {
      setIsSaving(true);
      await updateDoc(doc(db, 'leasings', leasing.id!), { payments: updatedPayments });
      setPayments(updatedPayments);
      
      // Create expense if status changed to 'paid'
      if (status === 'paid' && currentOffice) {
        const payment = payments.find(p => p.id === paymentId);
        const vehicle = vehicles.find(v => v.id === leasing.vehicleId);
        
        if (payment && payment.amount > 0) {
          const amountTTC = payment.amount;
          const amountHT = amountTTC / 1.19;
          const vatAmount = amountTTC - amountHT;

          await addDoc(collection(db, 'expenses'), {
            date: format(new Date(), 'yyyy-MM-dd'),
            type: 'leasing',
            category: 'leasing',
            description: `Paiement Leasing: ${vehicle?.brand} ${vehicle?.model} (${vehicle?.plate}) - Échéance ${format(new Date(payment.dueDate), 'dd/MM/yyyy')}`,
            amount: amountTTC,
            amountHT,
            vatAmount,
            amountTTC,
            paymentMethod: paymentMethod,
            vehicleId: leasing.vehicleId,
            officeId: currentOffice.id,
            createdBy: auth.currentUser?.uid || 'system',
            agentName: auth.currentUser?.displayName || 'Agent',
            createdAt: new Date().toISOString()
          });
        }
      }

      addNotification('success', 'Statut mis à jour', 'Le statut du paiement a été mis à jour.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leasings/${leasing.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateAmount = async (paymentId: string, amount: number) => {
    const updatedPayments = payments.map(p => 
      p.id === paymentId ? { ...p, amount } : p
    );
    
    try {
      setIsSaving(true);
      await updateDoc(doc(db, 'leasings', leasing.id!), { payments: updatedPayments });
      setPayments(updatedPayments);
      addNotification('success', 'Montant mis à jour', 'Le montant du paiement a été personnalisé.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leasings/${leasing.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
        <div className="p-8 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-stone-900">Échéancier de Paiement</h3>
            <p className="text-sm text-stone-500">Contrat: {leasing.contractNumber}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest text-right">Mode de paiement pour "Payer"</label>
              <div className="flex gap-1">
                {['cash', 'card', 'transfer'].map((m) => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m as PaymentMethod)}
                    className={clsx(
                      "px-3 py-1 rounded-lg text-[10px] font-bold uppercase border transition-all",
                      paymentMethod === m ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-stone-400 border-stone-200 hover:border-stone-300"
                    )}
                  >
                    {m === 'cash' ? 'Especes' : m === 'card' ? 'Carte' : 'Virement'}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
        
        <div className="p-8 overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-bold text-stone-400 uppercase tracking-widest border-b border-stone-100">
                <th className="pb-4">Date d'échéance</th>
                <th className="pb-4">Montant (TND)</th>
                <th className="pb-4">Statut</th>
                <th className="pb-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {payments.map((payment) => (
                <tr key={payment.id} className="group">
                  <td className="py-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-stone-400" />
                      <span className="font-medium text-stone-900">{format(new Date(payment.dueDate), 'dd MMMM yyyy', { locale: fr })}</span>
                    </div>
                  </td>
                  <td className="py-4">
                    <input
                      type="number"
                      value={payment.amount}
                      onChange={(e) => handleUpdateAmount(payment.id, Number(e.target.value))}
                      className="w-24 px-2 py-1 bg-stone-50 border-none rounded text-sm font-bold text-stone-900 focus:ring-1 focus:ring-emerald-500"
                    />
                  </td>
                  <td className="py-4">
                    <span className={clsx(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                      payment.status === 'paid' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                      payment.status === 'late' ? "bg-red-50 text-red-700 border-red-100" :
                      "bg-stone-50 text-stone-600 border-stone-100"
                    )}>
                      {payment.status === 'paid' ? 'Payé' : payment.status === 'late' ? 'En retard' : 'En attente'}
                    </span>
                  </td>
                  <td className="py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {payment.status !== 'paid' && (
                        <button
                          onClick={() => handleUpdateStatus(payment.id, 'paid')}
                          className="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                          title="Marquer comme payé"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      {payment.status === 'pending' && (
                        <button
                          onClick={() => handleUpdateStatus(payment.id, 'late')}
                          className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-all"
                          title="Marquer comme en retard"
                        >
                          <AlertCircle className="w-4 h-4" />
                        </button>
                      )}
                      {payment.status !== 'pending' && (
                        <button
                          onClick={() => handleUpdateStatus(payment.id, 'pending')}
                          className="p-1.5 hover:bg-stone-100 text-stone-400 rounded-lg transition-all"
                          title="Réinitialiser"
                        >
                          <Clock className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LeasingModal({ isOpen, onClose, leasing, vehicles }: { isOpen: boolean, onClose: () => void, leasing: Leasing | null, vehicles: Vehicle[] }) {
  const { addNotification } = useNotifications();
  const { currentOffice } = useOffice();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Leasing>>(leasing || {
    vehicleId: '',
    provider: '',
    contractNumber: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(new Date().setFullYear(new Date().getFullYear() + 3)), 'yyyy-MM-dd'),
    monthlyPayment: 0,
    totalAmount: 0,
    deposit: 0,
    status: 'active',
    isSubcontracted: false,
    subcontractorName: '',
    subcontractorPhone: '',
    subcontractorEmail: '',
    commissionAmount: 0,
    commissionType: 'monthly',
    depositType: 'total',
    payments: [],
    documents: []
  });
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const newDocs = [...(formData.documents || [])];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressed = await compressImage(file);
        newDocs.push({
          name: file.name,
          url: compressed, // In a real app, this would be a Firebase Storage URL
          type: file.type
        });
      }
      setFormData({ ...formData, documents: newDocs });
      addNotification('success', 'Téléchargé', `${files.length} document(s) ajouté(s).`);
    } catch (error) {
      console.error('Error uploading files:', error);
      addNotification('error', 'Erreur', 'Échec du téléchargement des documents.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      if (leasing?.id) {
        await updateDoc(doc(db, 'leasings', leasing.id), formData);
        addNotification('success', 'Mis à jour', 'Le contrat de leasing a été mis à jour.');
      } else {
        // Generate initial payments
        const start = new Date(formData.startDate!);
        const end = new Date(formData.endDate!);
        const months = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
        
        const payments = Array.from({ length: months }, (_, i) => {
          const dueDate = new Date(start);
          dueDate.setMonth(start.getMonth() + i);
          return {
            id: crypto.randomUUID(),
            dueDate: format(dueDate, 'yyyy-MM-dd'),
            amount: formData.monthlyPayment!,
            status: 'pending' as const
          };
        });

        const res = await addDoc(collection(db, 'leasings'), {
          ...formData,
          payments,
          createdAt: new Date().toISOString(),
          officeId: currentOffice?.id
        });
        
        // Update vehicle to link leasing
        if (formData.vehicleId) {
          await updateDoc(doc(db, 'vehicles', formData.vehicleId), {
            status: 'rented' // Or something that indicates it's in leasing
          });
        }
        
        addNotification('success', 'Créé', 'Le contrat de leasing a été créé avec succès.');
      }
      onClose();
    } catch (error) {
      handleFirestoreError(error, leasing ? OperationType.UPDATE : OperationType.CREATE, 'leasings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
        <div className="p-8 border-b border-stone-100 flex items-center justify-between">
          <h3 className="text-2xl font-bold text-stone-900">{leasing ? 'Modifier le Leasing' : 'Nouveau Contrat Leasing'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <X className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Véhicule</label>
              <select
                required
                value={formData.vehicleId || ''}
                onChange={(e) => {
                  const v = vehicles.find(veh => veh.id === e.target.value);
                  setFormData({
                    ...formData, 
                    vehicleId: e.target.value,
                    vehicleModel: v ? `${v.brand} ${v.model}` : '',
                    vehiclePlate: v?.plate || ''
                  });
                }}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Sélectionner un véhicule</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plate})</option>
                ))}
              </select>
              {formData.vehicleId && (
                <div className="mt-2 p-3 bg-emerald-50 rounded-xl border border-emerald-100 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <Car className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Détails du véhicule</span>
                  </div>
                  {(() => {
                    const v = vehicles.find(veh => veh.id === formData.vehicleId);
                    return v ? (
                      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
                        <p className="text-[10px] text-emerald-600 font-medium">Immatriculation: <span className="text-stone-900 font-bold">{v.plate}</span></p>
                        <p className="text-[10px] text-emerald-600 font-medium">Année: <span className="text-stone-900 font-bold">{v.year}</span></p>
                        <p className="text-[10px] text-emerald-600 font-medium">Type: <span className="text-stone-900 font-bold uppercase">{v.type}</span></p>
                        <p className="text-[10px] text-emerald-600 font-medium">Kilométrage: <span className="text-stone-900 font-bold">{(v.mileage || 0).toLocaleString()} KM</span></p>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Fournisseur / Banque</label>
              <input
                required
                value={formData.provider || ''}
                onChange={(e) => setFormData({...formData, provider: e.target.value})}
                placeholder="Ex: Amen Bank, Tunisie Leasing..."
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">N° de Contrat</label>
              <input
                required
                value={formData.contractNumber || ''}
                onChange={(e) => setFormData({...formData, contractNumber: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Statut</label>
              <select
                value={formData.status || 'active'}
                onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              >
                <option value="active">En cours</option>
                <option value="completed">Terminé</option>
                <option value="terminated">Résilié</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Date de début</label>
              <input
                type="date"
                required
                value={formData.startDate || ''}
                onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Date de fin</label>
              <input
                type="date"
                required
                value={formData.endDate || ''}
                onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Mensualité (TND)</label>
              <input
                type="number"
                required
                value={formData.monthlyPayment || 0}
                onChange={(e) => setFormData({...formData, monthlyPayment: parseFloat(e.target.value) || 0})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Montant Total (TND)</label>
              <input
                type="number"
                required
                value={formData.totalAmount || 0}
                onChange={(e) => setFormData({...formData, totalAmount: Number(e.target.value) || 0})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Apport / Caution (TND)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={formData.deposit || 0}
                  onChange={(e) => setFormData({...formData, deposit: Number(e.target.value) || 0})}
                  className="flex-1 px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
                <select
                  value={formData.depositType || 'total'}
                  onChange={(e) => setFormData({...formData, depositType: e.target.value as any})}
                  className="w-28 px-2 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-[10px] font-bold"
                >
                  <option value="total">Total</option>
                  <option value="monthly">Mensuel</option>
                </select>
              </div>
            </div>
          </div>

          <div className="p-6 bg-stone-50 rounded-3xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={clsx(
                  "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                  formData.isSubcontracted ? "bg-amber-100 text-amber-600" : "bg-white text-stone-400 shadow-sm"
                )}>
                  <Car className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-900">Véhicule sous-traitance (Nom du Tiers)</p>
                  <p className="text-[10px] text-stone-500 italic serif">Le véhicule appartient à un tiers.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFormData({...formData, isSubcontracted: !formData.isSubcontracted})}
                className={clsx(
                  "w-12 h-6 rounded-full transition-all relative",
                  formData.isSubcontracted ? "bg-emerald-500" : "bg-stone-200"
                )}
              >
                <div className={clsx(
                  "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                  formData.isSubcontracted ? "right-1" : "left-1"
                )} />
              </button>
            </div>

            {formData.isSubcontracted && (
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-stone-200 animate-in slide-in-from-top-2 duration-200">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Nom du Propriétaire (Sous-traitant)</label>
                  <input
                    required
                    value={formData.subcontractorName || ''}
                    onChange={(e) => setFormData({...formData, subcontractorName: e.target.value})}
                    className="w-full px-4 py-2 bg-white border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Téléphone</label>
                  <input
                    required
                    value={formData.subcontractorPhone || ''}
                    onChange={(e) => setFormData({...formData, subcontractorPhone: e.target.value})}
                    className="w-full px-4 py-2 bg-white border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Email</label>
                  <input
                    type="email"
                    value={formData.subcontractorEmail || ''}
                    onChange={(e) => setFormData({...formData, subcontractorEmail: e.target.value})}
                    className="w-full px-4 py-2 bg-white border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Commission (TND)</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={formData.commissionAmount || 0}
                      onChange={(e) => setFormData({...formData, commissionAmount: Number(e.target.value) || 0})}
                      className="flex-1 px-4 py-2 bg-white border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                    <select
                      value={formData.commissionType || 'monthly'}
                      onChange={(e) => setFormData({...formData, commissionType: e.target.value as any})}
                      className="w-24 px-2 py-2 bg-white border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-[10px] font-bold"
                    >
                      <option value="monthly">Mensuel</option>
                      <option value="total">Total</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Documents du Contrat (Scan, PDF)</label>
            <div className="flex flex-wrap gap-3">
              {formData.documents?.map((doc, index) => (
                <div key={index} className="px-4 py-2 bg-stone-50 border border-stone-100 rounded-xl flex items-center gap-3 group">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-medium text-stone-700 truncate max-w-[150px]">{doc.name}</span>
                  <button 
                    type="button"
                    onClick={() => setFormData({
                      ...formData,
                      documents: formData.documents?.filter((_, i) => i !== index)
                    })}
                    className="p-1 hover:bg-red-50 text-red-400 hover:text-red-600 rounded transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <label className="flex flex-col items-center justify-center w-32 h-24 bg-stone-50 border-2 border-dashed border-stone-200 rounded-2xl cursor-pointer hover:bg-stone-100 hover:border-emerald-300 transition-all group">
                <Upload className="w-6 h-6 text-stone-400 group-hover:text-emerald-500 mb-1" />
                <span className="text-[10px] font-bold text-stone-400 group-hover:text-emerald-600 uppercase">Ajouter</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>
            {uploading && <p className="text-xs text-emerald-600 animate-pulse font-medium">Téléchargement en cours...</p>}
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg mt-4 disabled:opacity-50"
          >
            {isSaving ? 'Enregistrement...' : (leasing ? 'Mettre à jour' : 'Créer le contrat')}
          </button>
        </form>
      </div>
    </div>
  );
}
