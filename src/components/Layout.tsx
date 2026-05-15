import React, { useState, useEffect } from 'react';
import { User } from '../lib/api';
import { Database as DatabaseIcon, LayoutDashboard, Car, Users, Calendar, LogOut, Menu, X, ShieldCheck, Wrench, Settings, Bell, DollarSign, PieChart, Megaphone, Clock as ClockIcon, Info, TrendingUp, Droplets, Lock, Globe, RefreshCw } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { UserProfile, AppTab } from '../types';
import { useNotifications } from './NotificationContext';
import { NotificationCenter } from './NotificationCenter';
import { GuideModal } from './GuideModal';
import { useLanguage } from '../contexts/LanguageContext';
import { useOffice } from '../contexts/OfficeContext';
import { collection, onSnapshot, query, where, orderBy } from '../lib/api';
import { db, auth } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { fr, ar, enUS } from 'date-fns/locale';

import { checkVehicleExpirations } from '../services/alertService';

import { Logo } from './Logo';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LayoutProps {
  user: User;
  profile: UserProfile | null;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  onLogout: () => void;
  onViewChange?: (view: 'admin' | 'customer') => void;
  children: React.ReactNode;
}

export function Layout({ user, profile, activeTab, setActiveTab, onLogout, onViewChange, children }: LayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [websiteReservationCount, setWebsiteReservationCount] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [dbStatus, setDbStatus] = useState<'online' | 'offline' | 'checking'>('checking');

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) setDbStatus('online');
        else setDbStatus('offline');
      } catch (e) {
        setDbStatus('offline');
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);
  const { notifications } = useNotifications();
  const { t, language, setLanguage, isRTL } = useLanguage();
  const { currentOffice, offices, setCurrentOffice } = useOffice();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getLocale = () => {
    switch (language) {
      case 'fr': return fr;
      case 'ar': return ar;
      case 'en': return enUS;
      default: return fr;
    }
  };

  useEffect(() => {
    if (!user || !auth.currentUser || !currentOffice) return;
    
    const q = query(
      collection(db, 'notifications'), 
      where('officeId', '==', currentOffice.id),
      where('type', '==', 'website_reservation'),
      where('read', '==', false)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadCount(snapshot.size);
    }, (error) => {
      if (error.code !== 'permission-denied') {
        console.error("Error listening to notifications:", error);
      }
    });

    // Listen for website reservations
    const qWeb = query(
      collection(db, 'rentals'), 
      where('officeId', '==', currentOffice.id),
      where('status', '==', 'pending_confirmation')
    );
    const unsubscribeWeb = onSnapshot(qWeb, (snapshot) => {
      setWebsiteReservationCount(snapshot.size);
    }, (error) => {
      if (error.code !== 'permission-denied') {
        console.error("Error listening to website reservations:", error);
      }
    });

    // Check for expirations if admin
    if (profile?.role === 'admin' || profile?.role === 'master_admin' || profile?.role === 'manager') {
      checkVehicleExpirations().catch(console.error);
    }

    return () => {
      unsubscribe();
      unsubscribeWeb();
    };
  }, [user, profile, currentOffice]);

  const navItems: { id: AppTab, label: string, icon: any, adminOnly?: boolean, isSubItem?: boolean }[] = [
    { id: 'dashboard', label: t('dashboard'), icon: LayoutDashboard },
    { id: 'statistics', label: t('statistics'), icon: PieChart, adminOnly: true },
    { id: 'finance', label: 'Statut Entreprise', icon: TrendingUp, adminOnly: true },
    { id: 'payments', label: 'Paiements', icon: DollarSign, adminOnly: true },
    { id: 'vehicles', label: t('vehicles'), icon: Car },
    { id: 'clients', label: t('clients'), icon: Users },
    { id: 'rentals', label: t('rentals'), icon: Calendar },
    { id: 'leasing', label: 'Leasing', icon: DollarSign },
    { id: 'stock', label: t('stock'), icon: PieChart },
    { id: 'maintenance', label: t('maintenance'), icon: Wrench },
    { id: 'workers', label: 'Travailleurs', icon: Users },
    { id: 'expenses', label: t('expenses'), icon: DollarSign },
    { id: 'washes', label: 'Lavage', icon: Droplets, isSubItem: true },
    { id: 'insurances', label: 'Assurances', icon: ShieldCheck },
    { id: 'planning', label: t('planning'), icon: Calendar },
    { id: 'accounting', label: t('accounting'), icon: DollarSign, adminOnly: true },
    { id: 'gps', label: 'GPS Integration', icon: Globe, adminOnly: true },
    { id: 'administration', label: 'Administration', icon: ShieldCheck, adminOnly: true },
    { id: 'settings', label: t('settings'), icon: Settings },
    { id: 'publicity', label: 'Publicité', icon: Megaphone, adminOnly: true },
    { id: 'website', label: 'Site Web', icon: Globe },
  ];

  const filteredNavItems = navItems.filter(item => {
    // Master admin and Admin always have access to everything
    // Special check for the master admin email
    const isMasterAdmin = profile?.role === 'master_admin' || ['brahemdesign@gmail.com', 'siwarbraham98@gmail.com', 'admin@rentx.tn'].includes(user.email?.toLowerCase() || '');
    if (isMasterAdmin || profile?.role === 'admin') return true;

    // Customers (Clients) ONLY have access to the website
    if (profile?.role === 'customer') {
      return item.id === 'website';
    }

    // If permissions are defined, check if the user has access to this specific module
    if (profile?.permissions && profile.permissions.length > 0) {
      return profile.permissions.includes(item.id);
    }

    // Fallback to role-based restrictions for admin-only modules
    if (item.adminOnly && profile?.role !== 'manager') {
      return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      {/* Offline Banner */}
      <AnimatePresence>
        {dbStatus === 'offline' && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-red-600 text-white py-2 px-4 flex items-center justify-center gap-2 text-sm font-bold shadow-lg z-50 shrink-0"
          >
            <Bell className="w-4 h-4 animate-bounce" />
            <span>Serveur hors ligne - La connexion à la base de données a été perdue. Veuillez patienter...</span>
            <button 
              onClick={() => window.location.reload()}
              className="ml-4 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition-all"
            >
              Actualiser
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className={cn(
          "bg-white border-r border-stone-200 transition-all duration-300 flex flex-col",
          isSidebarOpen ? "w-64" : "w-20"
        )}>
          <div className="p-6 flex flex-col items-center gap-4">
            <Logo 
              className={isSidebarOpen ? "w-40" : "w-12 h-12"} 
              showText={isSidebarOpen} 
              isCircular={!isSidebarOpen}
            />
          </div>

          <nav className="flex-1 px-3 space-y-1 mt-6">
            {filteredNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all group",
                  item.isSubItem && isSidebarOpen && "ml-4 w-[calc(100%-1rem)]",
                  activeTab === item.id 
                    ? "bg-emerald-50 text-emerald-700 font-medium" 
                    : "text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                )}
              >
                <item.icon className={cn(
                  "w-5 h-5 shrink-0",
                  activeTab === item.id ? "text-emerald-600" : "text-stone-400 group-hover:text-stone-600"
                )} />
                {isSidebarOpen && <span>{item.label}</span>}
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-stone-100">
            <div className={cn("flex items-center gap-3 mb-4", !isSidebarOpen && "justify-center")}>
              <img 
                src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
                alt={user.displayName || ''} 
                className="w-10 h-10 rounded-full border-2 border-white shadow-sm"
                referrerPolicy="no-referrer"
              />
              {isSidebarOpen && (
                <div className="overflow-hidden flex-1">
                  <p className="text-sm font-medium text-stone-900 truncate">{user.displayName}</p>
                    <div className="flex flex-col gap-2 mt-2">
                      <div className="flex items-center gap-1 text-emerald-600">
                        <ShieldCheck className="w-3 h-3" />
                        <p className="text-[10px] font-bold uppercase tracking-tighter truncate">
                          {profile?.role === 'master_admin' || ['brahemdesign@gmail.com', 'siwarbraham98@gmail.com', 'admin@rentx.tn'].includes(user.email?.toLowerCase() || '') ? 'Master Admin' : (profile?.role?.replace('_', ' ') || 'Agent')}
                        </p>
                      </div>
                      {(profile?.role === 'admin' || profile?.role === 'master_admin' || profile?.role === 'manager' || ['brahemdesign@gmail.com', 'siwarbraham98@gmail.com', 'admin@rentx.tn'].includes(user.email?.toLowerCase() || '')) && (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setActiveTab('administration')}
                            className={cn(
                              "flex-1 text-[9px] font-bold px-2 py-1.5 rounded-lg transition-all uppercase tracking-widest shadow-sm flex items-center justify-center gap-1",
                              activeTab === 'administration' ? "bg-emerald-700 text-white" : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20"
                            )}
                          >
                            <ShieldCheck className="w-3 h-3" />
                            Administrateur
                          </button>
                        </div>
                      )}
                    </div>
                </div>
              )}
            </div>
            <button
              onClick={onLogout}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-stone-500 hover:bg-red-50 hover:text-red-600 transition-all",
                !isSidebarOpen && "justify-center"
              )}
            >
              <LogOut className="w-5 h-5" />
              {isSidebarOpen && <span>{t('logout')}</span>}
            </button>
          </div>

          {isSidebarOpen && (
            <div className="px-6 py-4 border-t border-stone-100">
              <p className="text-[10px] text-stone-400 font-medium uppercase tracking-widest text-center">
                &copy; {new Date().getFullYear()} RentX Auto
              </p>
            </div>
          )}
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="h-16 bg-white border-b border-stone-200 flex items-center justify-between px-8 shrink-0">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 hover:bg-stone-100 rounded-lg text-stone-500"
              >
                <Menu className="w-5 h-5" />
              </button>
              <button 
                onClick={() => onViewChange?.('customer')}
                className="hidden md:flex items-center gap-2 bg-stone-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-stone-800 transition-all shadow-sm"
              >
                <Globe className="w-4 h-4" />
                Voir le site
              </button>
              <div className="flex items-center gap-2 bg-stone-50 p-1 rounded-xl border border-stone-100">
                <button 
                  onClick={() => setLanguage('fr')}
                  className={cn(
                    "px-3 py-1 text-[10px] font-bold rounded-lg transition-all",
                    language === 'fr' ? "bg-white text-emerald-600 shadow-sm" : "text-stone-400 hover:text-stone-600"
                  )}
                >
                  FR
                </button>
                <button 
                  onClick={() => setLanguage('ar')}
                  className={cn(
                    "px-3 py-1 text-[10px] font-bold rounded-lg transition-all",
                    language === 'ar' ? "bg-white text-emerald-600 shadow-sm" : "text-stone-400 hover:text-stone-600"
                  )}
                >
                  AR
                </button>
                <button 
                  onClick={() => setLanguage('en')}
                  className={cn(
                    "px-3 py-1 text-[10px] font-bold rounded-lg transition-all",
                    language === 'en' ? "bg-white text-emerald-600 shadow-sm" : "text-stone-400 hover:text-stone-600"
                  )}
                >
                  EN
                </button>
              </div>

              {/* Office Selector */}
              <div className="flex items-center gap-2 bg-stone-50 p-1 rounded-xl border border-stone-100">
                {offices.filter(office => {
                  const isMasterAdmin = profile?.role === 'master_admin' || 
                                       ['brahemdesign@gmail.com', 'siwarbraham98@gmail.com', 'admin@rentx.tn'].includes(user.email?.toLowerCase() || '');
                  const isAdmin = profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'accountant';
                  
                  if (isMasterAdmin || isAdmin) return true;
                  return profile?.permissions?.includes(`office_${office.id}`);
                }).map(office => (
                  <button
                    key={office.id}
                    onClick={() => setCurrentOffice(office)}
                    className={cn(
                      "px-3 py-1 text-[10px] font-bold rounded-lg transition-all",
                      currentOffice?.id === office.id ? "bg-white text-emerald-600 shadow-sm" : "text-stone-400 hover:text-stone-600"
                    )}
                  >
                    {office.name}
                  </button>
                ))}
              </div>

              {/* Connection Status Indicator */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-stone-50 rounded-xl border border-stone-100 shadow-sm">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  dbStatus === 'online' ? "bg-emerald-500 animate-pulse" : dbStatus === 'checking' ? "bg-amber-500" : "bg-red-500"
                )} />
                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest hidden sm:inline">
                  {dbStatus === 'online' ? 'Connecté' : dbStatus === 'checking' ? 'Vérification...' : 'Déconnecté'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-6">
              {/* Clock and Date */}
              <div className="hidden md:flex items-center gap-3 px-4 py-1.5 bg-stone-50 rounded-2xl border border-stone-100 shadow-sm">
                <div className="p-2 bg-white rounded-xl shadow-sm border border-stone-50">
                  <ClockIcon className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-stone-900 tabular-nums leading-none">
                    {format(currentTime, 'HH:mm:ss')}
                  </span>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-0.5">
                    {format(currentTime, 'EEEE d MMMM yyyy', { locale: getLocale() })}
                  </span>
                </div>
              </div>

              {websiteReservationCount > 0 && (
                <div className="relative">
                  <button 
                    onClick={() => setActiveTab('rentals')}
                    className="p-2 rounded-lg transition-all relative text-emerald-600 bg-emerald-50 animate-pulse"
                    title="Nouvelle Réservation Site Web"
                  >
                    <Globe className="w-5 h-5" />
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white">
                      {websiteReservationCount}
                    </span>
                  </button>
                </div>
              )}

              <div className="relative">
                <button 
                  onClick={() => setIsGuideOpen(true)}
                  className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                  title="Guide d'utilisation"
                >
                  <Info className="w-5 h-5" />
                </button>
              </div>


              <div className="relative">
                <button 
                  onClick={() => setIsNotificationCenterOpen(true)}
                  className="p-2 hover:bg-stone-100 rounded-lg text-stone-500 transition-all"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white">
                      {unreadCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-8 relative">
            <div className="max-w-7xl mx-auto">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentOffice?.id || 'no-office'}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
          <NotificationCenter 
            isOpen={isNotificationCenterOpen} 
            onClose={() => setIsNotificationCenterOpen(false)} 
          />
          <GuideModal 
            isOpen={isGuideOpen} 
            onClose={() => setIsGuideOpen(false)} 
            activeTab={activeTab}
          />
        </div>
      </div>
    </div>
  );
}
