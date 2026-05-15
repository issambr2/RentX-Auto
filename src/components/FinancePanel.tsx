import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy, getDocs, updateDoc, doc, deleteDoc } from '../lib/api';
import { db, auth } from '../lib/api';
import { Rental, Maintenance, Leasing, SalaryPayment, Expense, FinanceStatus, VehicleWash, PaymentMethod } from '../types';
import { TrendingUp, TrendingDown, DollarSign, PieChart, Calendar, ArrowUpRight, ArrowDownRight, Filter, Download, Briefcase, Car, Wrench, Users, FileText, XCircle, Search, Trash2, AlertTriangle, CheckCircle2, Clock, RefreshCcw, Edit2, CreditCard } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx } from 'clsx';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart as RePieChart, Pie, Cell, Legend } from 'recharts';
import { useOffice } from '../contexts/OfficeContext';
import { useNotifications } from './NotificationContext';
import { ConfirmationModal } from './ConfirmationModal';
import { UserProfile } from '../types';
import * as XLSX from 'xlsx';

interface UnifiedPayment {
  id: string;
  sourceId: string;
  sourceType: 'rental' | 'expense' | 'wash' | 'leasing' | 'salary' | 'maintenance';
  date: string;
  amount: number;
  type: 'income' | 'expense';
  description: string;
  paymentMethod: string;
  status: string;
  originalDoc: any;
  leasingPaymentId?: string;
}

interface FinancePanelProps {
  profile: UserProfile | null;
}

import { handleFirestoreError, OperationType } from '../utils/errorHandling';

