import React, { useState } from 'react';
import { Car, User, LogOut, Calendar, Bell } from 'lucide-react';
import { UserProfile } from '../../types';
import { CustomerNotificationCenter } from './CustomerNotificationCenter';

import { Logo } from '../Logo';

interface CustomerNavbarProps {
  user: any;
  profile: UserProfile | null;
  onLogout: () => void;
  onAuthClick: () => void;
  onDashboardClick: () => void;
  onSettingsClick: () => void;
  onReservationsClick: () => void;
}

export function CustomerNavbar({ user, profile, onLogout, onAuthClick, onDashboardClick, onSettingsClick, onReservationsClick }: CustomerNavbarProps) {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-stone-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20 items-center">
          <div className="flex items-center gap-2">
            <Logo className="w-12 h-12" isCircular={true} showText={false} />
            <div className="flex flex-col">
              <span className="text-lg font-black tracking-widest uppercase text-emerald-600 leading-none">RentX</span>
              <span className="text-xs font-medium italic text-emerald-400">Auto</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <a href="#vehicles" className="text-sm font-medium text-stone-600 hover:text-emerald-600 transition-colors">Véhicules</a>
            <a href="#services" className="text-sm font-medium text-stone-600 hover:text-emerald-600 transition-colors">Services</a>
            <a href="#contact" className="text-sm font-medium text-stone-600 hover:text-emerald-600 transition-colors">Contact</a>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3">
                {(['master_admin', 'agent'].includes(profile?.role || '') || user.email?.toLowerCase() === 'brahemdesign@gmail.com') && (
                  <button 
                    onClick={onDashboardClick}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl transition-all shadow-md shadow-emerald-600/20"
                  >
                    <Calendar className="w-4 h-4" />
                    Dashboard Admin
                  </button>
                )}
                <button 
                  onClick={() => setIsNotificationsOpen(true)}
                  className="p-3 bg-stone-50 text-stone-600 rounded-xl hover:bg-stone-100 transition-all relative group"
                  title="Notifications"
                >
                  <Bell className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                  {/* We could add a red dot here if there are unread notifications */}
                </button>
                <button 
                  onClick={onSettingsClick}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-stone-700 hover:bg-stone-50 rounded-xl transition-all"
                >
                  <User className="w-4 h-4" />
                  Mon Profil
                </button>
                <button 
                  onClick={onReservationsClick}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-stone-700 hover:bg-stone-50 rounded-xl transition-all"
                >
                  <Calendar className="w-4 h-4" />
                  Mes Réservations
                </button>
                <div className="h-8 w-px bg-stone-200 mx-2" />
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs font-bold text-stone-900">{profile?.fullName}</p>
                    <p className="text-[10px] text-stone-400 uppercase tracking-widest">Client</p>
                  </div>
                  <button 
                    onClick={onLogout}
                    className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={onAuthClick}
                className="flex items-center gap-2 bg-stone-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg shadow-stone-900/10"
              >
                <User className="w-4 h-4" />
                Connexion
              </button>
            )}
          </div>
        </div>
      </div>
      {user && (
        <CustomerNotificationCenter 
          isOpen={isNotificationsOpen}
          onClose={() => setIsNotificationsOpen(false)}
          userId={user.uid}
        />
      )}
    </nav>
  );
}
