import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, onSnapshot, query, where } from '../lib/api';
import { db, auth } from '../lib/api';
import { Vehicle, VehicleType, VehicleStatus } from '../types';
import { Plus, Search, MoreVertical, Trash2, Edit2, Filter, X, Check, AlertTriangle, Clock, Calendar, Globe, PenTool, Info, CheckCircle2, XCircle, ArrowLeftRight, Droplets, User, Building2, History, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx } from 'clsx';
import { logActivity } from '../services/logService';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { DeleteModal } from './DeleteModal';
import { useNotifications } from './NotificationContext';
import { useOffice } from '../contexts/OfficeContext';

import { ImageUpload } from './ImageUpload';

interface VehicleListProps {
  setActiveTab?: (tab: any) => void;
}

export function VehicleList({ setActiveTab }: VehicleListProps) {
  const { currentOffice, offices } = useOffice();
  const { addNotification } = useNotifications();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'company' | 'subcontracted'>('all');
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id: string }>({ isOpen: false, id: '' });
  const [transferModal, setTransferModal] = useState<{ isOpen: boolean, vehicle: Vehicle | null, targetOfficeId?: string }>({ isOpen: false, vehicle: null });
  const [sortConfig, setSortConfig] = useState<{ key: keyof Vehicle | 'brandModel', direction: 'asc' | 'desc' }>({ key: 'brand', direction: 'asc' });
  const [mileageHistoryVehicle, setMileageHistoryVehicle] = useState<Vehicle | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedVehicleHistory, setSelectedVehicleHistory] = useState<Vehicle | null>(null);

  useEffect(() => {
    if (!currentOffice) return;

    const q = query(collection(db, 'vehicles'), where('officeId', '==', currentOffice.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const vehicleData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Vehicle[];
      setVehicles(vehicleData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'vehicles');
    });
    return () => unsubscribe();
  }, [currentOffice]);

  const handleUpdateStatus = async (id: string, status: VehicleStatus) => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'vehicles', id), { status });
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'update_vehicle_status', `Statut mis à jour: ${status}`, auth.currentUser.displayName || undefined);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `vehicles/${id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTransfer = async (vehicle: Vehicle, targetOfficeId: string) => {
    if (!currentOffice) return;
    const targetOffice = offices.find(o => o.id === targetOfficeId);
    if (!targetOffice) return;
    
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'vehicles', vehicle.id), { officeId: targetOfficeId });
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'transfer_vehicle', `Véhicule transféré vers ${targetOffice.name}: ${vehicle.brand} ${vehicle.model}`, auth.currentUser.displayName || undefined);
      }
      addNotification('success', 'Transfert réussi', `Le véhicule a été transféré vers ${targetOffice.name}.`);
      setTransferModal({ isOpen: false, vehicle: null });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `vehicles/${vehicle.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredVehicles = vehicles.filter(v => {
    const matchesSearch = v.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.plate.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesOwnership = ownershipFilter === 'all' || 
      (ownershipFilter === 'company' && !v.isSubcontracted) ||
      (ownershipFilter === 'subcontracted' && v.isSubcontracted);
    
    return matchesSearch && matchesOwnership;
  });

  const sortedVehicles = [...filteredVehicles].sort((a, b) => {
    let aValue: any = a[sortConfig.key as keyof Vehicle];
    let bValue: any = b[sortConfig.key as keyof Vehicle];

    if (sortConfig.key === 'brandModel') {
      aValue = `${a.brand} ${a.model}`.toLowerCase();
      bValue = `${b.brand} ${b.model}`.toLowerCase();
    } else if (typeof aValue === 'string') {
      aValue = aValue.toLowerCase();
      bValue = bValue.toLowerCase();
    }

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (key: keyof Vehicle | 'brandModel') => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleDelete = async (id: string) => {
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, 'vehicles', id));
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'delete_vehicle', `Véhicule supprimé: ${id}`, auth.currentUser.displayName || undefined);
      }
      setDeleteModal({ isOpen: false, id: '' });
      addNotification('success', 'Suppression réussie', 'Le véhicule a été supprimé.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `vehicles/${id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseModal = (closeFn: () => void) => {
    closeFn();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Véhicules</h2>
            <p className="text-stone-500 italic serif">Gérez votre flotte automobile en temps réel.</p>
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
          onClick={() => { setEditingVehicle(null); setIsModalOpen(true); }}
          className="flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 px-6 rounded-2xl font-semibold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20"
        >
          <Plus className="w-5 h-5" />
          Ajouter un véhicule
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-100 flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="text"
              placeholder="Rechercher par marque, modèle ou plaque..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all"
            />
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <select
              value={ownershipFilter}
              onChange={(e) => setOwnershipFilter(e.target.value as any)}
              className="px-4 py-2 bg-stone-50 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Tous les véhicules</option>
              <option value="company">Ma Société</option>
              <option value="subcontracted">Sous-traitance</option>
            </select>
            <button className="p-3 hover:bg-stone-100 rounded-xl text-stone-500 transition-all">
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-stone-50/50 text-stone-400 text-xs font-bold uppercase tracking-widest">
                <th 
                  className="px-8 py-4 cursor-pointer hover:text-emerald-600 transition-colors"
                  onClick={() => handleSort('brandModel')}
                >
                  <div className="flex items-center gap-2">
                    Véhicule
                    {sortConfig.key === 'brandModel' && (
                      <span className="text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-8 py-4">Catégorie</th>
                <th className="px-8 py-4">Agent</th>
                <th 
                  className="px-8 py-4 cursor-pointer hover:text-emerald-600 transition-colors"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center gap-2">
                    Statut
                    {sortConfig.key === 'status' && (
                      <span className="text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-8 py-4">Lavage</th>
                <th className="px-8 py-4">Ajouté le</th>
                <th className="px-8 py-4">Emplacement</th>
                <th 
                  className="px-8 py-4 cursor-pointer hover:text-emerald-600 transition-colors"
                  onClick={() => handleSort('pricePerDay')}
                >
                  <div className="flex items-center gap-2">
                    Prix / Jour (TTC)
                    {sortConfig.key === 'pricePerDay' && (
                      <span className="text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-8 py-4">Carburant</th>
                <th 
                  className="px-8 py-4 cursor-pointer hover:text-emerald-600 transition-colors"
                  onClick={() => handleSort('mileage')}
                >
                  <div className="flex items-center gap-2">
                    Kilométrage
                    {sortConfig.key === 'mileage' && (
                      <span className="text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-8 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {sortedVehicles.map((vehicle) => (
                <tr key={vehicle.id} className="hover:bg-stone-50/50 transition-all group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-stone-100 rounded-xl flex items-center justify-center text-stone-500 font-bold">
                        {vehicle.brand ? vehicle.brand[0] : '?'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-stone-900">{vehicle.brand} {vehicle.model}</p>
                          {vehicle.color && (
                            <span className="text-[10px] text-stone-400 font-medium italic">({vehicle.color})</span>
                          )}
                          {vehicle.isSubcontracted && (
                            <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">
                              Sous-traitance
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-400 font-mono">{vehicle.plate}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="text-sm text-stone-600 capitalize">{vehicle.type}</span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3 text-emerald-600" />
                      <span className="text-sm font-medium text-stone-900">{vehicle.agentName || 'Inconnu'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <StatusBadge status={vehicle.status} />
                  </td>
                  <td className="px-8 py-5">
                    <WashStatusBadge status={vehicle.washStatus} lastWashDate={vehicle.lastWashDate} />
                  </td>
                  <td className="px-8 py-5">
                    {vehicle.createdAt && (
                      <div className="flex items-center gap-2 text-xs text-stone-400">
                        <Clock className="w-3 h-3" />
                        <span>{format(new Date(vehicle.createdAt), 'dd/MM/yy HH:mm', { locale: fr })}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-8 py-5">
                    <p className="text-sm text-stone-600 italic">{vehicle.parkingLocation || 'Non spécifié'}</p>
                  </td>
                  <td className="px-8 py-5">
                    <p className="font-bold text-stone-900">{vehicle.pricePerDay} TND</p>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 w-12 bg-stone-100 rounded-full overflow-hidden">
                        <div 
                          className={clsx(
                            "h-full transition-all",
                            (vehicle.fuelLevel || 0) > 50 ? "bg-emerald-500" : (vehicle.fuelLevel || 0) > 20 ? "bg-amber-500" : "bg-red-500"
                          )}
                          style={{ width: `${vehicle.fuelLevel || 0}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-stone-500">{vehicle.fuelLevel || 0}%</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <p className="text-sm text-stone-600">{(vehicle.mileage || 0).toLocaleString()} km</p>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button 
                        onClick={() => handleUpdateStatus(vehicle.id, 'available')}
                        className={clsx(
                          "p-2 rounded-lg transition-all",
                          vehicle.status === 'available' ? "bg-emerald-100 text-emerald-600" : "hover:bg-emerald-50 text-emerald-400"
                        )}
                        title="Marquer comme Disponible"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleUpdateStatus(vehicle.id, 'occupied')}
                        className={clsx(
                          "p-2 rounded-lg transition-all",
                          vehicle.status === 'occupied' ? "bg-emerald-100 text-emerald-600" : "hover:bg-emerald-50 text-emerald-400"
                        )}
                        title="Marquer comme Occupé"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setTransferModal({ isOpen: true, vehicle })}
                        className="p-2 hover:bg-amber-50 text-amber-600 rounded-lg transition-all"
                        title="Transférer vers l'autre bureau"
                      >
                        <ArrowLeftRight className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => { setSelectedVehicleHistory(vehicle); setIsHistoryOpen(true); }}
                        className="p-2 hover:bg-stone-100 text-stone-600 rounded-lg transition-all"
                        title="Historique Complet"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => { setEditingVehicle(vehicle); setIsModalOpen(true); }}
                        className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setDeleteModal({ isOpen: true, id: vehicle.id })}
                        className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {setActiveTab && (
                        <button 
                          onClick={() => setActiveTab('gps')}
                          className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                          title="Configuration GPS"
                        >
                          <Globe className="w-4 h-4" />
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

      {isHistoryOpen && selectedVehicleHistory && (
        <VehicleHistoryModal
          vehicle={selectedVehicleHistory}
          onClose={() => setIsHistoryOpen(false)}
        />
      )}

      {isModalOpen && (
        <VehicleModal 
          isOpen={isModalOpen} 
          onClose={isModalOpen ? () => setIsModalOpen(false) : undefined as any} 
          onCloseWithConfirm={() => handleCloseModal(() => setIsModalOpen(false))}
          vehicle={editingVehicle}
          vehicles={vehicles}
        />
      )}

      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '' })}
        onConfirm={() => handleDelete(deleteModal.id)}
        title="Supprimer le véhicule"
        message="Êtes-vous sûr de vouloir supprimer ce véhicule ? Cette action supprimera également tout l'historique associé."
      />

      {transferModal.isOpen && transferModal.vehicle && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-8">
              <div className="w-20 h-20 bg-amber-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                <ArrowLeftRight className="w-10 h-10 text-amber-600" />
              </div>
              <h3 className="text-2xl font-bold text-stone-900 mb-2 text-center">Transférer le véhicule</h3>
              <p className="text-stone-500 italic serif mb-8 text-center">
                Sélectionnez le bureau de destination pour <span className="font-bold text-stone-900">{transferModal.vehicle.brand} {transferModal.vehicle.model}</span>.
              </p>
              
              <div className="space-y-3 mb-8 mt-6">
                {offices.filter(o => o.id !== currentOffice?.id).map(office => (
                  <button
                    key={office.id}
                    onClick={() => setTransferModal({ ...transferModal, targetOfficeId: office.id })}
                    className={clsx(
                      "w-full p-4 rounded-2xl border-2 transition-all flex items-center justify-between group",
                      transferModal.targetOfficeId === office.id 
                        ? "border-emerald-500 bg-emerald-50" 
                        : "border-stone-100 hover:border-emerald-200 bg-stone-50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                        transferModal.targetOfficeId === office.id ? "bg-emerald-100 text-emerald-600" : "bg-white text-stone-400 group-hover:text-emerald-500"
                      )}>
                        <Building2 className="w-5 h-5" />
                      </div>
                      <span className={clsx(
                        "font-bold transition-colors",
                        transferModal.targetOfficeId === office.id ? "text-emerald-900" : "text-stone-600"
                      )}>
                        {office.name}
                      </span>
                    </div>
                    {transferModal.targetOfficeId === office.id && (
                      <Check className="w-5 h-5 text-emerald-600" />
                    )}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setTransferModal({ isOpen: false, vehicle: null })}
                  className="py-4 bg-stone-100 text-stone-600 rounded-2xl font-bold hover:bg-stone-200 transition-all"
                >
                  Annuler
                </button>
                <button
                  onClick={() => transferModal.vehicle && transferModal.targetOfficeId && handleTransfer(transferModal.vehicle, transferModal.targetOfficeId)}
                  disabled={isSaving || !transferModal.targetOfficeId}
                  className="py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg disabled:opacity-50"
                >
                  {isSaving ? 'Transfert...' : 'Confirmer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {mileageHistoryVehicle && (
        <VehicleHistoryModal
          vehicle={mileageHistoryVehicle}
          onClose={() => setMileageHistoryVehicle(null)}
        />
      )}

      {isHelpOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-stone-100 flex items-center justify-between bg-emerald-600 text-white">
              <div className="flex items-center gap-3">
                <Info className="w-6 h-6" />
                <h3 className="text-xl font-bold">Guide: Gestion de Flotte</h3>
              </div>
              <button onClick={() => setIsHelpOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-8 space-y-4 text-stone-600">
              <div className="space-y-2">
                <p className="font-bold text-stone-900">1. États des Véhicules</p>
                <p className="text-sm">• <span className="font-bold text-emerald-600">Disponible:</span> Prêt pour une location.</p>
                <p className="text-sm">• <span className="font-bold text-emerald-600">Loué:</span> Actuellement en contrat.</p>
                <p className="text-sm">• <span className="font-bold text-amber-600">Réservé:</span> Bloqué pour un futur contrat.</p>
                <p className="text-sm">• <span className="font-bold text-red-600">Maintenance:</span> En réparation ou entretien.</p>
              </div>
              <div className="space-y-2">
                <p className="font-bold text-stone-900">2. Maintenance</p>
                <p className="text-sm">Le système suit automatiquement les entretiens à venir en fonction du kilométrage ou de la date.</p>
              </div>
            </div>
            <div className="p-8 bg-stone-50 border-t border-stone-100">
              <button
                onClick={() => setIsHelpOpen(false)}
                className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VehicleHistoryModal({ vehicle, onClose }: { vehicle: Vehicle, onClose: () => void }) {
  const [rentals, setRentals] = useState<any[]>([]);
  const [maintenances, setMaintenances] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeHistoryTab, setActiveHistoryTab] = useState<'all' | 'rentals' | 'maintenance' | 'expenses'>('all');

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const [rentalsSnap, maintenanceSnap, expensesSnap] = await Promise.all([
          getDocs(query(collection(db, 'rentals'), where('vehicleId', '==', vehicle.id))),
          getDocs(query(collection(db, 'maintenances'), where('vehicleId', '==', vehicle.id))),
          getDocs(query(collection(db, 'expenses'), where('vehicleId', '==', vehicle.id)))
        ]);

        setRentals(rentalsSnap.docs.map(d => ({ id: d.id, ...d.data(), type: 'rental' })));
        setMaintenances(maintenanceSnap.docs.map(d => ({ id: d.id, ...d.data(), type: 'maintenance' })));
        setExpenses(expensesSnap.docs.map(d => ({ id: d.id, ...d.data(), type: 'expense' })));
      } catch (error) {
        console.error("Error fetching history:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [vehicle.id]);

  const allHistory = [...rentals, ...maintenances, ...expenses].sort((a, b) => 
    new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime()
  );

  const filteredHistory = activeHistoryTab === 'all' 
    ? allHistory 
    : allHistory.filter(item => item.type === activeHistoryTab);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="p-8 border-b border-stone-100 flex items-center justify-between shrink-0 bg-stone-50">
          <div>
            <h3 className="text-2xl font-bold text-stone-900">Historique Complet</h3>
            <p className="text-stone-500 italic serif">{vehicle.brand} {vehicle.model} - {vehicle.plate}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full text-stone-400">
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        <div className="px-8 py-4 border-b border-stone-100 flex gap-2 overflow-x-auto scrollbar-hide shrink-0">
          {[
            { id: 'all', label: 'Tout', icon: History },
            { id: 'rentals', label: 'Locations', icon: Calendar },
            { id: 'maintenance', label: 'Entretien', icon: PenTool },
            { id: 'expenses', label: 'Dépenses', icon: ArrowLeftRight }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveHistoryTab(tab.id as any)}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0",
                activeHistoryTab === tab.id 
                  ? "bg-stone-900 text-white shadow-lg" 
                  : "bg-white text-stone-500 hover:bg-stone-50 border border-stone-100"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-white">
          {loading ? (
            <div className="flex justify-center p-12">
              <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-20 grayscale opacity-50">
              <History className="w-16 h-16 mx-auto mb-4 text-stone-300" />
              <p className="text-stone-500 italic serif">Aucun historique trouvé pour cette sélection.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredHistory.map((item) => (
                <div key={item.id} className="relative pl-8 before:absolute before:left-0 before:top-4 before:bottom-0 before:w-px before:bg-stone-100 last:before:hidden">
                  <div className={clsx(
                    "absolute left-[-4px] top-4 w-2 h-2 rounded-full",
                    item.type === 'rental' ? "bg-emerald-500" : item.type === 'maintenance' ? "bg-amber-500" : "bg-red-500"
                  )} />
                  <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100 hover:border-emerald-200 transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className={clsx(
                          "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                          item.type === 'rental' ? "bg-emerald-100 text-emerald-700" : item.type === 'maintenance' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                        )}>
                          {item.type === 'rental' ? 'Location' : item.type === 'maintenance' ? 'Entretien' : 'Dépense'}
                        </span>
                        <h4 className="text-lg font-bold text-stone-900 mt-1">
                          {item.type === 'rental' ? (item.clientName || 'Contrat Client') : item.description || item.type}
                        </h4>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-stone-900">
                          {item.totalAmount || item.amount || item.totalCost || 0} TND
                        </p>
                        <p className="text-[10px] text-stone-400 font-mono">
                          {format(new Date(item.date || item.createdAt), 'dd MMMM yyyy', { locale: fr })}
                        </p>
                      </div>
                    </div>
                    {item.type === 'rental' && (
                      <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-stone-200/50 text-xs">
                        <div>
                          <p className="text-stone-400 uppercase font-bold tracking-tighter">Distance</p>
                          <p className="font-bold text-stone-600">{(item.returnMileage || item.departureMileage) ? ((item.returnMileage || 0) - (item.departureMileage || 0)) : 0} KM</p>
                        </div>
                        <div>
                          <p className="text-stone-400 uppercase font-bold tracking-tighter">Durée</p>
                          <p className="font-bold text-stone-600">{item.days || 0} Jours</p>
                        </div>
                        <div>
                          <p className="text-stone-400 uppercase font-bold tracking-tighter">Ref</p>
                          <p className="font-bold text-stone-600">{item.contractNumber || item.id.slice(-6)}</p>
                        </div>
                      </div>
                    )}
                    {item.type === 'maintenance' && (
                      <div className="mt-4 pt-4 border-t border-stone-200/50 flex items-center justify-between">
                        <p className="text-xs text-stone-600">
                          <span className="font-bold">Intervenant:</span> {item.providerName || 'N/A'}
                        </p>
                        <span className={clsx(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full",
                          item.status === 'completed' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                        )}>
                          {item.status === 'completed' ? 'Terminé' : 'En cours'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-8 bg-stone-50 border-t border-stone-100 shrink-0">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-stone-200">
            <div className="flex gap-8">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Total Revenus</p>
                <h4 className="text-lg font-black text-emerald-600">
                  {rentals.reduce((sum, r) => sum + (r.totalAmount || 0), 0).toLocaleString()} TND
                </h4>
              </div>
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Total Coûts</p>
                <h4 className="text-lg font-black text-red-600">
                  {(maintenances.reduce((sum, m) => sum + (m.totalCost || 0), 0) + expenses.reduce((sum, e) => sum + (e.amount || 0), 0)).toLocaleString()} TND
                </h4>
              </div>
            </div>
            <button
              onClick={onClose}
              className="px-8 py-3 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all shadow-lg"
            >
              Fermer l'Historique
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: VehicleStatus }) {
  const getStyle = () => {
    switch (status) {
      case 'available': return "bg-emerald-50 text-emerald-700 border-emerald-100";
      case 'rented': return "bg-emerald-50 text-emerald-700 border-emerald-100";
      case 'occupied': return "bg-indigo-50 text-indigo-700 border-indigo-100";
      case 'maintenance': return "bg-amber-50 text-amber-700 border-amber-100";
      case 'reserved': return "bg-purple-50 text-purple-700 border-purple-100";
      default: return "bg-stone-50 text-stone-700 border-stone-100";
    }
  };

  const getLabel = () => {
    switch (status) {
      case 'available': return "Disponible";
      case 'rented': return "Loué";
      case 'occupied': return "Occupé";
      case 'maintenance': return "Maintenance";
      case 'reserved': return "Réservé";
      default: return "Disponible";
    }
  };

  return (
    <span className={clsx("px-3 py-1 rounded-full text-xs font-bold border", getStyle())}>
      {getLabel()}
    </span>
  );
}

function WashStatusBadge({ status, lastWashDate }: { status?: 'clean' | 'dirty', lastWashDate?: string }) {
  if (!status) return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-stone-50 text-stone-400 border-stone-100">
        <Droplets className="w-3 h-3" />
        Propre
      </span>
    </span>
  );
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className={clsx(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border",
        status === 'clean' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100"
      )}>
        <Droplets className="w-3 h-3" />
        {status === 'clean' ? 'Propre' : 'Sale'}
      </span>
      {lastWashDate && (
        <span className="text-[9px] text-stone-400 italic text-center">
          {format(new Date(lastWashDate), 'dd/MM/yy')}
        </span>
      )}
    </span>
  );
}

function VehicleModal({ isOpen, onClose, onCloseWithConfirm, vehicle, vehicles }: { isOpen: boolean, onClose: () => void, onCloseWithConfirm?: () => void, vehicle: Vehicle | null, vehicles: Vehicle[] }) {
  const { addNotification } = useNotifications();
  const { currentOffice } = useOffice();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    brand: vehicle?.brand || '',
    model: vehicle?.model || '',
    plate: vehicle?.plate || '',
    vin: vehicle?.vin || '',
    color: vehicle?.color || '',
    year: vehicle?.year || new Date().getFullYear(),
    type: vehicle?.type || 'economy' as VehicleType,
    status: vehicle?.status || 'available' as VehicleStatus,
    mileage: vehicle?.mileage || 0,
    fuelLevel: vehicle?.fuelLevel || 100,
    pricePerDay: vehicle?.pricePerDay || 0,
    fuelType: vehicle?.fuelType || 'essence',
    transmission: vehicle?.transmission || 'manual',
    parkingLocation: vehicle?.parkingLocation || '',
    insuranceExpiry: vehicle?.insuranceExpiry || '',
    vignetteExpiry: vehicle?.vignetteExpiry || '',
    technicalInspectionExpiry: vehicle?.technicalInspectionExpiry || '',
    leasingExpiry: vehicle?.leasingExpiry || '',
    washStatus: vehicle?.washStatus || 'clean' as 'clean' | 'dirty',
    images: vehicle?.images || [],
    grayCardRecto: vehicle?.grayCardRecto || '',
    grayCardVerso: vehicle?.grayCardVerso || '',
    insurancePhoto: vehicle?.insurancePhoto || '',
    vignettePhoto: vehicle?.vignettePhoto || '',
    technicalInspectionPhoto: vehicle?.technicalInspectionPhoto || '',
    leasingPhoto: vehicle?.leasingPhoto || '',
    lastOilChangeMileage: vehicle?.lastOilChangeMileage || 0,
    oilChangeInterval: vehicle?.oilChangeInterval || 10000,
    nextOilChangeMileage: vehicle?.nextOilChangeMileage || 10000,
    isSubcontracted: vehicle?.isSubcontracted || false,
    ownerName: vehicle?.ownerName || '',
    lastWashDate: vehicle?.lastWashDate || ''
  });

  const handleClose = onCloseWithConfirm || onClose;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Duplicate check
    if (!vehicle) {
      const duplicateByPlate = vehicles.find(v => v.plate.toLowerCase().replace(/\s/g, '') === formData.plate.toLowerCase().replace(/\s/g, ''));
      const duplicateByVin = formData.vin ? vehicles.find(v => v.vin === formData.vin) : null;

      if (duplicateByPlate) {
        addNotification('error', 'Doublage détecté', `Un véhicule avec la plaque "${formData.plate}" existe déjà.`);
        return;
      }
      if (duplicateByVin) {
        addNotification('error', 'Doublage détecté', `Un véhicule avec le numéro de châssis (VIN) "${formData.vin}" existe déjà.`);
        return;
      }
    }

    try {
      setIsSaving(true);
      if (vehicle) {
        await updateDoc(doc(db, 'vehicles', vehicle.id), {
          ...formData,
          agentName: auth.currentUser?.displayName || 'Agent'
        });
        if (auth.currentUser) {
          logActivity(auth.currentUser.uid, 'update_vehicle', `Véhicule modifié: ${formData.brand} ${formData.model}`, auth.currentUser.displayName || undefined);
        }
      } else {
        if (!currentOffice) return;
        await addDoc(collection(db, 'vehicles'), {
          ...formData,
          agentName: auth.currentUser?.displayName || 'Agent',
          officeId: currentOffice.id,
          createdAt: new Date().toISOString()
        });
        if (auth.currentUser) {
          logActivity(auth.currentUser.uid, 'add_vehicle', `Nouveau véhicule ajouté: ${formData.brand} ${formData.model}`, auth.currentUser.displayName || undefined);
        }
      }
      onClose();
    } catch (error) {
      handleFirestoreError(error, vehicle ? OperationType.UPDATE : OperationType.CREATE, vehicle ? `vehicles/${vehicle.id}` : 'vehicles');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200 resizable-modal" onClick={e => e.stopPropagation()}>
        <div className="p-8 border-b border-stone-100 flex items-center justify-between shrink-0">
          <h3 className="text-2xl font-bold text-stone-900">
            {vehicle ? 'Modifier le véhicule' : 'Nouveau véhicule'}
          </h3>
          <button onClick={handleClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <X className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Marque</label>
              <input
                required
                value={formData.brand}
                onChange={(e) => setFormData({...formData, brand: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Modèle</label>
              <input
                required
                value={formData.model}
                onChange={(e) => setFormData({...formData, model: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Plaque</label>
              <input
                required
                placeholder="123 TUN 4567"
                value={formData.plate}
                onChange={(e) => setFormData({...formData, plate: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Couleur</label>
              <input
                value={formData.color}
                onChange={(e) => setFormData({...formData, color: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                placeholder="Ex: Noir, Blanc..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Année</label>
              <input
                type="number"
                required
                value={formData.year}
                onChange={(e) => setFormData({...formData, year: Number(e.target.value)})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Catégorie</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({...formData, type: e.target.value as VehicleType})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              >
                <option value="economy">Économique</option>
                <option value="compact">Compacte</option>
                <option value="sedan">Berline</option>
                <option value="suv">SUV</option>
                <option value="luxury">Luxe</option>
                <option value="van">Utilitaire</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Statut</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({...formData, status: e.target.value as VehicleStatus})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              >
                <option value="available">Disponible</option>
                <option value="rented">Loué</option>
                <option value="occupied">Occupé</option>
                <option value="maintenance">Maintenance</option>
                <option value="reserved">Réservé</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">État de Lavage</label>
              <select
                value={formData.washStatus}
                onChange={(e) => setFormData({...formData, washStatus: e.target.value as any})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              >
                <option value="clean">Propre</option>
                <option value="dirty">Sale</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Dernier Lavage</label>
              <input
                type="date"
                value={formData.lastWashDate}
                onChange={(e) => setFormData({...formData, lastWashDate: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">N° de Châssis (VIN)</label>
            <input
              required
              value={formData.vin}
              onChange={(e) => setFormData({...formData, vin: e.target.value})}
              className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Carburant</label>
              <select
                value={formData.fuelType}
                onChange={(e) => setFormData({...formData, fuelType: e.target.value as any})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              >
                <option value="essence">Essence</option>
                <option value="diesel">Diesel</option>
                <option value="hybrid">Hybride</option>
                <option value="electric">Électrique</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Transmission</label>
              <select
                value={formData.transmission}
                onChange={(e) => setFormData({...formData, transmission: e.target.value as any})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              >
                <option value="manual">Manuelle</option>
                <option value="automatic">Automatique</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Prix / Jour (TND TTC)</label>
              <input
                type="number"
                required
                value={formData.pricePerDay}
                onChange={(e) => setFormData({...formData, pricePerDay: Number(e.target.value)})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Kilométrage Actuel</label>
              <input
                type="number"
                required
                value={formData.mileage}
                onChange={(e) => setFormData({...formData, mileage: Number(e.target.value)})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Niveau de Carburant (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                required
                value={formData.fuelLevel}
                onChange={(e) => setFormData({...formData, fuelLevel: Number(e.target.value)})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-100 space-y-4">
            <h4 className="text-sm font-bold text-emerald-900 flex items-center gap-2">
              <PenTool className="w-4 h-4" />
              Configuration Vidange
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Dernière Vidange (km)</label>
                <input
                  type="number"
                  required
                  value={formData.lastOilChangeMileage}
                  onChange={(e) => {
                    const last = Number(e.target.value);
                    setFormData({
                      ...formData, 
                      lastOilChangeMileage: last,
                      nextOilChangeMileage: last + formData.oilChangeInterval
                    });
                  }}
                  className="w-full px-4 py-2 bg-white border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Intervalle (km)</label>
                <input
                  type="number"
                  required
                  value={formData.oilChangeInterval}
                  onChange={(e) => {
                    const interval = Number(e.target.value);
                    setFormData({
                      ...formData, 
                      oilChangeInterval: interval,
                      nextOilChangeMileage: formData.lastOilChangeMileage + interval
                    });
                  }}
                  className="w-full px-4 py-2 bg-white border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                />
              </div>
            </div>
            <div className="pt-2 border-t border-emerald-100">
              <p className="text-xs text-emerald-600 font-medium">Prochaine vidange prévue à : <span className="font-bold">{(formData.nextOilChangeMileage || 0).toLocaleString()} km</span></p>
            </div>
          </div>

          <div className="p-6 bg-stone-50 rounded-3xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={clsx(
                  "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                  formData.isSubcontracted ? "bg-amber-100 text-amber-600" : "bg-white text-stone-400 shadow-sm"
                )}>
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-900">Véhicule sous-traitance</p>
                  <p className="text-[10px] text-stone-500 italic serif">Ce véhicule appartient à un partenaire.</p>
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
              <div className="animate-in slide-in-from-top-2 duration-200">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Nom du Propriétaire / Sous-traitant</label>
                <input
                  required
                  value={formData.ownerName}
                  onChange={(e) => setFormData({...formData, ownerName: e.target.value})}
                  placeholder="Nom complet du partenaire"
                  className="w-full px-4 py-3 bg-white border-none rounded-xl focus:ring-2 focus:ring-emerald-500 mt-2"
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Emplacement (Parking/Garage)</label>
            <input
              value={formData.parkingLocation}
              onChange={(e) => setFormData({...formData, parkingLocation: e.target.value})}
              placeholder="Ex: Parking A, Garage Central..."
              className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Expiration Assurance</label>
              <input
                type="date"
                value={formData.insuranceExpiry}
                onChange={(e) => setFormData({...formData, insuranceExpiry: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Expiration Vignette</label>
              <input
                type="date"
                value={formData.vignetteExpiry}
                onChange={(e) => setFormData({...formData, vignetteExpiry: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Visite Technique</label>
              <input
                type="date"
                value={formData.technicalInspectionExpiry}
                onChange={(e) => setFormData({...formData, technicalInspectionExpiry: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Leasing</label>
              <input
                type="date"
                value={formData.leasingExpiry}
                onChange={(e) => setFormData({...formData, leasingExpiry: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 p-6 bg-stone-50 rounded-3xl border border-stone-100">
            <div className="space-y-2">
              <ImageUpload
                label="Carte Grise (Recto)"
                value={formData.grayCardRecto}
                onChange={(url) => setFormData({...formData, grayCardRecto: url})}
              />
            </div>
            <div className="space-y-2">
              <ImageUpload
                label="Carte Grise (Verso)"
                value={formData.grayCardVerso}
                onChange={(url) => setFormData({...formData, grayCardVerso: url})}
              />
            </div>
            <div className="space-y-2">
              <ImageUpload
                label="Assurance"
                value={formData.insurancePhoto}
                onChange={(url) => setFormData({...formData, insurancePhoto: url})}
              />
            </div>
            <div className="space-y-2">
              <ImageUpload
                label="Vignette"
                value={formData.vignettePhoto}
                onChange={(url) => setFormData({...formData, vignettePhoto: url})}
              />
            </div>
            <div className="space-y-2">
              <ImageUpload
                label="Visite Technique"
                value={formData.technicalInspectionPhoto}
                onChange={(url) => setFormData({...formData, technicalInspectionPhoto: url})}
              />
            </div>
            <div className="space-y-2">
              <ImageUpload
                label="Leasing"
                value={formData.leasingPhoto}
                onChange={(url) => setFormData({...formData, leasingPhoto: url})}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Photos du véhicule</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((index) => (
                <ImageUpload
                  key={index}
                  label={`Photo ${index + 1}`}
                  value={formData.images[index] || ''}
                  onChange={(url) => {
                    const newImages = [...formData.images];
                    newImages[index] = url;
                    setFormData({ ...formData, images: newImages.filter(img => img !== '') });
                  }}
                />
              ))}
            </div>
          </div>
          <div className="pt-4">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
            >
              {isSaving ? 'Enregistrement...' : (vehicle ? 'Mettre à jour' : 'Enregistrer le véhicule')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
