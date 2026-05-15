import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, where, orderBy, limit, onSnapshot, addDoc } from '../lib/api';
import { db, auth } from '../lib/api';
import { Car, Users, Calendar, TrendingUp, AlertCircle, Clock, ArrowUpRight, ArrowDownRight, Plus, FileText, Wrench, UserPlus, Activity, ShieldCheck, Droplets } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area, RadialBarChart, RadialBar, PieChart, Pie, Legend } from 'recharts';
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx } from 'clsx';
import * as XLSX from 'xlsx';
import { ActivityLog, Rental, Vehicle, Client, VehicleStatus } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { useNotifications } from './NotificationContext';
import { useOffice } from '../contexts/OfficeContext';

export function Dashboard({ setActiveTab }: { setActiveTab: (tab: any) => void }) {
  const { addNotification } = useNotifications();
  const { currentOffice } = useOffice();
  const [stats, setStats] = useState({
    totalVehicles: 0,
    availableVehicles: 0,
    rentedVehicles: 0,
    occupiedVehicles: 0,
    reservedVehicles: 0,
    maintenanceVehicles: 0,
    dirtyVehicles: 0,
    activeRentals: 0,
    totalClients: 0,
    monthlyRevenue: 0,
    previousMonthlyRevenue: 0,
    unpaidAmount: 0
  });
  const [recentLogs, setRecentLogs] = useState<ActivityLog[]>([]);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expiringDocs, setExpiringDocs] = useState<{vehicle: Vehicle, type: string, days: number}[]>([]);
  const [upcomingRentals, setUpcomingRentals] = useState<Rental[]>([]);
  const [pendingPayments, setPendingPayments] = useState<Rental[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);

  const exportToExcel = (data: any[], fileName: string) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    XLSX.writeFile(workbook, `${fileName}_${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
    addNotification('success', 'Export réussi', `Le fichier ${fileName} a été téléchargé.`);
  };

  useEffect(() => {
    if (!auth.currentUser || !currentOffice) {
      setLoading(false);
      return;
    }

    const fetchDashboardData = async () => {
      try {
        let vehiclesSnap;
        try {
          vehiclesSnap = await getDocs(query(collection(db, 'vehicles'), where('officeId', '==', currentOffice.id)));
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, 'vehicles');
          return;
        }

        let clientsSnap;
        try {
          clientsSnap = await getDocs(query(collection(db, 'clients'), where('officeId', '==', currentOffice.id)));
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, 'clients');
          return;
        }

        let rentalsSnap;
        try {
          rentalsSnap = await getDocs(query(collection(db, 'rentals'), where('officeId', '==', currentOffice.id)));
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, 'rentals');
          return;
        }
        
        let washesSnap;
        try {
          washesSnap = await getDocs(query(collection(db, 'washes'), where('officeId', '==', currentOffice.id)));
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, 'washes');
          return;
        }

        const vehicles = vehiclesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vehicle[];
        const rentals = rentalsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Rental[];
        const washes = washesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
        const clients = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

        setVehicles(vehicles);
        setClients(clients);
        setRentals(rentals);

        const activeRentals = rentals.filter(r => r.status === 'active').length;
        const availableVehicles = vehicles.filter(v => v.status === 'available').length;
        const rentedVehicles = vehicles.filter(v => v.status === 'rented').length;
        const occupiedVehicles = vehicles.filter(v => v.status === 'occupied').length;
        const reservedVehicles = vehicles.filter(v => v.status === 'reserved').length;
        const maintenanceVehicles = vehicles.filter(v => v.status === 'maintenance').length;
        const dirtyVehicles = vehicles.filter(v => v.washStatus === 'dirty').length;
        
        const now = new Date();
        const upcoming = rentals
          .filter(r => (r.status === 'reserved' || r.status === 'active') && new Date(r.startDate) >= now)
          .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
          .slice(0, 5);
        setUpcomingRentals(upcoming);
        
        const pending = rentals
          .filter(r => (r.paymentStatus === 'pending' || r.paymentStatus === 'partial') && r.documentType !== 'quote')
          .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
          .slice(0, 5);
        setPendingPayments(pending);
        
        const currentMonthStart = startOfMonth(now);
        const currentMonthEnd = endOfMonth(now);
        const prevMonthStart = startOfMonth(subMonths(now, 1));
        const prevMonthEnd = endOfMonth(subMonths(now, 1));

        const getRevenueForPeriod = (start: Date, end: Date) => {
          const rentalRev = rentals
            .filter(r => 
              isWithinInterval(new Date(r.startDate), { start, end }) && 
              r.documentType !== 'quote' && 
              r.documentType !== 'reservation'
            )
            .reduce((acc, r) => acc + (r.paidAmount || 0), 0);
          
          const washRev = washes
            .filter(w => isWithinInterval(new Date(w.date), { start, end }))
            .reduce((acc, w) => acc + (w.price || 0), 0);
            
          return rentalRev + washRev;
        };

        const monthlyRevenue = getRevenueForPeriod(currentMonthStart, currentMonthEnd);
        const previousMonthlyRevenue = getRevenueForPeriod(prevMonthStart, prevMonthEnd);

        const last6Months = Array.from({ length: 6 }).map((_, i) => {
          const date = subMonths(now, 5 - i);
          const monthStart = startOfMonth(date);
          const monthEnd = endOfMonth(date);
          const revenue = getRevenueForPeriod(monthStart, monthEnd);
          return {
            name: format(date, 'MMM', { locale: fr }),
            revenue
          };
        });

        const unpaidAmount = rentals
          .filter(r => r.documentType !== 'quote' && r.documentType !== 'reservation')
          .reduce((acc, r) => acc + ((r.totalAmount || 0) - (r.paidAmount || 0)), 0);

        // -- OPTIMIZED NOTIFICATION CHECK --
        const expiring: {vehicle: Vehicle, type: string, days: number}[] = [];
        
        // Only run heavy notification writes once every 6 hours per session to save quota
        const lastCheckKey = `last_notif_check_${auth.currentUser?.uid}`;
        const lastCheck = localStorage.getItem(lastCheckKey);
        const shouldRunAsyncWrites = !lastCheck || (Date.now() - parseInt(lastCheck)) > (6 * 60 * 60 * 1000);

        let existingNotifications: any[] = [];
        if (shouldRunAsyncWrites) {
          try {
            const existingNotificationsSnap = await getDocs(query(collection(db, 'notifications'), limit(100)));
            existingNotifications = existingNotificationsSnap.docs.map(doc => doc.data());
          } catch (e) {
            console.error("Error fetching notifications for check:", e);
          }
        }

        for (const v of vehicles) {
          const checkExpiry = async (dateStr: string | undefined, type: string) => {
            if (!dateStr) return;
            const expiry = new Date(dateStr);
            const diff = differenceInDays(expiry, now);
            
            if (diff <= 15) {
              expiring.push({ vehicle: v, type, days: diff });
              
              const notificationTitle = diff <= 0 ? `Document Expiré: ${type}` : `Expiration ${type}`;
              const notificationMessage = diff <= 0 
                ? `${v.brand} ${v.model}: le document est expiré.` 
                : `${v.brand} ${v.model}: expire dans ${diff} jours.`;
              
              if (shouldRunAsyncWrites) {
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                const alreadyExists = existingNotifications.some(n => 
                  n.title === notificationTitle && 
                  n.vehicleId === v.id &&
                  n.docName === type &&
                  n.date === todayStr
                );

                if (!alreadyExists) {
                  try {
                    await addDoc(collection(db, 'notifications'), {
                      title: notificationTitle,
                      message: notificationMessage,
                      type: diff <= 0 ? 'error' : 'warning',
                      timestamp: new Date().toISOString(),
                      read: false,
                      vehicleId: v.id,
                      docName: type,
                      date: todayStr,
                      isManual: false,
                      officeId: currentOffice.id
                    });
                  } catch (error) {
                    console.error("Auto notification error:", error);
                  }
                }
              }

              // UI-only notification (not saved to DB)
              if (diff <= 15 && diff > 0) {
                addNotification('warning', notificationTitle, notificationMessage, undefined, 'vehicles');
              } else if (diff <= 0) {
                addNotification('error', notificationTitle, notificationMessage, undefined, 'vehicles');
              }
            }
          };
          await checkExpiry(v.insuranceExpiry, 'Assurance');
          await checkExpiry(v.vignetteExpiry, 'Vignette');
          await checkExpiry(v.technicalInspectionExpiry, 'Visite Technique');
          await checkExpiry(v.leasingExpiry, 'Leasing');

          if (v.nextOilChangeMileage && v.mileage) {
            const remainingKm = v.nextOilChangeMileage - v.mileage;
            if (remainingKm <= 100) {
              const title = remainingKm <= 0 ? "Vidange Dépassée" : "Alerte Vidange";
              const message = remainingKm <= 0 
                ? `${v.brand} ${v.model}: vidange dépassée de ${Math.abs(remainingKm)} km.`
                : `${v.brand} ${v.model}: vidange dans ${remainingKm} km.`;
              
              if (shouldRunAsyncWrites) {
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                const alreadyExists = existingNotifications.some(n => 
                  n.title === title && 
                  n.vehicleId === v.id &&
                  n.docName === 'Vidange' &&
                  n.date === todayStr
                );

                if (!alreadyExists) {
                  try {
                    await addDoc(collection(db, 'notifications'), {
                      title,
                      message,
                      type: remainingKm <= 0 ? 'error' : 'warning',
                      timestamp: new Date().toISOString(),
                      read: false,
                      vehicleId: v.id,
                      docName: 'Vidange',
                      date: todayStr,
                      isManual: false,
                      officeId: currentOffice.id
                    });
                  } catch (error) {
                    console.error("Oil change notif error:", error);
                  }
                }
              }

              expiring.push({ vehicle: v, type: 'Vidange', days: remainingKm });
              addNotification(remainingKm <= 0 ? 'error' : 'warning', title, message, undefined, 'vehicles');
            }
          }
        }
        
        if (shouldRunAsyncWrites) {
          localStorage.setItem(lastCheckKey, Date.now().toString());
        }

        setExpiringDocs(expiring);
        setRevenueData(last6Months);
        setStats({
          totalVehicles: vehiclesSnap.size,
          availableVehicles,
          rentedVehicles,
          occupiedVehicles,
          reservedVehicles,
          maintenanceVehicles,
          dirtyVehicles,
          activeRentals,
          totalClients: clientsSnap.size,
          monthlyRevenue,
          previousMonthlyRevenue,
          unpaidAmount
        });

        const logsQuery = query(
          collection(db, 'activity_logs'), 
          where('officeId', '==', currentOffice.id),
          orderBy('timestamp', 'desc'), 
          limit(5)
        );
        let maintenanceSnap;
        try {
          maintenanceSnap = await getDocs(query(collection(db, 'maintenances'), where('officeId', '==', currentOffice.id)));
          const pendingMaintenance = maintenanceSnap.docs.filter(d => d.data().status === 'pending');
          if (pendingMaintenance.length > 0) {
            addNotification('warning', 'Maintenance Requise', `${pendingMaintenance.length} véhicules nécessitent une attention.`, undefined, 'maintenance');
          }
        } catch (e) {
          console.error("Maintenance check failed:", e);
        }

        let logsSnap;
        try {
          logsSnap = await getDocs(logsQuery);
        } catch (e) {
          console.error("Logs fetch failed:", e);
          return;
        }
        setRecentLogs(logsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ActivityLog[]);

      } catch (error: any) {
        if (error.code === 'resource-exhausted' || error.message?.includes('Quota exceeded')) {
          addNotification('error', 'Quota Dépassé', 'Le système a atteint ses limites de lecture gratuites pour aujourd\'hui. Certaines données peuvent être manquantes.');
        }
        console.error("Dashboard error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();

    const hasShownWelcome = sessionStorage.getItem('welcome_shown');
    if (!hasShownWelcome && auth.currentUser) {
      addNotification('info', 'Bienvenue sur RentX Auto', 'Votre tableau de bord est à jour.', undefined, 'dashboard');
      sessionStorage.setItem('welcome_shown', 'true');
    }
  }, [auth.currentUser, currentOffice?.id]);

  const fleetData = [
    { name: 'Disponibles', value: stats.availableVehicles, color: '#10b981' },
    { name: 'Loués', value: stats.rentedVehicles, color: '#059669' },
    { name: 'Occupés', value: stats.occupiedVehicles, color: '#6366f1' },
    { name: 'Réservés', value: stats.reservedVehicles, color: '#8b5cf6' },
    { name: 'Maintenance', value: stats.maintenanceVehicles, color: '#f59e0b' },
  ];

  const occupancyRate = stats.totalVehicles > 0 
    ? Math.round((stats.activeRentals / stats.totalVehicles) * 100) 
    : 0;

  const occupancyData = [
    { name: 'Occupancy', value: occupancyRate, fill: '#10b981' }
  ];

  const handleExportReport = () => {
    const headers = ['Métrique', 'Valeur'];
    const data = [
      ['Total Véhicules', stats.totalVehicles],
      ['Véhicules Disponibles', stats.availableVehicles],
      ['Locations Actives', stats.activeRentals],
      ['Total Clients', stats.totalClients],
      ['Revenu Mensuel', stats.monthlyRevenue],
      ['Paiements en attente', stats.unpaidAmount],
    ];

    const csvContent = [
      headers.join(','),
      ...data.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `rapport_dhokkar_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return (
    <div className="animate-pulse space-y-8 max-w-7xl mx-auto">
      <div className="h-10 w-48 bg-stone-200 rounded-xl mb-8"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1,2,3,4].map(i => <div key={i} className="h-32 bg-stone-200 rounded-3xl"></div>)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 h-96 bg-stone-200 rounded-3xl"></div>
        <div className="h-96 bg-stone-200 rounded-3xl"></div>
      </div>
    </div>
  );

  const statusData = [
    { name: 'Disponible', value: stats.availableVehicles, color: '#10b981' },
    { name: 'Loué', value: stats.rentedVehicles, color: '#059669' },
    { name: 'Occupé', value: stats.occupiedVehicles, color: '#6366f1' },
    { name: 'Réservé', value: stats.reservedVehicles, color: '#f59e0b' },
    { name: 'Maintenance', value: stats.maintenanceVehicles, color: '#ef4444' },
  ].filter(d => d.value > 0);

  const revenueGrowth = stats.previousMonthlyRevenue > 0 
    ? ((stats.monthlyRevenue - stats.previousMonthlyRevenue) / stats.previousMonthlyRevenue) * 100 
    : 0;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Tableau de Bord - {currentOffice?.name}</h2>
          <p className="text-stone-500 italic serif text-sm">Performance et état de votre agence en temps réel.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-stone-100 p-1 rounded-2xl border border-stone-200">
            <button 
              onClick={() => exportToExcel(vehicles, 'Vehicules')}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-stone-600 hover:bg-white hover:text-emerald-600 rounded-xl transition-all"
            >
              <Car className="w-4 h-4" />
              Véhicules
            </button>
            <button 
              onClick={() => exportToExcel(clients, 'Clients')}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-stone-600 hover:bg-white hover:text-emerald-600 rounded-xl transition-all"
            >
              <Users className="w-4 h-4" />
              Clients
            </button>
            <button 
              onClick={() => exportToExcel(rentals, 'Locations')}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-stone-600 hover:bg-white hover:text-emerald-600 rounded-xl transition-all"
            >
              <Calendar className="w-4 h-4" />
              Locations
            </button>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Système OK</span>
          </div>
          <button className="p-2 bg-white border border-stone-200 rounded-xl text-stone-500 hover:bg-stone-50 transition-all shadow-sm">
            <Activity className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Business Health Overview */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-stone-900 flex items-center gap-2">
              <Activity className="w-6 h-6 text-emerald-500" />
              Statut & Santé de l'Entreprise
            </h3>
            <p className="text-sm text-stone-500 italic serif">Indicateurs de performance globale basés sur les données temps réel.</p>
          </div>
          <div className="flex gap-4">
            <div className="px-6 py-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex flex-col items-center">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Croissance</span>
              <span className="text-2xl font-black text-emerald-700 tracking-tighter">
                {revenueGrowth > 0 ? '+' : ''}{revenueGrowth.toFixed(1)}%
              </span>
            </div>
            <div className="px-6 py-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex flex-col items-center">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Disponibilité</span>
              <span className="text-2xl font-black text-emerald-700 tracking-tighter">
                {stats.totalVehicles > 0 ? Math.round((stats.availableVehicles / stats.totalVehicles) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100">
            <div className="flex justify-between items-end mb-2">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Taux d'Atteinte CA</span>
              <span className="text-sm font-bold text-stone-900">{Math.min(100, Math.round((stats.monthlyRevenue / 50000) * 100))}%</span>
            </div>
            <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-1000" 
                style={{ width: `${Math.min(100, (stats.monthlyRevenue / 50000) * 100)}%` }} 
              />
            </div>
          </div>
          <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100">
            <div className="flex justify-between items-end mb-2">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Véhicules Loués</span>
              <span className="text-sm font-bold text-stone-900">{Math.round((stats.rentedVehicles / Math.max(1, stats.totalVehicles)) * 100)}%</span>
            </div>
            <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-1000" 
                style={{ width: `${(stats.rentedVehicles / Math.max(1, stats.totalVehicles)) * 100}%` }} 
              />
            </div>
          </div>
          <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100">
            <div className="flex justify-between items-end mb-2">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Qualité Parc (Propreté)</span>
              <span className="text-sm font-bold text-stone-900">{Math.round(((stats.totalVehicles - stats.dirtyVehicles) / Math.max(1, stats.totalVehicles)) * 100)}%</span>
            </div>
            <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-500 transition-all duration-1000" 
                style={{ width: `${((stats.totalVehicles - stats.dirtyVehicles) / Math.max(1, stats.totalVehicles)) * 100}%` }} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <button 
          onClick={() => setActiveTab('rentals')}
          className="flex items-center gap-3 p-4 bg-white border border-stone-200 rounded-2xl hover:border-emerald-500 hover:shadow-md transition-all group text-left"
        >
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all shrink-0">
            <Plus className="w-5 h-5" />
          </div>
          <span className="text-sm font-bold text-stone-700">Nouvelle Location</span>
        </button>
        <button 
          onClick={() => setActiveTab('vehicles')}
          className="flex items-center gap-3 p-4 bg-white border border-stone-200 rounded-2xl hover:border-emerald-500 hover:shadow-md transition-all group text-left"
        >
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all shrink-0">
            <Car className="w-5 h-5" />
          </div>
          <span className="text-sm font-bold text-stone-700">Ajouter Véhicule</span>
        </button>
        <button 
          onClick={() => setActiveTab('clients')}
          className="flex items-center gap-3 p-4 bg-white border border-stone-200 rounded-2xl hover:border-purple-500 hover:shadow-md transition-all group text-left"
        >
          <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-all shrink-0">
            <UserPlus className="w-5 h-5" />
          </div>
          <span className="text-sm font-bold text-stone-700">Nouveau Client</span>
        </button>
        <button 
          onClick={() => setActiveTab('accounting')}
          className="flex items-center gap-3 p-4 bg-white border border-stone-200 rounded-2xl hover:border-amber-500 hover:shadow-md transition-all group text-left"
        >
          <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-all shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <span className="text-sm font-bold text-stone-700">Rapports</span>
        </button>
        <button 
          onClick={() => setActiveTab('users')}
          className="flex items-center gap-3 p-4 bg-white border border-stone-200 rounded-2xl hover:border-stone-900 hover:shadow-md transition-all group text-left"
        >
          <div className="w-10 h-10 bg-stone-100 text-stone-600 rounded-xl flex items-center justify-center group-hover:bg-stone-900 group-hover:text-white transition-all shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <span className="text-sm font-bold text-stone-700">Gérer Administrateurs</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        <StatCard 
          title="Véhicules" 
          value={stats.totalVehicles} 
          subtitle={`${stats.availableVehicles} disponibles`}
          icon={Car} 
          color="bg-emerald-500" 
          trend={+5}
        />
        <StatCard 
          title="Maintenance" 
          value={stats.maintenanceVehicles} 
          subtitle="En atelier"
          icon={Wrench} 
          color="bg-amber-500" 
          trend={0}
          onClick={() => setActiveTab('vehicles')}
        />
        <StatCard 
          title="Lavage" 
          value={stats.dirtyVehicles} 
          subtitle="Véhicules sales"
          icon={Droplets} 
          color="bg-emerald-400" 
          trend={0}
          onClick={() => setActiveTab('vehicles')}
        />
        <StatCard 
          title="Locations" 
          value={stats.activeRentals} 
          subtitle="Contrats actifs"
          icon={Calendar} 
          color="bg-emerald-500" 
          trend={+12}
        />
        <StatCard 
          title="Clients" 
          value={stats.totalClients} 
          subtitle="Base de données"
          icon={Users} 
          color="bg-purple-500" 
          trend={+8}
        />
        <StatCard 
          title="Revenu Mensuel (TTC)" 
          value={`${(stats.monthlyRevenue || 0).toLocaleString()} TND`} 
          subtitle={`HT: ${((stats.monthlyRevenue || 0) / 1.19).toFixed(3)} TND`}
          icon={TrendingUp} 
          color="bg-emerald-600" 
          trend={revenueGrowth}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
            <div>
              <h3 className="text-lg font-bold text-stone-900">Évolution du Revenu</h3>
              <p className="text-sm text-stone-500">Revenus mensuels sur les 6 derniers mois</p>
            </div>
            <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full self-start sm:self-auto">
              <ArrowUpRight className="w-4 h-4" />
              <span className="text-xs font-bold">+{revenueGrowth.toFixed(1)}%</span>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}}
                />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Fleet Status Chart */}
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold text-stone-900">État de la Flotte</h3>
              <p className="text-sm text-stone-500">Distribution par statut</p>
            </div>
            <div className="p-2 bg-stone-50 rounded-xl">
              <Car className="w-5 h-5 text-stone-400" />
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    borderRadius: '16px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' 
                  }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  formatter={(value) => <span className="text-[10px] font-bold text-stone-600 uppercase tracking-widest">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Pending Payments Overview */}
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold text-stone-900">Paiements en Attente</h3>
              <p className="text-sm text-stone-500">Les 5 dernières locations avec solde restant.</p>
            </div>
            <button 
              onClick={() => setActiveTab('accounting')}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-500 uppercase tracking-widest"
            >
              Voir tout
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-bold text-stone-400 uppercase tracking-widest border-b border-stone-100">
                  <th className="pb-4">Client</th>
                  <th className="pb-4">Contrat</th>
                  <th className="pb-4">Total</th>
                  <th className="pb-4">Reste</th>
                  <th className="pb-4">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {pendingPayments.map((rental) => {
                  const client = clients.find(c => c.id === rental.clientId);
                  const remaining = rental.totalAmount - (rental.paidAmount || 0);
                  return (
                    <tr key={rental.id} className="group hover:bg-stone-50/50 transition-all">
                      <td className="py-4">
                        <p className="text-sm font-bold text-stone-900">{client?.name || 'Client Inconnu'}</p>
                      </td>
                      <td className="py-4">
                        <span className="text-xs font-mono text-stone-500">{rental.contractNumber || rental.id.slice(-6).toUpperCase()}</span>
                      </td>
                      <td className="py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-stone-900">{(rental.totalAmount || 0).toLocaleString()} TND</span>
                          <span className="text-[10px] text-stone-400">HT: {((rental.totalAmountHT || rental.totalAmount / 1.19) || 0).toFixed(3)}</span>
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-red-600">{(remaining || 0).toLocaleString()} TND</span>
                          <span className="text-[10px] text-red-500">HT: {(remaining / 1.19).toFixed(3)}</span>
                        </div>
                      </td>
                      <td className="py-4">
                        <span className={clsx(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tighter border",
                          rental.paymentStatus === 'partial' ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-red-50 text-red-700 border-red-100"
                        )}>
                          {rental.paymentStatus === 'partial' ? 'Partiel' : 'Impayé'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {pendingPayments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-stone-400 italic text-sm">
                      Aucun paiement en attente.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-stone-900">Activité Récente</h3>
            <button 
              onClick={() => setActiveTab('administration')}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-500 uppercase tracking-widest"
            >
              Voir tout
            </button>
          </div>
          <div className="space-y-6">
            {recentLogs.length > 0 ? recentLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-4 group">
                <div className="w-10 h-10 bg-stone-50 rounded-xl flex items-center justify-center text-stone-400 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-all">
                  <Clock className="w-5 h-5" />
                </div>
                <div className="flex-1 border-b border-stone-100 pb-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-stone-900 capitalize">{log.action.replace('_', ' ')}</p>
                      <span className="text-[10px] bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded font-medium">
                        {log.userName || 'Système'}
                      </span>
                    </div>
                    <span className="text-[10px] text-stone-400 font-medium">
                      {log.timestamp ? format(new Date(log.timestamp), 'HH:mm', { locale: fr }) : '--:--'}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500">{log.description}</p>
                </div>
              </div>
            )) : (
              <p className="text-center text-stone-400 py-8 italic">Aucune activité récente.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Alerts & Reminders */}
        <div className="lg:col-span-3 bg-stone-900 text-white p-8 rounded-3xl shadow-xl flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-emerald-400 mb-4">
              <AlertCircle className="w-5 h-5" />
              <span className="text-xs font-bold uppercase tracking-widest">Maintenance & Alertes</span>
            </div>
            <h3 className="text-2xl font-bold mb-2">Alertes & Rappels</h3>
            <p className="text-stone-400 text-sm">Suivez les expirations de documents et les entretiens à venir.</p>
          </div>
          
          <div className="flex-1 w-full overflow-x-auto pb-2 scrollbar-hide">
            <div className="flex gap-4 min-w-max">
              {expiringDocs.length > 0 ? expiringDocs.map((doc, idx) => (
                <div key={idx} className="p-4 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-all cursor-pointer min-w-[200px]">
                  <p className="text-sm font-bold">{doc.type} {doc.days <= 0 ? 'Expiré' : 'Expire bientôt'}</p>
                  <p className="text-xs text-stone-400 mt-1">{doc.vehicle.brand} {doc.vehicle.model} - {doc.days <= 0 ? 'Dépassé' : `Dans ${doc.days} jours`}</p>
                </div>
              )) : (
                <div className="p-4 bg-white/5 rounded-2xl border border-white/10 text-center w-full">
                  <p className="text-sm text-stone-400 italic">Aucune alerte pour le moment.</p>
                </div>
              )}
            </div>
          </div>
          
          <button 
            onClick={() => setActiveTab('vehicles')}
            className="w-full md:w-auto px-8 py-4 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-600/20 whitespace-nowrap"
          >
            Gérer le parc
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon: Icon, color, trend, onClick }: any) {
  const isPositive = trend >= 0;
  return (
    <div 
      onClick={onClick}
      className={clsx(
        "bg-white p-6 rounded-3xl border border-stone-200 shadow-sm hover:shadow-md transition-all group",
        onClick && "cursor-pointer hover:border-emerald-500"
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 ${color} rounded-2xl flex items-center justify-center text-white shadow-lg shadow-current/20`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className={clsx(
          "flex items-center gap-0.5 px-2 py-1 rounded-full text-[10px] font-bold",
          isPositive ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
        )}>
          {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {Math.abs(trend).toFixed(0)}%
        </div>
      </div>
      <div>
        <p className="text-stone-500 text-sm font-medium mb-1">{title}</p>
        <h4 className="text-2xl font-bold text-stone-900 mb-1">{value}</h4>
        <p className="text-xs text-stone-400 italic">{subtitle}</p>
      </div>
    </div>
  );
}
