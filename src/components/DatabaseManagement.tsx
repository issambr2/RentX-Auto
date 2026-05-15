import React, { useState, useEffect } from 'react';
import { Database, Download, Upload, Trash2, AlertTriangle, CheckCircle2, Loader2, Wrench, Folder, RefreshCw, Shield, Lock } from 'lucide-react';
import { collection, getDocs, writeBatch, doc, setDoc, getDoc, updateDoc, getToken, logout } from '../lib/api';
import { db, auth } from '../lib/api';
import { logActivity } from '../services/logService';
import { clsx } from 'clsx';
import { UserProfile } from '../types';

const COLLECTIONS_FOR_EXPORT = [
  'vehicles',
  'clients',
  'rentals',
  'maintenances',
  'expenses',
  'activity_logs',
  'notifications',
  'workers',
  'attendance',
  'salaryTransactions',
  'salaryAdvances',
  'salaryPayments',
  'promotions',
  'leasings',
  'stocks',
  'offices',
  'settings'
];

const COLLECTIONS_FOR_RESET = [
  'vehicles',
  'clients',
  'rentals',
  'maintenances',
  'expenses',
  'activity_logs',
  'notifications',
  'workers',
  'attendance',
  'salaryTransactions',
  'salaryAdvances',
  'salaryPayments',
  'promotions',
  'leasings',
  'stocks'
];

interface DatabaseManagementProps {
  profile: UserProfile | null;
}

