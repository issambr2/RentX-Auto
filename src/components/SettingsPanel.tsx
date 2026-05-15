import React, { useState, useEffect } from 'react';
import { auth, updatePassword } from '../lib/api';
import { Key, Shield, Lock, CheckCircle, Clock } from 'lucide-react';
import { logActivity } from '../services/logService';
import { useNotifications } from './NotificationContext';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { clsx } from 'clsx';

export function SettingsPanel() {
  const { addNotification } = useNotifications();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [logoutTimeout, setLogoutTimeout] = useState(() => {
    const saved = localStorage.getItem('logout_timeout');
    return saved ? parseInt(saved, 10) : 900000; // 15 min default
  });

  const updateTimeout = (minutes: number) => {
    const ms = minutes * 60 * 1000;
    setLogoutTimeout(ms);
    localStorage.setItem('logout_timeout', ms.toString());
    // Dispatch event to update the listener in AutoLogout component if it's already mounted
    window.dispatchEvent(new CustomEvent('update-logout-timeout', { detail: minutes }));
    addNotification('success', 'Succès', `Durée de déconnexion automatique fixée à ${minutes} minutes`);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      addNotification('error', 'Erreur', 'Les mots de passe ne correspondent pas');
      return;
    }
    if (newPassword.length < 6) {
      addNotification('error', 'Erreur', 'Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setLoading(true);
    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
        logActivity(auth.currentUser.uid, 'change_password', 'Mot de passe personnel mis à jour', auth.currentUser.displayName || undefined);
        addNotification('success', 'Succès', 'Votre mot de passe a été mis à jour avec succès');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (error: any) {
      if (error.code === 'auth/requires-recent-login') {
        addNotification('error', 'Sécurité', 'Veuillez vous reconnecter pour effectuer cette action');
      } else {
        handleFirestoreError(error, OperationType.UPDATE, 'auth');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Paramètres du Compte</h2>
        <p className="text-stone-500 italic serif">Gérez vos informations personnelles et votre sécurité.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mb-4">
                <Lock className="w-10 h-10 text-stone-400" />
              </div>
              <h3 className="font-bold text-stone-900">{auth.currentUser?.displayName || 'Utilisateur'}</h3>
              <p className="text-sm text-stone-500 mb-4">{auth.currentUser?.email}</p>
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-100">
                <Shield className="w-3 h-3" />
                Compte Sécurisé
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-100">
              <h3 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-600" />
                Déconnexion Automatique
              </h3>
              <p className="text-sm text-stone-500 mt-1">Déconnecte la session après une période d'inactivité.</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[5, 15, 30, 60].map((min) => (
                  <button
                    key={min}
                    onClick={() => updateTimeout(min)}
                    className={clsx(
                      "py-3 rounded-2xl text-sm font-bold transition-all border-2",
                      logoutTimeout === min * 60 * 1000
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-200"
                        : "bg-stone-50 text-stone-600 border-stone-100 hover:bg-stone-100"
                    )}
                  >
                    {min === 60 ? '1 Heure' : `${min} min`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-100">
              <h3 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                <Key className="w-5 h-5 text-emerald-600" />
                Changer le mot de passe
              </h3>
            </div>
            <form onSubmit={handleChangePassword} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Nouveau mot de passe</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Confirmer le mot de passe</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-stone-900 text-white py-4 px-6 rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Mettre à jour le mot de passe
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
