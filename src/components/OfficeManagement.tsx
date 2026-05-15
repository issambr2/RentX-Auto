import React, { useState } from 'react';
import { useOffice } from '../contexts/OfficeContext';
import { Building2, Plus, Trash2, MapPin, Phone, Mail, Globe, Save, X } from 'lucide-react';
import { db } from '../lib/api';
import { collection, addDoc, doc, deleteDoc, updateDoc } from '../lib/api';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import { ConfirmationModal } from './ConfirmationModal';
import { UserProfile } from '../types';

interface OfficeManagementProps {
  profile: UserProfile | null;
}

export function OfficeManagement({ profile }: OfficeManagementProps) {
  const { offices } = useOffice();
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteOfficeId, setDeleteOfficeId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    isActive: true
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setIsSaving(true);
    try {
      await addDoc(collection(db, 'offices'), {
        ...formData,
        createdAt: new Date().toISOString()
      });
      setIsAdding(false);
      setFormData({ name: '', address: '', phone: '', email: '', isActive: true });
    } catch (error) {
      console.error("Error adding office:", error);
      alert("Erreur lors de l'ajout du bureau");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteOfficeId) return;

    try {
      await deleteDoc(doc(db, 'offices', deleteOfficeId));
      setDeleteOfficeId(null);
    } catch (error) {
      console.error("Error deleting office:", error);
      alert("Erreur lors de la suppression du bureau");
    }
  };

  const toggleStatus = async (officeId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'offices', officeId), {
        isActive: !currentStatus
      });
    } catch (error) {
      console.error("Error updating office status:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-stone-900">Gestion des Bureaux</h3>
          <p className="text-stone-500 text-sm italic">Ajoutez ou supprimez les succursales et points de vente de votre agence.</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20"
        >
          <Plus className="w-4 h-4" />
          Nouveau Bureau
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {offices.map((office) => (
          <div 
            key={office.id}
            className={clsx(
              "group relative bg-white p-6 rounded-3xl border border-stone-200 shadow-sm transition-all hover:shadow-md",
              !office.isActive && "opacity-60 grayscale"
            )}
          >
            <div className="flex items-start justify-between mb-6">
              <div className="w-12 h-12 bg-stone-50 rounded-2xl flex items-center justify-center text-stone-400 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleStatus(office.id, !!office.isActive)}
                  className={clsx(
                    "text-[10px] font-bold px-2 py-1 rounded transition-colors uppercase tracking-widest",
                    office.isActive ? "bg-emerald-50 text-emerald-600" : "bg-stone-100 text-stone-500"
                  )}
                >
                  {office.isActive ? 'Actif' : 'Inactif'}
                </button>
                <button
                  onClick={() => setDeleteOfficeId(office.id)}
                  className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  title="Supprimer le bureau"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-lg font-bold text-stone-900 leading-tight">{office.name}</h4>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-stone-500">
                  <MapPin className="w-4 h-4 shrink-0" />
                  <span className="text-xs truncate">{office.address || 'Aucune adresse configurée'}</span>
                </div>
                <div className="flex items-center gap-2 text-stone-500">
                  <Phone className="w-4 h-4 shrink-0" />
                  <span className="text-xs">{office.phone || 'Aucun téléphone'}</span>
                </div>
                <div className="flex items-center gap-2 text-stone-500">
                  <Mail className="w-4 h-4 shrink-0" />
                  <span className="text-xs truncate">{office.email || 'Aucun email'}</span>
                </div>
              </div>
            </div>
          </div>
        ))}

        {offices.length === 0 && (
          <div className="col-span-full py-12 bg-stone-50 rounded-3xl border-2 border-dashed border-stone-200 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mb-4 text-stone-300">
              <Building2 className="w-8 h-8" />
            </div>
            <h4 className="text-stone-900 font-bold mb-1">Aucun bureau configuré</h4>
            <p className="text-stone-500 text-xs italic">Commencez par ajouter votre premier bureau.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-8 border-b border-stone-100 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-stone-900">Nouveau Bureau</h3>
                  <p className="text-xs text-stone-400 mt-1 uppercase tracking-widest font-bold">Configuration de l'agence</p>
                </div>
                <button 
                  onClick={() => setIsAdding(false)} 
                  className="p-2 hover:bg-stone-50 rounded-full text-stone-400 transition-all active:scale-95"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleAdd} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Nom du bureau</label>
                    <div className="relative group">
                      <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300 group-focus-within:text-emerald-500 transition-colors" />
                      <input
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-100 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-bold"
                        placeholder="Ex: Agence Tunis Centre"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Adresse complète</label>
                    <div className="relative group">
                      <MapPin className="absolute left-4 top-4 w-4 h-4 text-stone-300 group-focus-within:text-emerald-500 transition-colors" />
                      <textarea
                        value={formData.address}
                        onChange={(e) => setFormData({...formData, address: e.target.value})}
                        className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-100 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-bold min-h-[100px]"
                        placeholder="Rue, ville, code postal..."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Téléphone</label>
                      <div className="relative group">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300 group-focus-within:text-emerald-500 transition-colors" />
                        <input
                          value={formData.phone}
                          onChange={(e) => setFormData({...formData, phone: e.target.value})}
                          className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-100 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-bold"
                          placeholder="+216 ..."
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Email</label>
                      <div className="relative group">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300 group-focus-within:text-emerald-500 transition-colors" />
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({...formData, email: e.target.value})}
                          className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-100 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-bold"
                          placeholder="agence@exemple.com"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-4 border-t border-stone-50 mt-8">
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="flex-1 px-8 py-4 bg-stone-100 text-stone-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-stone-200 transition-all active:scale-95"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-2 px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-500 shadow-xl shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isSaving ? 'Enregistrement...' : 'Enregistrer le bureau'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={!!deleteOfficeId}
        onClose={() => setDeleteOfficeId(null)}
        onConfirm={handleDelete}
        title="Supprimer le bureau"
        message="Êtes-vous sûr de vouloir supprimer ce bureau ? Cette action est irréversible et pourrait affecter les données liées (véhicules, locations)."
        confirmText="Supprimer"
        type="danger"
      />
    </div>
  );
}
