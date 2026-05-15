import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, where } from '../lib/api';
import { db, auth } from '../lib/api';
import { useOffice } from '../contexts/OfficeContext';
import { useNotifications } from './NotificationContext';
import { logActivity } from '../services/logService';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx } from 'clsx';
import { 
  Plus, Search, Calendar, User, Clock, 
  Car as CarIcon, Trash2, XCircle 
} from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { Expense, Vehicle, PaymentMethod } from '../types';
import { DeleteModal } from './DeleteModal';

export function ExpenseList() {
  const { currentOffice } = useOffice();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id: string }>({ isOpen: false, id: '' });

  useEffect(() => {
    if (!currentOffice) return;

    const unsubExpenses = onSnapshot(query(collection(db, 'expenses'), where('officeId', '==', currentOffice.id), orderBy('date', 'desc')), (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Expense[]);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'expenses');
    });

    const unsubVehicles = onSnapshot(query(collection(db, 'vehicles'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vehicle[]);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'vehicles');
    });

    return () => {
      unsubExpenses();
      unsubVehicles();
    };
  }, [currentOffice]);

  const handleDelete = async (id: string) => {
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, 'expenses', id));
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'delete_expense', `Dépense supprimée`, auth.currentUser.displayName || undefined);
      }
      setDeleteModal({ isOpen: false, id: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `expenses/${id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredExpenses = expenses.filter(expense => 
    expense.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    expense.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getVehicleLabel = (id?: string) => {
    if (!id) return 'Général';
    const v = vehicles.find(v => v.id === id);
    return v ? `${v.brand} ${v.model} (${v.plate})` : 'Inconnu';
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Dépenses & Paiements Divers</h2>
          <p className="text-stone-500 italic serif">Suivi des coûts opérationnels (carburant, entretien, leasing, etc.).</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 bg-stone-900 text-white py-3 px-6 rounded-2xl font-semibold hover:bg-stone-800 transition-all shadow-lg"
        >
          <Plus className="w-5 h-5" />
          Nouvelle dépense
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-100 flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="text"
              placeholder="Rechercher une dépense..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-stone-50/50 text-stone-400 text-xs font-bold uppercase tracking-widest">
                <th className="px-8 py-4">Date</th>
                <th className="px-8 py-4">Agent</th>
                <th className="px-8 py-4">Créé le</th>
                <th className="px-8 py-4">Type</th>
                <th className="px-8 py-4">Description</th>
                <th className="px-8 py-4">Véhicule</th>
                <th className="px-8 py-4">Montant</th>
                <th className="px-8 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredExpenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-stone-50/50 transition-all group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2 text-sm text-stone-600">
                      <Calendar className="w-4 h-4 text-stone-400" />
                      <span>{format(new Date(expense.date), 'dd MMM yyyy', { locale: fr })}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3 text-emerald-600" />
                      <span className="text-sm font-medium text-stone-900">{expense.agentName || 'Inconnu'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    {expense.createdAt && (
                      <div className="flex items-center gap-2 text-xs text-stone-400">
                        <Clock className="w-3 h-3" />
                        <span>{format(new Date(expense.createdAt), 'dd/MM/yy HH:mm', { locale: fr })}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-8 py-5">
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md border ${
                      expense.type === 'gas' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                      expense.type === 'maintenance' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                      expense.type === 'leasing' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                      expense.type === 'wash' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                      expense.type === 'salary' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                      'bg-stone-100 text-stone-600 border-stone-200'
                    }`}>
                      {expense.type === 'gas' ? 'Carburant' : 
                       expense.type === 'maintenance' ? 'Entretien' :
                       expense.type === 'leasing' ? 'Leasing' :
                       expense.type === 'insurance' ? 'Assurance' :
                       expense.type === 'wash' ? 'Lavage' :
                       expense.type === 'salary' ? 'Salaire' :
                       expense.type === 'tax' ? 'Taxe' : 'Autre'}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <p className="text-sm font-medium text-stone-900">{expense.description}</p>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2 text-sm text-stone-500">
                      <CarIcon className="w-3 h-3" />
                      <span>{getVehicleLabel(expense.vehicleId)}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col">
                      <p className="font-bold text-red-600">-( { (expense.amountTTC || expense.amount || 0).toLocaleString() } ) TND</p>
                      <p className="text-[10px] text-stone-400">TTC (inc 19% TVA)</p>
                      <p className="text-[10px] text-stone-500">HT: { (expense.amountHT || ( (expense.amountTTC || expense.amount) / 1.19 ) || 0).toFixed(3) }</p>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <button
                      onClick={() => setDeleteModal({ isOpen: true, id: expense.id })}
                      className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <ExpenseModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          vehicles={vehicles}
        />
      )}

      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '' })}
        onConfirm={() => handleDelete(deleteModal.id)}
        title="Supprimer la dépense"
        message="Êtes-vous sûr de vouloir supprimer cette dépense ? Cette action est irréversible."
      />
    </div>
  );
}

function ExpenseModal({ isOpen, onClose, vehicles }: { isOpen: boolean, onClose: () => void, vehicles: Vehicle[] }) {
  const { currentOffice } = useOffice();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    type: 'other' as Expense['type'],
    description: '',
    amount: 0,
    paymentMethod: 'cash' as PaymentMethod,
    vehicleId: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOffice) return;
    try {
      setIsSaving(true);
      const amountTTC = formData.amount;
      const amountHT = amountTTC / 1.19;
      const vatAmount = amountTTC - amountHT;
      
      await addDoc(collection(db, 'expenses'), {
        ...formData,
        amountHT,
        vatAmount,
        amountTTC,
        createdBy: auth.currentUser?.uid || 'system',
        agentName: auth.currentUser?.displayName || 'Agent',
        createdAt: new Date().toISOString(),
        officeId: currentOffice.id
      });
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'add_expense', `Dépense ajoutée: ${formData.description} (${formData.amount} TND)`, auth.currentUser.displayName || undefined);
      }
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'expenses');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 resizable-modal">
        <div className="p-8 border-b border-stone-100 flex items-center justify-between">
          <h3 className="text-2xl font-bold text-stone-900">Nouvelle Dépense</h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Date</label>
            <input
              type="date"
              required
              value={formData.date}
              onChange={(e) => setFormData({...formData, date: e.target.value})}
              className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Type</label>
            <select
              required
              value={formData.type}
              onChange={(e) => setFormData({...formData, type: e.target.value as any})}
              className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
            >
              <option value="gas">Carburant</option>
              <option value="maintenance">Entretien</option>
              <option value="leasing">Leasing</option>
              <option value="insurance">Assurance</option>
              <option value="salary">Salaire</option>
              <option value="tax">Taxe</option>
              <option value="other">Autre</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Description</label>
            <input
              type="text"
              required
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              placeholder="Ex: Plein d'essence Clio"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Montant (TND)</label>
            <input
              type="number"
              required
              value={formData.amount}
              onChange={(e) => setFormData({...formData, amount: Number(e.target.value)})}
              className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Véhicule (Optionnel)</label>
            <select
              value={formData.vehicleId}
              onChange={(e) => setFormData({...formData, vehicleId: e.target.value})}
              className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Général</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plate})</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest ml-1">Mode de Paiement</label>
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
                    "py-3 rounded-xl border-2 text-[10px] font-bold uppercase transition-all",
                    formData.paymentMethod === m.id ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-stone-50 text-stone-400 hover:border-stone-100 bg-stone-50"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg disabled:opacity-50"
          >
            {isSaving ? 'Enregistrement...' : 'Enregistrer la dépense'}
          </button>
        </form>
      </div>
    </div>
  );
}
