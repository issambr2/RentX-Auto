import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, orderBy, getDocs } from '../lib/api';
import { db, auth } from '../lib/api';
import { Vehicle, VehicleWash, PaymentMethod, Client } from '../types';
import { useOffice } from '../contexts/OfficeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Droplets, Plus, Search, Calendar, DollarSign, CheckCircle2, Trash2, Edit2, Car, Clock, User, XCircle, CreditCard, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { fr, ar, enUS } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import { DeleteModal } from './DeleteModal';
import { useNotifications } from './NotificationContext';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';

export function WashPanel() {
  const { currentOffice } = useOffice();
  const { language } = useLanguage();
  const { addNotification } = useNotifications();
  const [washes, setWashes] = useState<VehicleWash[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'pending'>('all');
  
  // Form state
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [priceTTC, setPriceTTC] = useState<number>(0);
  const [isPaid, setIsPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [washDate, setWashDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [washTime, setWashTime] = useState(format(new Date(), 'HH:mm'));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id: string }>({ isOpen: false, id: '' });

  useEffect(() => {
    if (!currentOffice) return;

    const unsubWashes = onSnapshot(
      query(collection(db, 'washes'), where('officeId', '==', currentOffice.id), orderBy('date', 'desc')),
      (snapshot) => {
        setWashes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as VehicleWash[]);
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'washes')
    );

    const unsubVehicles = onSnapshot(
      query(collection(db, 'vehicles'), where('officeId', '==', currentOffice.id)),
      (snapshot) => {
        setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vehicle[]);
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'vehicles')
    );

    const unsubClients = onSnapshot(
      query(collection(db, 'clients'), where('officeId', '==', currentOffice.id)),
      (snapshot) => {
        setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Client[]);
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'clients')
    );

    return () => {
      unsubWashes();
      unsubVehicles();
      unsubClients();
    };
  }, [currentOffice]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOffice || !auth.currentUser || !selectedVehicleId) return;

    setIsSaving(true);
    try {
      const vehicle = vehicles.find(v => v.id === selectedVehicleId);
      const client = clients.find(c => c.id === selectedClientId);
      
      const priceHT = priceTTC / 1.19;
      const vatAmount = priceTTC - priceHT;

      const washData = {
        officeId: currentOffice.id,
        vehicleId: selectedVehicleId,
        vehiclePlate: vehicle?.plate || '',
        clientId: selectedClientId || null,
        clientName: client?.name || null,
        date: washDate,
        time: washTime,
        priceHT,
        vatAmount,
        priceTTC,
        price: priceTTC,
        isPaid,
        paymentMethod: isPaid ? paymentMethod : null,
        notes,
        createdBy: auth.currentUser.uid,
        agentName: auth.currentUser.displayName || 'Agent',
        createdAt: new Date().toISOString()
      };

      if (editingId) {
        await updateDoc(doc(db, 'washes', editingId), washData);
        // Sync with expenses
        const expQuery = query(collection(db, 'expenses'), where('washId', '==', editingId));
        const expSnap = await getDocs(expQuery);
        if (!expSnap.empty) {
          await updateDoc(doc(expSnap.docs[0].ref), {
            amount: priceTTC,
            amountHT: priceHT,
            vatAmount: vatAmount,
            amountTTC: priceTTC,
            description: `Lavage: ${vehicle?.brand} ${vehicle?.model} (${vehicle?.plate})${client ? ' - Client: ' + client.name : ''}`
          });
        }
      } else {
        const washRef = await addDoc(collection(db, 'washes'), washData);
        
        // Update vehicle status
        if (vehicle) {
          await updateDoc(doc(db, 'vehicles', vehicle.id), {
            washStatus: 'clean',
            lastWashDate: washDate
          });
        }

        if (isPaid && priceTTC > 0) {
          await addDoc(collection(db, 'expenses'), {
            officeId: currentOffice.id,
            date: washDate,
            type: 'wash',
            description: `Lavage: ${vehicle?.brand} ${vehicle?.model} (${vehicle?.plate})${client ? ' - Client: ' + client.name : ''}`,
            amount: priceTTC,
            amountHT: priceHT,
            vatAmount: vatAmount,
            amountTTC: priceTTC,
            paymentMethod,
            washId: washRef.id,
            createdBy: auth.currentUser.uid,
            agentName: auth.currentUser.displayName || 'Agent',
            createdAt: new Date().toISOString()
          });
        }
      }

      addNotification('success', 'Succès', 'Lavage enregistré');
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'washes');
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setSelectedVehicleId('');
    setSelectedClientId('');
    setPriceTTC(0);
    setIsPaid(false);
    setPaymentMethod('cash');
    setNotes('');
    setWashDate(format(new Date(), 'yyyy-MM-dd'));
    setWashTime(format(new Date(), 'HH:mm'));
    setEditingId(null);
  };

  const handleEdit = (wash: VehicleWash) => {
    setSelectedVehicleId(wash.vehicleId);
    setSelectedClientId(wash.clientId || '');
    setPriceTTC(wash.priceTTC || wash.price);
    setIsPaid(wash.isPaid);
    setPaymentMethod(wash.paymentMethod || 'cash');
    setNotes(wash.notes || '');
    setWashDate(wash.date);
    setWashTime(wash.time || format(new Date(), 'HH:mm'));
    setEditingId(wash.id);
    setIsModalOpen(true);
  };

  const filteredWashes = washes.filter(w => {
    const matchesSearch = w.vehiclePlate.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (w.clientName || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || (filterStatus === 'paid' ? w.isPaid : !w.isPaid);
    return matchesSearch && matchesStatus;
  });

  const getLocale = () => language === 'ar' ? ar : language === 'en' ? enUS : fr;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
            <Droplets className="w-6 h-6 text-emerald-600" />
            Lavage Véhicule
          </h2>
        </div>
        <button
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
        >
          <Plus className="w-5 h-5" />
          Nouveau Lavage
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-100 flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="text"
              placeholder="Plaque, Client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-stone-50/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-400 uppercase tracking-widest">Véhicule / Client</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-400 uppercase tracking-widest">Date & Heure</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-400 uppercase tracking-widest">Prix (HT / TTC)</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-400 uppercase tracking-widest">Statut</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-stone-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredWashes.map((wash) => (
                <tr key={wash.id} className="hover:bg-stone-50/50 group">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-stone-900">{wash.vehiclePlate}</span>
                      {wash.clientName && <span className="text-xs text-stone-500">{wash.clientName}</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2 text-sm text-stone-600">
                      <Calendar className="w-4 h-4" />
                      {format(new Date(wash.date), 'dd/MM/yyyy')}
                      <Clock className="w-4 h-4 ml-1" />
                      {wash.time || '--:--'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-stone-900">{(wash.priceTTC || wash.price).toLocaleString()} TND</span>
                      <span className="text-[10px] text-stone-400">HT: {((wash.priceTTC || wash.price) / 1.19).toFixed(3)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${wash.isPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {wash.isPaid ? 'PAYÉ' : 'EN ATTENTE'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleEdit(wash)} className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteModal({ isOpen: true, id: wash.id })} className="p-2 hover:bg-red-50 text-red-600 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={resetForm} />
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-lg bg-white rounded-3xl overflow-hidden p-8">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Droplets className="w-5 h-5 text-emerald-600" />
                {editingId ? 'Modifier Lavage' : 'Nouveau Lavage'}
              </h3>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-400 uppercase">Véhicule</label>
                    <select required value={selectedVehicleId} onChange={(e) => setSelectedVehicleId(e.target.value)} className="w-full p-3 bg-stone-50 rounded-xl border-none outline-none">
                      <option value="">Sélectionner...</option>
                      {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} - {v.brand}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-400 uppercase">Client (Optionnel)</label>
                    <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} className="w-full p-3 bg-stone-50 rounded-xl border-none outline-none">
                      <option value="">Aucun</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-400 uppercase">Date</label>
                    <input type="date" required value={washDate} onChange={(e) => setWashDate(e.target.value)} className="w-full p-3 bg-stone-50 rounded-xl border-none outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-400 uppercase">Heure</label>
                    <input type="time" required value={washTime} onChange={(e) => setWashTime(e.target.value)} className="w-full p-3 bg-stone-50 rounded-xl border-none outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-400 uppercase">Prix TTC (19% TVA)</label>
                    <input type="number" step="0.001" required value={priceTTC} onChange={(e) => setPriceTTC(parseFloat(e.target.value) || 0)} className="w-full p-3 bg-stone-50 rounded-xl border-none outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-400 uppercase">Statut Paiement</label>
                    <button type="button" onClick={() => setIsPaid(!isPaid)} className={`w-full p-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${isPaid ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-400 hover:bg-stone-200'}`}>
                      {isPaid ? <CheckCircle2 className="w-4 h-4" /> : null}
                      {isPaid ? 'PAYÉ' : 'NON PAYÉ'}
                    </button>
                  </div>
                </div>

                {isPaid && (
                  <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Mode de Paiement</label>
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
                            "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
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

                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-400 uppercase">Notes</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full p-3 bg-stone-50 rounded-xl border-none outline-none h-20 resize-none" />
                </div>

                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 p-4 bg-stone-100 rounded-2xl font-bold">Annuler</button>
                  <button type="submit" disabled={isSaving} className="flex-1 p-4 bg-emerald-600 text-white rounded-2xl font-bold">Enregistrer</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '' })}
        onConfirm={async () => {
          try {
            await deleteDoc(doc(db, 'washes', deleteModal.id));
            setDeleteModal({ isOpen: false, id: '' });
          } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, 'washes');
          }
        }}
        title="Supprimer Lavage"
        message="Voulez-vous vraiment supprimer cet enregistrement ?"
      />
    </div>
  );
}
