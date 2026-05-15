import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from './lib/api';
import { onSnapshot, doc } from './lib/api';
import { auth, db, loginWithEmail, logout, resetPassword } from './lib/api';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { VehicleList } from './components/VehicleList';
import { ClientList } from './components/ClientList';
import { RentalList } from './components/RentalList';
import { MaintenanceList } from './components/MaintenanceList';
import { AdminPanel } from './components/AdminPanel';
import { AccountingPanel } from './components/AccountingPanel';
import { UserManagement } from './components/UserManagement';
import { ExpenseList } from './components/ExpenseList';
import { StatisticsPanel } from './components/StatisticsPanel';
import { AdministrationPanel } from './components/AdministrationPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { GPSIntegration } from './components/GPSIntegration';
import { StockPanel } from './components/StockPanel';
import { AutoLogout } from './components/AutoLogout';
import { LeasingList } from './components/LeasingList';
import { WorkerPanel } from './components/WorkerPanel';
import { FinancePanel } from './components/FinancePanel';
import { WashPanel } from './components/WashPanel';
import { PublicityPanel } from './components/PublicityPanel';
import { InsuranceList } from './components/InsuranceList';
import { OfficeSelection } from './components/OfficeSelection';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useOffice } from './contexts/OfficeContext';
import { CustomerPortal } from './components/customer/CustomerPortal';
import { AuthPage } from './components/customer/AuthPage';
import { LogIn, Car, Users, Calendar, LayoutDashboard, LogOut, Settings as SettingsIcon, DollarSign, Mail, Lock, Globe } from 'lucide-react';
import { UserProfile, UserRole, AppTab } from './types';
import { ensureUserProfile, getUserProfile } from './services/userService';
import { logActivity } from './services/logService';

import { PlanningCalendar } from './components/PlanningCalendar';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'admin' | 'customer' | 'auth'>('customer');
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const { currentOffice, setCurrentOffice } = useOffice();

  useEffect(() => {
    if (profile && profile.role === 'master_admin') {
      const prompted = sessionStorage.getItem('masterAdminOfficePrompted');
      if (!prompted) {
        // Force office selection for master admin on new session login
        setCurrentOffice(null);
        sessionStorage.setItem('masterAdminOfficePrompted', 'true');
      }
    }
  }, [profile?.id]);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      sessionStorage.removeItem('masterAdminOfficePrompted');
      return;
    }

    const unsub = onSnapshot(doc(db, 'users', user.uid), async (snapshot) => {
      if (snapshot.exists()) {
        const userProfile = snapshot.data() as UserProfile;
        if (!userProfile.isActive) {
          console.warn('Account deactivated, logging out...');
          await logout();
          setUser(null);
          setProfile(null);
          setView('customer');
        } else {
          setProfile(userProfile);
          
          // Debug role and access
          const isMasterAdmin = userProfile.role === 'master_admin' || 
                              ['brahemdesign@gmail.com', 'siwarbraham98@gmail.com', 'admin@dhokkar.tn'].includes(user.email?.toLowerCase() || '');
          const isAdmin = ['agent', 'admin', 'manager', 'accountant', 'master_admin'].includes(userProfile.role) || isMasterAdmin;
          
          if (!isAdmin && view === 'admin') {
            setView('customer');
          }
        }
      } else {
        // User doc deleted
        await logout();
        setUser(null);
        setProfile(null);
        setView('customer');
      }
    }, (error) => {
      if (error.code !== 'permission-denied') {
        console.error('Error listening to profile:', error);
      }
    });

    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!profile || !user) return;
    
    // Determine view based on role
    const isMasterAdmin = profile.role === 'master_admin' || user.email?.toLowerCase() === 'brahemdesign@gmail.com';
    const isAdmin = ['agent', 'admin', 'manager', 'accountant', 'master_admin'].includes(profile.role) || isMasterAdmin;
    
    // Always default to admin dashboard for staff if they are not explicitly on customer view
    const currentHash = window.location.hash;
    if (isAdmin && currentHash !== '#customer') {
      setView('admin');
    } else {
      setView('customer');
    }
  }, [profile?.id]); // Only run when a NEW profile is loaded

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#login' || hash === '#auth') {
        setView('auth');
      } else if (hash === '#admin') {
        setView('admin');
      } else if (hash === '#customer') {
        setView('customer');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Initial check

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await ensureUserProfile(user);
        setUser(user);
      } else {
        setUser(null);
        setProfile(null);
        setView('customer');
      }
      setLoading(false);
    });
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    try {
      if (user) {
        await logActivity(user.uid, 'logout', 'Utilisateur déconnecté');
      }
    } catch (e) {
      console.warn("Logout logging failed, proceeding with logout:", e);
    }
    await logout();
    setView('customer');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard setActiveTab={setActiveTab} />;
      case 'vehicles':
        return <VehicleList setActiveTab={setActiveTab} />;
      case 'clients':
        return <ClientList />;
      case 'rentals':
        return <RentalList />;
      case 'leasing':
        return <LeasingList />;
      case 'maintenance':
        return <MaintenanceList />;
      case 'expenses':
        return <ExpenseList />;
      case 'accounting':
      case 'payments':
        return <AccountingPanel initialTab={activeTab === 'payments' ? 'payments' : 'reports'} />;
      case 'statistics':
        return <StatisticsPanel />;
      case 'planning':
        return <PlanningCalendar setActiveTab={setActiveTab} />;
      case 'administration':
        return <AdministrationPanel profile={profile} />;
      case 'gps':
        return <GPSIntegration />;
      case 'stock':
        return <StockPanel />;
      case 'workers':
        return <WorkerPanel />;
      case 'washes':
        return <WashPanel />;
      case 'insurances':
        return <InsuranceList />;
      case 'finance':
        return <FinancePanel profile={profile} />;
      case 'settings':
        return <SettingsPanel />;
      case 'publicity':
        return <PublicityPanel />;
      case 'website':
        return (
          <div className="flex flex-col items-center justify-center h-[60vh] space-y-6">
            <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center">
              <Globe className="w-10 h-10 text-emerald-600" />
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-bold text-stone-900">Portail Client</h3>
              <p className="text-stone-500 mt-2">Vous allez être redirigé vers le site web public.</p>
            </div>
            <button 
              onClick={() => setView('customer')}
              className="bg-stone-900 text-white px-8 py-4 rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg"
            >
              Ouvrir le Site Web
            </button>
          </div>
        );
      default:
        return <Dashboard setActiveTab={setActiveTab} />;
    }
  };

  return (
    <ErrorBoundary>
      <AutoLogout>
        {view === 'customer' ? (
          <CustomerPortal 
            user={user} 
            profile={profile} 
            onLogout={handleLogout}
            onAuthClick={() => setView('auth')}
            onDashboardClick={() => setView('admin')}
          />
        ) : view === 'auth' ? (
          <AuthPage 
            onSuccess={() => {/* App will re-render via onAuthStateChanged */}}
            onBack={() => setView('customer')}
          />
        ) : !user ? (
          <AuthPage 
            onSuccess={() => setView('admin')}
            onBack={() => setView('customer')}
          />
        ) : !currentOffice && view === 'admin' ? (
          <OfficeSelection />
        ) : (
          <Layout 
            user={user} 
            profile={profile}
            activeTab={activeTab} 
            setActiveTab={setActiveTab}
            onLogout={handleLogout}
            onViewChange={setView}
          >
            {renderTabContent()}
          </Layout>
        )}
      </AutoLogout>
    </ErrorBoundary>
  );
}