export function DatabaseManagement({ profile }: DatabaseManagementProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [dbPath, setDbPath] = useState('');
  const [newDbPath, setNewDbPath] = useState('');
  const [isChangingPath, setIsChangingPath] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [autoLogoutEnabled, setAutoLogoutEnabled] = useState(() => localStorage.getItem('auto_logout_enabled') === 'true');

  useEffect(() => {
    fetchDbPath();
  }, []);

  const fetchDbPath = async () => {
    try {
      const token = getToken();
      const res = await fetch('/api/system/db-path', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDbPath(data.path);
        setNewDbPath(data.path);
      } else if (res.status === 401) {
        logout();
      }
    } catch (error) {
      console.error('Error fetching DB path:', error);
    }
  };

  const handleUpdatePath = async () => {
    if (!newDbPath || newDbPath === dbPath) return;
    setIsChangingPath(true);
    try {
      const token = getToken();
      const res = await fetch('/api/system/db-path', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ path: newDbPath })
      });
      if (res.ok) {
        const data = await res.json();
        setDbPath(data.path);
        setStatus({ type: 'success', message: 'Emplacement de la base de données mis à jour.' });
      } else if (res.status === 401) {
        logout();
      } else {
        const err = await res.json();
        setStatus({ type: 'error', message: err.error || 'Erreur lors du changement d\'emplacement.' });
      }
    } catch (error: any) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setIsChangingPath(false);
    }
  };

  const handleReconnect = async () => {
    setIsReconnecting(true);
    setStatus(null);
    try {
      const token = getToken();
      const res = await fetch('/api/system/reconnect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setStatus({ type: 'success', message: 'Connexion à la base de données rafraîchie.' });
      } else if (res.status === 401) {
        logout();
      } else {
        setStatus({ type: 'error', message: 'Échec du rafraîchissement de la connexion.' });
      }
    } catch (error: any) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setIsReconnecting(false);
    }
  };

  const toggleAutoLogout = (enabled: boolean) => {
    setAutoLogoutEnabled(enabled);
    window.dispatchEvent(new CustomEvent('toggle-auto-logout', { detail: enabled }));
  };

  const handleExport = async () => {
    setIsExporting(true);
    setStatus(null);
    try {
      const backupData: Record<string, any[]> = {};
      
      for (const colName of COLLECTIONS_FOR_EXPORT) {
        if (colName === 'settings') {
          try {
            const settingsSnap = await getDoc(doc(db, 'settings', 'system'));
            if (settingsSnap.exists()) {
              backupData[colName] = [{ id: 'system', ...settingsSnap.data() }];
            }
          } catch (e) {
            console.warn('Skipping settings export due to permissions or missing doc');
          }
          continue;
        }

        try {
          const snapshot = await getDocs(collection(db, colName));
          backupData[colName] = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
        } catch (e) {
          console.warn(`Skipping export for ${colName}:`, e);
        }
      }

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dhokkar_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setStatus({ type: 'success', message: 'Sauvegarde exportée avec succès.' });
      if (auth.currentUser) {
        await logActivity(auth.currentUser.uid, 'database_export', 'Exportation complète de la base de données', profile?.fullName);
      }
    } catch (error) {
      console.error('Export error:', error);
      setStatus({ type: 'error', message: 'Erreur lors de l\'exportation.' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setStatus(null);
    try {
      const reader = new FileReader();
      const content = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsText(file);
      });

      const backupData = JSON.parse(content);
      let importedCount = 0;
      
      for (const colName of COLLECTIONS_FOR_EXPORT) {
        if (backupData[colName] && Array.isArray(backupData[colName])) {
          const items = backupData[colName];
          // Process in chunks of 500 for Firebase batch limits
          for (let i = 0; i < items.length; i += 500) {
            const chunk = items.slice(i, i + 500);
            const batch = writeBatch(db);
            
            chunk.forEach((item: any) => {
              const { id, ...data } = item;
              if (id) {
                const docRef = doc(db, colName, id);
                batch.set(docRef, data);
                importedCount++;
              }
            });
            
            await batch.commit();
          }
        }
      }

      setStatus({ type: 'success', message: `${importedCount} enregistrements importés avec succès.` });
      if (auth.currentUser) {
        await logActivity(auth.currentUser.uid, 'database_import', 'Importation de données dans la base de données', profile?.fullName);
      }
    } catch (error) {
      console.error('Import error:', error);
      setStatus({ type: 'error', message: 'Erreur lors de l\'importation. Vérifiez le format du fichier.' });
    } finally {
      setIsImporting(false);
      if (event.target) event.target.value = '';
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    setStatus(null);
    try {
      let deletedCount = 0;
      for (const colName of COLLECTIONS_FOR_RESET) {
        const snapshot = await getDocs(collection(db, colName));
        const docs = snapshot.docs;
        deletedCount += docs.length;
        
        for (let i = 0; i < docs.length; i += 500) {
          const batch = writeBatch(db);
          const chunk = docs.slice(i, i + 500);
          chunk.forEach((doc) => {
            batch.delete(doc.ref);
          });
          await batch.commit();
        }
      }

      setStatus({ type: 'success', message: `Base de données réinitialisée. ${deletedCount} documents supprimés.` });
      setShowConfirmReset(false);
      if (auth.currentUser) {
        await logActivity(auth.currentUser.uid, 'database_reset', 'Réinitialisation complète de la base de données', profile?.fullName);
      }
    } catch (error) {
      console.error('Reset error:', error);
      setStatus({ type: 'error', message: 'Erreur lors de la réinitialisation.' });
    } finally {
      setIsResetting(false);
    }
  };

  const handleRepair = async () => {
    setIsRepairing(true);
    setStatus(null);
    try {
      // 1. Ensure default offices exist
      const officeList = [
        { id: 'bureau-chedli', name: 'Bureau Chedli', isActive: true, createdAt: new Date().toISOString() },
        { id: 'bureau-aymen', name: 'Bureau Aymen', isActive: true, createdAt: new Date().toISOString() }
      ];

      for (const office of officeList) {
        const officeRef = doc(db, 'offices', office.id);
        const officeSnap = await getDoc(officeRef);
        if (!officeSnap.exists()) {
          await setDoc(officeRef, office);
        }
      }

      // 2. Ensure system settings exist
      const settingsRef = doc(db, 'settings', 'system');
      const settingsSnap = await getDoc(settingsRef);
      if (!settingsSnap.exists()) {
        await setDoc(settingsRef, {
          agencyName: 'RentX Auto',
          agencyAddress: 'Rue Taieb Hachicha M\'saken A côté café Vegas',
          agencyPhone: '24621605 | 53666895',
          agencyEmail: 'dhokkarlocation2016@gmail.com',
          agencyMF: '114739OR/A/M 000',
          currency: 'TND',
          taxRate: 19,
          warningPeriod: 15,
          chauffeurPrice: 50,
          rentalTerms: 'Conditions par défaut...'
        });
      }

      // 3. Ensure bootstrap admins have correct profiles in Firestore
      const bootstrapAdmins = [
        { email: 'brahemdesign@gmail.com', name: 'Brahem Design', role: 'master_admin' },
        { email: 'admin@rentx.tn', name: 'Admin RentX', role: 'admin' }
      ];

      const usersSnap = await getDocs(collection(db, 'users'));
      for (const admin of bootstrapAdmins) {
        const existingUser = usersSnap.docs.find(d => d.data().email?.toLowerCase() === admin.email.toLowerCase());
        if (existingUser) {
          await updateDoc(doc(db, 'users', existingUser.id), { role: admin.role, isActive: true });
        }
      }

      setStatus({ type: 'success', message: 'Système réparé : Paramètres, Bureaux et Permissions Administrateur restaurés.' });
      if (auth.currentUser) {
        await logActivity(auth.currentUser.uid, 'database_repair', 'Réparation du système effectuée', profile?.fullName);
      }
    } catch (error) {
      console.error('Repair error:', error);
      setStatus({ type: 'error', message: 'Erreur lors de la réparation.' });
    } finally {
      setIsRepairing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-8 border border-stone-200 shadow-sm">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-red-50 rounded-2xl">
            <Database className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-stone-900">Maintenance & Sauvegarde</h3>
            <p className="text-stone-500 text-sm italic">Outils critiques pour la gestion de l'intégrité des données.</p>
          </div>
        </div>

        {status && (
          <div className={clsx(
            "mb-8 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2",
            status.type === 'success' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"
          )}>
            {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            <span className="text-sm font-medium">{status.message}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* DB Path Card */}
          <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100 hover:border-emerald-200 transition-all group col-span-1 md:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-white rounded-xl shadow-sm group-hover:scale-110 transition-transform">
                <Folder className="w-5 h-5 text-emerald-600" />
              </div>
              <button
                onClick={handleReconnect}
                disabled={isReconnecting}
                className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                title="Actualiser la connexion"
              >
                <RefreshCw className={clsx("w-5 h-5", isReconnecting && "animate-spin")} />
              </button>
            </div>
            <h4 className="font-bold text-stone-900 mb-2">Emplacement Base de Données</h4>
            <p className="text-xs text-stone-500 mb-4 truncate" title={dbPath}>Local actuel : <span className="font-mono text-emerald-700">{dbPath}</span></p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newDbPath}
                onChange={(e) => setNewDbPath(e.target.value)}
                placeholder="Nouveau chemin (ex: C:/data/db.sqlite)"
                className="flex-1 px-4 py-2 text-sm bg-white border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
              />
              <button
                onClick={handleUpdatePath}
                disabled={isChangingPath || !newDbPath || newDbPath === dbPath}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-500 transition-all disabled:opacity-50"
              >
                Appliquer
              </button>
            </div>
          </div>

          {/* Auto Logout Card */}
          <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100 hover:border-amber-200 transition-all group">
            <div className="p-3 bg-white rounded-xl w-fit mb-4 shadow-sm group-hover:scale-110 transition-transform">
              <Lock className="w-5 h-5 text-amber-600" />
            </div>
            <h4 className="font-bold text-stone-900 mb-2">Déconnexion Auto</h4>
            <p className="text-xs text-stone-500 mb-6">Désactiver la déconnexion automatique après inactivité.</p>
            <button
              onClick={() => toggleAutoLogout(!autoLogoutEnabled)}
              className={clsx(
                "w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2",
                autoLogoutEnabled ? "bg-amber-600 text-white hover:bg-amber-700" : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50"
              )}
            >
              <Shield className="w-4 h-4" />
              {autoLogoutEnabled ? 'Activée' : 'Désactivée'}
            </button>
          </div>

          {/* Export Card */}
          <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100 hover:border-emerald-200 transition-all group">
            <div className="p-3 bg-white rounded-xl w-fit mb-4 shadow-sm group-hover:scale-110 transition-transform">
              <Download className="w-5 h-5 text-emerald-600" />
            </div>
            <h4 className="font-bold text-stone-900 mb-2">Sauvegarde</h4>
            <p className="text-xs text-stone-500 mb-6">Téléchargez une copie complète de toutes vos données au format JSON.</p>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="w-full py-3 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-bold hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Exporter JSON
            </button>
          </div>

          {/* Import Card */}
          <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100 hover:border-emerald-200 transition-all group">
            <div className="p-3 bg-white rounded-xl w-fit mb-4 shadow-sm group-hover:scale-110 transition-transform">
              <Upload className="w-5 h-5 text-emerald-600" />
            </div>
            <h4 className="font-bold text-stone-900 mb-2">Restauration</h4>
            <p className="text-xs text-stone-500 mb-6">Importez des données à partir d'un fichier de sauvegarde précédemment exporté.</p>
            <label className="w-full py-3 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-bold hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Importer JSON
              <input type="file" accept=".json" onChange={handleImport} className="hidden" disabled={isImporting} />
            </label>
          </div>

          {/* Repair Card */}
          <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100 hover:border-amber-200 transition-all group">
            <div className="p-3 bg-white rounded-xl w-fit mb-4 shadow-sm group-hover:scale-110 transition-transform">
              <Wrench className="w-5 h-5 text-amber-600" />
            </div>
            <h4 className="font-bold text-stone-900 mb-2">Réparation</h4>
            <p className="text-xs text-stone-500 mb-6">Restaure les bureaux par défaut et les paramètres système si manquants.</p>
            <button
              onClick={handleRepair}
              disabled={isRepairing}
              className="w-full py-3 bg-white border border-stone-200 text-amber-700 rounded-xl text-sm font-bold hover:bg-amber-50 hover:border-amber-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isRepairing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
              Réparer Système
            </button>
          </div>

          {/* Reset Card */}
          <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100 hover:border-red-200 transition-all group">
            <div className="p-3 bg-white rounded-xl w-fit mb-4 shadow-sm group-hover:scale-110 transition-transform">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <h4 className="font-bold text-stone-900 mb-2">Réinitialisation</h4>
            <p className="text-xs text-stone-500 mb-6">Supprimez définitivement toutes les données (véhicules, clients, locations, etc.).</p>
            <button
              onClick={() => setShowConfirmReset(true)}
              className="w-full py-3 bg-white border border-stone-200 text-red-600 rounded-xl text-sm font-bold hover:bg-red-50 hover:border-red-200 transition-all flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Tout Supprimer
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmReset && (
        <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6 text-red-600">
              <div className="p-3 bg-red-50 rounded-2xl">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold">Action Critique</h3>
            </div>
            
            <p className="text-stone-600 mb-8 leading-relaxed">
              Êtes-vous absolument sûr de vouloir <span className="font-bold text-red-600 underline">supprimer toutes les données</span> ? 
              Cette action est irréversible et effacera tous les véhicules, clients, locations et historiques.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmReset(false)}
                className="flex-1 py-4 bg-stone-100 text-stone-600 rounded-2xl font-bold hover:bg-stone-200 transition-all"
              >
                Annuler
              </button>
              <button
                onClick={handleReset}
                disabled={isResetting}
                className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isResetting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
