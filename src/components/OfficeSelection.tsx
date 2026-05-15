import React, { useState } from 'react';
import { useOffice } from '../contexts/OfficeContext';
import { Car, MapPin, ChevronRight, Building2, Plus, XCircle } from 'lucide-react';
import { db } from '../lib/api';
import { collection, addDoc } from '../lib/api';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'motion/react';

export function OfficeSelection() {
  const { offices, setCurrentOffice } = useOffice();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newOfficeName, setNewOfficeName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateOffice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOfficeName.trim()) return;

    setIsCreating(true);
    try {
      const docRef = await addDoc(collection(db, 'offices'), {
        name: newOfficeName.trim(),
        isActive: true,
        createdAt: new Date().toISOString()
      });
      
      const newOffice = {
        id: docRef.id,
        name: newOfficeName.trim(),
        isActive: true
      };

      setNewOfficeName('');
      setShowCreateModal(false);
      
      // Auto-select the newly created office
      setCurrentOffice(newOffice);
    } catch (error) {
      console.error("Error creating office:", error);
      alert("Erreur lors de la création du bureau");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
      <div className="max-w-2xl w-full">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Building2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-4xl font-black text-stone-900 mb-4 tracking-tight">Sélection du Bureau</h1>
          <p className="text-stone-500 text-lg italic serif">Veuillez choisir le bureau dans lequel vous travaillez aujourd'hui.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {offices.map((office, index) => (
            <motion.button
              key={office.id}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setCurrentOffice(office)}
              className="group relative bg-white p-8 rounded-3xl border border-stone-200 shadow-sm hover:shadow-xl hover:border-emerald-500 transition-all text-left overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <Building2 className="w-32 h-32" />
              </div>
              
              <div className="relative z-10">
                <div className="w-14 h-14 bg-stone-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                  <MapPin className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-bold text-stone-900 mb-2">{office.name}</h3>
                <p className="text-stone-500 text-sm mb-6">Accédez à la gestion des véhicules et contrats de ce bureau.</p>
                
                <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm uppercase tracking-widest">
                  Sélectionner
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </motion.button>
          ))}

          <motion.button
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: offices.length * 0.1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowCreateModal(true)}
            className="group relative bg-stone-100 p-8 rounded-3xl border-2 border-dashed border-stone-300 hover:border-emerald-500 hover:bg-emerald-50/30 transition-all text-left flex flex-col items-center justify-center text-center"
          >
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mb-4 group-hover:text-emerald-600 transition-colors shadow-sm">
              <Plus className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-stone-900 mb-1">Ajouter un Bureau</h3>
            <p className="text-stone-500 text-xs italic">Créez un nouveau point de vente ou succursale.</p>
          </motion.button>
          
          {offices.length === 0 && !showCreateModal && (
            <div className="col-span-full bg-white p-12 rounded-[2.5rem] border border-stone-200 text-center shadow-xl">
              <div className="w-20 h-20 bg-stone-100 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-stone-400">
                <Building2 className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-stone-900 mb-4">Aucun Bureau Trouvé</h3>
              <p className="text-stone-500 mb-8 max-w-md mx-auto italic serif">
                Il semble qu'aucun bureau ne soit configuré. Créez votre premier bureau pour commencer.
              </p>
            </div>
          )}
        </div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-12"
        >
          <p className="text-xs text-stone-400 font-bold uppercase tracking-widest">
            Vous pourrez changer de bureau à tout moment depuis les paramètres.
          </p>
        </motion.div>
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-8 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
                <div>
                  <h3 className="text-2xl font-bold text-stone-900">Nouveau Bureau</h3>
                  <p className="text-xs text-stone-400 mt-1 uppercase tracking-widest font-black">Configuration initiale</p>
                </div>
                <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-white rounded-full text-stone-400 transition-colors shadow-sm">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleCreateOffice} className="p-8 space-y-6">
                <div className="space-y-4">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest block ml-1">
                    Nom du Bureau
                  </label>
                  <div className="relative group">
                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-300 group-focus-within:text-emerald-500 transition-colors" />
                    <input
                      autoFocus
                      required
                      value={newOfficeName}
                      onChange={(e) => setNewOfficeName(e.target.value)}
                      placeholder="Ex: Agence Tunis Centre"
                      className="w-full pl-12 pr-4 py-4 bg-stone-50 border-2 border-transparent rounded-2xl focus:border-emerald-500 focus:bg-white transition-all font-bold text-stone-900"
                    />
                  </div>
                  <p className="text-[10px] text-stone-400 italic ml-1">
                    Après la création, vous pourrez configurer les coordonnées complètes dans les paramètres.
                  </p>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-6 py-4 rounded-2xl font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all"
                  >
                    Annuler
                  </button>
                  <button
                    disabled={isCreating || !newOfficeName.trim()}
                    type="submit"
                    className="flex-1 px-6 py-4 rounded-2xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-xl shadow-emerald-600/20 transition-all disabled:opacity-50"
                  >
                    {isCreating ? 'Création...' : 'Créer le bureau'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
