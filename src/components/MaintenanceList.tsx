import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, getDocs, where } from '../lib/api';
import { db, auth } from '../lib/api';
import { useOffice } from '../contexts/OfficeContext';
import { useNotifications } from './NotificationContext';
import { logActivity } from '../services/logService';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx } from 'clsx';
import { 
  Plus, Car as CarIcon, User, Clock, Calendar, 
  CheckCircle, Edit2, Trash2, X, Package, 
  DollarSign, MapPin, AlertCircle, CreditCard, TrendingUp 
} from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { Maintenance, Vehicle, PaymentMethod, Client } from '../types';
import { DeleteModal } from './DeleteModal';

const processMaintenanceSideEffects = async (maintenance: any, paidAmount: number, vehicles: Vehicle[], officeId: string, paymentMethod: PaymentMethod = 'cash') => {
  if (maintenance.status !== 'completed') return;

  try {
    const vehicle = vehicles.find(v => v.id === maintenance.vehicleId);
    
    // 1. Update vehicle status
    const vehicleUpdate: any = { 
      status: 'available'
    };

    // Synchronize vehicle mileage if maintenance mileage is higher
    if (maintenance.mileageAtService && (!vehicle?.mileage || maintenance.mileageAtService > vehicle.mileage)) {
      vehicleUpdate.mileage = maintenance.mileageAtService;
    }

    if (maintenance.type === 'oil_change' && maintenance.mileageAtService) {
      vehicleUpdate.lastOilChangeMileage = maintenance.mileageAtService;
      if (vehicle?.oilChangeInterval) {
        vehicleUpdate.nextOilChangeMileage = maintenance.mileageAtService + vehicle.oilChangeInterval;
      } else {
        vehicleUpdate.nextOilChangeMileage = maintenance.mileageAtService + 10000;
      }
    }

    if (maintenance.clientId) {
      // Record as income for the client
      await addDoc(collection(db, 'payments'), {
        officeId,
        rentalId: maintenance.id, // Linking to maintenance record as rentalId for compatibility
        clientId: maintenance.clientId,
        amount: paidAmount,
        method: paymentMethod,
        date: maintenance.date,
        type: 'income',
        category: 'maintenance',
        note: `Maintenance (${maintenance.type}) - ${vehicle?.brand || ''} ${vehicle?.model || ''}`,
        createdBy: officeId, // Fallback
        createdAt: new Date().toISOString()
      });
    }

    await updateDoc(doc(db, 'vehicles', maintenance.vehicleId), vehicleUpdate);

    // 2. Stock Deduction & History
    let stockUsageCost = 0;
    if (maintenance.parts && Array.isArray(maintenance.parts)) {
      const stockSnapshot = await getDocs(query(collection(db, 'stock'), where('officeId', '==', officeId)));
      const stockItems = stockSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

      for (const part of maintenance.parts) {
        const item = stockItems.find(i => i.id === part.itemId);
        if (item && item.quantity >= part.quantity) {
          await updateDoc(doc(db, 'stock', item.id), {
            quantity: item.quantity - part.quantity,
            totalUsed: (Number(item.totalUsed) || 0) + part.quantity,
            updatedAt: new Date().toISOString()
          });

          await addDoc(collection(db, 'stockMovements'), {
            itemId: item.id,
            itemName: item.name,
            type: 'out',
            quantity: part.quantity,
            priceTTC: part.price,
            date: new Date().toISOString(),
            reason: `Intervention (${maintenance.type}) - ${vehicle?.brand} ${vehicle?.model} (${vehicle?.plate})`,
            vehicleId: maintenance.vehicleId,
            vehiclePlate: vehicle?.plate,
            userId: auth.currentUser?.uid || '',
            userName: auth.currentUser?.displayName || 'Système',
            createdAt: new Date().toISOString(),
            officeId: officeId
          });
          stockUsageCost += part.price * part.quantity;
        }
      }
    }

    // 3. Create Expense
    const totalMaintenanceCost = (paidAmount || 0) + stockUsageCost;
    if (totalMaintenanceCost > 0 && maintenance.paymentStatus === 'paid') {
      await addDoc(collection(db, 'expenses'), {
        officeId: officeId,
        date: new Date().toISOString(),
        category: 'entretien',
        type: maintenance.type,
        description: `Maintenance (${maintenance.type}): ${vehicle?.brand} ${vehicle?.model} (${vehicle?.plate}) - ${maintenance.description}${stockUsageCost > 0 ? ` (Pièces stock: ${stockUsageCost.toFixed(3)} TND)` : ''}`,
        amount: totalMaintenanceCost,
        amountHT: totalMaintenanceCost / 1.19,
        vatAmount: totalMaintenanceCost - (totalMaintenanceCost / 1.19),
        amountTTC: totalMaintenanceCost,
        paymentMethod: paymentMethod,
        vehicleId: maintenance.vehicleId,
        maintenanceId: maintenance.id,
        createdBy: auth.currentUser?.uid || '',
        agentName: auth.currentUser?.displayName || 'Système',
        createdAt: new Date().toISOString()
      });
    }

    // 4. Log Worker Payment if any
    if (maintenance.workerPayment && maintenance.workerPayment > 0) {
      await addDoc(collection(db, 'expenses'), {
        officeId: officeId,
        date: new Date().toISOString(),
        category: 'entretien',
        type: 'maintenance_worker',
        description: `Paiement Intervenant: ${maintenance.providerName || 'Travailleur'} pour ${vehicle?.brand} ${vehicle?.model} (${vehicle?.plate})`,
        amount: maintenance.workerPayment,
        amountHT: maintenance.workerPayment,
        vatAmount: 0,
        amountTTC: maintenance.workerPayment,
        paymentMethod: paymentMethod,
        vehicleId: maintenance.vehicleId,
        maintenanceId: maintenance.id,
        createdBy: auth.currentUser?.uid || '',
        agentName: auth.currentUser?.displayName || 'Système',
        createdAt: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error("Error processing maintenance side effects:", error);
  }
};

export function MaintenanceList() {
  const { currentOffice } = useOffice();
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMaintenance, setEditingMaintenance] = useState<Maintenance | null>(null);
  const [completingMaintenance, setCompletingMaintenance] = useState<Maintenance | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id: string }>({ isOpen: false, id: '' });

  useEffect(() => {
    if (!currentOffice) return;

    let maintenancesLoaded = false;
    let vehiclesLoaded = false;

    const unsubMaintenances = onSnapshot(query(collection(db, 'maintenances'), where('officeId', '==', currentOffice.id), orderBy('date', 'desc')), (snapshot) => {
      setMaintenances(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Maintenance[]);
      maintenancesLoaded = true;
      if (vehiclesLoaded) setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'maintenances');
      maintenancesLoaded = true;
      if (vehiclesLoaded) setLoading(false);
    });
    const unsubVehicles = onSnapshot(query(collection(db, 'vehicles'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vehicle[]);
      vehiclesLoaded = true;
      if (maintenancesLoaded) setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'vehicles');
      vehiclesLoaded = true;
      if (maintenancesLoaded) setLoading(false);
    });

    const unsubClients = onSnapshot(query(collection(db, 'clients'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Client[]);
    });

    return () => {
      unsubMaintenances();
      unsubVehicles();
      unsubClients();
    };
  }, [currentOffice]);

  const getVehicle = (id: string) => vehicles.find(v => v.id === id);

  const handleComplete = async (maintenance: Maintenance, paymentStatus: 'pending' | 'paid', paidAmount: number, parkingLocation: string, method: PaymentMethod, workerPayment?: number, providerName?: string) => {
    setIsSaving(true);
    try {
      const updatedData: any = { 
        status: 'completed' as const,
        paymentStatus,
        paidAmount,
        paymentMethod: method,
        isPaid: paymentStatus === 'paid'
      };

      if (workerPayment) updatedData.workerPayment = workerPayment;
      if (providerName) updatedData.providerName = providerName;
      
      await updateDoc(doc(db, 'maintenances', maintenance.id), updatedData);
      
      const fullMaintenance = { ...maintenance, ...updatedData };
      if (currentOffice?.id) {
        await processMaintenanceSideEffects(fullMaintenance, paidAmount, vehicles, currentOffice.id, method);
      }

      // Update vehicle parking location separately
      await updateDoc(doc(db, 'vehicles', maintenance.vehicleId), { 
        parkingLocation
      });

      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'complete_maintenance', `Maintenance terminée pour ${getVehicle(maintenance.vehicleId)?.brand} ${getVehicle(maintenance.vehicleId)?.model}. Emplacement: ${parkingLocation}`, auth.currentUser.displayName || undefined);
      }
      setCompletingMaintenance(null);
    } catch (error) {
      console.error("Error completing maintenance:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setIsSaving(true);
    try {
      const maintenanceToDelete = maintenances.find(m => m.id === id);
      await deleteDoc(doc(db, 'maintenances', id));
      
      // If it was in maintenance status, set vehicle back to available
      if (maintenanceToDelete && maintenanceToDelete.vehicleId) {
        await updateDoc(doc(db, 'vehicles', maintenanceToDelete.vehicleId), {
          status: 'available'
        });
      }

      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'delete_maintenance', `Maintenance supprimée: ${id}`);
      }
      setDeleteModal({ isOpen: false, id: '' });
    } catch (error) {
      console.error("Error deleting maintenance:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Maintenance</h2>
          <p className="text-stone-500 italic serif">Suivi des entretiens et réparations de la flotte.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 px-6 rounded-2xl font-semibold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20"
        >
          <Plus className="w-5 h-5" />
          Nouvel entretien
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-stone-50/50 text-stone-400 text-xs font-bold uppercase tracking-widest">
                <th className="px-8 py-4">Véhicule</th>
                <th className="px-8 py-4">Agent</th>
                <th className="px-8 py-4">Créé le</th>
                <th className="px-8 py-4">Type & Description</th>
                <th className="px-8 py-4">Date</th>
                <th className="px-8 py-4">Coût</th>
                <th className="px-8 py-4">Paiement</th>
                <th className="px-8 py-4">Statut</th>
                <th className="px-8 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {maintenances.map((m) => (
                <tr key={m.id} className="hover:bg-stone-50/50 transition-all group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center text-stone-400">
                        <CarIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-stone-900">{getVehicle(m.vehicleId)?.brand} {getVehicle(m.vehicleId)?.model}</p>
                        <p className="text-xs text-stone-400 font-mono">{getVehicle(m.vehicleId)?.plate}</p>
                        {m.clientName && (
                          <p className="text-[10px] text-emerald-600 font-bold uppercase mt-1 flex items-center gap-1">
                            <User className="w-2.5 h-2.5" />
                            Facturé à: {m.clientName}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3 text-emerald-600" />
                      <span className="text-sm font-medium text-stone-900">{m.agentName || 'Inconnu'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    {m.createdAt && (
                      <div className="flex items-center gap-2 text-xs text-stone-400">
                        <Clock className="w-3 h-3" />
                        <span>{format(new Date(m.createdAt), 'dd/MM/yy HH:mm', { locale: fr })}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-8 py-5">
                    <p className="text-sm font-bold text-stone-900 capitalize">{m.type}</p>
                    <p className="text-xs text-stone-500 truncate max-w-xs">{m.description}</p>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2 text-sm text-stone-600">
                      <Calendar className="w-4 h-4 text-stone-400" />
                      <span>{format(new Date(m.date), 'dd MMM yyyy', { locale: fr })}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <p className="font-bold text-stone-900">{(m.cost || 0).toLocaleString()} TND</p>
                  </td>
                  <td className="px-8 py-5">
                    <span className={clsx(
                      "px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                      m.paymentStatus === 'paid' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                    )}>
                      {m.paymentStatus === 'paid' ? 'Payé' : 'En attente'}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <MaintenanceStatusBadge status={m.status} />
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      {m.status === 'scheduled' && (
                        <button 
                          onClick={() => setCompletingMaintenance(m)}
                          className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                          title="Marquer comme terminé"
                        >
                          <CheckCircle className="w-5 h-5" />
                        </button>
                      )}
                      <button 
                        onClick={() => { setEditingMaintenance(m); setIsModalOpen(true); }}
                        className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                        title="Modifier"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setDeleteModal({ isOpen: true, id: m.id })}
                        className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-all"
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
        <MaintenanceModal 
          isOpen={isModalOpen} 
          onClose={() => { setIsModalOpen(false); setEditingMaintenance(null); }} 
          vehicles={vehicles}
          clients={clients}
          maintenance={editingMaintenance}
          processMaintenanceSideEffects={processMaintenanceSideEffects}
        />
      )}

      {completingMaintenance && (
        <MaintenanceCompletionModal
          maintenance={completingMaintenance}
          onClose={() => setCompletingMaintenance(null)}
          onConfirm={(paymentStatus, paidAmount, parkingLocation, method, workerPayment, providerName) => 
            handleComplete(completingMaintenance, paymentStatus, paidAmount, parkingLocation, method, workerPayment, providerName)
          }
          vehicle={getVehicle(completingMaintenance.vehicleId)}
          isSaving={isSaving}
        />
      )}

      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '' })}
        onConfirm={() => handleDelete(deleteModal.id)}
        title="Supprimer la maintenance"
        message="Êtes-vous sûr de vouloir supprimer cet enregistrement de maintenance ? Cette action est irréversible."
      />
    </div>
  );
}

function MaintenanceStatusBadge({ status }: { status: Maintenance['status'] }) {
  const styles = {
    scheduled: "bg-emerald-50 text-emerald-700 border-emerald-100",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-100",
    cancelled: "bg-red-50 text-red-700 border-red-100"
  };
  const labels = {
    scheduled: "Planifié",
    completed: "Terminé",
    cancelled: "Annulé"
  };
  const icons = {
    scheduled: Clock,
    completed: CheckCircle,
    cancelled: AlertCircle
  };
  const Icon = icons[status];

  return (
    <span className={clsx("px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 w-fit", styles[status])}>
      <Icon className="w-3 h-3" />
      {labels[status]}
    </span>
  );
}

function MaintenanceModal({ isOpen, onClose, vehicles, clients, maintenance, processMaintenanceSideEffects }: { isOpen: boolean, onClose: () => void, vehicles: Vehicle[], clients: Client[], maintenance: Maintenance | null, processMaintenanceSideEffects: any }) {
  const { currentOffice } = useOffice();
  const [isSaving, setIsSaving] = useState(false);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    vehicleId: maintenance?.vehicleId || '',
    clientId: maintenance?.clientId || '',
    clientName: maintenance?.clientName || '',
    clientEmail: maintenance?.clientEmail || '',
    type: maintenance?.type || 'oil_change' as Maintenance['type'],
    status: maintenance?.status || 'scheduled' as Maintenance['status'],
    description: maintenance?.description || '',
    date: maintenance?.date || format(new Date(), 'yyyy-MM-dd'),
    cost: maintenance?.cost || 0,
    mileageAtService: maintenance?.mileageAtService || 0,
    isPaid: maintenance?.isPaid || false,
    paymentMethod: (maintenance?.paymentMethod as PaymentMethod) || 'cash',
    parts: maintenance?.parts || [] as { itemId: string, itemName: string, quantity: number, price: number }[],
    paymentStatus: maintenance?.paymentStatus || 'pending' as 'pending' | 'paid',
    paidAmount: maintenance?.paidAmount || 0
  });

  const addPart = (itemId: string) => {
    if (!itemId) return;
    const item = stockItems.find(i => i.id === itemId);
    if (!item) return;

    const existingIndex = formData.parts.findIndex(p => p.itemId === itemId);
    if (existingIndex >= 0) {
      const newParts = [...formData.parts];
      newParts[existingIndex].quantity += 1;
      setFormData({ ...formData, parts: newParts });
    } else {
      setFormData({
        ...formData,
        parts: [...formData.parts, {
          itemId: item.id,
          itemName: item.name,
          quantity: 1,
          price: item.priceTTC || 0
        }]
      });
    }
  };

  const removePart = (index: number) => {
    const newParts = [...formData.parts];
    newParts.splice(index, 1);
    setFormData({ ...formData, parts: newParts });
  };

  const updatePartQuantity = (index: number, qty: number) => {
    const newParts = [...formData.parts];
    newParts[index].quantity = Math.max(0.1, qty);
    setFormData({ ...formData, parts: newParts });
  };

  const totalPartsCost = formData.parts.reduce((acc, part) => acc + (part.price * part.quantity), 0);
  const totalCost = formData.cost + totalPartsCost;

  const handleClose = () => {
    onClose();
  };

  useEffect(() => {
    if (!currentOffice) return;
    const fetchStock = async () => {
      const q = query(collection(db, 'stock'), where('officeId', '==', currentOffice.id));
      const snapshot = await getDocs(q);
      setStockItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchStock();
  }, [currentOffice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.vehicleId) return;

    try {
      setIsSaving(true);
      const isNewlyCompleted = formData.status === 'completed' && (!maintenance || maintenance.status !== 'completed');
      
      if (maintenance) {
        await updateDoc(doc(db, 'maintenances', maintenance.id), formData);
        if (isNewlyCompleted && currentOffice?.id) {
          await processMaintenanceSideEffects(formData, formData.paidAmount || totalCost, vehicles, currentOffice.id, formData.paymentMethod);
        }
        if (auth.currentUser) {
          logActivity(auth.currentUser.uid, 'update_maintenance', `Maintenance modifiée pour ${vehicles.find(v => v.id === formData.vehicleId)?.brand}`, auth.currentUser.displayName || undefined);
        }
      } else {
        const docData = {
          ...formData,
          agentName: auth.currentUser?.displayName || 'Agent',
          createdAt: new Date().toISOString(),
          officeId: currentOffice?.id
        };
        const docRef = await addDoc(collection(db, 'maintenances'), docData);
        
        if (formData.status === 'completed' && currentOffice?.id) {
          await processMaintenanceSideEffects({ ...docData, id: docRef.id }, formData.paidAmount || totalCost, vehicles, currentOffice.id, formData.paymentMethod);
        } else {
          // If just scheduled, set vehicle status to maintenance
          await updateDoc(doc(db, 'vehicles', formData.vehicleId), { status: 'maintenance' });
        }
        
        if (auth.currentUser) {
          logActivity(auth.currentUser.uid, 'add_maintenance', `Nouvelle maintenance ${formData.status} pour ${vehicles.find(v => v.id === formData.vehicleId)?.brand}`, auth.currentUser.displayName || undefined);
        }
      }
      onClose();
    } catch (error) {
      console.error("Error saving maintenance:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 resizable-modal" onClick={e => e.stopPropagation()}>
        <div className="p-8 border-b border-stone-100 flex items-center justify-between">
          <h3 className="text-2xl font-bold text-stone-900">{maintenance ? 'Modifier l\'entretien' : 'Nouvel Entretien'}</h3>
          <button onClick={handleClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <X className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-6 max-h-[80vh] overflow-y-auto">
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Client (Facultatif - Pour facturation)</label>
            <select
              value={formData.clientId}
              onChange={(e) => {
                const client = clients.find(c => c.id === e.target.value);
                setFormData({
                  ...formData,
                  clientId: e.target.value,
                  clientName: client?.name || '',
                  clientEmail: client?.email || ''
                });
              }}
              className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Sélectionner un client</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Véhicule</label>
            <select
              required
              disabled={!!maintenance}
              value={formData.vehicleId}
              onChange={(e) => setFormData({...formData, vehicleId: e.target.value})}
              className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            >
              <option value="">Sélectionner un véhicule</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plate})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Type</label>
              <select
                required
                value={formData.type}
                onChange={(e) => setFormData({...formData, type: e.target.value as Maintenance['type']})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              >
                <option value="oil_change">Vidange</option>
                <option value="tire_change">Pneus</option>
                <option value="brake_service">Freins</option>
                <option value="inspection">Contrôle Technique</option>
                <option value="repair">Réparation</option>
                <option value="other">Autre</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Statut</label>
              <select
                required
                value={formData.status}
                onChange={(e) => setFormData({...formData, status: e.target.value as Maintenance['status']})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold"
              >
                <option value="scheduled">Planifié</option>
                <option value="completed">Terminé</option>
                <option value="cancelled">Annulé</option>
              </select>
            </div>
            <div className="space-y-2 col-span-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Date</label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Description</label>
            <textarea
              required
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 h-24 resize-none"
              placeholder="Détails de l'intervention..."
            />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Coût (TND)</label>
              <input
                type="number"
                required
                value={formData.cost}
                onChange={(e) => setFormData({...formData, cost: Number(e.target.value)})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Kilométrage</label>
              <input
                type="number"
                required
                value={formData.mileageAtService}
                onChange={(e) => setFormData({...formData, mileageAtService: Number(e.target.value)})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="p-6 bg-stone-50 rounded-3xl border border-stone-100 space-y-4">
            <h4 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-stone-400" />
              Articles du Stock (Pièces, Huile, Filtres)
            </h4>
            
            <div className="space-y-4">
              <div className="flex gap-2">
                <select
                  onChange={(e) => {
                    addPart(e.target.value);
                    e.target.value = "";
                  }}
                  className="flex-1 px-4 py-3 bg-white border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Ajouter un article du stock...</option>
                  <optgroup label="Huiles">
                    {stockItems.filter(i => i.category === 'huiles' || i.unit === 'L').map(i => (
                      <option key={i.id} value={i.id}>{i.name} ({i.quantity} L dispo)</option>
                    ))}
                  </optgroup>
                  <optgroup label="Filtres & Pièces">
                    {stockItems.filter(i => i.category !== 'huiles' && i.unit !== 'L').map(i => (
                      <option key={i.id} value={i.id}>{i.name} ({i.quantity} {i.unit} dispo)</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {formData.parts.length > 0 && (
                <div className="space-y-2 border-t border-stone-200 pt-4">
                  {formData.parts.map((part, index) => (
                    <div key={index} className="flex items-center justify-between gap-4 p-3 bg-white rounded-xl shadow-sm border border-stone-100">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-stone-900 truncate">{part.itemName}</p>
                        <p className="text-xs text-stone-400">{(part.price || 0).toFixed(3)} TND / unité</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={part.quantity}
                          onChange={(e) => updatePartQuantity(index, parseFloat(e.target.value) || 0)}
                          className="w-16 px-2 py-1 bg-stone-50 border border-stone-200 rounded text-center text-sm font-bold"
                        />
                        <button 
                          type="button"
                          onClick={() => removePart(index)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between items-center px-4 py-2 bg-emerald-50 rounded-xl mt-2 border border-emerald-100">
                    <span className="text-xs font-bold text-emerald-800 uppercase tracking-widest">Total Pièces</span>
                    <span className="font-bold text-emerald-900">{totalPartsCost.toFixed(3)} TND</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 pt-4 border-t border-stone-100">
            <div className="flex items-center justify-between col-span-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isPaid"
                  checked={formData.isPaid}
                  onChange={(e) => setFormData({
                    ...formData, 
                    isPaid: e.target.checked, 
                    paymentStatus: e.target.checked ? 'paid' : 'pending',
                    paidAmount: e.target.checked ? totalCost : formData.paidAmount
                  })}
                  className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                />
                <label htmlFor="isPaid" className="text-sm font-bold text-stone-700 cursor-pointer">Marquer comme payé</label>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Total Coût (MO + Pièces)</p>
                <p className="text-xl font-black text-stone-900">{totalCost.toFixed(3)} TND</p>
              </div>
            </div>
          </div>
          {formData.status === 'completed' && (
            <div className="space-y-2 border-t border-stone-100 pt-4">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Mode de Paiement</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'cash', label: 'Espèces' },
                  { id: 'card', label: 'Carte' },
                  { id: 'transfer', label: 'Virement' }
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setFormData({...formData, paymentMethod: m.id as PaymentMethod})}
                    className={clsx(
                      "py-2 px-1 rounded-xl border-2 text-[10px] font-bold uppercase transition-all",
                      formData.paymentMethod === m.id ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-stone-50 text-stone-400 hover:border-stone-100 bg-stone-50"
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all disabled:opacity-50"
          >
            {isSaving ? 'Enregistrement...' : (maintenance ? 'Mettre à jour' : 'Enregistrer l\'entretien')}
          </button>
        </form>
      </div>
    </div>
  );
}

function MaintenanceCompletionModal({ maintenance, onClose, onConfirm, vehicle, isSaving }: { 
  maintenance: Maintenance, 
  onClose: () => void, 
  onConfirm: (paymentStatus: 'pending' | 'paid', paidAmount: number, parkingLocation: string, method: PaymentMethod, workerPayment?: number, providerName?: string) => void,
  vehicle?: Vehicle,
  isSaving: boolean
}) {
  const totalCostIncludingParts = maintenance.cost + (maintenance.parts?.reduce((acc, p) => acc + (p.price * p.quantity), 0) || 0);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid'>('paid');
  const [paidAmount, setPaidAmount] = useState(totalCostIncludingParts);
  const [parkingLocation, setParkingLocation] = useState(vehicle?.parkingLocation || '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [workerPayment, setWorkerPayment] = useState(0);
  const [providerName, setProviderName] = useState('');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-md">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 space-y-6 animate-in fade-in zoom-in duration-200 overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-stone-900">Terminer la Maintenance</h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
            <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">Véhicule</p>
            <p className="font-bold text-emerald-900">{vehicle?.brand} {vehicle?.model} ({vehicle?.plate})</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Statut du Paiement Garage/Fournisseur</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setPaymentStatus('paid'); setPaidAmount(totalCostIncludingParts); }}
                className={clsx(
                  "py-3 px-4 rounded-xl font-bold text-sm transition-all border-2",
                  paymentStatus === 'paid' ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-stone-600 border-stone-100 hover:border-emerald-200"
                )}
              >
                Tout Payé
              </button>
              <button
                onClick={() => setPaymentStatus('pending')}
                className={clsx(
                  "py-3 px-4 rounded-xl font-bold text-sm transition-all border-2",
                  paymentStatus === 'pending' ? "bg-amber-500 text-white border-amber-500" : "bg-white text-stone-600 border-stone-100 hover:border-amber-200"
                )}
              >
                En attente
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
              <DollarSign className="w-3 h-3" /> Montant Réglé au Garage (TND)
            </label>
            <input
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(Number(e.target.value))}
              className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[10px] text-stone-400">Total estimé avec pièces: {totalCostIncludingParts.toFixed(3)} TND</p>
          </div>

          {paymentStatus === 'paid' && (
            <div className="space-y-4">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest px-1">Mode de Paiement</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'cash', label: 'Espèces', icon: DollarSign },
                  { id: 'card', label: 'Carte', icon: CreditCard },
                  { id: 'transfer', label: 'Virement', icon: TrendingUp }
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id as PaymentMethod)}
                    className={clsx(
                      "flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all",
                      paymentMethod === m.id ? "border-emerald-600 bg-emerald-50 text-emerald-600" : "border-stone-100 text-stone-400 hover:border-stone-200"
                    )}
                  >
                    <m.icon className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-stone-100 space-y-4">
            <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em]">Paiement Main d'œuvre / Travailleur</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Nom/Intervenant</label>
                <input
                  value={providerName}
                  onChange={(e) => setProviderName(e.target.value)}
                  placeholder="Nom du mécanicien..."
                  className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Montant / Avance (TND)</label>
                <input
                  type="number"
                  value={workerPayment}
                  onChange={(e) => setWorkerPayment(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            {workerPayment > 0 && (
              <p className="text-[10px] text-amber-600 italic">Ce montant sera enregistré comme dépense de type 'Salaire'.</p>
            )}
          </div>

          <div className="space-y-2 pt-4 border-t border-stone-100">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
              <MapPin className="w-3 h-3" /> Emplacement Final de Parking
            </label>
            <input
              value={parkingLocation}
              onChange={(e) => setParkingLocation(e.target.value)}
              placeholder="Ex: Parking A, Garage Central..."
              className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <button
          onClick={() => onConfirm(paymentStatus, paidAmount, parkingLocation, paymentMethod, workerPayment, providerName)}
          disabled={isSaving}
          className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg disabled:opacity-50"
        >
          {isSaving ? 'Traitement...' : 'Confirmer & Rendre Disponible'}
        </button>
      </div>
    </div>
  );
}
