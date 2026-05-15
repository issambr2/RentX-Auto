import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDocs, where } from '../lib/api';
import { db } from '../lib/api';
import { Vehicle, GPSIntegration as GPSIntegrationType } from '../types';
import { Globe, Plus, Trash2, Edit2, CheckCircle2, XCircle, AlertCircle, ExternalLink, Save, Search, Filter, MapPin, Car, Info } from 'lucide-react';
import { clsx } from 'clsx';
import { useLanguage } from '../contexts/LanguageContext';
import { useOffice } from '../contexts/OfficeContext';
import { DeleteModal } from './DeleteModal';
import { GuideModal } from './GuideModal';

const GPS_PROVIDERS = [
  { id: 'teltonika', name: 'Teltonika', logo: 'https://teltonika-iot-group.com/favicon.ico' },
  { id: 'ruptela', name: 'Ruptela', logo: 'https://www.ruptela.com/favicon.ico' },
  { id: 'calamp', name: 'CalAmp', logo: 'https://www.calamp.com/favicon.ico' },
  { id: 'traccar', name: 'Traccar (Open Source)', logo: 'https://www.traccar.org/favicon.ico' },
  { id: 'gpswox', name: 'GPSWOX', logo: 'https://www.gpswox.com/favicon.ico' },
  { id: 'generic', name: 'Generic API / Webhook', logo: null },
];

