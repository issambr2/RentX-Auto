import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy } from '../lib/api';
import { db } from '../lib/api';
import { Rental, Expense, Maintenance, UserProfile, Vehicle, Leasing } from '../types';
import { 
  FileText, 
  Download, 
  Printer, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  Filter,
  ChevronDown,
  ChevronUp,
  Search,
  CreditCard
} from 'lucide-react';
import { format, isWithinInterval, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx } from 'clsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { useOffice } from '../contexts/OfficeContext';

export function FinancialReport() {
  const { currentOffice } = useOffice();
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [leasings, setLeasings] = useState<Leasing[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });

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
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as UserProfile[]);
    });
    const unsubVehicles = onSnapshot(query(collection(db, 'vehicles'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vehicle[]);
    });
    const unsubLeasings = onSnapshot(query(collection(db, 'leasings'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setLeasings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Leasing[]);
    });

    setLoading(false);

    return () => {
      unsubRentals();
      unsubExpenses();
      unsubMaintenances();
      unsubUsers();
      unsubVehicles();
      unsubLeasings();
    };
  }, [currentOffice]);

  const filteredRentals = rentals.filter(r => 
    r.documentType !== 'quote' && 
    r.documentType !== 'reservation' &&
    isWithinInterval(parseISO(r.startDate), { 
      start: parseISO(dateRange.start), 
      end: parseISO(dateRange.end) 
    })
  );

  const filteredExpenses = expenses.filter(e => 
    isWithinInterval(parseISO(e.date), { 
      start: parseISO(dateRange.start), 
      end: parseISO(dateRange.end) 
    })
  );

  const filteredMaintenances = maintenances.filter(m => 
    isWithinInterval(parseISO(m.date), { 
      start: parseISO(dateRange.start), 
      end: parseISO(dateRange.end) 
    })
  );

  const leasingOperations = leasings.flatMap(l => {
    const ops = l.payments
      .filter(p => p.status === 'paid' && p.paidDate && isWithinInterval(parseISO(p.paidDate), {
        start: parseISO(dateRange.start),
        end: parseISO(dateRange.end)
      }))
      .map(p => ({
        date: p.paidDate!,
        type: 'leasing' as const,
        description: `Leasing ${l.provider} - ${l.contractNumber}`,
        vehicleId: l.vehicleId,
        amount: p.amount,
        isSubcontracted: l.isSubcontracted,
        commission: l.commissionType === 'monthly' ? (l.commissionAmount || 0) : 0,
        subcontractorName: l.subcontractorName
      }));

    // Add total commission as a separate entry if it falls within the period
    if (l.isSubcontracted && l.commissionType === 'total' && l.startDate && isWithinInterval(parseISO(l.startDate), {
      start: parseISO(dateRange.start),
      end: parseISO(dateRange.end)
    })) {
      ops.push({
        date: l.startDate,
        type: 'leasing' as any,
        description: `Commission Totale Leasing - ${l.contractNumber}`,
        vehicleId: l.vehicleId,
        amount: 0,
        isSubcontracted: true,
        commission: l.commissionAmount || 0,
        subcontractorName: l.subcontractorName
      });
    }

    // Add total deposit as a separate entry if it falls within the period
    if (l.deposit && l.depositType === 'total' && l.startDate && isWithinInterval(parseISO(l.startDate), {
      start: parseISO(dateRange.start),
      end: parseISO(dateRange.end)
    })) {
      ops.push({
        date: l.startDate,
        type: 'leasing' as any,
        description: `Apport / Caution Leasing - ${l.contractNumber}`,
        vehicleId: l.vehicleId,
        amount: l.deposit,
        isSubcontracted: false,
        commission: 0,
        subcontractorName: l.subcontractorName
      });
    }

    return ops;
  });

  const totalRevenue = filteredRentals.reduce((acc, r) => acc + (r.paidAmount || 0), 0) +
                       leasingOperations.reduce((acc, l) => acc + (l.isSubcontracted ? (l.amount + l.commission) : 0), 0) +
                       filteredMaintenances.filter(m => m.clientId).reduce((acc, m) => acc + (m.paidAmount || 0), 0);
  
  const totalRevenueHT = totalRevenue / 1.19;
  const totalRevenueVAT = totalRevenue - totalRevenueHT;

  const totalExpenses = filteredExpenses.reduce((acc, e) => acc + (e.amountTTC || e.amount || 0), 0) + 
                        filteredMaintenances.filter(m => !m.clientId).reduce((acc, m) => acc + (m.paidAmount || 0), 0) +
                        leasingOperations.reduce((acc, l) => acc + l.amount, 0);
  
  const totalExpensesHT = totalExpenses / 1.19;
  const totalExpensesVAT = totalExpenses - totalExpensesHT;

  const netProfit = totalRevenue - totalExpenses;
  const netProfitHT = totalRevenueHT - totalExpensesHT;

  const exportToCSV = () => {
    const headers = ["Date", "Type", "Description", "Vehicule", "Operateur", "Entree (TND)", "Sortie (TND)"];
    
    const rows = [
      ...filteredRentals.map(r => [
        r.startDate,
        "Location",
        `Contrat ${r.contractNumber}`,
        vehicles.find(v => v.id === r.vehicleId)?.brand || "N/A",
        users.find(u => u.id === r.userId)?.fullName || "N/A",
        r.paidAmount || 0,
        0
      ]),
      ...filteredExpenses.map(e => [
        e.date,
        "Depense",
        e.description,
        vehicles.find(v => v.id === e.vehicleId)?.brand || "General",
        users.find(u => u.id === e.createdBy)?.fullName || "N/A",
        0,
        e.amount
      ]),
      ...filteredMaintenances.map(m => [
        m.date,
        "Maintenance",
        m.clientId ? `Facture Client: ${m.description}` : m.description,
        vehicles.find(v => v.id === m.vehicleId)?.brand || "N/A",
        users.find(u => u.id === m.createdBy)?.fullName || "N/A",
        m.clientId ? (m.paidAmount || 0) : 0,
        !m.clientId ? (m.paidAmount || 0) : 0
      ]),
      ...leasingOperations.map(l => [
        l.date,
        "Leasing",
        l.description,
        vehicles.find(v => v.id === l.vehicleId)?.brand || "N/A",
        "System",
        l.isSubcontracted ? (l.amount + l.commission) : 0,
        l.amount
      ])
    ].sort((a, b) => new Date(a[0] as string).getTime() - new Date(b[0] as string).getTime());

    // Add totals row
    rows.push(["", "", "TOTAL", "", "", totalRevenue, totalExpenses]);
    rows.push(["", "", "BENEFICE NET", "", "", "", netProfit]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `rapport_financier_${dateRange.start}_au_${dateRange.end}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    const doc = new jsPDF();
    const today = format(new Date(), 'dd/MM/yyyy');
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(20, 20, 20);
    doc.text('RentX Auto - Rapport Financier', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Période: ${format(parseISO(dateRange.start), 'dd/MM/yyyy')} au ${format(parseISO(dateRange.end), 'dd/MM/yyyy')}`, 14, 30);
    doc.text(`Généré le: ${today}`, 14, 35);
    
    // Summary
    doc.setFontSize(12);
    doc.setTextColor(40, 40, 40);
    doc.text(`Total Recettes: ${totalRevenue.toLocaleString()} TND`, 14, 50);
    doc.text(`Total Dépenses: ${totalExpenses.toLocaleString()} TND`, 14, 57);
    doc.text(`Bénéfice Net: ${netProfit.toLocaleString()} TND`, 14, 64);
    
    // Table
    const tableData = [
      ...filteredRentals.map(r => ({ ...r, type: 'rental' })),
      ...filteredExpenses.map(e => ({ ...e, type: 'expense' })),
      ...filteredMaintenances.map(m => ({ ...m, type: 'maintenance' })),
      ...leasingOperations.map(l => ({ ...l, type: 'leasing' }))
    ]
    .sort((a: any, b: any) => new Date(a.startDate || a.date).getTime() - new Date(b.startDate || b.date).getTime())
    .map(op => {
      const date = (op as any).startDate || (op as any).date;
      const isRental = op.type === 'rental';
      const isExpense = op.type === 'expense';
      const isLeasing = op.type === 'leasing';
      const isMaintenance = op.type === 'maintenance';
      
      let entry = '-';
      let exit = '-';

      if (isRental) entry = `${((op as any).paidAmount || 0).toLocaleString()} TND`;
      else if (isMaintenance && (op as any).clientId) entry = `${((op as any).paidAmount || 0).toLocaleString()} TND`;
      else if (isLeasing) {
        const leasingOp = op as any;
        if (leasingOp.isSubcontracted) entry = `${(leasingOp.amount + leasingOp.commission).toLocaleString()} TND`;
        exit = `${leasingOp.amount.toLocaleString()} TND`;
      } else {
        exit = `${((op as any).amount || (op as any).paidAmount || 0).toLocaleString()} TND`;
      }

      return [
        format(new Date(date), 'dd/MM/yyyy'),
        isRental ? 'Revenue' : isLeasing ? 'Leasing' : isExpense ? 'Dépense' : (isMaintenance && (op as any).clientId) ? 'Facturation' : 'Entretien',
        isRental ? `Contrat ${(op as any).contractNumber}` : (op as any).description,
        vehicles.find(v => v.id === (op as any).vehicleId)?.brand || (isExpense ? 'Général' : 'N/A'),
        entry,
        exit
      ];
    });
    
    autoTable(doc, {
      startY: 75,
      head: [['Date', 'Type', 'Détails', 'Véhicule', 'Entrée', 'Sortie']],
      body: tableData,
      headStyles: { fillColor: [17, 24, 39] }, // Stone-900
      alternateRowStyles: { fillColor: [245, 245, 240] },
    });
    
    doc.save(`rapport_financier_${dateRange.start}_au_${dateRange.end}.pdf`);
  };

  return (
    <div className="space-y-8">
      {/* Filters */}
      <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col md:flex-row items-end gap-6 no-print">
        <div className="flex-1 space-y-2">
          <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Période du</label>
          <div className="relative">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input 
              type="date" 
              value={dateRange.start}
              onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
              className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
        <div className="flex-1 space-y-2">
          <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Au</label>
          <div className="relative">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input 
              type="date" 
              value={dateRange.end}
              onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
              className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 bg-stone-100 text-stone-700 px-6 py-3 rounded-xl font-bold hover:bg-stone-200 transition-all"
          >
            <Download className="w-5 h-5" />
            CSV
          </button>
          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 bg-stone-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-stone-800 transition-all shadow-lg"
          >
            <Printer className="w-5 h-5" />
            Imprimer
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Total Recettes (TTC)</p>
              <h3 className="text-3xl font-black text-stone-900">{(totalRevenue || 0).toLocaleString()} TND</h3>
            </div>
          </div>
          <div className="flex flex-col gap-1 border-t border-stone-100 pt-4">
            <div className="flex justify-between text-xs">
              <span className="text-stone-400 font-medium uppercase tracking-tighter">Montant H.T:</span>
              <span className="text-stone-600 font-bold">{(totalRevenueHT || 0).toFixed(3)} TND</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-stone-400 font-medium uppercase tracking-tighter">TVA (19%):</span>
              <span className="text-stone-600 font-bold">{(totalRevenueVAT || 0).toFixed(3)} TND</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-red-50 text-red-600 rounded-2xl">
              <TrendingDown className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Total Dépenses (TTC)</p>
              <h3 className="text-3xl font-black text-stone-900">{(totalExpenses || 0).toLocaleString()} TND</h3>
            </div>
          </div>
          <div className="flex flex-col gap-1 border-t border-stone-100 pt-4">
            <div className="flex justify-between text-xs">
              <span className="text-stone-400 font-medium uppercase tracking-tighter">Montant H.T:</span>
              <span className="text-stone-600 font-bold">{(totalExpensesHT || 0).toFixed(3)} TND</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-stone-400 font-medium uppercase tracking-tighter">TVA (19%):</span>
              <span className="text-stone-600 font-bold">{(totalExpensesVAT || 0).toFixed(3)} TND</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-emerald-100 shadow-sm shadow-emerald-600/5 transition-all hover:shadow-md">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-emerald-600 text-white rounded-2xl">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Bénéfice Net (TTC)</p>
              <h3 className={clsx(
                "text-3xl font-black",
                netProfit >= 0 ? "text-emerald-600" : "text-red-600"
              )}>
                {(netProfit || 0).toLocaleString()} TND
              </h3>
            </div>
          </div>
          <div className="flex flex-col gap-1 border-t border-stone-100 pt-4">
            <div className="flex justify-between text-xs">
              <span className="text-stone-400 font-medium uppercase tracking-tighter">Bénéfice Net H.T:</span>
              <span className={clsx(
                "font-bold",
                netProfit >= 0 ? "text-emerald-600" : "text-red-500"
              )}>{(netProfitHT || 0).toFixed(3)} TND</span>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden print:border-none print:shadow-none">
        <div className="p-8 border-b border-stone-100">
          <h3 className="text-xl font-bold text-stone-900">Détail des Opérations</h3>
          <p className="text-sm text-stone-400">Liste chronologique des entrées et sorties d'argent.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-stone-50/50 text-stone-400 text-[10px] font-bold uppercase tracking-widest">
                <th className="px-8 py-4">Date</th>
                <th className="px-8 py-4">Type</th>
                <th className="px-8 py-4">Détails</th>
                <th className="px-8 py-4">Véhicule</th>
                <th className="px-8 py-4">Opérateur</th>
                <th className="px-8 py-4 text-right">Entrée</th>
                <th className="px-8 py-4 text-right">Sortie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {[
                ...filteredRentals.map(r => ({ ...r, type: 'rental' })),
                ...filteredExpenses.map(e => ({ ...e, type: 'expense' })),
                ...filteredMaintenances.map(m => ({ ...m, type: 'maintenance' })),
                ...leasingOperations.map(l => ({ ...l, type: 'leasing' }))
              ]
              .sort((a, b) => new Date((a as any).startDate || (a as any).date).getTime() - new Date((b as any).startDate || (b as any).date).getTime())
              .map((op: any, idx) => {
                const date = op.startDate || op.date;
                const isRental = op.type === 'rental';
                const isExpense = op.type === 'expense';
                const isMaintenance = op.type === 'maintenance';
                const isLeasing = op.type === 'leasing';
                
                return (
                  <tr key={idx} className="hover:bg-stone-50/50 transition-all text-sm">
                    <td className="px-8 py-4 font-mono text-xs text-stone-500">
                      {format(new Date(date), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-8 py-4">
                      <span className={clsx(
                        "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-tighter border",
                        isRental ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                        isLeasing ? "bg-amber-50 text-amber-700 border-amber-100" :
                        (isExpense && op.type === 'salary') ? "bg-indigo-50 text-indigo-700 border-indigo-100" :
                        isExpense ? "bg-red-50 text-red-700 border-red-100" :
                        (isMaintenance && op.clientId) ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                        "bg-emerald-50 text-emerald-700 border-emerald-100"
                      )}>
                        {isRental ? 'Revenue' : isLeasing ? 'Leasing' : (isExpense && op.type === 'salary') ? 'Salaire' : isExpense ? 'Dépense' : (isMaintenance && op.clientId) ? 'Facturation' : 'Entretien'}
                      </span>
                    </td>
                    <td className="px-8 py-4">
                      <p className="font-medium text-stone-900">
                        {isRental ? `Contrat ${op.contractNumber}` : (isMaintenance && op.clientId) ? `Facture Client: ${op.description}` : op.description}
                      </p>
                      {isLeasing && op.isSubcontracted && (
                        <p className="text-[10px] text-stone-400 italic">Propriétaire: {op.subcontractorName}</p>
                      )}
                    </td>
                    <td className="px-8 py-4 text-stone-500">
                      {vehicles.find(v => v.id === op.vehicleId)?.brand || (isExpense ? 'Général' : 'N/A')}
                    </td>
                    <td className="px-8 py-4 text-stone-500">
                      {users.find(u => u.id === (op.userId || op.createdBy))?.fullName || 'System'}
                    </td>
                    <td className="px-8 py-4 text-right font-bold text-emerald-600">
                      {(isRental || (isMaintenance && op.clientId)) ? `${(op.paidAmount || 0).toLocaleString()} TND` : 
                       (isLeasing && op.isSubcontracted) ? `${(op.amount + op.commission).toLocaleString()} TND` : '-'}
                    </td>
                    <td className="px-8 py-4 text-right font-bold text-red-600">
                      {isLeasing ? `${op.amount.toLocaleString()} TND` :
                       (!isRental && !(isMaintenance && op.clientId)) ? `${(op.amount || op.paidAmount || 0).toLocaleString()} TND` : '-'}
                    </td>
                  </tr>
                );
              })}
              {filteredRentals.length === 0 && filteredExpenses.length === 0 && filteredMaintenances.length === 0 && leasingOperations.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-8 py-12 text-center text-stone-400 italic">
                    Aucune opération sur cette période.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-stone-50/50 font-bold">
              <tr>
                <td colSpan={5} className="px-8 py-4 text-right text-stone-400 uppercase text-[10px]">Totaux Période</td>
                <td className="px-8 py-4 text-right text-emerald-600">{(totalRevenue || 0).toLocaleString()} TND</td>
                <td className="px-8 py-4 text-right text-red-600">{(totalExpenses || 0).toLocaleString()} TND</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print\\:border-none { border: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          @page { margin: 2cm; }
        }
      `}</style>
    </div>
  );
}