export function FinancePanel({ profile }: FinancePanelProps) {
  const { currentOffice } = useOffice();
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [allPayments, setAllPayments] = useState<UnifiedPayment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [isCancelling, setIsCancelling] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, payment: UnifiedPayment | null }>({ isOpen: false, payment: null });
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
  const [editingPayment, setEditingPayment] = useState<UnifiedPayment | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  
  const canManagePayments = profile?.role === 'master_admin' || 
                           profile?.role === 'admin' || 
                           profile?.role === 'manager' || 
                           profile?.role === 'accountant' ||
                           auth.currentUser?.email === 'brahemdesign@gmail.com';
  
  useEffect(() => {
    console.log("FinancePanel Profile:", profile);
    console.log("Can Manage Payments:", canManagePayments);
  }, [profile, canManagePayments]);

  const [stats, setStats] = useState({
    revenue: 0,
    expenses: 0,
    profit: 0,
    breakdown: {
      rentals: 0,
      maintenance: 0,
      leasing: 0,
      salaries: 0,
      other: 0
    },
    revenueByVehicle: [] as { brand: string, model: string, plate: string, revenue: number }[]
  });
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    if (!currentOffice) return;

    const fetchData = async () => {
      // Only show full loading on initial load or office/month change
      const isInitialOrTypeChange = !allPayments.length;
      if (isInitialOrTypeChange) setLoading(true);
      
      try {
        const monthStart = startOfMonth(new Date(selectedMonth));
        const monthEnd = endOfMonth(new Date(selectedMonth));

        // Fetch all necessary data
        const rentalsSnap = await getDocs(query(collection(db, 'rentals'), where('officeId', '==', currentOffice.id)));
        const maintenanceSnap = await getDocs(query(collection(db, 'maintenances'), where('officeId', '==', currentOffice.id)));
        const leasingSnap = await getDocs(query(collection(db, 'leasings'), where('officeId', '==', currentOffice.id)));
        const salariesSnap = await getDocs(query(collection(db, 'salaryPayments'), where('officeId', '==', currentOffice.id)));
        const expensesSnap = await getDocs(query(collection(db, 'expenses'), where('officeId', '==', currentOffice.id)));
        const washesSnap = await getDocs(query(collection(db, 'washes'), where('officeId', '==', currentOffice.id)));

        const rentals = rentalsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Rental));
        const maintenances = maintenanceSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Maintenance));
        const leasings = leasingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Leasing));
        const salaries = salariesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SalaryPayment));
        const expenses = expensesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
        const washes = washesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as VehicleWash));

        // Unified Payments for History
        const unified: UnifiedPayment[] = [];

        // Rentals
        rentals.forEach(r => {
          if (r.paidAmount > 0) {
            unified.push({
              id: `rental-${r.id}`,
              sourceId: r.id,
              sourceType: 'rental',
              date: r.startDate,
              amount: r.paidAmount,
              type: 'income',
              description: `Location: ${r.contractNumber}`,
              paymentMethod: r.paymentMethod,
              status: r.paymentStatus,
              originalDoc: r
            });
          }
        });

        // Washes
        washes.forEach(w => {
          if (w.isPaid) {
            unified.push({
              id: `wash-${w.id}`,
              sourceId: w.id,
              sourceType: 'wash',
              date: w.date,
              amount: w.price,
              type: 'income',
              description: `Lavage: ${w.vehiclePlate}`,
              paymentMethod: w.paymentMethod || 'cash',
              status: 'paid',
              originalDoc: w
            });
          }
        });

        // Expenses
        expenses.forEach(e => {
          unified.push({
            id: `expense-${e.id}`,
            sourceId: e.id,
            sourceType: 'expense',
            date: e.date,
            amount: e.amount,
            type: 'expense',
            description: e.description,
            paymentMethod: e.paymentMethod,
            status: 'paid',
            originalDoc: e
          });
        });

        // Leasing
        leasings.forEach(l => {
          l.payments.forEach(p => {
            if (p.status === 'paid') {
              unified.push({
                id: `leasing-${l.id}-${p.id}`,
                sourceId: l.id,
                sourceType: 'leasing',
                leasingPaymentId: p.id,
                date: p.paidDate || p.dueDate,
                amount: p.amount,
                type: 'expense',
                description: `Leasing: ${l.contractNumber}`,
                paymentMethod: p.paymentMethod || 'transfer',
                status: 'paid',
                originalDoc: l
              });
            }
          });
        });

        // Salaries
        salaries.forEach(s => {
          if (s.status === 'paid') {
            unified.push({
              id: `salary-${s.id}`,
              sourceId: s.id,
              sourceType: 'salary',
              date: s.paymentDate || s.month,
              amount: s.netSalary,
              type: 'expense',
              description: `Salaire: ${s.month}`,
              paymentMethod: s.paymentMethod,
              status: 'paid',
              originalDoc: s
            });
          }
        });

        // Maintenance
        maintenances.forEach(m => {
          if (m.status === 'completed' && m.cost > 0) {
            unified.push({
              id: `maintenance-${m.id}`,
              sourceId: m.id,
              sourceType: 'maintenance',
              date: m.date,
              amount: m.cost,
              type: m.clientId ? 'income' : 'expense',
              description: `${m.clientId ? 'Facturation Client' : 'Entretien'}: ${m.type}${m.clientName ? ` (${m.clientName})` : ''}`,
              paymentMethod: m.paymentMethod || 'cash',
              status: 'paid',
              originalDoc: m
            });
          }
        });

        setAllPayments(unified.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

        // Calculate for selected month
        const monthlyRentals = rentals.filter(r => isWithinInterval(new Date(r.startDate), { start: monthStart, end: monthEnd }));
        const monthlyClientMaintenance = maintenances.filter(m => m.clientId && m.status === 'completed' && isWithinInterval(new Date(m.date), { start: monthStart, end: monthEnd }));
        const maintenanceRevenue = monthlyClientMaintenance.reduce((sum, m) => sum + (m.cost || 0), 0);
        const revenue = monthlyRentals.reduce((sum, r) => sum + (r.totalAmount || 0), 0) + maintenanceRevenue;

        const monthlyMaintenance = maintenances.filter(m => !m.clientId && m.status === 'completed' && isWithinInterval(new Date(m.date), { start: monthStart, end: monthEnd }));
        const maintenanceCost = monthlyMaintenance.reduce((sum, m) => sum + (m.cost || 0), 0);

        const monthlyLeasing = leasings.reduce((sum, l) => {
          const monthlyPay = l.payments.filter(p => p.status === 'paid' && isWithinInterval(new Date(p.paidDate || p.dueDate), { start: monthStart, end: monthEnd }));
          return sum + monthlyPay.reduce((s, p) => s + p.amount, 0);
        }, 0);

        const monthlySalaries = salaries.filter(s => s.month === selectedMonth && s.status === 'paid');
        const salaryCost = monthlySalaries.reduce((sum, s) => sum + s.netSalary, 0);

        const monthlySalariesFromExpenses = expenses.filter(e => e.type === 'salary' && isWithinInterval(new Date(e.date), { start: monthStart, end: monthEnd }));
        const salaryCostFromExpenses = monthlySalariesFromExpenses.reduce((sum, e) => sum + (e.amountTTC || e.amount || 0), 0);

        const monthlyMaintenanceFromExpenses = expenses.filter(e => e.type === 'maintenance' && isWithinInterval(new Date(e.date), { start: monthStart, end: monthEnd }));
        const maintenanceCostFromExpenses = monthlyMaintenanceFromExpenses.reduce((sum, e) => sum + (e.amountTTC || e.amount || 0), 0);

        const monthlyOtherExpenses = expenses.filter(e => !['salary', 'maintenance'].includes(e.type) && isWithinInterval(new Date(e.date), { start: monthStart, end: monthEnd }));
        const otherCost = monthlyOtherExpenses.reduce((sum, e) => sum + (e.amountTTC || e.amount || 0), 0);

        const totalExpenses = maintenanceCost + maintenanceCostFromExpenses + monthlyLeasing + salaryCost + salaryCostFromExpenses + otherCost;

        // Revenue by vehicle
        const vehicleRevenueMap = new Map<string, number>();
        monthlyRentals.forEach(r => {
          const current = vehicleRevenueMap.get(r.vehicleId) || 0;
          vehicleRevenueMap.set(r.vehicleId, current + (r.totalAmount || 0));
        });

        const vehiclesSnap = await getDocs(query(collection(db, 'vehicles'), where('officeId', '==', currentOffice.id)));
        const vehicles = vehiclesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

        const revenueByVehicle = Array.from(vehicleRevenueMap.entries())
          .map(([vehicleId, revenue]) => {
            const vehicle = vehicles.find(v => v.id === vehicleId);
            return {
              brand: vehicle?.brand || 'Inconnu',
              model: vehicle?.model || '',
              plate: vehicle?.plate || '',
              revenue
            };
          })
          .sort((a, b) => b.revenue - a.revenue);

        setStats({
          revenue,
          expenses: totalExpenses,
          profit: revenue - totalExpenses,
          breakdown: {
            rentals: revenue,
            maintenance: maintenanceCost + maintenanceCostFromExpenses,
            leasing: monthlyLeasing,
            salaries: salaryCost + salaryCostFromExpenses,
            other: otherCost
          },
          revenueByVehicle
        });

        // Generate 6 months trend
        const trend = Array.from({ length: 6 }).map((_, i) => {
          const date = subMonths(new Date(), 5 - i);
          const mStart = startOfMonth(date);
          const mEnd = endOfMonth(date);
          const mKey = format(date, 'yyyy-MM');

          const rev = rentals
            .filter(r => isWithinInterval(new Date(r.startDate), { start: mStart, end: mEnd }))
            .reduce((sum, r) => sum + (r.totalAmount || 0), 0) +
            maintenances
            .filter(m => m.clientId && m.status === 'completed' && isWithinInterval(new Date(m.date), { start: mStart, end: mEnd }))
            .reduce((sum, m) => sum + (m.cost || 0), 0);
          
          const exp = maintenances
            .filter(m => !m.clientId && m.status === 'completed' && isWithinInterval(new Date(m.date), { start: mStart, end: mEnd }))
            .reduce((sum, m) => sum + (m.cost || 0), 0) +
            leasings.reduce((sum, l) => {
              const p = l.payments.filter(pay => pay.status === 'paid' && isWithinInterval(new Date(pay.paidDate || pay.dueDate), { start: mStart, end: mEnd }));
              return sum + p.reduce((s, pay) => s + pay.amount, 0);
            }, 0) +
            salaries.filter(s => s.month === mKey && s.status === 'paid').reduce((sum, s) => sum + s.netSalary, 0) +
            expenses.filter(e => isWithinInterval(new Date(e.date), { start: mStart, end: mEnd })).reduce((sum, e) => sum + e.amount, 0);

          return {
            name: format(date, 'MMM', { locale: fr }),
            revenue: rev,
            expenses: exp,
            profit: rev - exp
          };
        });

        setChartData(trend);

      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'finance-data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentOffice, selectedMonth, refreshTrigger]);

  const handleUpdatePayment = async (updatedData: any) => {
    if (!editingPayment) return;
    try {
      switch (editingPayment.sourceType) {
        case 'rental':
          await updateDoc(doc(db, 'rentals', editingPayment.sourceId), {
            paidAmount: Number(updatedData.amount),
            paymentMethod: updatedData.paymentMethod,
            startDate: updatedData.date
          });
          break;
        case 'expense':
          await updateDoc(doc(db, 'expenses', editingPayment.sourceId), {
            amount: Number(updatedData.amount),
            description: updatedData.description,
            paymentMethod: updatedData.paymentMethod,
            date: updatedData.date
          });
          break;
        case 'wash':
          await updateDoc(doc(db, 'washes', editingPayment.sourceId), {
            price: Number(updatedData.amount),
            paymentMethod: updatedData.paymentMethod,
            date: updatedData.date
          });
          break;
        case 'leasing':
          const leasing = editingPayment.originalDoc as Leasing;
          const updatedLeasingPayments = leasing.payments.map(p => 
            p.id === editingPayment.leasingPaymentId ? { ...p, amount: Number(updatedData.amount), paidDate: updatedData.date } : p
          );
          await updateDoc(doc(db, 'leasings', editingPayment.sourceId), {
            payments: updatedLeasingPayments
          });
          break;
        case 'salary':
          await updateDoc(doc(db, 'salaryPayments', editingPayment.sourceId), {
            netSalary: Number(updatedData.amount),
            paymentMethod: updatedData.paymentMethod,
            paymentDate: updatedData.date
          });
          break;
        case 'maintenance':
          await updateDoc(doc(db, 'maintenances', editingPayment.sourceId), {
            cost: Number(updatedData.amount),
            date: updatedData.date
          });
          break;
      }
      addNotification('success', 'Paiement mis à jour', 'Les modifications ont été enregistrées avec succès.');
      setRefreshTrigger(prev => prev + 1);
      setIsEditModalOpen(false);
      setEditingPayment(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, editingPayment.sourceType);
    }
  };

  const handleBulkDelete = async () => {
    try {
      for (const paymentId of selectedPayments) {
        const payment = allPayments.find(p => p.id === paymentId);
        if (payment) {
          await handleCancelPayment(payment);
        }
      }
      addNotification('success', 'Suppression groupée terminée', `${selectedPayments.length} paiements ont été traités.`);
      setSelectedPayments([]);
      setIsBulkDeleteModalOpen(false);
    } catch (error) {
      console.error("Error in bulk delete:", error);
      addNotification('error', 'Erreur', "Une erreur est survenue lors de la suppression groupée.");
    }
  };

  const togglePaymentSelection = (id: string) => {
    setSelectedPayments(prev => 
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const toggleAllSelection = () => {
    if (selectedPayments.length === filteredPayments.length) {
      setSelectedPayments([]);
    } else {
      setSelectedPayments(filteredPayments.map(p => p.id));
    }
  };

  const handleCancelPayment = async (payment: UnifiedPayment) => {
    setIsCancelling(payment.id);
    try {
      switch (payment.sourceType) {
        case 'rental':
          await updateDoc(doc(db, 'rentals', payment.sourceId), {
            paidAmount: 0,
            paymentStatus: 'pending'
          });
          addNotification('success', 'Paiement annulé', 'Le paiement de la location a été réinitialisé.');
          break;
        case 'expense':
          await deleteDoc(doc(db, 'expenses', payment.sourceId));
          addNotification('success', 'Dépense supprimée', 'La dépense a été définitivement supprimée.');
          break;
        case 'wash':
          // Delete the wash record entirely as requested
          await deleteDoc(doc(db, 'washes', payment.sourceId));
          
          // Also delete the linked expense if it exists
          const expenseQuery = query(collection(db, 'expenses'), where('washId', '==', payment.sourceId));
          const expenseSnap = await getDocs(expenseQuery);
          for (const d of expenseSnap.docs) {
            await deleteDoc(doc(db, 'expenses', d.id));
          }
          addNotification('success', 'Lavage supprimé', 'Le lavage et sa dépense liée ont été supprimés.');
          break;
        case 'leasing':
          const leasing = payment.originalDoc as Leasing;
          const updatedPayments = leasing.payments.map(p => 
            p.id === payment.leasingPaymentId ? { ...p, status: 'pending', paidDate: null } : p
          );
          await updateDoc(doc(db, 'leasings', payment.sourceId), {
            payments: updatedPayments
          });
          addNotification('success', 'Paiement leasing annulé', 'Le statut du paiement leasing a été réinitialisé.');
          break;
        case 'salary':
          await updateDoc(doc(db, 'salaryPayments', payment.sourceId), {
            status: 'pending',
            paymentDate: null
          });
          addNotification('success', 'Paiement salaire annulé', 'Le statut du salaire a été réinitialisé.');
          break;
        case 'maintenance':
          await updateDoc(doc(db, 'maintenances', payment.sourceId), {
            status: 'pending'
          });
          addNotification('success', 'Paiement maintenance annulé', 'Le statut de la maintenance a été réinitialisé.');
          break;
      }
      
      // Refresh data without page reload
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, payment.sourceType);
    } finally {
      setIsCancelling(null);
    }
  };

  const filteredPayments = allPayments.filter(p => {
    const matchesSearch = p.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         p.paymentMethod.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || p.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const exportFinanceReport = () => {
    const data = [
      { 'Catégorie': 'Revenus (Locations)', 'Montant': stats.revenue },
      { 'Catégorie': 'Dépenses (Maintenance)', 'Montant': stats.breakdown.maintenance },
      { 'Catégorie': 'Dépenses (Leasing)', 'Montant': stats.breakdown.leasing },
      { 'Catégorie': 'Dépenses (Salaires)', 'Montant': stats.breakdown.salaries },
      { 'Catégorie': 'Dépenses (Autres)', 'Montant': stats.breakdown.other },
      { 'Catégorie': 'Total Dépenses', 'Montant': stats.expenses },
      { 'Catégorie': 'Bénéfice Net', 'Montant': stats.profit },
    ];

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rapport Financier");
    XLSX.writeFile(workbook, `Rapport_Financier_${selectedMonth}.xlsx`);
  };

  const pieData = [
    { name: 'Maintenance', value: stats.breakdown.maintenance, color: '#f59e0b' },
    { name: 'Leasing', value: stats.breakdown.leasing, color: '#10b981' },
    { name: 'Salaires', value: stats.breakdown.salaries, color: '#8b5cf6' },
    { name: 'Autres', value: stats.breakdown.other, color: '#ef4444' },
  ].filter(d => d.value > 0);

  if (loading) return <div className="animate-pulse space-y-8">...</div>;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Statut Financier</h2>
          <p className="text-stone-500 italic serif">Analyse détaillée des revenus, dépenses et rentabilité.</p>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="month" 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-white border border-stone-200 rounded-xl px-4 py-2 text-sm font-bold text-stone-700 focus:ring-2 focus:ring-emerald-500"
          />
          <button 
            onClick={exportFinanceReport}
            className="flex items-center gap-2 bg-stone-900 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-stone-800 transition-all shadow-lg"
          >
            <Download className="w-4 h-4" />
            Exporter
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase tracking-widest">Revenus</span>
          </div>
          <p className="text-3xl font-black text-stone-900">{stats.revenue.toLocaleString()} DT</p>
          <p className="text-stone-400 text-xs mt-2 italic">Total des locations encaissées</p>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center">
              <TrendingDown className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full uppercase tracking-widest">Dépenses</span>
          </div>
          <p className="text-3xl font-black text-stone-900">{stats.expenses.toLocaleString()} DT</p>
          <p className="text-stone-400 text-xs mt-2 italic">Maintenance, leasing, salaires et frais</p>
        </div>

        <div className={clsx(
          "p-8 rounded-[2.5rem] border shadow-sm",
          stats.profit >= 0 ? "bg-emerald-900 text-white border-emerald-800" : "bg-red-900 text-white border-red-800"
        )}>
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/10 text-white rounded-2xl flex items-center justify-center">
              <DollarSign className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-white/60 bg-white/10 px-2 py-1 rounded-full uppercase tracking-widest">Bénéfice Net</span>
          </div>
          <p className="text-3xl font-black">{stats.profit.toLocaleString()} DT</p>
          <p className="text-white/60 text-xs mt-2 italic">Résultat net après toutes charges</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Trend Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
          <h3 className="text-lg font-bold text-stone-900 mb-8 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            Évolution Financière (6 mois)
          </h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#a8a29e', fontSize: 10, fontWeight: 600}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#a8a29e', fontSize: 10, fontWeight: 600}} />
                <Tooltip 
                  contentStyle={{backgroundColor: '#fff', borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}}
                />
                <Area type="monotone" dataKey="revenue" name="Revenus" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                <Area type="monotone" dataKey="expenses" name="Dépenses" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorExp)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Breakdown Chart */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
          <h3 className="text-lg font-bold text-stone-900 mb-8 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-purple-500" />
            Répartition des Dépenses
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RePieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}}
                />
                <Legend verticalAlign="bottom" height={36}/>
              </RePieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between p-3 bg-stone-50 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                  <Car className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-stone-700">Leasing</span>
              </div>
              <span className="text-sm font-black text-stone-900">{stats.breakdown.leasing.toLocaleString()} DT</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-stone-50 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center">
                  <Wrench className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-stone-700">Maintenance</span>
              </div>
              <span className="text-sm font-black text-stone-900">{stats.breakdown.maintenance.toLocaleString()} DT</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-stone-50 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-stone-700">Salaires</span>
              </div>
              <span className="text-sm font-black text-stone-900">{stats.breakdown.salaries.toLocaleString()} DT</span>
            </div>
          </div>
        </div>
      </div>

      {/* Revenue by Vehicle */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
        <h3 className="text-xl font-bold text-stone-900 mb-8 flex items-center gap-2">
          <Car className="w-6 h-6 text-emerald-500" />
          Classement des Revenus par Véhicule
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stats.revenueByVehicle.map((v, i) => (
            <div key={i} className="flex items-center justify-between p-6 bg-stone-50 rounded-3xl border border-stone-100 hover:border-emerald-200 transition-all group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-stone-400 group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-sm">
                  <Car className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-stone-900">{v.brand} {v.model}</p>
                  <p className="text-xs text-stone-400 font-mono">{v.plate}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-black text-emerald-600">{v.revenue.toLocaleString()} DT</p>
                <p className="text-[10px] text-stone-400 uppercase tracking-widest">Revenue ce mois</p>
              </div>
            </div>
          ))}
          {stats.revenueByVehicle.length === 0 && (
            <div className="col-span-full py-12 text-center text-stone-400 italic">
              Aucun revenu enregistré pour ce mois.
            </div>
          )}
        </div>
      </div>

      {/* Advanced Payment History */}
      <div className="bg-white rounded-[2.5rem] border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-stone-100 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h3 className="text-xl font-bold text-stone-900 flex items-center gap-2">
              <RefreshCcw className="w-6 h-6 text-emerald-500" />
              Historique Avancé des Paiements
            </h3>
            <p className="text-stone-400 text-xs italic mt-1">Gérez et annulez tous les flux financiers de l'entreprise.</p>
          </div>
          
          <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
            {selectedPayments.length > 0 && canManagePayments && (
              <button
                onClick={() => setIsBulkDeleteModalOpen(true)}
                className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-700 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                Supprimer ({selectedPayments.length})
              </button>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input 
                type="text"
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-stone-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 w-full md:w-64"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="px-4 py-2 bg-stone-50 border-none rounded-xl text-sm font-bold text-stone-700 focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Tous les flux</option>
              <option value="income">Entrées (Revenus)</option>
              <option value="expense">Sorties (Dépenses)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50/50 text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                <th className="px-8 py-4">
                  <input 
                    type="checkbox"
                    checked={selectedPayments.length === filteredPayments.length && filteredPayments.length > 0}
                    onChange={toggleAllSelection}
                    className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                  />
                </th>
                <th className="px-8 py-4">Date</th>
                <th className="px-8 py-4">Description</th>
                <th className="px-8 py-4">Type</th>
                <th className="px-8 py-4">Méthode</th>
                <th className="px-8 py-4">Montant</th>
                <th className="px-8 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredPayments.map((payment) => (
                <tr key={payment.id} className={clsx(
                  "hover:bg-stone-50/50 transition-all group",
                  selectedPayments.includes(payment.id) && "bg-emerald-50/30"
                )}>
                  <td className="px-8 py-5">
                    <input 
                      type="checkbox"
                      checked={selectedPayments.includes(payment.id)}
                      onChange={() => togglePaymentSelection(payment.id)}
                      className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                    />
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2 text-sm text-stone-600">
                      <Calendar className="w-4 h-4 text-stone-400" />
                      <span>{format(new Date(payment.date), 'dd MMM yyyy', { locale: fr })}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-stone-900">{payment.description}</span>
                      <span className="text-[10px] text-stone-400 uppercase tracking-tighter">{payment.sourceType}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className={clsx(
                      "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md border",
                      payment.type === 'income' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100"
                    )}>
                      {payment.type === 'income' ? 'Entrée' : 'Sortie'}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2 text-xs text-stone-500">
                      {payment.paymentMethod === 'cash' ? <DollarSign className="w-3 h-3 text-amber-600" /> : 
                       payment.paymentMethod === 'card' ? <CreditCard className="w-3 h-3 text-emerald-600" /> : 
                       <TrendingUp className="w-3 h-3 text-emerald-600" />}
                      <span className="capitalize">{payment.paymentMethod === 'cash' ? 'Espèces' : payment.paymentMethod === 'card' ? 'Carte' : 'Virement'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <p className={clsx(
                      "font-black text-lg",
                      payment.type === 'income' ? "text-emerald-600" : "text-red-600"
                    )}>
                      {payment.type === 'income' ? '+' : '-'}{payment.amount.toLocaleString()} DT
                    </p>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-2 transition-all">
                      {canManagePayments && (
                        <>
                          <button
                            onClick={() => { setEditingPayment(payment); setIsEditModalOpen(true); }}
                            className="p-2 hover:bg-stone-100 text-stone-600 rounded-xl transition-all opacity-40 hover:opacity-100"
                            title="Modifier ce paiement"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setConfirmModal({ isOpen: true, payment })}
                            disabled={isCancelling === payment.id}
                            className="p-2 hover:bg-red-50 text-red-600 rounded-xl transition-all opacity-40 hover:opacity-100 disabled:opacity-20"
                            title="Annuler ce paiement"
                          >
                            {isCancelling === payment.id ? (
                              <Clock className="w-4 h-4 animate-spin" />
                            ) : (
                              <XCircle className="w-4 h-4" />
                            )}
                          </button>
                        </>
                      )}
                      {!canManagePayments && (
                        <span className="text-[10px] text-stone-400 italic">Lecture seule</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredPayments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-8 py-12 text-center text-stone-400 italic">
                    Aucun paiement trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, payment: null })}
        onConfirm={() => {
          if (confirmModal.payment) {
            handleCancelPayment(confirmModal.payment);
            setConfirmModal({ isOpen: false, payment: null });
          }
        }}
        title="Confirmer l'annulation"
        message={`Êtes-vous sûr de vouloir annuler ce paiement de ${confirmModal.payment?.amount.toLocaleString()} DT ? Cette action modifiera ou supprimera le document source (${confirmModal.payment?.description}).`}
        type="danger"
        confirmText="Confirmer l'annulation"
      />

      {isEditModalOpen && editingPayment && (
        <EditPaymentModal
          payment={editingPayment}
          onClose={() => { setIsEditModalOpen(false); setEditingPayment(null); }}
          onConfirm={handleUpdatePayment}
        />
      )}

      <ConfirmationModal
        isOpen={isBulkDeleteModalOpen}
        onClose={() => setIsBulkDeleteModalOpen(false)}
        onConfirm={handleBulkDelete}
        title="Suppression groupée"
        message={`Êtes-vous sûr de vouloir supprimer ${selectedPayments.length} paiements ? Cette action est irréversible.`}
        type="danger"
        confirmText="Tout supprimer"
      />
    </div>
  );
}

interface EditPaymentModalProps {
  payment: UnifiedPayment;
  onClose: () => void;
  onConfirm: (data: any) => void;
}

function EditPaymentModal({ payment, onClose, onConfirm }: EditPaymentModalProps) {
  const [amount, setAmount] = useState(payment.amount || 0);
  const [date, setDate] = useState(payment.date || '');
  const [description, setDescription] = useState(payment.description || '');
  const [method, setMethod] = useState(payment.paymentMethod || 'cash');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-8 border-b border-stone-100 flex items-center justify-between bg-stone-900 text-white">
          <h3 className="text-xl font-bold">Modifier le paiement</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        <div className="p-8 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Montant (DT)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Mode de paiement</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
            >
              <option value="cash">Espèces</option>
              <option value="card">Carte</option>
              <option value="transfer">Virement</option>
            </select>
          </div>
          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-stone-100 text-stone-600 rounded-xl font-bold hover:bg-stone-200 transition-all"
            >
              Annuler
            </button>
            <button
              onClick={() => onConfirm({ amount, date, description, paymentMethod: method })}
              className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 transition-all shadow-lg"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