export function GPSIntegration() {
  const { t } = useLanguage();
  const { currentOffice } = useOffice();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [integrations, setIntegrations] = useState<GPSIntegrationType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id: string }>({ isOpen: false, id: '' });
  const [editingIntegration, setEditingIntegration] = useState<GPSIntegrationType | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState({
    vehicleId: '',
    providerName: 'teltonika',
    model: '',
    deviceId: '',
    apiKey: '',
    apiSecret: '',
    trackingUrl: '',
    status: 'active' as 'active' | 'inactive' | 'error',
  });

  useEffect(() => {
    if (!currentOffice) return;

    const vQuery = query(collection(db, 'vehicles'), where('officeId', '==', currentOffice.id));
    const iQuery = query(collection(db, 'gps_integrations'), where('officeId', '==', currentOffice.id));

    const unsubscribeV = onSnapshot(vQuery, (snapshot) => {
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle)));
    });

    const unsubscribeI = onSnapshot(iQuery, (snapshot) => {
      setIntegrations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GPSIntegrationType)));
      setLoading(false);
    });

    return () => {
      unsubscribeV();
      unsubscribeI();
    };
  }, [currentOffice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingIntegration?.id) {
        await updateDoc(doc(db, 'gps_integrations', editingIntegration.id), {
          ...formData,
          lastUpdate: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'gps_integrations'), {
          ...formData,
          lastUpdate: serverTimestamp(),
          officeId: currentOffice?.id
        });
      }
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error saving GPS integration:", error);
    }
  };

  const resetForm = () => {
    setFormData({
      vehicleId: '',
      providerName: 'teltonika',
      model: '',
      deviceId: '',
      apiKey: '',
      apiSecret: '',
      trackingUrl: '',
      status: 'active',
    });
    setEditingIntegration(null);
  };

  const handleEdit = (integration: GPSIntegrationType) => {
    setEditingIntegration(integration);
    setFormData({
      vehicleId: integration.vehicleId,
      providerName: integration.providerName,
      model: integration.model || '',
      deviceId: integration.deviceId,
      apiKey: integration.apiKey || '',
      apiSecret: integration.apiSecret || '',
      trackingUrl: integration.trackingUrl || '',
      status: integration.status,
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'gps_integrations', id));
    } catch (error) {
      console.error("Error deleting GPS integration:", error);
    }
  };

  const getVehicleInfo = (vehicleId: string) => {
    return vehicles.find(v => v.id === vehicleId);
  };

  const filteredIntegrations = integrations.filter(integration => {
    const vehicle = getVehicleInfo(integration.vehicleId);
    const searchStr = `${vehicle?.brand} ${vehicle?.model} ${vehicle?.plate} ${integration.deviceId} ${integration.providerName}`.toLowerCase();
    return searchStr.includes(searchTerm.toLowerCase());
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold text-stone-900 tracking-tight flex items-center gap-2">
              <Globe className="w-6 h-6 text-emerald-600" />
              Intégration GPS
            </h2>
            <p className="text-stone-500 text-sm italic serif mt-1">
              Gérez le suivi en temps réel de votre flotte avec n'importe quel logiciel GPS
            </p>
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
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="flex items-center gap-2 bg-stone-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg"
        >
          <Plus className="w-5 h-5" />
          Nouvelle Intégration
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-stone-200 overflow-hidden">
        <div className="p-6 border-b border-stone-100 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="text"
              placeholder="Rechercher par véhicule, IMEI, fournisseur..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-stone-50/50">
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-400 uppercase tracking-widest">Véhicule</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-400 uppercase tracking-widest">Fournisseur</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-400 uppercase tracking-widest">ID Appareil (IMEI)</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-400 uppercase tracking-widest">Statut</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-stone-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredIntegrations.map((integration) => {
                const vehicle = getVehicleInfo(integration.vehicleId);
                const provider = GPS_PROVIDERS.find(p => p.id === integration.providerName);
                
                return (
                  <tr key={integration.id} className="hover:bg-stone-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center">
                          <Car className="w-5 h-5 text-stone-400" />
                        </div>
                        <div>
                          <p className="font-bold text-stone-900">{vehicle?.brand} {vehicle?.model}</p>
                          <p className="text-xs text-stone-500 tabular-nums">{vehicle?.plate}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {provider?.logo ? (
                          <img src={provider.logo} alt={provider.name} className="w-5 h-5 rounded" />
                        ) : (
                          <Globe className="w-5 h-5 text-stone-400" />
                        )}
                        <span className="text-sm font-medium text-stone-700">{provider?.name || integration.providerName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <code className="text-xs bg-stone-100 px-2 py-1 rounded-lg text-stone-600 font-mono">
                        {integration.deviceId}
                      </code>
                    </td>
                    <td className="px-6 py-4">
                      <span className={clsx(
                        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                        integration.status === 'active' ? "bg-emerald-50 text-emerald-700" :
                        integration.status === 'error' ? "bg-red-50 text-red-700" : "bg-stone-100 text-stone-600"
                      )}>
                        {integration.status === 'active' ? <CheckCircle2 className="w-3 h-3" /> :
                         integration.status === 'error' ? <AlertCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {integration.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {integration.trackingUrl && (
                          <a
                            href={integration.trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                            title="Ouvrir le suivi"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        <button
                          onClick={() => handleEdit(integration)}
                          className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteModal({ isOpen: true, id: integration.id! })}
                          className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredIntegrations.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Globe className="w-12 h-12 text-stone-200" />
                      <p className="text-stone-400 font-medium italic serif">Aucune intégration GPS trouvée</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-stone-200">
            <div className="p-8 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <div>
                <h3 className="text-xl font-bold text-stone-900 tracking-tight">
                  {editingIntegration ? 'Modifier l\'intégration' : 'Nouvelle intégration GPS'}
                </h3>
                <p className="text-stone-500 text-xs italic serif mt-1">Configurez la connexion avec votre matériel GPS</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-stone-200 rounded-xl transition-colors">
                <XCircle className="w-6 h-6 text-stone-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Véhicule</label>
                  <select
                    required
                    value={formData.vehicleId}
                    onChange={(e) => setFormData({ ...formData, vehicleId: e.target.value })}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Sélectionner un véhicule</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plate})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Fournisseur / Logiciel</label>
                  <select
                    required
                    value={formData.providerName}
                    onChange={(e) => setFormData({ ...formData, providerName: e.target.value })}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    {GPS_PROVIDERS.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Modèle GPS</label>
                  <input
                    type="text"
                    placeholder="ex: FMB920, GV300..."
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">ID Appareil / IMEI</label>
                  <input
                    required
                    type="text"
                    placeholder="Numéro de série ou IMEI"
                    value={formData.deviceId}
                    onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Clé API (Optionnel)</label>
                  <input
                    type="password"
                    value={formData.apiKey}
                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Statut</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="active">Actif</option>
                    <option value="inactive">Inactif</option>
                    <option value="error">Erreur / Maintenance</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">URL de Suivi / Endpoint API</label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                  <input
                    type="url"
                    placeholder="https://tracking.provider.com/api/v1/..."
                    value={formData.trackingUrl}
                    onChange={(e) => setFormData({ ...formData, trackingUrl: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <p className="text-[10px] text-stone-400 italic">Lien direct vers la plateforme de suivi ou endpoint de données.</p>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-3 rounded-xl font-bold text-stone-500 hover:bg-stone-100 transition-all"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="bg-stone-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-stone-800 transition-all shadow-lg flex items-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  {editingIntegration ? 'Mettre à jour' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '' })}
        onConfirm={() => handleDelete(deleteModal.id)}
        title="Supprimer l'intégration"
        message="Êtes-vous sûr de vouloir supprimer cette intégration GPS ? Cette action est irréversible."
      />

      <GuideModal 
        isOpen={isHelpOpen} 
        onClose={() => setIsHelpOpen(false)} 
        activeTab="gps"
      />
    </div>
  );
}
