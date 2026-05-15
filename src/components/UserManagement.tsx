import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, setDoc, auth, updatePassword, getToken, logout } from '../lib/api';
import { db } from '../lib/api';
import { UserProfile, UserRole } from '../types';
import { User, Shield, Mail, Calendar, Trash2, UserPlus, Key, CheckCircle, XCircle, Clock, Send, Lock, AlertTriangle, Edit2, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx } from 'clsx';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { logActivity } from '../services/logService';
import { useNotifications } from './NotificationContext';
import { DeleteModal } from './DeleteModal';

interface UserManagementProps {
  profile?: UserProfile | null;
}

export function UserManagement({ profile }: UserManagementProps) {
  const isAdmin = profile?.role === 'admin' || profile?.role === 'master_admin';
  const { addNotification } = useNotifications();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isChangePassModalOpen, setIsChangePassModalOpen] = useState(false);
  const [isUpdateUserPassModalOpen, setIsUpdateUserPassModalOpen] = useState(false);
  const [showNewUserPass, setShowNewUserPass] = useState(false);
  const [showChangePass, setShowChangePass] = useState(false);
  const [showUpdateUserPass, setShowUpdateUserPass] = useState(false);
  const [selectedUserForPass, setSelectedUserForPass] = useState<UserProfile | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, user: UserProfile | null }>({ isOpen: false, user: null });
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'ready' | 'error'>('checking');
  const [offices, setOffices] = useState<{id: string, name: string}[]>([]);
  const [newPassword, setNewPassword] = useState('');
  const [userNewPassword, setUserNewPassword] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'agent' as UserRole,
    permissions: [] as string[]
  });

  const availablePermissions = React.useMemo(() => [
    { id: 'dashboard', label: 'Tableau de Bord' },
    { id: 'vehicles', label: 'Véhicules' },
    { id: 'clients', label: 'Clients' },
    { id: 'rentals', label: 'Locations' },
    { id: 'maintenance', label: 'Maintenance' },
    { id: 'expenses', label: 'Dépenses' },
    { id: 'planning', label: 'Planning' },
    { id: 'accounting', label: 'Comptabilité' },
    { id: 'statistics', label: 'Statistiques' },
    { id: 'administration', label: 'Administration' },
    { id: 'settings', label: 'Paramètres' },
    { id: 'website', label: 'Site Web' },
    { id: 'stock', label: 'Stock' },
    { id: 'gps', label: 'GPS' },
    ...offices.map(o => ({ id: `office_${o.id}`, label: `Accès: ${o.name}` }))
  ], [offices]);

  useEffect(() => {
    const checkApi = async () => {
      try {
        const response = await fetch('/api/health');
        const data = await response.json();
        if (data.firebaseInitialized) {
          setApiStatus('ready');
        } else {
          setApiStatus('error');
        }
      } catch (e) {
        setApiStatus('error');
      }
    };
    checkApi();

    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as UserProfile[]);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    const unsubOffices = onSnapshot(collection(db, 'offices'), (snapshot) => {
      setOffices(snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    });

    return () => {
      unsub();
      unsubOffices();
    };
  }, []);

  const handleBulkStatusUpdate = async (active: boolean) => {
    if (selectedUserIds.length === 0) return;
    try {
      const promises = selectedUserIds.map(id => 
        updateDoc(doc(db, 'users', id), { isActive: active })
      );
      await Promise.all(promises);
      
      if (auth.currentUser) {
        logActivity(
          auth.currentUser.uid, 
          'bulk_update_user_status', 
          `${selectedUserIds.length} utilisateurs ${active ? 'activés' : 'désactivés'}`, 
          auth.currentUser.displayName || undefined
        );
      }
      
      addNotification('success', 'Mise à jour réussie', `${selectedUserIds.length} utilisateurs ont été ${active ? 'activés' : 'désactivés'}.`);
      setSelectedUserIds([]);
    } catch (error) {
      addNotification('error', 'Erreur', 'Une erreur est survenue lors de la mise à jour groupée.');
    }
  };

  const toggleSelectAll = () => {
    if (selectedUserIds.length === users.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(users.map(u => u.id));
    }
  };

  const toggleSelectUser = (userId: string) => {
    setSelectedUserIds(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const token = getToken();
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newUser)
      });

      if (!response.ok) {
        if (response.status === 401) {
          logout();
          return;
        }
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { error: 'Erreur serveur inconnue' };
        }
        
        if (errorData.error && errorData.error.includes('OPERATION_NOT_ALLOWED')) {
          throw new Error('L\'inscription par Email/Mot de passe n\'est pas activée dans la console Firebase (Paramètres > Authentication > Sign-in method).');
        }
        throw new Error(errorData.error || `Erreur HTTP: ${response.status}`);
      }
      
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'add_user', `Nouvel utilisateur créé: ${newUser.email}`, auth.currentUser.displayName || undefined);
      }
      
      setIsModalOpen(false);
      setNewUser({ email: '', password: '', fullName: '', role: 'agent', permissions: [] });
      addNotification('success', 'Utilisateur créé', 'L\'utilisateur a été créé avec succès.');
    } catch (error: any) {
      addNotification('error', 'Erreur de création', error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      await updateDoc(doc(db, 'users', editingUser.id), {
        fullName: editingUser.fullName,
        email: editingUser.email,
        role: editingUser.role,
        permissions: editingUser.permissions,
        allowedOffices: editingUser.permissions
          .filter(p => p.startsWith('office_'))
          .map(p => p.replace('office_', ''))
      });
      
      // Also update in Firebase Auth via API
      const token = getToken();
      
      if (!token) {
        console.warn('No token for Auth update, but Firestore was updated.');
      } else {
        const apiResponse = await fetch('/api/admin/update-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            uid: editingUser.id,
            email: editingUser.email,
            displayName: editingUser.fullName
          })
        });

        if (!apiResponse.ok) {
          if (apiResponse.status === 401) {
            logout();
            return;
          }
          const errorData = await apiResponse.json().catch(() => ({}));
          console.warn('Auth update failed, but Firestore was updated:', errorData.error);
        }
      }
      
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'update_user', `Utilisateur mis à jour: ${editingUser.email}`, auth.currentUser.displayName || undefined);
      }
      
      setIsEditUserModalOpen(false);
      setEditingUser(null);
      addNotification('success', 'Utilisateur mis à jour', 'Le profil a été mis à jour avec succès.');
    } catch (error: any) {
      addNotification('error', 'Erreur', error.message);
    }
  };

  const handleToggleStatus = async (user: UserProfile) => {
    try {
      const newStatus = !user.isActive;
      await updateDoc(doc(db, 'users', user.id), { isActive: newStatus });
      
      // Sync with Firebase Auth disabled state
      const token = getToken();
      
      if (token) {
        const syncResponse = await fetch('/api/admin/update-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            uid: user.id,
            disabled: !newStatus
          })
        });
        
        if (syncResponse.status === 401) {
          logout();
          return;
        }
      }

      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'update_user_status', `Statut de ${user.email} changé à ${newStatus ? 'actif' : 'inactif'}`, auth.currentUser.displayName || undefined);
      }
      addNotification('success', 'Statut mis à jour', `L'utilisateur est désormais ${newStatus ? 'actif' : 'inactif'}.`);
    } catch (error: any) {
      addNotification('error', 'Erreur', error.message || 'Une erreur est survenue lors du changement de statut.');
    }
  };

  const handleDeleteUser = async (user: UserProfile) => {
    if (user.id === auth.currentUser?.uid) {
      addNotification('error', 'Action impossible', 'Vous ne pouvez pas supprimer votre propre compte.');
      return;
    }
    
    setIsProcessing(true);
    try {
      const token = getToken();
      if (!token) {
        throw new Error('Authentification requise.');
      }
      
      const response = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ uid: user.id })
      });

      if (!response.ok) {
        if (response.status === 401) {
          logout();
          return;
        }
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { error: 'Erreur serveur inconnue' };
        }
        throw new Error(errorData.error || 'Erreur lors de la suppression de l\'utilisateur');
      }

      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'delete_user', `Utilisateur supprimé: ${user.email}`, auth.currentUser.displayName || undefined);
      }
      addNotification('success', 'Utilisateur supprimé', `L'utilisateur ${user.email} a été supprimé.`);
      setDeleteModal({ isOpen: false, user: null });
    } catch (error: any) {
      console.error('Delete User Error:', error);
      addNotification('error', 'Erreur', error.message || 'Une erreur est survenue lors de la suppression.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateRole = async (user: UserProfile, newRole: UserRole) => {
    try {
      await updateDoc(doc(db, 'users', user.id), { role: newRole });
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'update_user_role', `Rôle de ${user.email} changé à ${newRole}`, auth.currentUser.displayName || undefined);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.id}`);
    }
  };

  const handleTogglePermission = async (user: UserProfile, permissionId: string) => {
    // Admins always have all permissions, no need to toggle
    if (user.role === 'admin' || user.role === 'master_admin') return;
    
    try {
      const currentPermissions = user.permissions || [];
      const newPermissions = currentPermissions.includes(permissionId)
        ? currentPermissions.filter(p => p !== permissionId)
        : [...currentPermissions, permissionId];
      
      await updateDoc(doc(db, 'users', user.id), { permissions: newPermissions });
      
      // Also update allowedOffices for easier filtering if needed
      const allowedOffices = newPermissions
        .filter(p => p.startsWith('office_'))
        .map(p => p.replace('office_', ''));
      
      await updateDoc(doc(db, 'users', user.id), { allowedOffices });

      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'update_user_permissions', `Permissions de ${user.email} mises à jour`, auth.currentUser.displayName || undefined);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.id}`);
    }
  };

  const handleUpdateUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForPass || !userNewPassword) return;
    
    setIsProcessing(true);
    try {
      const token = getToken();
      if (!token) {
        throw new Error('Authentification requise.');
      }
      
      const response = await fetch('/api/admin/update-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          uid: selectedUserForPass.id,
          newPassword: userNewPassword
        })
      });

      if (!response.ok) {
        if (response.status === 401) {
          logout();
          return;
        }
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { error: 'Erreur serveur inconnue' };
        }
        throw new Error(errorData.error || 'Erreur lors de la mise à jour du mot de passe');
      }

      addNotification('success', 'Mot de passe mis à jour', `Le mot de passe de ${selectedUserForPass.email} a été modifié avec succès.`);
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'admin_update_password', `Mot de passe de ${selectedUserForPass.email} modifié par l'admin`, auth.currentUser.displayName || undefined);
      }
      setIsUpdateUserPassModalOpen(false);
      setUserNewPassword('');
      setSelectedUserForPass(null);
    } catch (error: any) {
      console.error('Update Password Error:', error);
      addNotification('error', 'Erreur de mise à jour', error.message || 'Impossible de mettre à jour le mot de passe.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleChangeMyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setIsProcessing(true);
    try {
      await updatePassword(auth.currentUser, newPassword);
      addNotification('success', 'Mot de passe mis à jour', 'Votre mot de passe a été changé avec succès.');
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'change_my_password', 'Mot de passe personnel mis à jour', auth.currentUser.displayName || undefined);
      }
      setIsChangePassModalOpen(false);
      setNewPassword('');
    } catch (error: any) {
      console.error('Change My Password Error:', error);
      if (error.code === 'auth/requires-recent-login') {
        addNotification('error', 'Sécurité', 'Cette action nécessite une connexion récente. Veuillez vous déconnecter et vous reconnecter.');
      } else {
        addNotification('error', 'Erreur', error.message || 'Impossible de changer le mot de passe.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Gestion des Utilisateurs</h2>
            {apiStatus === 'ready' ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase tracking-widest border border-emerald-100 shadow-sm">
                <CheckCircle className="w-2.5 h-2.5" />
                Synchronisé
              </span>
            ) : apiStatus === 'checking' ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-stone-400 bg-stone-50 px-2 py-0.5 rounded-full uppercase tracking-widest border border-stone-200 animate-pulse">
                <Clock className="w-2.5 h-2.5" />
                Vérification...
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full uppercase tracking-widest border border-red-100 shadow-sm">
                <AlertCircle className="w-2.5 h-2.5" />
                Erreur de Synchro
              </span>
            )}
          </div>
          <p className="text-stone-500 italic serif">Gérez les accès, les rôles et les profils de l'équipe.</p>
        </div>
        <div className="flex gap-3">
          {selectedUserIds.length > 0 && (profile?.role === 'admin' || profile?.role === 'master_admin') && (
            <div className="flex items-center gap-2 bg-stone-100 px-4 py-2 rounded-2xl border border-stone-200 animate-in fade-in slide-in-from-right-4">
              <span className="text-sm font-bold text-stone-600">{selectedUserIds.length} sélectionnés</span>
              <div className="h-4 w-px bg-stone-300 mx-2" />
              <button
                onClick={() => handleBulkStatusUpdate(true)}
                className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-wider"
              >
                <CheckCircle className="w-3 h-3" />
                Activer
              </button>
              <button
                onClick={() => handleBulkStatusUpdate(false)}
                className="flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700 uppercase tracking-wider"
              >
                <Lock className="w-3 h-3" />
                Désactiver
              </button>
            </div>
          )}
          <button
            onClick={() => setIsChangePassModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-white border border-stone-200 text-stone-700 py-3 px-6 rounded-2xl font-semibold hover:bg-stone-50 transition-all shadow-sm"
          >
            <Lock className="w-5 h-5" />
            Changer mon mot de passe
          </button>
          {(profile?.role === 'admin' || profile?.role === 'master_admin') && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center justify-center gap-2 bg-stone-900 text-white py-3 px-6 rounded-2xl font-semibold hover:bg-stone-800 transition-all shadow-lg"
            >
              <UserPlus className="w-5 h-5" />
              Nouvel utilisateur
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-stone-50/50 text-stone-400 text-xs font-bold uppercase tracking-widest">
                <th className="px-8 py-4 w-10">
                  <input
                    type="checkbox"
                    checked={users.length > 0 && selectedUserIds.length === users.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-stone-300"
                  />
                </th>
                <th className="px-8 py-4">Utilisateur</th>
                <th className="px-8 py-4">Rôle</th>
                <th className="px-8 py-4">Modules Autorisés</th>
                <th className="px-8 py-4">Dernière connexion</th>
                <th className="px-8 py-4">Statut</th>
                <th className="px-8 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {users.map((user) => (
                <tr key={user.id} className={clsx(
                  "hover:bg-stone-50/50 transition-all group",
                  selectedUserIds.includes(user.id) && "bg-emerald-50/30"
                )}>
                  <td className="px-8 py-5">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(user.id)}
                      onChange={() => toggleSelectUser(user.id)}
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-stone-300"
                    />
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-stone-100 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-stone-400" />
                      </div>
                      <div>
                        <p className="font-bold text-stone-900">{user.fullName}</p>
                        <p className="text-sm text-stone-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <select
                      value={user.role}
                      onChange={(e) => handleUpdateRole(user, e.target.value as UserRole)}
                      disabled={!isAdmin}
                      className={clsx(
                        "bg-stone-50 border-none rounded-lg text-sm font-medium focus:ring-2 focus:ring-emerald-500 px-3 py-1",
                        !isAdmin && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <option value="admin">Administrateur</option>
                      <option value="agent">Agent</option>
                      <option value="customer">Client</option>
                    </select>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-wrap gap-1 max-w-[250px]">
                      {availablePermissions.map(perm => (
                        <button
                          key={perm.id}
                          onClick={() => handleTogglePermission(user, perm.id)}
                          disabled={!isAdmin}
                          className={clsx(
                            "text-[10px] px-2 py-0.5 rounded-md border transition-all",
                            user.permissions?.includes(perm.id)
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold"
                              : "bg-stone-50 text-stone-400 border-stone-200",
                            !isAdmin && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          {perm.label}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2 text-sm text-stone-600">
                      <Clock className="w-4 h-4 text-stone-400" />
                      <span>{user.lastLogin ? format(new Date(user.lastLogin), 'dd MMM yyyy HH:mm', { locale: fr }) : 'Jamais'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <button
                      onClick={() => handleToggleStatus(user)}
                      disabled={!isAdmin}
                      className={clsx(
                        "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all",
                        user.isActive 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                          : 'bg-red-50 text-red-700 border-red-100',
                        !isAdmin && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {user.isActive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {user.isActive ? 'Actif' : 'Inactif'}
                    </button>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      {(profile?.role === 'admin' || profile?.role === 'master_admin') && (
                        <>
                          <button
                            onClick={() => { setEditingUser(user); setIsEditUserModalOpen(true); }}
                            className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                            title="Modifier l'utilisateur"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => { setSelectedUserForPass(user); setIsUpdateUserPassModalOpen(true); }}
                            className="p-2 hover:bg-amber-50 text-amber-600 rounded-lg transition-all"
                            title="Modifier le mot de passe"
                          >
                            <Lock className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => setDeleteModal({ isOpen: true, user })}
                            className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-all"
                            title="Supprimer"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isEditUserModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 resizable-modal">
            <div className="p-8 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-stone-900">Modifier l'Utilisateur</h3>
              <button onClick={() => setIsEditUserModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleUpdateUser} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Nom complet</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                    <input
                      type="text"
                      required
                      value={editingUser.fullName || ''}
                      onChange={(e) => setEditingUser({...editingUser, fullName: e.target.value})}
                      className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                    <input
                      type="email"
                      required
                      value={editingUser.email || ''}
                      onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                      className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Rôle</label>
                  <div className="relative">
                    <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                    <select
                      required
                      value={editingUser.role || 'agent'}
                      onChange={(e) => setEditingUser({...editingUser, role: e.target.value as UserRole})}
                      className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="admin">Administrateur</option>
                      <option value="agent">Agent</option>
                      <option value="customer">Client</option>
                    </select>
                  </div>
                </div>
              </div>

              {editingUser.role !== 'customer' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Permissions & Bureaux (Modules Autorisés)</label>
                    <button 
                      type="button"
                      onClick={() => setEditingUser({
                        ...editingUser, 
                        permissions: editingUser.permissions.length === availablePermissions.length ? [] : availablePermissions.map(p => p.id)
                      })}
                      className="text-[10px] font-bold text-emerald-600 hover:text-emerald-500 uppercase tracking-widest"
                    >
                      {editingUser.permissions.length === availablePermissions.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {availablePermissions.map(perm => (
                      <label key={perm.id} className={clsx(
                        "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border",
                        editingUser.permissions.includes(perm.id)
                          ? "bg-emerald-50 border-emerald-200"
                          : "bg-stone-50 border-stone-100 hover:bg-stone-100"
                      )}>
                        <input
                          type="checkbox"
                          checked={editingUser.permissions.includes(perm.id)}
                          onChange={(e) => {
                            const perms = e.target.checked
                              ? [...editingUser.permissions, perm.id]
                              : editingUser.permissions.filter(p => p !== perm.id);
                            setEditingUser({...editingUser, permissions: perms});
                          }}
                          className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-stone-300"
                        />
                        <span className={clsx(
                          "text-xs font-medium",
                          editingUser.permissions.includes(perm.id) ? "text-emerald-700" : "text-stone-600"
                        )}>{perm.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsEditUserModalOpen(false)}
                  className="flex-1 py-4 bg-stone-100 text-stone-600 rounded-2xl font-bold hover:bg-stone-200 transition-all"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg"
                >
                  Enregistrer les modifications
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 resizable-modal">
            <div className="p-8 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-stone-900">Nouvel Utilisateur</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleAddUser} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Nom complet</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                  <input
                    type="text"
                    required
                    value={newUser.fullName}
                    onChange={(e) => setNewUser({...newUser, fullName: e.target.value})}
                    className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    placeholder="Jean Dupont"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                  <input
                    type="email"
                    required
                    value={newUser.email}
                    onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                    className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    placeholder="email@exemple.com"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Mot de passe</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                  <input
                    type={showNewUserPass ? "text" : "password"}
                    required
                    value={newUser.password}
                    onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                    className="w-full pl-12 pr-12 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewUserPass(!showNewUserPass)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    {showNewUserPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Rôle</label>
                <div className="relative">
                  <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                  <select
                    required
                    value={newUser.role}
                    onChange={(e) => setNewUser({...newUser, role: e.target.value as UserRole})}
                    className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="admin">Administrateur</option>
                    <option value="agent">Agent</option>
                    <option value="customer">Client</option>
                  </select>
                </div>
              </div>

              {newUser.role !== 'customer' && (
                <div className="space-y-3">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Modules Autorisés (Permissions)</label>
                  <div className="grid grid-cols-2 gap-3">
                    {availablePermissions.map(perm => (
                      <label key={perm.id} className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl cursor-pointer hover:bg-stone-100 transition-all">
                        <input
                          type="checkbox"
                          checked={newUser.permissions.includes(perm.id)}
                          onChange={(e) => {
                            const perms = e.target.checked
                              ? [...newUser.permissions, perm.id]
                              : newUser.permissions.filter(p => p !== perm.id);
                            setNewUser({...newUser, permissions: perms});
                          }}
                          className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-stone-300"
                        />
                        <span className="text-sm font-medium text-stone-700">{perm.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isProcessing}
                className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Création en cours...
                  </>
                ) : (
                  "Créer l'utilisateur"
                )}
              </button>
            </form>
          </div>
        </div>
      )}
      {isChangePassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 resizable-modal">
            <div className="p-8 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-stone-900">Changer mon mot de passe</h3>
              <button onClick={() => setIsChangePassModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleChangeMyPassword} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Nouveau mot de passe</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                  <input
                    type={showChangePass ? "text" : "password"}
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-12 pr-12 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowChangePass(!showChangePass)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    {showChangePass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={isProcessing}
                className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Mise à jour...
                  </>
                ) : (
                  "Mettre à jour le mot de passe"
                )}
              </button>
            </form>
          </div>
        </div>
      )}
      
      {isUpdateUserPassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 resizable-modal">
            <div className="p-8 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-stone-900">Modifier le mot de passe</h3>
              <button onClick={() => setIsUpdateUserPassModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleUpdateUserPassword} className="p-8 space-y-6">
              <p className="text-sm text-stone-500 italic">Modification du mot de passe pour <span className="font-bold text-stone-900">{selectedUserForPass?.email}</span></p>
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Nouveau mot de passe</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                  <input
                    type={showUpdateUserPass ? "text" : "password"}
                    required
                    minLength={6}
                    value={userNewPassword}
                    onChange={(e) => setUserNewPassword(e.target.value)}
                    className="w-full pl-12 pr-12 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowUpdateUserPass(!showUpdateUserPass)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    {showUpdateUserPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={isProcessing}
                className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Mise à jour...
                  </>
                ) : (
                  "Confirmer la modification"
                )}
              </button>
            </form>
          </div>
        </div>
      )}
      
      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, user: null })}
        onConfirm={() => deleteModal.user && handleDeleteUser(deleteModal.user)}
        title="Supprimer l'utilisateur"
        message={`Êtes-vous sûr de vouloir supprimer l'utilisateur ${deleteModal.user?.email} ? Cette action est irréversible.`}
      />
    </div>
  );
}
