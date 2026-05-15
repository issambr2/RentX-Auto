import React, { useState } from 'react';
import { UserManagement } from './UserManagement';
import { AdminPanel } from './AdminPanel';
import { DatabaseManagement } from './DatabaseManagement';
import { GPSIntegration } from './GPSIntegration';
import { OfficeManagement } from './OfficeManagement';
import { Users, Settings, ShieldCheck, Activity, Database, Globe, Building2 } from 'lucide-react';
import { clsx } from 'clsx';
import { UserProfile } from '../types';

interface AdministrationPanelProps {
  profile: UserProfile | null;
}

export function AdministrationPanel({ profile }: AdministrationPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'offices' | 'database' | 'logs' | 'settings' | 'gps'>('users');
  const isMasterAdmin = profile?.role === 'master_admin';

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Administration</h2>
          <p className="text-stone-500 italic serif">Gérez les utilisateurs, les bureaux et configurez le système.</p>
        </div>
      </div>

      <div className="flex gap-2 bg-stone-100 p-1 rounded-2xl w-fit overflow-x-auto max-w-full">
        <button
          onClick={() => setActiveSubTab('users')}
          className={clsx(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0",
            activeSubTab === 'users' ? "bg-white text-emerald-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
          )}
        >
          <Users className="w-4 h-4" />
          Utilisateurs
        </button>

        <button
          onClick={() => setActiveSubTab('offices')}
          className={clsx(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0",
            activeSubTab === 'offices' ? "bg-white text-emerald-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
          )}
        >
          <Building2 className="w-4 h-4" />
          Bureaux
        </button>
        
        {isMasterAdmin && (
          <button
            onClick={() => setActiveSubTab('database')}
            className={clsx(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0",
              activeSubTab === 'database' ? "bg-white text-emerald-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            <ShieldCheck className="w-4 h-4" />
            Maintenance
          </button>
        )}

        <button
          onClick={() => setActiveSubTab('logs')}
          className={clsx(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0",
            activeSubTab === 'logs' ? "bg-white text-emerald-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
          )}
        >
          <Activity className="w-4 h-4" />
          Audit Logs
        </button>
        <button
          onClick={() => setActiveSubTab('gps')}
          className={clsx(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0",
            activeSubTab === 'gps' ? "bg-white text-emerald-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
          )}
        >
          <Globe className="w-4 h-4" />
          GPS
        </button>
        <button
          onClick={() => setActiveSubTab('settings')}
          className={clsx(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0",
            activeSubTab === 'settings' ? "bg-white text-emerald-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
          )}
        >
          <Settings className="w-4 h-4" />
          Paramètres
        </button>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        {activeSubTab === 'users' && <UserManagement profile={profile} />}
        {activeSubTab === 'offices' && <OfficeManagement profile={profile} />}
        {activeSubTab === 'database' && isMasterAdmin && <DatabaseManagement profile={profile} />}
        {activeSubTab === 'logs' && <AdminPanel initialTab="logs" profile={profile} />}
        {activeSubTab === 'gps' && <GPSIntegration />}
        {activeSubTab === 'settings' && <AdminPanel initialTab="system" profile={profile} />}
      </div>
    </div>
  );
}
