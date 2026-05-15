import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, doc, getDocs, where, deleteDoc } from '../lib/api';
import { db, auth } from '../lib/api';
import { StockItem, StockMovement, Vehicle } from '../types';
import { Package, Plus, Minus, History, Car, Clock, Search, Filter, AlertTriangle, CheckCircle, ArrowUpRight, ArrowDownLeft, Edit2, Trash2, X, Info, FileText, Upload, Download, User } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx } from 'clsx';
import * as XLSX from 'xlsx';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { useNotifications } from './NotificationContext';
import { DeleteModal } from './DeleteModal';
import { GuideModal } from './GuideModal';
import { useOffice } from '../contexts/OfficeContext';
import { compressImage } from '../utils/imageCompression';

import { logActivity } from '../services/logService';

export function StockPanel() {
  const { currentOffice } = useOffice();
  const { addNotification } = useNotifications();
  const [categoryFilter, setCategoryFilter] = useState('');
  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'inventory' | 'history'>('inventory');
  const [historySearch, setHistorySearch] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'in' | 'out'>('all');
  const [historyUserFilter, setHistoryUserFilter] = useState('');
  const [historyVehicleFilter, setHistoryVehicleFilter] = useState('');
  const [historyDateRange, setHistoryDateRange] = useState({ start: '', end: '' });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id: string }>({ isOpen: false, id: '' });
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [movementType, setMovementType] = useState<'in' | 'out'>('out');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  const [newItem, setNewItem] = useState({
    name: '',
    description: '',
    category: '',
    quantity: 0,
    unit: 'psc' as 'L' | 'psc',
    priceTTC: 0,
    purchasePriceTTC: 0,
    minQuantity: 5,
    supplierName: ''
  });

  const [editingItem, setEditingItem] = useState<StockItem | null>(null);

  const [newMovement, setNewMovement] = useState({
    quantity: 1,
    reason: '',
    vehicleId: '',
    supplierName: '',
    priceTTC: 0,
    date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    documents: [] as { name: string; url: string }[]
  });
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const newDocs = [...newMovement.documents];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressed = await compressImage(file);
        newDocs.push({
          name: file.name,
          url: compressed // In a real app, this would be a Firebase Storage URL
        });
      }
      setNewMovement({ ...newMovement, documents: newDocs });
      addNotification('success', 'Téléchargé', `${files.length} document(s) ajouté(s).`);
    } catch (error) {
      console.error('Error uploading files:', error);
      addNotification('error', 'Erreur', 'Échec du téléchargement des documents.');
    } finally {
      setUploading(false);
    }
  };

  const handleCloseModal = (closeFn: () => void) => {
    if (window.confirm("Voulez-vous vraiment quitter sans enregistrer ?")) {
      closeFn();
    }
  };

  useEffect(() => {
    if (!currentOffice) return;

    const qItems = query(collection(db, 'stock'), orderBy('name'));
    const qMovements = query(collection(db, 'stockMovements'), orderBy('date', 'desc'));
    const qVehicles = query(collection(db, 'vehicles'), orderBy('brand'));

    const unsubItems = onSnapshot(qItems, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockItem)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'stock'));

    const unsubMovements = onSnapshot(qMovements, (snapshot) => {
      setMovements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockMovement)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'stockMovements'));

    const unsubVehicles = onSnapshot(qVehicles, (snapshot) => {
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'vehicles'));

    return () => {
      unsubItems();
      unsubMovements();
      unsubVehicles();
    };
  }, [currentOffice]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOffice) return;
    setIsSaving(true);
    try {
      const stockItem: Omit<StockItem, 'id'> = {
        ...newItem,
        officeId: currentOffice.id,
        priceHT: newItem.priceTTC / 1.19,
        purchasePrice: newItem.purchasePriceTTC,
        totalReceived: newItem.quantity,
        totalUsed: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'stock'), stockItem);
      
      if (newItem.quantity > 0) {
        await addDoc(collection(db, 'stockMovements'), {
          itemId: docRef.id,
          itemName: newItem.name,
          type: 'in',
          quantity: newItem.quantity,
          priceTTC: newItem.purchasePriceTTC,
          priceHT: newItem.purchasePriceTTC / 1.19,
          date: new Date().toISOString(),
          reason: 'Initialisation du stock',
          userId: auth.currentUser?.uid || '',
          userName: auth.currentUser?.displayName || 'Admin',
          createdAt: new Date().toISOString(),
          officeId: currentOffice.id
        });
      }

      if (auth.currentUser) {
        logActivity(
          auth.currentUser.uid,
          'stock_add_item',
          `Nouvel article ajouté au stock: ${newItem.name} (${newItem.quantity} ${newItem.unit})`,
          auth.currentUser.displayName || 'Admin',
          currentOffice.id
        );
      }

      setIsAddModalOpen(false);
      setNewItem({
        name: '',
        description: '',
        category: '',
        quantity: 0,
        unit: 'psc',
        priceTTC: 0,
        purchasePriceTTC: 0,
        minQuantity: 5,
        supplierName: ''
      });
      addNotification('success', 'Succès', 'Article ajouté au stock.');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'stock');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'stock', editingItem.id), {
        ...editingItem,
        updatedAt: new Date().toISOString()
      });

      if (auth.currentUser) {
        logActivity(
          auth.currentUser.uid,
          'stock_edit_item',
          `Article de stock modifié: ${editingItem.name}`,
          auth.currentUser.displayName || 'Admin',
          currentOffice?.id
        );
      }
      setIsEditModalOpen(false);
      setEditingItem(null);
      addNotification('success', 'Succès', 'Article mis à jour.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'stock');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      const itemToDelete = items.find(i => i.id === id);
      await deleteDoc(doc(db, 'stock', id));

      if (auth.currentUser && itemToDelete) {
        logActivity(
          auth.currentUser.uid,
          'stock_delete_item',
          `Article supprimé du stock: ${itemToDelete.name}`,
          auth.currentUser.displayName || 'Admin',
          currentOffice?.id
        );
      }
      addNotification('success', 'Succès', 'Article supprimé.');
      setDeleteModal({ isOpen: false, id: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'stock');
    }
  };

  const handleMovement = (e: React.FormEvent) => {
    e.preventDefault();
    setIsConfirmModalOpen(true);
  };

  const confirmMovement = async () => {
    if (!selectedItem) return;
    setIsSaving(true);
    try {
      const vehicle = vehicles.find(v => v.id === newMovement.vehicleId);
      const unitPriceTTC = movementType === 'in' ? (newMovement.priceTTC || selectedItem.purchasePriceTTC || selectedItem.purchasePrice || 0) : selectedItem.priceTTC;
      const totalPriceTTC = unitPriceTTC * newMovement.quantity;
      const totalPriceHT = totalPriceTTC / 1.19;
      const totalVatAmount = totalPriceTTC - totalPriceHT;

      const movementData: Omit<StockMovement, 'id'> = {
        itemId: selectedItem.id,
        itemName: selectedItem.name,
        type: movementType,
        quantity: newMovement.quantity,
        priceTTC: unitPriceTTC,
        priceHT: unitPriceTTC / 1.19,
        vatAmount: unitPriceTTC - (unitPriceTTC / 1.19),
        supplierName: newMovement.supplierName || undefined,
        date: newMovement.date,
        reason: newMovement.reason || (movementType === 'in' ? 'Réception de stock' : 'Sortie de stock'),
        vehicleId: newMovement.vehicleId || undefined,
        vehiclePlate: vehicle?.plate,
        userId: auth.currentUser?.uid || '',
        userName: auth.currentUser?.displayName || 'Admin',
        createdAt: new Date().toISOString(),
        officeId: currentOffice?.id || '',
        documents: newMovement.documents
      };

      await addDoc(collection(db, 'stockMovements'), movementData);

      // Log to audit system
      if (auth.currentUser) {
        logActivity(
          auth.currentUser.uid, 
          movementType === 'in' ? 'stock_in' : 'stock_out', 
          `${movementType === 'in' ? 'Entrée' : 'Sortie'} de stock: ${selectedItem.name} (${newMovement.quantity} ${selectedItem.unit})${vehicle ? ' pour ' + vehicle.brand + ' ' + vehicle.model + ' (' + vehicle.plate + ')' : ''}`,
          auth.currentUser.displayName || 'Admin',
          currentOffice?.id
        );
      }

      const newQuantity = movementType === 'in' 
        ? selectedItem.quantity + newMovement.quantity 
        : selectedItem.quantity - newMovement.quantity;

      const stockUpdate: any = {
        quantity: newQuantity,
        updatedAt: new Date().toISOString()
      };

      if (movementType === 'in') {
        stockUpdate.totalReceived = ((selectedItem as any).totalReceived || 0) + newMovement.quantity;
        if (newMovement.priceTTC > 0) {
          stockUpdate.purchasePriceTTC = newMovement.priceTTC;
          stockUpdate.purchasePrice = newMovement.priceTTC;
        }
      } else {
        stockUpdate.totalUsed = ((selectedItem as any).totalUsed || 0) + newMovement.quantity;
      }

      await updateDoc(doc(db, 'stock', selectedItem.id), stockUpdate);

      if (totalPriceTTC > 0) {
        await addDoc(collection(db, 'expenses'), {
          officeId: currentOffice?.id,
          date: newMovement.date || new Date().toISOString(),
          category: movementType === 'in' ? 'stock_purchase' : 'maintenance',
          type: movementType === 'in' ? 'purchase' : 'stock_usage',
          description: movementType === 'in' 
            ? `Réception stock: ${selectedItem.name} (${newMovement.quantity} ${selectedItem.unit}) ${newMovement.supplierName ? 'Fournisseur: ' + newMovement.supplierName : ''}`
            : `Sortie stock: ${selectedItem.name} (${newMovement.quantity} ${selectedItem.unit}) pour ${vehicle?.brand || ''} ${vehicle?.model || ''} (${vehicle?.plate || ''}) - Motif: ${newMovement.reason}`,
          amount: totalPriceTTC,
          amountHT: totalPriceHT,
          vatAmount: totalVatAmount,
          amountTTC: totalPriceTTC,
          paymentMethod: 'cash',
          vehicleId: newMovement.vehicleId || null,
          itemId: selectedItem.id,
          createdBy: auth.currentUser?.uid || '',
          agentName: auth.currentUser?.displayName || 'Admin'
        });
      }

      setIsConfirmModalOpen(false);
      setIsMovementModalOpen(false);
      setNewMovement({
        quantity: 1,
        reason: '',
        vehicleId: '',
        supplierName: '',
        priceTTC: 0,
        date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        documents: []
      });
      addNotification('success', 'Succès', 'Mouvement enregistré.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'stockMovements');
    } finally {
      setIsSaving(false);
    }
  };

  const exportInventory = () => {
    const data = items.map(item => ({
      'Article': item.name,
      'Catégorie': item.category,
      'Quantité': `${item.quantity} ${item.unit}`,
      'Prix Achat TTC': item.purchasePriceTTC || item.purchasePrice || 0,
      'Prix Vente TTC': item.priceTTC,
      'Valeur Stock': item.quantity * (item.priceTTC || 0),
      'Min. Alerte': item.minQuantity,
      'Dernière Mise à Jour': format(new Date(item.updatedAt), 'dd/MM/yyyy HH:mm')
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventaire");
    XLSX.writeFile(wb, `Inventaire_Stock_${format(new Date(), 'dd_MM_yyyy')}.xlsx`);
  };

  const exportHistory = () => {
    const data = movements.map(mov => ({
      'Date': format(new Date(mov.date), 'dd/MM/yyyy HH:mm'),
      'Article': mov.itemName,
      'Type': mov.type === 'in' ? 'Entrée' : 'Sortie',
      'Quantité': mov.quantity,
      'Prix TTC': mov.priceTTC || 0,
      'Motif': mov.reason,
      'Véhicule': mov.vehiclePlate || 'N/A',
      'Utilisateur': mov.userName
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historique");
    XLSX.writeFile(wb, `Historique_Stock_${format(new Date(), 'dd_MM_yyyy')}.xlsx`);
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (item.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !categoryFilter || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Clock className="w-8 h-8 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Gestion du Stock</h2>
            <p className="text-stone-500 italic serif">Suivez vos pièces, consommables et mouvements de stock.</p>
          </div>
          <button 
            onClick={() => setIsHelpOpen(true)}
            className="p-2 bg-emerald-50 text-emerald-600 rounded-full hover:bg-emerald-100 transition-colors"
            title="Guide d'utilisation"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
        <div className="flex bg-stone-100 p-1 rounded-2xl border border-stone-200">
          <button
            onClick={() => setActiveTab('inventory')}
            className={clsx(
              "px-6 py-2 rounded-xl text-sm font-bold transition-all",
              activeTab === 'inventory' ? "bg-white text-emerald-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            Inventaire
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={clsx(
              "px-6 py-2 rounded-xl text-sm font-bold transition-all",
              activeTab === 'history' ? "bg-white text-emerald-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            Historique
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-stone-100 p-1 rounded-2xl border border-stone-200">
            <button 
              onClick={exportInventory}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-stone-600 hover:bg-white hover:text-emerald-600 rounded-xl transition-all"
            >
              <FileText className="w-4 h-4" />
              Inventaire
            </button>
            <button 
              onClick={exportHistory}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-stone-600 hover:bg-white hover:text-emerald-600 rounded-xl transition-all"
            >
              <History className="w-4 h-4" />
              Historique
            </button>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-stone-900 text-white py-3 px-6 rounded-2xl font-semibold hover:bg-stone-800 transition-all shadow-lg"
          >
            <Plus className="w-5 h-5" />
            Nouvel Article
          </button>
        </div>
      </div>

      {activeTab === 'inventory' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Valeur Stock (Vente)</p>
              <p className="text-2xl font-bold text-stone-900 tracking-tight">
                {items.reduce((acc, item) => acc + (item.quantity * (item.priceTTC || 0)), 0).toLocaleString()} <span className="text-sm font-medium text-stone-400">DT</span>
              </p>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm border-l-4 border-l-emerald-500">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Total Reçu</p>
              <p className="text-2xl font-bold text-emerald-600 tracking-tight">
                {items.reduce((acc, item) => acc + (item.totalReceived || 0), 0).toLocaleString()} <span className="text-sm font-medium text-stone-400">{items[0]?.unit || 'unites'}</span>
              </p>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm border-l-4 border-l-amber-500">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Total Utilisé</p>
              <p className="text-2xl font-bold text-amber-600 tracking-tight">
                {items.reduce((acc, item) => acc + (item.totalUsed || 0), 0).toLocaleString()} <span className="text-sm font-medium text-stone-400">{items[0]?.unit || 'unites'}</span>
              </p>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm border-l-4 border-l-red-500">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Articles en Alerte</p>
              <p className="text-2xl font-bold text-red-600 tracking-tight">
                {items.filter(i => i.quantity <= (i.minQuantity || 0)).length}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-sm flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                  <input
                    type="text"
                    placeholder="Rechercher un article..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="w-5 h-5 text-stone-400" />
                  <select 
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="bg-stone-50 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 px-4 py-3"
                  >
                    <option value="">Toutes catégories</option>
                    <option value="pieces">Pièces</option>
                    <option value="consommables">Consommables</option>
                    <option value="huiles">Huiles</option>
                  </select>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-50/50 border-b border-stone-100">
                      <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Article</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Prix (TTC)</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Quantité</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredItems.map((item) => (
                      <tr key={item.id} className="hover:bg-stone-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center text-stone-400">
                              <Package className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="font-bold text-stone-900">{item.name}</p>
                              <div className="flex items-center gap-2">
                                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{item.category}</p>
                                {item.description && (
                                  <>
                                    <span className="text-stone-300">•</span>
                                    <p className="text-[10px] text-stone-500 italic truncate max-w-[150px]">{item.description}</p>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-stone-400 uppercase font-bold w-12">Vente:</span>
                              <p className="font-bold text-stone-900">{Number(item.priceTTC || 0).toFixed(3)} DT</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-stone-400 uppercase font-bold w-12">Achat:</span>
                              <p className="text-stone-500 text-xs">{Number(item.purchasePriceTTC || item.purchasePrice || 0).toFixed(3)} DT</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className={clsx(
                              "px-3 py-1 rounded-full text-xs font-bold border",
                              item.quantity <= (item.minQuantity || 0) 
                                ? "bg-red-50 text-red-700 border-red-100" 
                                : "bg-emerald-50 text-emerald-700 border-emerald-100"
                            )}>
                              {item.quantity} {item.unit}
                            </span>
                            {item.quantity <= (item.minQuantity || 0) && (
                              <AlertTriangle className="w-4 h-4 text-red-500" />
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 transition-all">
                            <button
                              onClick={() => { setSelectedItem(item); setMovementType('in'); setIsMovementModalOpen(true); }}
                              className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-all"
                              title="Entrée de stock"
                            >
                              <Plus className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => { setSelectedItem(item); setMovementType('out'); setIsMovementModalOpen(true); }}
                              className="p-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-all"
                              title="Sortie de stock"
                            >
                              <Minus className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => { setEditingItem(item); setIsEditModalOpen(true); }}
                              className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-all"
                              title="Modifier"
                            >
                              <Edit2 className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => setDeleteModal({ isOpen: true, id: item.id })}
                              className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all"
                              title="Supprimer"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-stone-900 flex items-center gap-2">
                    <History className="w-5 h-5 text-stone-400" />
                    Mouvements Récents
                  </h3>
                </div>
                <div className="space-y-4">
                  {movements.slice(0, 10).map((mov) => (
                    <div key={mov.id} className="flex gap-3 p-3 bg-stone-50 rounded-2xl border border-stone-100">
                      <div className={clsx(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                        mov.type === 'in' ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                      )}>
                        {mov.type === 'in' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <p className="text-xs font-bold text-stone-900 truncate">{mov.itemName}</p>
                          <span className="text-[10px] font-bold text-stone-400 tabular-nums">
                            {mov.type === 'in' ? '+' : '-'}{mov.quantity}
                          </span>
                        </div>
                        <p className="text-[10px] text-stone-500 mt-0.5 truncate">{mov.reason}</p>
                        {mov.vehiclePlate && (
                          <div className="flex items-center gap-1 mt-1">
                            <Car className="w-3 h-3 text-stone-400" />
                            <span className="text-[10px] font-bold text-emerald-600">{mov.vehiclePlate}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[9px] text-stone-400 font-medium">{format(new Date(mov.date), 'dd/MM HH:mm')}</span>
                          <div className="flex items-center gap-2">
                            {mov.documents && mov.documents.length > 0 && (
                              <div className="flex gap-1">
                                {mov.documents.map((doc, idx) => (
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
                            <span className="text-[9px] text-stone-400 font-medium">{mov.userName}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-stone-100 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="relative">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5 block px-1">Recherche</label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="text"
                    placeholder="Article ou motif..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5 block px-1">Type</label>
                <select
                  value={historyTypeFilter}
                  onChange={(e) => setHistoryTypeFilter(e.target.value as any)}
                  className="w-full bg-stone-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 px-4 py-2.5"
                >
                  <option value="all">Tous les types</option>
                  <option value="in">Entrées</option>
                  <option value="out">Sorties</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5 block px-1">Véhicule</label>
                <select
                  value={historyVehicleFilter}
                  onChange={(e) => setHistoryVehicleFilter(e.target.value)}
                  className="w-full bg-stone-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 px-4 py-2.5 shadow-none"
                >
                  <option value="">Tous les véhicules</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plate})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5 block px-1">Utilisateur</label>
                <select
                  value={historyUserFilter}
                  onChange={(e) => setHistoryUserFilter(e.target.value)}
                  className="w-full bg-stone-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 px-4 py-2.5 shadow-none"
                >
                  <option value="">Tous les utilisateurs</option>
                  {Array.from(new Set(movements.map(m => m.userName))).filter(Boolean).map(userName => (
                    <option key={userName} value={userName}>{userName}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-end justify-between gap-4 pt-4 border-t border-stone-50">
              <div className="flex items-center gap-4">
                <div>
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5 block px-1">Période du</label>
                  <input
                    type="date"
                    value={historyDateRange.start}
                    onChange={(e) => setHistoryDateRange({...historyDateRange, start: e.target.value})}
                    className="bg-stone-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 px-4 py-2.5"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5 block px-1">Au</label>
                  <input
                    type="date"
                    value={historyDateRange.end}
                    onChange={(e) => setHistoryDateRange({...historyDateRange, end: e.target.value})}
                    className="bg-stone-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 px-4 py-2.5"
                  />
                </div>
              </div>
              
              <button
                onClick={exportHistory}
                className="flex items-center gap-2 bg-stone-900 text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-stone-800 transition-all shadow-md shrink-0"
              >
                <Download className="w-4 h-4" />
                Exporter l'historique
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-stone-50/50 text-stone-400 text-[10px] font-bold uppercase tracking-widest">
                  <th className="px-8 py-4">Date</th>
                  <th className="px-8 py-4">Article</th>
                  <th className="px-8 py-4">Type</th>
                  <th className="px-8 py-4">Quantité</th>
                  <th className="px-8 py-4">Détails / Motif</th>
                  <th className="px-8 py-4">Utilisateur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {movements
                  .filter(m => {
                    const item = items.find(i => i.id === m.itemId);
                    const vehicle = vehicles.find(v => v.id === m.vehicleId);
                    const matchesSearch = 
                      (item?.name || '').toLowerCase().includes(historySearch.toLowerCase()) ||
                      (m.reason || '').toLowerCase().includes(historySearch.toLowerCase());
                    const matchesType = historyTypeFilter === 'all' || m.type === historyTypeFilter;
                    const matchesUser = !historyUserFilter || m.userName === historyUserFilter;
                    const matchesVehicle = !historyVehicleFilter || m.vehicleId === historyVehicleFilter;
                    const matchesDate = (!historyDateRange.start || m.date >= historyDateRange.start) &&
                                       (!historyDateRange.end || m.date <= historyDateRange.end);
                    return matchesSearch && matchesType && matchesUser && matchesVehicle && matchesDate;
                  })
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((m) => {
                    const item = items.find(i => i.id === m.itemId);
                    const vehicle = vehicles.find(v => v.id === m.vehicleId);
                    return (
                      <tr key={m.id} className="hover:bg-stone-50/50 transition-all">
                        <td className="px-8 py-5 text-xs text-stone-600">
                          {format(new Date(m.date), 'dd MMM yyyy HH:mm', { locale: fr })}
                        </td>
                        <td className="px-8 py-5">
                          <p className="font-bold text-stone-900">{item?.name || 'Article inconnu'}</p>
                        </td>
                        <td className="px-8 py-5">
                          <span className={clsx(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                            m.type === 'in' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100"
                          )}>
                            {m.type === 'in' ? 'Entrée' : 'Sortie'}
                          </span>
                        </td>
                        <td className="px-8 py-5 font-bold text-stone-900">
                          <div className={clsx(
                            "flex items-center gap-1",
                            m.type === 'in' ? "text-emerald-600" : "text-amber-600"
                          )}>
                            {m.type === 'in' ? '+' : '-'}{m.quantity} {item?.unit || ''}
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex flex-col gap-1">
                            <p className="text-sm text-stone-900 font-medium">{m.reason}</p>
                            {vehicle && (
                              <div className="flex items-center gap-1.5 bg-stone-50 px-2 py-0.5 rounded-md w-fit">
                                <Car className="w-3 h-3 text-emerald-600" />
                                <p className="text-[10px] text-stone-600 font-bold uppercase">{vehicle.brand} {vehicle.model} ({vehicle.plate})</p>
                              </div>
                            )}
                            <p className="text-[10px] text-stone-400 tabular-nums">Prix: {(m.priceTTC || 0).toLocaleString()} TND</p>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-stone-100 rounded-full flex items-center justify-center">
                              <User className="w-3 h-3 text-stone-400" />
                            </div>
                            <span className="text-xs text-stone-600">{m.userName || 'Système'}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm" onClick={() => setIsAddModalOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-stone-900">Nouvel Article</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleAddItem} className="p-8 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Nom de l'article</label>
                  <input
                    type="text"
                    required
                    value={newItem.name}
                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    placeholder="ex: Huile Moteur 5W40"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Description</label>
                  <textarea
                    value={newItem.description}
                    onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 h-20 resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Catégorie</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem({...newItem, category: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Choisir...</option>
                    <option value="pieces">Pièces</option>
                    <option value="consommables">Consommables</option>
                    <option value="huiles">Huiles</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Unité</label>
                  <select
                    value={newItem.unit}
                    onChange={(e) => setNewItem({...newItem, unit: e.target.value as 'L' | 'psc'})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="psc">Pièce (psc)</option>
                    <option value="L">Litre (L)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Prix Vente TTC (TND)</label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={newItem.priceTTC}
                    onChange={(e) => setNewItem({...newItem, priceTTC: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Prix Achat TTC (TND)</label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={newItem.purchasePriceTTC}
                    onChange={(e) => setNewItem({...newItem, purchasePriceTTC: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Fournisseur</label>
                  <input
                    type="text"
                    value={newItem.supplierName}
                    onChange={(e) => setNewItem({...newItem, supplierName: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    placeholder="Nom du fournisseur..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Stock Initial</label>
                  <input
                    type="number"
                    required
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({...newItem, quantity: parseInt(e.target.value) || 0})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Alerte Min.</label>
                  <input
                    type="number"
                    required
                    value={newItem.minQuantity}
                    onChange={(e) => setNewItem({...newItem, minQuantity: parseInt(e.target.value) || 0})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg mt-4 disabled:opacity-50"
              >
                {isSaving ? 'Enregistrement...' : 'Ajouter au Stock'}
              </button>
            </form>
          </div>
        </div>
      )}

      {isEditModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm" onClick={() => setIsEditModalOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-stone-900">Modifier l'Article</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleEditItem} className="p-8 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Nom de l'article</label>
                  <input
                    type="text"
                    required
                    value={editingItem.name || ''}
                    onChange={(e) => setEditingItem({...editingItem, name: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Description</label>
                  <textarea
                    value={editingItem.description || ''}
                    onChange={(e) => setEditingItem({...editingItem, description: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 h-20 resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Prix Vente TTC (TND)</label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={editingItem.priceTTC || 0}
                    onChange={(e) => setEditingItem({...editingItem, priceTTC: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Prix Achat TTC (TND)</label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={editingItem.purchasePriceTTC || editingItem.purchasePrice || 0}
                    onChange={(e) => setEditingItem({...editingItem, purchasePriceTTC: parseFloat(e.target.value) || 0, purchasePrice: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg mt-4 disabled:opacity-50"
              >
                {isSaving ? 'Enregistrement...' : 'Enregistrer les modifications'}
              </button>
            </form>
          </div>
        </div>
      )}

      {isMovementModalOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm" onClick={() => setIsMovementModalOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-stone-100 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-stone-900">
                  {movementType === 'in' ? 'Réception de Stock' : 'Sortie du Stock'}
                </h3>
                <p className="text-stone-500 text-sm">{selectedItem.name}</p>
              </div>
              <button onClick={() => setIsMovementModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleMovement} className="p-8 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 text-center p-4 bg-stone-50 rounded-2xl border border-stone-100">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Stock Actuel</p>
                  <p className="text-xl font-bold text-stone-900">{selectedItem.quantity} {selectedItem.unit}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Quantité ({selectedItem.unit})</label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    required
                    value={newMovement.quantity}
                    onChange={(e) => setNewMovement({...newMovement, quantity: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {movementType === 'in' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Prix Unitaire Achat TTC</label>
                  <input
                    type="number"
                    step="0.001"
                    value={newMovement.priceTTC}
                    onChange={(e) => setNewMovement({...newMovement, priceTTC: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    placeholder={(selectedItem.purchasePriceTTC || selectedItem.purchasePrice || 0).toString()}
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Fournisseur</label>
                <input
                  type="text"
                  value={newMovement.supplierName}
                  onChange={(e) => setNewMovement({...newMovement, supplierName: e.target.value})}
                  className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  placeholder="Nom du fournisseur..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Date</label>
                <input
                  type="datetime-local"
                  required
                  value={newMovement.date}
                  onChange={(e) => setNewMovement({...newMovement, date: e.target.value})}
                  className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {movementType === 'out' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Véhicule (Optionnel)</label>
                  <select
                    value={newMovement.vehicleId}
                    onChange={(e) => setNewMovement({...newMovement, vehicleId: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Sélectionner...</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plate})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Motif</label>
                <textarea
                  required
                  value={newMovement.reason}
                  onChange={(e) => setNewMovement({...newMovement, reason: e.target.value})}
                  className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 h-20 resize-none"
                  placeholder="Raison du mouvement..."
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setIsMovementModalOpen(false)}
                  className="flex-1 py-4 bg-stone-100 text-stone-600 rounded-2xl font-bold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className={clsx(
                    "flex-1 py-4 text-white rounded-2xl font-bold shadow-lg",
                    movementType === 'in' ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20" : "bg-amber-600 hover:bg-amber-700 shadow-amber-500/20"
                  )}
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 text-center animate-in fade-in zoom-in duration-200">
            <div className={clsx(
              "w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6",
              movementType === 'in' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
            )}>
              {movementType === 'in' ? <ArrowDownLeft className="w-10 h-10" /> : <ArrowUpRight className="w-10 h-10" />}
            </div>
            <h3 className="text-2xl font-bold text-stone-900 mb-2">Confirmer le mouvement</h3>
            <p className="text-stone-500 italic serif mb-8">
              Enregistrer cette {movementType === 'in' ? 'entrée' : 'sortie'} de <span className="font-bold text-stone-900">{newMovement.quantity} {selectedItem?.unit}</span> ?
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                className="py-4 bg-stone-100 text-stone-600 rounded-2xl font-bold hover:bg-stone-200 transition-all"
              >
                Annuler
              </button>
              <button
                onClick={confirmMovement}
                disabled={isSaving}
                className="py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg disabled:opacity-50"
              >
                {isSaving ? 'Traitement...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '' })}
        onConfirm={() => handleDeleteItem(deleteModal.id)}
        title="Supprimer l'article"
        message="Êtes-vous sûr de vouloir supprimer cet article ? Cette action est irréversible."
      />

      <GuideModal 
        isOpen={isHelpOpen} 
        onClose={() => setIsHelpOpen(false)} 
        activeTab="stock"
      />
    </div>
  );
}
