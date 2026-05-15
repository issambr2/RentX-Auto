import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where, deleteDoc, doc, updateDoc } from '../lib/api';
import { db, auth } from '../lib/api';
import { Rental, Expense, Maintenance, Client, Vehicle, StockMovement, Leasing, VehicleWash, SalaryPayment } from '../types';
import { useOffice } from '../contexts/OfficeContext';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  FileText, 
  ClipboardList, 
  RotateCcw, 
  Search, 
  Trash2, 
  Edit2, 
  Printer,
  ChevronRight,
  Filter,
  Download,
  AlertTriangle,
  Car,
  Info,
  X,
  PieChart as PieIcon,
  Activity,
  CheckCircle2,
  Clock,
  Briefcase,
  Droplets,
  BarChart as BarChartIcon
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO, subMonths, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx } from 'clsx';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, PieChart, Pie, AreaChart, Area } from 'recharts';
import { logActivity } from '../services/logService';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { Receipt } from './Receipt';
import { RentalModal } from './RentalList';
import { DeleteModal } from './DeleteModal';
import { motion, AnimatePresence } from 'motion/react';

export function StatisticsPanel() {
  const { currentOffice } = useOffice();
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [leasings, setLeasings] = useState<Leasing[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [washes, setWashes] = useState<VehicleWash[]>([]);
  const [salaries, setSalaries] = useState<SalaryPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState<'all' | 'invoice' | 'quote' | 'credit_note'>('all');
  const [selectedDocForReceipt, setSelectedDocForReceipt] = useState<{rental: Rental, vehicle?: Vehicle, client: Client} | null>(null);
  const [editingRental, setEditingRental] = useState<Rental | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id: string }>({ isOpen: false, id: '' });
  const [activeView, setActiveView] = useState<'documents' | 'vehicles' | 'enterprise'>('enterprise');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    if (!currentOffice) return;

    const unsubRentals = onSnapshot(query(collection(db, 'rentals'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setRentals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Rental[]);
    });
    const unsubExpenses = onSnapshot(query(collection(db, 'expenses'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Expense[]);
    });
    const unsubMaintenances = onSnapshot(query(collection(db, 'maintenances'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setMaintenances(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Maintenance[]);
    });
    const unsubStockMovements = onSnapshot(query(collection(db, 'stockMovements'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setStockMovements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as StockMovement[]);
    });
    const unsubLeasings = onSnapshot(query(collection(db, 'leasings'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setLeasings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Leasing[]);
    });
    const unsubClients = onSnapshot(query(collection(db, 'clients'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Client[]);
    });
    const unsubVehicles = onSnapshot(query(collection(db, 'vehicles'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vehicle[]);
      setLoading(false);
    });
    const unsubWashes = onSnapshot(query(collection(db, 'washes'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setWashes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as VehicleWash[]);
    });
    const unsubSalaries = onSnapshot(query(collection(db, 'salaryPayments'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setSalaries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SalaryPayment[]);
    });

    return () => {
      unsubRentals();
      unsubExpenses();
      unsubMaintenances();
      unsubStockMovements();
      unsubLeasings();
      unsubClients();
      unsubVehicles();
      unsubWashes();
      unsubSalaries();
    };
  }, [currentOffice]);

  // Comprehensive Finance Calculations
  const financeStats = useMemo(() => {
    const periodRentals = rentals.filter(r => isWithinInterval(new Date(r.startDate), { start: new Date(startDate), end: new Date(endDate) }));
    const periodExpenses = expenses.filter(e => isWithinInterval(new Date(e.date), { start: new Date(startDate), end: new Date(endDate) }));
    const periodMaintenances = maintenances.filter(m => isWithinInterval(new Date(m.date), { start: new Date(startDate), end: new Date(endDate) }));
    const periodWashes = washes.filter(w => isWithinInterval(new Date(w.date), { start: new Date(startDate), end: new Date(endDate) }));
    const periodSalaries = salaries.filter(s => s.status === 'paid' && isWithinInterval(new Date(s.paymentDate), { start: new Date(startDate), end: new Date(endDate) }));

    const rentalRevenue = periodRentals.reduce((sum, r) => sum + (r.paidAmount || 0), 0);
    const washCost = periodWashes.reduce((sum, w) => sum + (w.price || 0), 0);
    
    let leasingRevenue = 0;
    leasings.forEach(l => {
      const paid = (l.payments || [])
        .filter(p => p.status === 'paid' && p.paidDate && isWithinInterval(new Date(p.paidDate), { start: new Date(startDate), end: new Date(endDate) }));
      
      paid.forEach(p => {
        if (l.isSubcontracted) {
          leasingRevenue += p.amount;
          if (l.commissionType === 'monthly') leasingRevenue += (l.commissionAmount || 0);
        }
      });

      if (l.isSubcontracted && l.commissionType === 'total' && l.startDate && isWithinInterval(new Date(l.startDate), { start: new Date(startDate), end: new Date(endDate) })) {
        leasingRevenue += (l.commissionAmount || 0);
      }
    });

    const totalRev = rentalRevenue + leasingRevenue;

    // Filter out maintenance expenses because they are counted via periodMaintenances
    const directExpenses = periodExpenses
      .filter(e => e.type !== 'maintenance' && e.type !== 'wash') // Washes and maintenance are counted separately from collections
      .reduce((sum, e) => sum + e.amount, 0);
    
    const maintenanceCost = periodMaintenances.reduce((sum, m) => sum + (m.cost || 0), 0);
    const salaryCost = periodSalaries.reduce((sum, s) => sum + (s.netSalary || 0), 0);
    
    let leasingExpense = 0;
    leasings.forEach(l => {
      const paid = (l.payments || [])
        .filter(p => p.status === 'paid' && p.paidDate && isWithinInterval(new Date(p.paidDate), { start: new Date(startDate), end: new Date(endDate) }));
      leasingExpense += paid.reduce((sum, p) => sum + p.amount, 0);
      
      if (l.deposit && l.startDate && isWithinInterval(new Date(l.startDate), { start: new Date(startDate), end: new Date(endDate) })) {
        if (l.depositType === 'total') leasingExpense += l.deposit;
      }
    });

    const totalExp = directExpenses + maintenanceCost + salaryCost + leasingExpense + washCost;

    // Occupancy Stats
    const totalDaysInPeriod = Math.max(1, differenceInDays(new Date(endDate), new Date(startDate)) + 1);
    const totalPossibleDays = vehicles.length * totalDaysInPeriod;
    const actualRentedDays = periodRentals.reduce((sum, r) => {
      const rStart = new Date(r.startDate);
      const rEnd = new Date(r.endDate);
      const effectiveStart = rStart > new Date(startDate) ? rStart : new Date(startDate);
      const effectiveEnd = rEnd < new Date(endDate) ? rEnd : new Date(endDate);
      const days = Math.max(0, differenceInDays(effectiveEnd, effectiveStart) + 1);
      return sum + days;
    }, 0);

    const occupancyRate = totalPossibleDays > 0 ? (actualRentedDays / totalPossibleDays) * 100 : 0;

    return {
      totalRevenue: totalRev,
      totalExpenses: totalExp,
      profit: totalRev - totalExp,
      rentalRevenue,
      washCost,
      leasingRevenue,
      directExpenses,
      maintenanceCost,
      salaryCost,
      leasingExpense,
      occupancyRate,
      unpaidAmount: periodRentals.reduce((sum, r) => sum + ((r.totalAmount || 0) - (r.paidAmount || 0)), 0),
      collectionRate: (totalRev + periodRentals.reduce((sum, r) => sum + (r.totalAmount - (r.paidAmount || 0)), 0)) > 0 
        ? (totalRev / (totalRev + periodRentals.reduce((sum, r) => sum + (r.totalAmount - (r.paidAmount || 0)), 0))) * 100 
        : 100,
      grossMargin: totalRev > 0 ? ((totalRev - totalExp) / totalRev) * 100 : 0,
      revPerDay: totalRev / totalDaysInPeriod,
      expenseRatio: totalRev > 0 ? (totalExp / totalRev) * 100 : 0
    };
  }, [rentals, expenses, maintenances, leasings, washes, salaries, startDate, endDate, vehicles.length]);
  
  const invoiceCount = rentals.filter(r => r.documentType === 'invoice' && isWithinInterval(new Date(r.startDate), { start: new Date(startDate), end: new Date(endDate) })).length;
  const quoteCount = rentals.filter(r => r.documentType === 'quote' && isWithinInterval(new Date(r.startDate), { start: new Date(startDate), end: new Date(endDate) })).length;
  const creditNoteCount = rentals.filter(r => r.documentType === 'credit_note' && isWithinInterval(new Date(r.startDate), { start: new Date(startDate), end: new Date(endDate) })).length;

  const filteredDocs = rentals.filter(r => {
    if (!isWithinInterval(new Date(r.startDate), { start: new Date(startDate), end: new Date(endDate) })) return false;
    if (docTypeFilter !== 'all' && r.documentType !== docTypeFilter) return false;
    const client = clients.find(c => c.id === r.clientId);
    const vehicle = vehicles.find(v => v.id === r.vehicleId);
    const searchStr = `${client?.name} ${vehicle?.brand} ${vehicle?.model} ${r.contractNumber || ''}`.toLowerCase();
    return searchStr.includes(searchTerm.toLowerCase());
  });

  const monthlyTrends = React.useMemo(() => {
    return Array.from({ length: 6 }).map((_, i) => {
      const date = subMonths(new Date(), 5 - i);
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      
      const periodRentals = rentals.filter(r => isWithinInterval(new Date(r.startDate), { start, end }));
      const periodExpenses = expenses.filter(e => isWithinInterval(new Date(e.date), { start, end }));
      const periodMaintenances = maintenances.filter(m => isWithinInterval(new Date(m.date), { start, end }));
      const periodSalaries = salaries.filter(s => s.paymentDate && isWithinInterval(new Date(s.paymentDate), { start, end }));
      
      const revenue = periodRentals.reduce((sum, r) => sum + (r.paidAmount || 0), 0);
      const costs = periodExpenses.reduce((sum, e) => sum + e.amount, 0) + 
                   periodMaintenances.reduce((sum, m) => sum + m.cost, 0) +
                   periodSalaries.reduce((sum, s) => sum + (s.netSalary || 0), 0);
      
      return {
        name: format(date, 'MMM', { locale: fr }),
        revenue,
        profit: revenue - costs,
        margin: revenue > 0 ? ((revenue - costs) / revenue) * 100 : 0
      };
    });
  }, [rentals, expenses, maintenances, salaries]);

  const vehicleStats = vehicles.map(vehicle => {
    const vehicleRentals = rentals.filter(r => r.vehicleId === vehicle.id && isWithinInterval(new Date(r.startDate), { start: new Date(startDate), end: new Date(endDate) }));
    const vehicleExpenses = expenses.filter(e => e.vehicleId === vehicle.id && isWithinInterval(new Date(e.date), { start: new Date(startDate), end: new Date(endDate) }));
    const vehicleMaintenances = maintenances.filter(m => m.vehicleId === vehicle.id && isWithinInterval(new Date(m.date), { start: new Date(startDate), end: new Date(endDate) }));
    const vehicleStockCosts = stockMovements.filter(sm => sm.vehicleId === vehicle.id && sm.type === 'out' && isWithinInterval(new Date(sm.date), { start: new Date(startDate), end: new Date(endDate) }));
    const vehicleLeasings = leasings.filter(l => l.vehicleId === vehicle.id);

    const revenue = vehicleRentals.reduce((acc, curr) => acc + (curr.paidAmount || 0), 0) +
                    vehicleLeasings.reduce((acc, l) => {
                      const paidLeasingRevenue = (l.payments || [])
                        .filter(p => p.status === 'paid' && p.paidDate && isWithinInterval(new Date(p.paidDate), { start: new Date(startDate), end: new Date(endDate) }))
                        .reduce((pAcc, p) => {
                          let rev = 0;
                          if (l.isSubcontracted) {
                            rev += p.amount;
                            if (l.commissionType === 'monthly') rev += (l.commissionAmount || 0);
                          }
                          return pAcc + rev;
                        }, 0);
                      
                      let totalComm = 0;
                      if (l.isSubcontracted && l.commissionType === 'total' && l.startDate && isWithinInterval(new Date(l.startDate), { start: new Date(startDate), end: new Date(endDate) })) {
                        totalComm = l.commissionAmount || 0;
                      }
                      return acc + paidLeasingRevenue + totalComm;
                    }, 0);

    const expenseCosts = vehicleExpenses.reduce((acc, curr) => acc + curr.amount, 0);
    const maintenanceCosts = vehicleMaintenances.reduce((acc, curr) => acc + curr.cost, 0);
    const stockCosts = vehicleStockCosts.reduce((acc, curr) => acc + (curr.quantity * (curr.priceTTC || 0)), 0);
    const leasingCosts = vehicleLeasings.reduce((acc, l) => {
      const paidLeasingExp = (l.payments || [])
        .filter(p => p.status === 'paid' && p.paidDate && isWithinInterval(new Date(p.paidDate), { start: new Date(startDate), end: new Date(endDate) }))
        .reduce((pAcc, p) => pAcc + p.amount, 0);
      
      let depExp = 0;
      if (l.deposit && l.startDate && isWithinInterval(new Date(l.startDate), { start: new Date(startDate), end: new Date(endDate) })) {
        if (l.depositType === 'total') depExp = l.deposit;
      }
      return acc + paidLeasingExp + depExp;
    }, 0);

    const totalExp = expenseCosts + maintenanceCosts + stockCosts + leasingCosts;

    return {
      ...vehicle,
      revenue,
      expenses: expenseCosts + stockCosts,
      maintenance: maintenanceCosts,
      totalExpenses: totalExp,
      profit: revenue - totalExp
    };
  }).filter(v => 
    v.brand.toLowerCase().includes(searchTerm.toLowerCase()) || 
    v.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.plate.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const vehicleRevenueTrend = vehicles.map(vehicle => {
    const months = Array.from({ length: 6 }).map((_, i) => {
      const date = subMonths(new Date(), 5 - i);
      const mStart = startOfMonth(date);
      const mEnd = endOfMonth(date);
      
      const monthlyRevenue = rentals
        .filter(r => r.vehicleId === vehicle.id && isWithinInterval(new Date(r.startDate), { start: mStart, end: mEnd }))
        .reduce((acc, curr) => acc + (curr.paidAmount || 0), 0);
        
      return {
        month: format(date, 'MMM', { locale: fr }),
        revenue: monthlyRevenue
      };
    });
    
    return {
      name: `${vehicle.brand} ${vehicle.model}`,
      data: months,
      totalRevenue: months.reduce((acc, curr) => acc + curr.revenue, 0)
    };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 5); // Top 5 vehicles

  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const content = `
      <html>
        <head>
          <title>Rapport Financier par Véhicule</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #1c1917; }
            h1 { font-size: 24px; margin-bottom: 10px; }
            p { color: #78716c; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { padding: 12px; border-bottom: 1px solid #e7e5e4; text-align: left; }
            th { background: #f5f5f4; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
            .amount { font-family: monospace; text-align: right; }
            .profit { font-weight: bold; }
            .positive { color: #059669; }
            .negative { color: #dc2626; }
            .footer { margin-top: 40px; font-size: 12px; color: #a8a29e; border-top: 1px solid #e7e5e4; pt: 20px; }
          </style>
        </head>
        <body>
          <h1>Rapport Financier par Véhicule</h1>
          <p>Période du ${format(new Date(startDate), 'dd/MM/yyyy')} au ${format(new Date(endDate), 'dd/MM/yyyy')}</p>
          <table>
            <thead>
              <tr>
                <th>Véhicule</th>
                <th>Immatriculation</th>
                <th class="amount">Revenus</th>
                <th class="amount">Dépenses</th>
                <th class="amount">Maintenance</th>
                <th class="amount">Bénéfice</th>
              </tr>
            </thead>
            <tbody>
              ${vehicleStats.map(v => `
                <tr>
                  <td>${v.brand} ${v.model}</td>
                  <td>${v.plate}</td>
                  <td class="amount">${v.revenue.toLocaleString()} TND</td>
                  <td class="amount">${v.expenses.toLocaleString()} TND</td>
                  <td class="amount">${v.maintenance.toLocaleString()} TND</td>
                  <td class="amount profit ${v.profit >= 0 ? 'positive' : 'negative'}">${v.profit.toLocaleString()} TND</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr style="background: #f5f5f4; font-weight: bold;">
                <td colspan="2">TOTAL</td>
                <td class="amount">${financeStats.totalRevenue.toLocaleString()} TND</td>
                <td class="amount">${financeStats.totalExpenses.toLocaleString()} TND</td>
                <td class="amount">${maintenances.filter(m => isWithinInterval(new Date(m.date), { start: new Date(startDate), end: new Date(endDate) })).reduce((acc, curr) => acc + curr.cost, 0).toLocaleString()} TND</td>
                <td class="amount">${financeStats.profit.toLocaleString()} TND</td>
              </tr>
            </tfoot>
          </table>
          <div class="footer">
            Généré le ${format(new Date(), 'dd/MM/yyyy HH:mm')}
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
  };

  const handleDeleteDoc = async (rentalId: string) => {
    try {
      await deleteDoc(doc(db, 'rentals', rentalId));
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'delete_document', `Document supprimé: ${rentalId}`, auth.currentUser.displayName || undefined);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `rentals/${rentalId}`);
    }
  };

  const handlePrint = (rental: Rental) => {
    const vehicle = vehicles.find(v => v.id === rental.vehicleId);
    const client = clients.find(c => c.id === rental.clientId);
    if (vehicle && client) {
      setSelectedDocForReceipt({ rental, vehicle, client });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-3xl font-bold text-stone-900 tracking-tight">État de Statistique</h2>
            <p className="text-stone-500 italic serif">Vue d'ensemble de la performance financière et gestion des documents.</p>
          </div>
          <button 
            onClick={() => setIsHelpOpen(true)}
            className="p-2 bg-emerald-50 text-emerald-600 rounded-full hover:bg-emerald-100 transition-colors"
            title="Guide d'utilisation"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-stone-200 shadow-sm">
            <Filter className="w-4 h-4 text-stone-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent border-none text-sm font-medium focus:ring-0 p-0"
            />
            <span className="text-stone-300">à</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent border-none text-sm font-medium focus:ring-0 p-0"
            />
          </div>
          <button
            onClick={handlePrintReport}
            className="flex items-center gap-2 bg-stone-900 text-white px-6 py-2.5 rounded-2xl font-semibold hover:bg-stone-800 transition-all shadow-lg"
          >
            <Printer className="w-4 h-4" />
            Imprimer Rapport
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-emerald-600" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">Revenus</span>
          </div>
          <p className="text-3xl font-bold text-stone-900">{(financeStats.totalRevenue || 0).toLocaleString()} TND</p>
          <p className="text-sm text-stone-500 mt-1">Total des encaissements (Locations + Sous-location)</p>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-red-600 bg-red-50 px-2 py-1 rounded-md">Dépenses</span>
          </div>
          <p className="text-3xl font-bold text-stone-900">{(financeStats.totalExpenses || 0).toLocaleString()} TND</p>
          <p className="text-sm text-stone-500 mt-1">Maintenance, Lavage, Salaires, Leasing & Stock</p>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-emerald-600" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">Bénéfice Net</span>
          </div>
          <p className={clsx(
            "text-3xl font-bold",
            (financeStats.profit) >= 0 ? "text-emerald-600" : "text-red-600"
          )}>
            {(financeStats.profit).toLocaleString()} TND
          </p>
          <p className="text-sm text-stone-500 mt-1">Résultat d'exploitation net</p>
        </div>
      </div>

      {/* Document Counters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatSummaryCard 
          icon={Activity} 
          label="Taux d'Occupation" 
          value={`${financeStats.occupancyRate.toFixed(1)}%`} 
          color="bg-emerald-50 text-emerald-600"
          desc="Véhicules loués / Flotte totale"
        />
        <StatSummaryCard 
          icon={RotateCcw} 
          label="Taux de Recouvrement" 
          value={`${financeStats.collectionRate.toFixed(1)}%`} 
          color="bg-purple-50 text-purple-600"
          desc="Encaissements / Chiffre d'affaire"
        />
        <StatSummaryCard 
          icon={AlertTriangle} 
          label="Impayés Période" 
          value={`${financeStats.unpaidAmount.toLocaleString()} TND`} 
          color="bg-red-50 text-red-600"
          desc="Montants restant à percevoir"
        />
      </div>

      {/* View Switcher */}
      <div className="flex gap-1 bg-stone-100 p-1 rounded-2xl w-fit">
        <button
          onClick={() => setActiveView('enterprise')}
          className={clsx(
            "px-6 py-2 rounded-xl text-sm font-bold transition-all",
            activeView === 'enterprise' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
          )}
        >
          Santé Entreprise
        </button>
        <button
          onClick={() => setActiveView('documents')}
          className={clsx(
            "px-6 py-2 rounded-xl text-sm font-bold transition-all",
            activeView === 'documents' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
          )}
        >
          Facturation
        </button>
        <button
          onClick={() => setActiveView('vehicles')}
          className={clsx(
            "px-6 py-2 rounded-xl text-sm font-bold transition-all",
            activeView === 'vehicles' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
          )}
        >
          Rentabilité Flotte
        </button>
      </div>

      {/* Revenue Trend Chart */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
        <h3 className="text-xl font-bold text-stone-900 mb-8 flex items-center gap-2">
          <BarChartIcon className="w-6 h-6 text-emerald-500" />
          Top 5 Revenus par Véhicule (6 derniers mois)
        </h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={vehicleRevenueTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: '#a8a29e', fontSize: 10, fontWeight: 600}} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: '#a8a29e', fontSize: 10, fontWeight: 600}} 
              />
              <Tooltip 
                cursor={{fill: '#f8fafc'}}
                contentStyle={{backgroundColor: '#fff', borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}}
              />
              <Bar dataKey="totalRevenue" name="Revenu Total (6 mois)" radius={[8, 8, 0, 0]}>
                {vehicleRevenueTrend.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={['#10b981', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444'][index % 5]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeView === 'enterprise' && (
          <motion.div 
            key="enterprise"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Evolution & Margin Chart */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
                <h3 className="text-lg font-bold text-stone-900 mb-8 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-500" />
                  Évolution & Marge (%)
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyTrends}>
                      <defs>
                        <linearGradient id="colorMargin" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} />
                      <YAxis axisLine={false} tickLine={false} unit="%" />
                      <Tooltip />
                      <Area type="monotone" dataKey="margin" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorMargin)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Revenue Composition */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
                <h3 className="text-lg font-bold text-stone-900 mb-8 flex items-center gap-2">
                  <PieIcon className="w-5 h-5 text-emerald-500" />
                  Composition des Revenus
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Locations', value: financeStats.rentalRevenue, color: '#10b981' },
                          { name: 'Leasing Sub.', value: financeStats.leasingRevenue, color: '#8b5cf6' },
                        ].filter(d => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        <Cell key="cell-0" fill="#10b981" />
                        <Cell key="cell-1" fill="#8b5cf6" />
                      </Pie>
                      <Tooltip formatter={(val: number) => `${val.toLocaleString()} TND`} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Expense Allocation */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
                <h3 className="text-lg font-bold text-stone-900 mb-8 flex items-center gap-2">
                  <PieIcon className="w-5 h-5 text-red-500" />
                  Répartition des Charges
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Maintenance', value: financeStats.maintenanceCost, color: '#f59e0b' },
                          { name: 'Lavages', value: financeStats.washCost, color: '#10b981' },
                          { name: 'Salaires', value: financeStats.salaryCost, color: '#ec4899' },
                          { name: 'Leasing/Fixe', value: financeStats.leasingExpense, color: '#6366f1' },
                          { name: 'Autres', value: financeStats.directExpenses, color: '#94a3b8' },
                        ].filter(d => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        <Cell key="cell-0" fill="#f59e0b" />
                        <Cell key="cell-1" fill="#10b981" />
                        <Cell key="cell-2" fill="#ec4899" />
                        <Cell key="cell-3" fill="#6366f1" />
                        <Cell key="cell-4" fill="#94a3b8" />
                      </Pie>
                      <Tooltip formatter={(val: number) => `${val.toLocaleString()} TND`} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Performance KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <KPIBadge 
                label="Marge Brut" 
                value={`${financeStats.grossMargin.toFixed(1)}%`} 
                icon={TrendingUp}
                trend={financeStats.grossMargin > 30 ? 'up' : 'down'}
              />
              <KPIBadge 
                label="Ratio Dépenses" 
                value={`${financeStats.expenseRatio.toFixed(1)}%`} 
                icon={TrendingDown}
                trend={financeStats.expenseRatio < 50 ? 'up' : 'down'}
              />
              <KPIBadge 
                label="CA Moyen / Jour" 
                value={`${Math.round(financeStats.revPerDay).toLocaleString()} DT`} 
                icon={DollarSign}
              />
              <KPIBadge 
                label="Taux d'Occupation" 
                value={`${financeStats.occupancyRate.toFixed(1)}%`} 
                icon={Activity}
                trend={financeStats.occupancyRate > 70 ? 'up' : 'down'}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <KPIBadge 
                label="Moy. Revenu / Véhicule" 
                value={`${Math.round((financeStats.totalRevenue / Math.max(1, vehicles.length))).toLocaleString()} DT`} 
                icon={Car}
              />
              <KPIBadge 
                label="Clients Actifs" 
                value={rentals.filter(r => r.status === 'active').length.toString()} 
                icon={Briefcase}
              />
              <KPIBadge 
                label="Véhicules au Lavage" 
                value={vehicles.filter(v => v.washStatus === 'dirty').length.toString()} 
                icon={Droplets}
              />
              <KPIBadge 
                label="Rentabilité Globale" 
                value={`${(financeStats.totalRevenue > 0 ? (financeStats.profit / financeStats.totalRevenue) * 100 : 0).toFixed(1)}%`} 
                icon={TrendingUp}
              />
            </div>
          </motion.div>
        )}

        {activeView === 'documents' && (
          <motion.div 
            key="documents"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="bg-white rounded-[2.5rem] border border-stone-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-stone-100 flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
              <input
                type="text"
                placeholder="Rechercher un document..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all"
              />
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <select
                value={docTypeFilter}
                onChange={(e) => setDocTypeFilter(e.target.value as any)}
                className="px-4 py-2 bg-stone-50 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">Tous les documents</option>
                <option value="invoice">Factures</option>
                <option value="quote">Devis</option>
                <option value="credit_note">Avoirs</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-stone-50/50 text-stone-400 text-xs font-bold uppercase tracking-widest">
                  <th className="px-8 py-4">Date</th>
                  <th className="px-8 py-4">Document</th>
                  <th className="px-8 py-4">Client</th>
                  <th className="px-8 py-4">Véhicule</th>
                  <th className="px-8 py-4">Montant</th>
                  <th className="px-8 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredDocs.map((doc) => {
                  const client = clients.find(c => c.id === doc.clientId);
                  const vehicle = vehicles.find(v => v.id === doc.vehicleId);
                  return (
                    <tr key={doc.id} className="hover:bg-stone-50/50 transition-all group">
                      <td className="px-8 py-5 text-sm text-stone-600">
                        {format(new Date(doc.startDate), 'dd MMM yyyy', { locale: fr })}
                      </td>
                      <td className="px-8 py-5">
                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md border ${
                          doc.documentType === 'quote' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                          doc.documentType === 'reservation' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                          doc.documentType === 'credit_note' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                          'bg-emerald-50 text-emerald-700 border-emerald-100'
                        }`}>
                          {doc.documentType === 'quote' ? 'Devis' : 
                           doc.documentType === 'reservation' ? 'Réservation (Non facturée)' :
                           doc.documentType === 'credit_note' ? 'Avoir' : 'Facture'}
                        </span>
                      </td>
                      <td className="px-8 py-5 font-bold text-stone-900">{client?.name || 'Inconnu'}</td>
                      <td className="px-8 py-5 text-sm text-stone-500">{vehicle?.brand} {vehicle?.model}</td>
                      <td className="px-8 py-5 font-bold text-stone-900">{(doc.totalAmount || 0).toLocaleString()} TND</td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button 
                            onClick={() => { setEditingRental(doc); setIsModalOpen(true); }}
                            className="p-2 hover:bg-stone-100 text-stone-600 rounded-lg transition-all"
                            title="Modifier"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handlePrint(doc)}
                            className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                            title="Imprimer"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setDeleteModal({ isOpen: true, id: doc.id })}
                            className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-all"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    )}

    {activeView === 'vehicles' && (
      <motion.div 
        key="vehicles"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
      >
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-stone-100">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
              <input
                type="text"
                placeholder="Rechercher un véhicule..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-stone-50/50 text-stone-400 text-xs font-bold uppercase tracking-widest">
                  <th className="px-8 py-4">Véhicule</th>
                  <th className="px-8 py-4">Immatriculation</th>
                  <th className="px-8 py-4 text-right">Gains</th>
                  <th className="px-8 py-4 text-right">Dépenses</th>
                  <th className="px-8 py-4 text-right">Maintenance</th>
                  <th className="px-8 py-4 text-right">Bénéfice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {vehicleStats.map((v) => (
                  <tr key={v.id} className="hover:bg-stone-50/50 transition-all group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center">
                          <Car className="w-5 h-5 text-stone-400" />
                        </div>
                        <div>
                          <p className="font-bold text-stone-900">{v.brand} {v.model}</p>
                          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{v.type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5 font-mono text-sm font-bold text-stone-600">{v.plate}</td>
                    <td className="px-8 py-5 text-right font-bold text-emerald-600">{v.revenue.toLocaleString()} TND</td>
                    <td className="px-8 py-5 text-right font-bold text-red-400">{v.expenses.toLocaleString()} TND</td>
                    <td className="px-8 py-5 text-right font-bold text-amber-500">{v.maintenance.toLocaleString()} TND</td>
                    <td className="px-8 py-5 text-right">
                      <span className={clsx(
                        "font-bold px-3 py-1 rounded-lg",
                        v.profit >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                      )}>
                        {v.profit.toLocaleString()} TND
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>

  {selectedDocForReceipt && (
    <Receipt 
      rental={selectedDocForReceipt.rental}
      vehicle={selectedDocForReceipt.vehicle}
      client={selectedDocForReceipt.client}
      onClose={() => setSelectedDocForReceipt(null)}
    />
  )}

  {isModalOpen && (
    <RentalModal
      isOpen={isModalOpen}
      onClose={() => { setIsModalOpen(false); setEditingRental(null); }}
      vehicles={vehicles}
      clients={clients}
      rentals={rentals}
      rental={editingRental}
    />
  )}

      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '' })}
        onConfirm={() => handleDeleteDoc(deleteModal.id)}
        title="Supprimer le document"
        message="Êtes-vous sûr de vouloir supprimer ce document ? Cette action est irréversible."
      />

      {isHelpOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-stone-100 flex items-center justify-between bg-emerald-600 text-white">
              <div className="flex items-center gap-3">
                <Info className="w-6 h-6" />
                <h3 className="text-xl font-bold">Guide: Statistiques & Rentabilité</h3>
              </div>
              <button onClick={() => setIsHelpOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-8 space-y-4 text-stone-600">
              <div className="space-y-2">
                <p className="font-bold text-stone-900">1. Calcul du Bénéfice</p>
                <p className="text-sm">• <span className="font-bold text-emerald-600">Revenus:</span> Locations payées + Lavages + Commissions de sous-traitance.</p>
                <p className="text-sm">• <span className="font-bold text-red-600">Dépenses:</span> Maintenance + Frais + Paiements Leasing + Salaires.</p>
              </div>
              <div className="space-y-2">
                <p className="font-bold text-stone-900">2. Performance Véhicule</p>
                <p className="text-sm">L'onglet "Performance Véhicules" vous permet de voir exactement quel véhicule est le plus rentable après déduction de tous ses frais (maintenance, taxes, etc.).</p>
              </div>
              <div className="space-y-2">
                <p className="font-bold text-stone-900">3. Santé Entreprise</p>
                <p className="text-sm">Analyses de haut niveau sur la structure de vos revenus, vos points de dépenses majeurs et l'efficacité globale de votre agence.</p>
              </div>
            </div>
            <div className="p-8 bg-stone-50 border-t border-stone-100">
              <button
                onClick={() => setIsHelpOpen(false)}
                className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatSummaryCard({ icon: Icon, label, value, color, desc }: any) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm group">
      <div className="flex items-center gap-4 mb-4">
        <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center transition-all group-hover:scale-110", color)}>
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{label}</p>
      </div>
      <p className="text-2xl font-bold text-stone-900">{value}</p>
      <p className="text-xs text-stone-400 mt-1 italic">{desc}</p>
    </div>
  );
}

function KPIBadge({ label, value, icon: Icon, trend }: { label: string, value: string, icon: any, trend?: 'up' | 'down' }) {
  return (
    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 flex items-center gap-4 relative overflow-hidden group">
      {trend && (
        <div className={clsx(
          "absolute top-0 right-0 w-1 h-full",
          trend === 'up' ? "bg-emerald-500" : "bg-red-500"
        )} />
      )}
      <div className="w-10 h-10 bg-white shadow-sm rounded-xl flex items-center justify-center text-stone-500 group-hover:bg-stone-900 group-hover:text-white transition-all">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{label}</p>
        <p className="text-lg font-bold text-stone-900">{value}</p>
      </div>
    </div>
  );
}
