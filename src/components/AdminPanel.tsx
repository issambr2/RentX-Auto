import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, updateDoc, doc, query, orderBy, limit, addDoc, getDocs, writeBatch, deleteDoc, setDoc, where, getDoc } from '../lib/api';
import { db, auth } from '../lib/api';
import { UserProfile, UserRole, ActivityLog, Vehicle, Client, SystemSettings, Office } from '../types';
import { Settings, Users, Shield, Activity, Search, Filter, Download, CheckCircle, XCircle, Clock, Globe, Database, Zap, UserPlus, User, Loader2, MapPin, Phone, Mail, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx } from 'clsx';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { logActivity } from '../services/logService';
import { useNotifications } from './NotificationContext';
import { ConfirmationModal } from './ConfirmationModal';
import { useOffice } from '../contexts/OfficeContext';

import { getWarningPeriod, setWarningPeriod as setWarningPeriodService } from '../services/alertService';

export function AdminPanel({ initialTab = 'logs', profile }: { initialTab?: 'logs' | 'system', profile?: UserProfile | null }) {
  const { currentOffice } = useOffice();
  const [activeSubTab, setActiveSubTab] = useState<'logs' | 'system'>(initialTab);
  const isMasterAdmin = profile?.role === 'master_admin';
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [logFilter, setLogFilter] = useState('');
  const [userFilter, setUserFilter] = useState('all');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isRepairModalOpen, setIsRepairModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [maintenanceLogs, setMaintenanceLogs] = useState<string[]>([]);
  const [warningPeriod, setWarningPeriodState] = useState(15);
  const [officeInfo, setOfficeInfo] = useState<Partial<Office>>({
    name: '',
    address: '',
    phone: '',
    email: ''
  });
  const [settings, setSettings] = useState<SystemSettings>({
    agencyName: 'RentX Auto',
    agencyAddress: 'Rue Taieb Hachicha M\'saken A côté café Vegas',
    agencyPhone: '24621605 | 53666895',
    agencyEmail: 'contact@rentx.tn',
    agencyMF: '114739OR/A/M 000',
    agencyLogo: '',
    currency: 'TND',
    taxRate: 19,
    warningPeriod: 15,
    chauffeurPrice: 50,
    rentalTerms: '1. Le locataire s\'engage à restituer le véhicule dans le même état qu\'au départ.\n2. Le carburant est à la charge du locataire.\n3. En cas d\'accident, le locataire doit fournir un constat amiable sous 24h.\n4. Le véhicule est assuré pour la location, mais une franchise reste à la charge du locataire en cas de sinistre responsable.'
  });
  const { addNotification } = useNotifications();

  useEffect(() => {
    const logsQuery = query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), limit(100));
    const unsubLogs = onSnapshot(logsQuery, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ActivityLog[]);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'activity_logs');
    });

    // Load settings
    const unsubSettings = onSnapshot(doc(db, 'settings', 'system'), (snapshot) => {
      if (snapshot.exists()) {
        setSettings(snapshot.data() as SystemSettings);
        setWarningPeriodState(snapshot.data().warningPeriod || 15);
      }
    });

    // Load current office info
    if (currentOffice) {
      setOfficeInfo({
        name: currentOffice.name || '',
        address: currentOffice.address || '',
        phone: currentOffice.phone || '',
        email: (currentOffice as any).email || ''
      });
    }

    return () => {
      unsubLogs();
      unsubSettings();
    };
  }, [currentOffice]);

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setWarningPeriodService(warningPeriod);
      await updateDoc(doc(db, 'settings', 'system'), { ...settings, warningPeriod });
      
      // Update office info if editing current office
      if (currentOffice) {
        await updateDoc(doc(db, 'offices', currentOffice.id), {
          ...officeInfo,
          updatedAt: new Date().toISOString()
        });
      }

      addNotification('success', 'Paramètres mis à jour', 'Les paramètres du système et du bureau ont été enregistrés avec succès.');
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'update_settings', 'Mise à jour des paramètres système', auth.currentUser.displayName || undefined);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/system');
    }
  };

  const addMaintenanceLog = (msg: string) => {
    setMaintenanceLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 10));
  };

  const exportLogs = () => {
    const csvContent = [
      ['Date', 'Utilisateur', 'Action', 'Description', 'IP Address'],
      ...logs.map(log => [
        (() => {
          try {
            return format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss');
          } catch (e) {
            return 'Invalid Date';
          }
        })(),
        log.userName || 'Système',
        log.action,
        log.description,
        log.ipAddress || ''
      ])
    ].map(e => e.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `audit_logs_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportData = async () => {
    setIsProcessing(true);
    setMaintenanceLogs(['Démarrage de l\'exportation complète...']);
    try {
      const backup: any = {};
      
      const collections = [
        'vehicles', 'clients', 'rentals', 'activity_logs', 
        'expenses', 'maintenances', 'offices', 
        'washes', 'leasings', 'stock', 'stockMovements',
        'workers', 'attendance', 'salaryAdvances', 'salaryPayments', 'salaryTransactions',
        'notifications', 'gps_integrations'
      ];
      
      for (const colName of collections) {
        addMaintenanceLog(`Exportation de ${colName}...`);
        try {
          const snapshot = await getDocs(collection(db, colName));
          backup[colName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (colErr) {
          addMaintenanceLog(`ERREUR sur ${colName}: ${colErr instanceof Error ? colErr.message : 'Permission refusée'}`);
          // Continue with other collections
        }
      }

      // Special case for settings (document vs collection)
      addMaintenanceLog('Exportation des paramètres...');
      try {
        const settingsRef = doc(db, 'settings', 'system');
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          backup['settings'] = [{ id: 'system', ...settingsSnap.data() }];
        }
      } catch (settingsErr) {
        addMaintenanceLog(`ERREUR sur settings/system: ${settingsErr instanceof Error ? settingsErr.message : 'Permission refusée'}`);
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup_rentx_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      addMaintenanceLog('Exportation terminée avec succès.');
      addNotification('success', 'Exportation réussie', 'Toutes les données ont été exportées.');
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'export_json', 'Exportation complète effectuée', auth.currentUser.displayName || undefined);
      }
    } catch (error) {
      addMaintenanceLog(`ERREUR: ${error instanceof Error ? error.message : 'Inconnue'}`);
      handleFirestoreError(error, OperationType.GET, 'backup');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      setIsProcessing(true);
      setMaintenanceLogs(['Démarrage de l\'importation...']);
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);
        
        let totalCount = 0;
        
        for (const [colName, docs] of Object.entries(data)) {
          if (!Array.isArray(docs)) continue;
          addMaintenanceLog(`Importation de ${docs.length} documents dans ${colName}...`);
          
          for (let i = 0; i < docs.length; i += 500) {
            const chunk = docs.slice(i, i + 500);
            const batch = writeBatch(db);
            
            chunk.forEach((item: any) => {
              const { id, ...rest } = item;
              const ref = id ? doc(db, colName, id) : doc(collection(db, colName));
              batch.set(ref, rest);
              totalCount++;
            });
            
            await batch.commit();
            addMaintenanceLog(`Progression: ${i + chunk.length}/${docs.length} (${colName})`);
          }
        }

        addMaintenanceLog(`Importation terminée: ${totalCount} documents importés.`);
        addNotification('success', 'Importation réussie', `${totalCount} documents importés.`);
      } catch (error) {
        addMaintenanceLog(`ERREUR IMPORT: ${error instanceof Error ? error.message : 'Inconnue'}`);
        addNotification('error', 'Erreur Importation', 'Le fichier JSON est invalide.');
      } finally {
        setIsProcessing(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleRepair = async () => {
    setIsProcessing(true);
    setMaintenanceLogs(['Lancement du diagnostic système...']);
    try {
      // 1. Settings
      addMaintenanceLog('Vérification des paramètres système...');
      const settingsRef = doc(db, 'settings', 'system');
      const settingsSnap = await getDoc(settingsRef);
      if (!settingsSnap.exists()) {
        await setDoc(settingsRef, settings);
        addMaintenanceLog('Document settings/system recréé.');
      }

      // 2. Offices check
      addMaintenanceLog('Vérification des bureaux...');
      const officesSnap = await getDocs(collection(db, 'offices'));
      let firstOfficeId = '';
      if (officesSnap.empty) {
        const defaultOffices = [
          { id: 'office-main', name: 'Bureau Principal', isActive: true },
          { id: 'office-annex', name: 'Bureau Annexe', isActive: true }
        ];
        for (const office of defaultOffices) {
          await setDoc(doc(db, 'offices', office.id), office);
        }
        firstOfficeId = 'office-main';
        addMaintenanceLog('Bureaux par défaut créés.');
      } else {
        firstOfficeId = officesSnap.docs[0].id;
      }

      // 3. Structural Integrity (Ensure officeId on vehicles and clients)
      addMaintenanceLog('Vérification de l\'intégrité des véhicules...');
      const vehiclesSnap = await getDocs(collection(db, 'vehicles'));
      let fixedVehicles = 0;
      for (const vehicleDoc of vehiclesSnap.docs) {
        if (!vehicleDoc.data().officeId) {
          await updateDoc(vehicleDoc.ref, { officeId: firstOfficeId });
          fixedVehicles++;
        }
      }
      if (fixedVehicles > 0) addMaintenanceLog(`${fixedVehicles} véhicules rattachés au bureau par défaut.`);

      addMaintenanceLog('Vérification de l\'intégrité des clients...');
      const clientsSnap = await getDocs(collection(db, 'clients'));
      let fixedClients = 0;
      for (const clientDoc of clientsSnap.docs) {
        if (!clientDoc.data().officeId) {
          await updateDoc(clientDoc.ref, { officeId: firstOfficeId });
          fixedClients++;
        }
      }
      if (fixedClients > 0) addMaintenanceLog(`${fixedClients} clients rattachés au bureau par défaut.`);

      // 4. Clean empty notifications
      addMaintenanceLog('Nettoyage des notifications obsolètes...');
      const notifsSnap = await getDocs(query(collection(db, 'notifications'), limit(500)));
      const batch = writeBatch(db);
      let deletedNotifs = 0;
      notifsSnap.docs.forEach(d => {
        const data = d.data();
        if (!data.title || !data.message) {
          batch.delete(d.ref);
          deletedNotifs++;
        }
      });
      if (deletedNotifs > 0) await batch.commit();

      // 5. Check for users collection and fix roles for bootstrap admins
      addMaintenanceLog('Vérification des accès administrateurs...');
      const usersRef = collection(db, 'users');
      const bootstrapEmails = ["brahemdesign@gmail.com", "admin@rentx.tn", "siwarbraham98@gmail.com"];
      
      for (const email of bootstrapEmails) {
        const q = query(usersRef, where('email', '==', email));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const userDoc = snap.docs[0];
          if (userDoc.data().role !== 'master_admin') {
            await updateDoc(userDoc.ref, { role: 'master_admin', isActive: true });
            addMaintenanceLog(`Rôle master_admin rétabli pour ${email}.`);
          }
        }
      }

      addMaintenanceLog('Réparation terminée avec succès.');
      addNotification('success', 'Système réparé', 'L\'intégrité des données a été vérifiée.');
    } catch (error) {
      addMaintenanceLog(`ERREUR REPARATION: ${error instanceof Error ? error.message : 'Inconnue'}`);
      handleFirestoreError(error, OperationType.UPDATE, 'repair');
    } finally {
      setIsProcessing(false);
      setIsRepairModalOpen(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('ÊTES-VOUS SÛR ? Cette action est irréversible et supprimera TOUTES les données opérationnelles (locations, dépenses, etc.).')) return;
    
    setIsProcessing(true);
    setMaintenanceLogs(['Lancement de la réinitialisation des données...']);
    try {
      const collectionsToDelete = [
        'rentals', 'activity_logs', 'expenses', 'maintenances', 
        'washes', 'leasings', 'stockMovements', 'attendance', 
        'salaryAdvances', 'salaryPayments', 'salaryTransactions',
        'notifications', 'gps_integrations'
      ];

      // Note: We don't delete vehicles, clients, workers, offices, or users unless explicitly requested
      // as they are structural data.
      
      for (const colName of collectionsToDelete) {
        const snapshot = await getDocs(collection(db, colName));
        // Delete in smaller batches to avoid timeouts/limits
        for (let i = 0; i < snapshot.docs.length; i += 500) {
          const chunk = snapshot.docs.slice(i, i + 500);
          const batch = writeBatch(db);
          chunk.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
        }
      }

      addNotification('success', 'Données réinitialisées', 'Toutes les données opérationnelles ont été supprimées.');
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'reset_data', 'Réinitialisation complète des données opérationnelles', auth.currentUser.displayName || undefined);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'reset');
    } finally {
      setIsProcessing(false);
      setIsResetModalOpen(false);
    }
  };

  const generateSampleData = async () => {
    try {
      // Add a sample vehicle
      await addDoc(collection(db, 'vehicles'), {
        brand: 'Volkswagen',
        model: 'Golf 8',
        year: 2023,
        plate: '220 TN 1234',
        type: 'compact',
        status: 'available',
        pricePerDay: 150,
        fuelType: 'essence',
        transmission: 'automatique',
        mileage: 5000,
        createdAt: new Date().toISOString()
      });

      // Add a sample client
      await addDoc(collection(db, 'clients'), {
        name: 'Ahmed Ben Salem',
        email: 'ahmed@example.com',
        phone: '55 123 456',
        licenseNumber: '12/345678',
        address: 'Tunis, Tunisie',
        createdAt: new Date().toISOString()
      });

      addNotification('success', 'Données générées', 'Un véhicule et un client de test ont été ajoutés.');
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'generate_sample_data', 'Génération de données de test effectuée.', auth.currentUser.displayName || undefined);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'sample_data');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Administration</h2>
          <p className="text-stone-500 italic serif">Gestion des utilisateurs, permissions et audit système.</p>
        </div>
        <div className="flex bg-stone-100 p-1 rounded-2xl">
          <button
            onClick={() => setActiveSubTab('logs')}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
              activeSubTab === 'logs' ? "bg-white text-emerald-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            <Activity className="w-4 h-4" />
            Audit Logs
          </button>
          <button
            onClick={() => setActiveSubTab('system')}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
              activeSubTab === 'system' ? "bg-white text-emerald-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            <Shield className="w-4 h-4" />
            Système
          </button>
        </div>
      </div>

      {activeSubTab === 'logs' && (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-stone-100 flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="flex flex-wrap gap-4 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  placeholder="Rechercher dans les logs..."
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-stone-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-stone-400" />
                <select
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                  className="bg-stone-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 px-4 py-2 min-w-[150px]"
                >
                  <option value="all">Tous les utilisateurs</option>
                  {Array.from(new Set(logs.map(l => l.userName || 'Système'))).sort().map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={exportLogs}
                className="flex items-center gap-2 bg-stone-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-stone-800 transition-all"
              >
                <Download className="w-4 h-4" />
                Exporter CSV
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-stone-50/50 text-stone-400 text-xs font-bold uppercase tracking-widest">
                  <th className="px-8 py-4">Date</th>
                  <th className="px-8 py-4">Agent</th>
                  <th className="px-8 py-4">Action</th>
                  <th className="px-8 py-4">Description</th>
                  <th className="px-8 py-4">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {logs
                  .filter(l => {
                    const matchesSearch = l.action.toLowerCase().includes(logFilter.toLowerCase()) || 
                                         l.description.toLowerCase().includes(logFilter.toLowerCase());
                    const matchesUser = userFilter === 'all' || (l.userName || 'Système') === userFilter;
                    return matchesSearch && matchesUser;
                  })
                  .map((log) => (
                    <tr key={log.id} className="hover:bg-stone-50/50 transition-all">
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-2 text-xs text-stone-500">
                        <Clock className="w-3 h-3" />
                        {(() => {
                          try {
                            return format(new Date(log.timestamp), 'dd/MM HH:mm:ss');
                          } catch (e) {
                            return 'Invalid Date';
                          }
                        })()}
                      </div>
                    </td>
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-2">
                        <User className="w-3 h-3 text-stone-400" />
                        <span className="text-sm font-medium text-stone-900">{log.userName || 'Système'}</span>
                      </div>
                    </td>
                    <td className="px-8 py-4">
                      <span className="text-[10px] font-bold uppercase tracking-widest bg-stone-100 px-2 py-1 rounded-md text-stone-600">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-8 py-4">
                      <p className="text-sm text-stone-900">{log.description}</p>
                    </td>
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-2 text-xs text-stone-400">
                        <Globe className="w-3 h-3" />
                        {log.ipAddress || 'Unknown'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'system' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm col-span-1 md:col-span-2">
            <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-6">Paramètres de l'Agence</h4>
            <form onSubmit={handleUpdateSettings} className="space-y-8">
              {currentOffice && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3 pb-2 border-b border-stone-100">
                    <div className="p-2 bg-emerald-50 rounded-lg">
                      <Building2 className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h5 className="text-sm font-bold text-stone-900">Bureau Actuel: {currentOffice.name}</h5>
                      <p className="text-[10px] text-stone-400 uppercase tracking-widest font-black">Informations de la succursale</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">Nom du Bureau</label>
                      <input
                        type="text"
                        value={officeInfo.name || ''}
                        onChange={(e) => setOfficeInfo({ ...officeInfo, name: e.target.value })}
                        className="w-full px-4 py-2 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-stone-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Mail className="w-3 h-3" /> Email du Bureau
                      </label>
                      <input
                        type="email"
                        value={officeInfo.email || ''}
                        onChange={(e) => setOfficeInfo({ ...officeInfo, email: e.target.value })}
                        className="w-full px-4 py-2 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-stone-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Phone className="w-3 h-3" /> Téléphone du Bureau
                      </label>
                      <input
                        type="text"
                        value={officeInfo.phone || ''}
                        onChange={(e) => setOfficeInfo({ ...officeInfo, phone: e.target.value })}
                        className="w-full px-4 py-2 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-stone-500 uppercase tracking-widest flex items-center gap-1.5">
                        <MapPin className="w-3 h-3" /> Adresse du Bureau
                      </label>
                      <input
                        type="text"
                        value={officeInfo.address || ''}
                        onChange={(e) => setOfficeInfo({ ...officeInfo, address: e.target.value })}
                        className="w-full px-4 py-2 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-6 pt-6 border-t border-stone-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 rounded-lg">
                    <Globe className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-stone-900">Paramètres de l'Agence (Global)</h5>
                    <p className="text-[10px] text-stone-400 uppercase tracking-widest font-black">Informations partagées par tous les bureaux</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">Nom de l'Agence</label>
                  <input
                    type="text"
                    value={settings.agencyName || ''}
                    onChange={(e) => setSettings({ ...settings, agencyName: e.target.value })}
                    className="w-full px-4 py-2 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">Email de l'Agence</label>
                  <input
                    type="email"
                    value={settings.agencyEmail || ''}
                    onChange={(e) => setSettings({ ...settings, agencyEmail: e.target.value })}
                    className="w-full px-4 py-2 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">Téléphone</label>
                  <input
                    type="text"
                    value={settings.agencyPhone || ''}
                    onChange={(e) => setSettings({ ...settings, agencyPhone: e.target.value })}
                    className="w-full px-4 py-2 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">Matricule Fiscal (MF)</label>
                  <input
                    type="text"
                    value={settings.agencyMF || ''}
                    onChange={(e) => setSettings({ ...settings, agencyMF: e.target.value })}
                    className="w-full px-4 py-2 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">Logo URL (Base64 ou Lien)</label>
                  <input
                    type="text"
                    value={settings.agencyLogo || ''}
                    onChange={(e) => setSettings({ ...settings, agencyLogo: e.target.value })}
                    className="w-full px-4 py-2 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                    placeholder="data:image/png;base64,..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">Devise</label>
                  <input
                    type="text"
                    value={settings.currency || ''}
                    onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                    className="w-full px-4 py-2 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">Taux de Taxe (%)</label>
                  <input
                    type="number"
                    value={settings.taxRate || 0}
                    onChange={(e) => setSettings({ ...settings, taxRate: Number(e.target.value) })}
                    className="w-full px-4 py-2 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">Période d'alerte (jours)</label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={warningPeriod || 0}
                    onChange={(e) => setWarningPeriodState(Number(e.target.value))}
                    className="w-full px-4 py-2 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">Prix Chauffeur / Jour (TND)</label>
                  <input
                    type="number"
                    value={settings.chauffeurPrice || 50}
                    onChange={(e) => setSettings({ ...settings, chauffeurPrice: Number(e.target.value) })}
                    className="w-full px-4 py-2 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">Adresse de l'Agence</label>
                <textarea
                  value={settings.agencyAddress || ''}
                  onChange={(e) => setSettings({ ...settings, agencyAddress: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">Conditions de Location</label>
                <textarea
                  value={settings.rentalTerms || ''}
                  onChange={(e) => setSettings({ ...settings, rentalTerms: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                />
              </div>
            </div>
            <button
                type="submit"
                className="w-full bg-emerald-600 text-white px-4 py-3 rounded-2xl font-bold hover:bg-emerald-500 transition-all shadow-sm"
              >
                Enregistrer les Paramètres
              </button>
            </form>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
            <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-6">Santé du Système</h4>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600">Base de données</span>
                <span className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                  <div className="w-2 h-2 bg-emerald-600 rounded-full animate-pulse" />
                  Connecté
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600">Authentification</span>
                <span className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                  <div className="w-2 h-2 bg-emerald-600 rounded-full animate-pulse" />
                  Opérationnel
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600">Stockage Images</span>
                <span className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                  <div className="w-2 h-2 bg-emerald-600 rounded-full animate-pulse" />
                  OK
                </span>
              </div>
            </div>
            
            <div className="mt-8 pt-8 border-t border-stone-100">
              <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">Maintenance & Actions Critiques</h4>
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => setIsConfirmModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-3 rounded-2xl text-sm font-bold hover:bg-emerald-100 transition-all"
                >
                  <Zap className="w-4 h-4" />
                  Générer Données Test
                </button>
                
                {isMasterAdmin && (
                  <div className="p-4 bg-red-50 rounded-2xl border border-red-100 space-y-3">
                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest text-center">Accès Master Admin</p>
                    <p className="text-xs text-red-800 text-center">Outils de sauvegarde et maintenance activés.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={handleExportData}
                        disabled={isProcessing}
                        className="text-[10px] bg-white text-stone-600 p-2 rounded-lg text-center font-bold hover:bg-stone-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        {isProcessing ? <Loader2 className="w-2 h-2 animate-spin" /> : null}
                        Exporter JSON
                      </button>
                      
                      <div className="relative">
                        <input
                          type="file"
                          accept=".json"
                          onChange={handleImportData}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          disabled={isProcessing}
                        />
                        <div className="text-[10px] bg-white text-stone-600 p-2 rounded-lg text-center font-bold hover:bg-stone-50 transition-colors">
                          Importer JSON
                        </div>
                      </div>

                      <button 
                        onClick={() => setIsRepairModalOpen(true)}
                        disabled={isProcessing}
                        className="text-[10px] bg-white text-stone-600 p-2 rounded-lg text-center font-bold hover:bg-stone-50 transition-colors disabled:opacity-50"
                      >
                        Réparer
                      </button>

                      <button 
                        onClick={() => setIsResetModalOpen(true)}
                        disabled={isProcessing}
                        className="text-[10px] bg-white text-red-600 p-2 rounded-lg text-center font-bold hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        Tout Supprimer
                      </button>
                    </div>

                    {maintenanceLogs.length > 0 && (
                      <div className="mt-4 p-4 bg-stone-900 rounded-xl border border-stone-800 shadow-inner max-h-48 overflow-y-auto">
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-stone-800">
                          <Activity className="w-3 h-3 text-emerald-500 animate-pulse" />
                          <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-widest">Console Système</span>
                        </div>
                        <div className="space-y-1">
                          {maintenanceLogs.map((log, i) => (
                            <div key={i} className="flex gap-3 group">
                              <span className="text-[9px] font-mono text-stone-600 shrink-0 select-none group-hover:text-stone-400 transition-colors">
                                {log.match(/\[(.*?)\]/)?.[1] || '--:--:--'}
                              </span>
                              <p className={clsx(
                                "text-[9px] font-mono leading-tight break-all",
                                log.includes('ERREUR') ? 'text-red-400' : 
                                log.includes('terminée') || log.includes('succès') ? 'text-emerald-400' : 'text-stone-300'
                              )}>
                                {log.replace(/\[.*?\]\s?/, '')}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-red-600 text-center italic mt-2">Accès via l'onglet "Maintenance"</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={generateSampleData}
        title="Générer des données de test"
        message="Cela va ajouter un véhicule et un client de test à votre base de données. Voulez-vous continuer ?"
        type="warning"
        confirmText="Générer"
      />

      <ConfirmationModal
        isOpen={isRepairModalOpen}
        onClose={() => setIsRepairModalOpen(false)}
        onConfirm={handleRepair}
        title="Réparer le système"
        message="Cette action va vérifier et recréer les paramètres et offices manquants. Les données existantes ne seront pas supprimées."
        type="info"
        confirmText="Réparer"
      />

      <ConfirmationModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleReset}
        title="RÉINITIALISATION TOTALE"
        message="ATTENTION : Cela va supprimer TOUTES les locations, dépenses, revenus et logs. Cette action est irréversible !"
        type="danger"
        confirmText="OUI, TOUT SUPPRIMER"
      />
    </div>
  );
}
