import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, orderBy } from '../lib/api';
import { db, auth } from '../lib/api';
import { Vehicle, Insurance, PaymentMethod } from '../types';
import { useOffice } from '../contexts/OfficeContext';
import { ShieldCheck, Plus, Search, Calendar, DollarSign, Edit2, Trash2, Car, XCircle, CreditCard, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { fr, ar, enUS } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import { DeleteModal } from './DeleteModal';
import { useNotifications } from './NotificationContext';
import { useLanguage } from '../contexts/LanguageContext';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';

export function InsuranceList() {
  const { currentOffice } = useOffice();
  const { language } = useLanguage();
  const { addNotification } = useNotifications();
  const [insurances, setInsurances] = useState<Insurance[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form state
  const [formData, setFormData] = useState<Partial<Insurance>>({
    vehicleId: '',
    provider: '',
    policyNumber: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(new Date().setFullYear(new Date().getFullYear() + 1)), 'yyyy-MM-dd'),
    amountTTC: 0,
    status: 'active',
    paymentMethod: 'cash' as PaymentMethod,
    notes: ''
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id: string }>({ isOpen: false, id: '' });

  useEffect(() => {
    if (!currentOffice) return;

    const unsubInsurances = onSnapshot(
      query(collection(db, 'insurances'), where('officeId', '==', currentOffice.id), orderBy('endDate', 'asc')),
      (snapshot) => {
        setInsurances(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Insurance[]);
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'insurances')
    );

    const unsubVehicles = onSnapshot(
      query(collection(db, 'vehicles'), where('officeId', '==', currentOffice.id)),
      (snapshot) => {
        setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vehicle[]);
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'vehicles')
    );

    return () => {
      unsubInsurances();
      unsubVehicles();
    };
  }, [currentOffice]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOffice || !auth.currentUser || !formData.vehicleId) return;

    setIsSaving(true);
    try {
      const vehicle = vehicles.find(v => v.id === formData.vehicleId);
      const amountHT = (formData.amountTTC || 0) / 1.19;
      const vatAmount = (formData.amountTTC || 0) - amountHT;

      const data = {
        ...formData,
        officeId: currentOffice.id,
        vehiclePlate: vehicle?.plate || '',
        amountHT,
        vatAmount,
        amountTTC: formData.amountTTC || 0,
        createdAt: new Date().toISOString()
      };

      if (editingId) {
        await updateDoc(doc(db, 'insurances', editingId), data);
      } else {
        const insRef = await addDoc(collection(db, 'insurances'), data);
        // Also add to expenses
        await addDoc(collection(db, 'expenses'), {
          officeId: currentOffice.id,
          date: formData.startDate,
          type: 'insurance',
          description: `Assurance: ${vehicle?.brand} ${vehicle?.model} (${vehicle?.plate}) - ${formData.provider}`,
          amount: formData.amountTTC,
          amountHT,
          vatAmount,
          amountTTC: formData.amountTTC,
          paymentMethod: formData.paymentMethod || 'cash',
          createdBy: auth.currentUser.uid,
          agentName: auth.currentUser.displayName || 'Agent',
          createdAt: new Date().toISOString()
        });
      }

      addNotification('success', 'Succès', 'Assurance enregistrée');
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'insurances');
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      vehicleId: '',
      provider: '',
      policyNumber: '',
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(new Date(new Date().setFullYear(new Date().getFullYear() + 1)), 'yyyy-MM-dd'),
      amountTTC: 0,
      status: 'active',
      notes: ''
    });
    setEditingId(null);
  };

  const handleEdit = (ins: Insurance) => {
    setFormData(ins);
    setEditingId(ins.id);
    setIsModalOpen(true);
  };

  const filteredInsurances = insurances.filter(ins => 
    ins.vehiclePlate?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    ins.provider.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ins.policyNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            Gestion des Assurances
          </h2>
        </div>
        <button
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
        >
          <Plus className="w-5 h-5" />
          Nouvelle Assurance
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-100">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="text"
              placeholder="Plaque, Assureur, Police..."
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
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-400 uppercase tracking-widest">Véhicule</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-400 uppercase tracking-widest">Assureur / Police</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-400 uppercase tracking-widest">Période</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-400 uppercase tracking-widest">Prix (HT / TTC)</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-400 uppercase tracking-widest">Statut</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-stone-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredInsurances.map((ins) => (
                <tr key={ins.id} className="hover:bg-stone-50/50 group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Car className="w-5 h-5 text-stone-400" />
                      <span className="font-bold text-stone-900">{ins.vehiclePlate}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-stone-900">{ins.provider}</span>
                      <span className="text-xs text-stone-500">{ins.policyNumber}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col text-sm">
                      <span className="text-stone-600">Du: {format(new Date(ins.startDate), 'dd/MM/yyyy')}</span>
                      <span className="font-bold text-emerald-600">Au: {format(new Date(ins.endDate), 'dd/MM/yyyy')}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-stone-900">{ins.amountTTC.toLocaleString()} TND</span>
                      <span className="text-[10px] text-stone-400">HT: {ins.amountHT.toFixed(3)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${new Date(ins.endDate) < new Date() ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {new Date(ins.endDate) < new Date() ? 'EXPIRED' : ins.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleEdit(ins)} className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteModal({ isOpen: true, id: ins.id })} className="p-2 hover:bg-red-50 text-red-600 rounded-lg"><Trash2 className="w-4 h-4" /></button>
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
            <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-xl bg-white rounded-3xl overflow-hidden p-8">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                {editingId ? 'Modifier Assurance' : 'Nouvelle Assurance'}
              </h3>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-400 uppercase">Véhicule</label>
                    <select required value={formData.vehicleId} onChange={(e) => setFormData({...formData, vehicleId: e.target.value})} className="w-full p-3 bg-stone-50 rounded-xl border-none outline-none">
                      <option value="">Sélectionner...</option>
                      {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} - {v.brand}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-400 uppercase">Assureur</label>
                    <input type="text" required value={formData.provider} onChange={(e) => setFormData({...formData, provider: e.target.value})} className="w-full p-3 bg-stone-50 rounded-xl border-none outline-none" placeholder="Nom de l'assureur" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-400 uppercase">Numéro de Police</label>
                    <input type="text" required value={formData.policyNumber} onChange={(e) => setFormData({...formData, policyNumber: e.target.value})} className="w-full p-3 bg-stone-50 rounded-xl border-none outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-400 uppercase">Montant TTC (19% TVA)</label>
                    <input type="number" step="0.001" required value={formData.amountTTC} onChange={(e) => setFormData({...formData, amountTTC: parseFloat(e.target.value) || 0})} className="w-full p-3 bg-stone-50 rounded-xl border-none outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-400 uppercase">Date Début</label>
                    <input type="date" required value={formData.startDate} onChange={(e) => setFormData({...formData, startDate: e.target.value})} className="w-full p-3 bg-stone-50 rounded-xl border-none outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-400 uppercase">Date Fin</label>
                    <input type="date" required value={formData.endDate} onChange={(e) => setFormData({...formData, endDate: e.target.value})} className="w-full p-3 bg-stone-50 rounded-xl border-none outline-none" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-400 uppercase">Notes</label>
                  <textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} className="w-full p-3 bg-stone-50 rounded-xl border-none outline-none h-20 resize-none" />
                </div>

                <div className="space-y-1">
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
                        onClick={() => setFormData({...formData, paymentMethod: m.id as PaymentMethod})}
                        className={clsx(
                          "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                          formData.paymentMethod === m.id ? "border-emerald-600 bg-emerald-50 text-emerald-600" : "border-stone-100 text-stone-400 hover:border-stone-200"
                        )}
                      >
                        <m.icon className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase">{m.label}</span>
                      </button>
                    ))}
                  </div>
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
            await deleteDoc(doc(db, 'insurances', deleteModal.id));
            setDeleteModal({ isOpen: false, id: '' });
          } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, 'insurances');
          }
        }}
        title="Supprimer Assurance"
        message="Voulez-vous vraiment supprimer cet enregistrement ?"
      />
    </div>
  );
}
