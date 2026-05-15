import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, updateDoc, doc, getDoc } from '../lib/api';
import { db, auth } from '../lib/api';
import { generateContractPDF, generateInvoicePDF } from '../services/pdfService';
import { Rental, Vehicle, Client, ActivityLog } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  TrendingUp, 
  AlertCircle, 
  CheckCircle, 
  DollarSign, 
  Search, 
  Filter, 
  Download, 
  Printer,
  CreditCard,
  User,
  Car as CarIcon,
  Clock,
  FileText,
  PieChart,
  Info,
  XCircle,
  Trash2,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx } from 'clsx';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { logActivity } from '../services/logService';
import { useNotifications } from './NotificationContext';
import { FinancialReport } from './FinancialReport';
import { ConfirmationModal } from './ConfirmationModal';
import { GuideModal } from './GuideModal';
import { useOffice } from '../contexts/OfficeContext';

interface PaymentModalProps {
  rental: Rental;
  onClose: () => void;
  onConfirm: (amount: number, method: string) => void;
  isSaving: boolean;
}

function PaymentModal({ rental, onClose, onConfirm, isSaving }: PaymentModalProps) {
  const [amount, setAmount] = useState(rental.totalAmount - (rental.paidAmount || 0));
  const [method, setMethod] = useState<string>(rental.paymentMethod || 'cash');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-8 border-b border-stone-100 flex items-center justify-between">
          <h3 className="text-2xl font-bold text-stone-900">Enregistrer un paiement</h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        <div className="p-8 space-y-6">
          <div className="bg-stone-50 p-4 rounded-2xl space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Total Contrat:</span>
              <span className="font-bold">{(rental.totalAmount || 0).toLocaleString()} TND</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Déjà payé:</span>
              <span className="font-bold text-emerald-600">{(rental.paidAmount || 0).toLocaleString()} TND</span>
            </div>
            <div className="h-px bg-stone-200 my-2" />
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Reste à percevoir:</span>
              <span className="font-bold text-red-600">{((rental.totalAmount || 0) - (rental.paidAmount || 0)).toLocaleString()} TND</span>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Montant reçu (TND)</label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold text-stone-900"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Mode de paiement</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'cash', label: 'Espèces', icon: DollarSign },
                  { id: 'card', label: 'Carte', icon: CreditCard },
                  { id: 'transfer', label: 'Virement', icon: TrendingUp }
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    className={clsx(
                      "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                      method === m.id ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-stone-100 text-stone-400 hover:border-stone-200"
                    )}
                  >
                    <m.icon className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-stone-100 text-stone-600 rounded-xl font-bold hover:bg-stone-200 transition-all"
            >
              Annuler
            </button>
            <button
              onClick={() => onConfirm(amount, method)}
              disabled={isSaving || amount <= 0}
              className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
            >
              {isSaving ? 'Enregistrement...' : 'Confirmer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AccountingPanelProps {
  initialTab?: 'payments' | 'reports';
}

export function AccountingPanel({ initialTab = 'payments' }: AccountingPanelProps) {
  const { currentOffice } = useOffice();
  const [activeSubTab, setActiveSubTab] = useState<'payments' | 'reports'>(initialTab);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('all');
  const [paymentModal, setPaymentModal] = useState<{ isOpen: boolean, rental: Rental | null }>({ isOpen: false, rental: null });
  const [isSaving, setIsSaving] = useState(false);
  const { addNotification } = useNotifications();

  useEffect(() => {
    if (!currentOffice) return;

    const unsubRentals = onSnapshot(query(collection(db, 'rentals'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setRentals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Rental[]);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'rentals');
    });

    const unsubVehicles = onSnapshot(query(collection(db, 'vehicles'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vehicle[]);
    });

    const unsubClients = onSnapshot(query(collection(db, 'clients'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Client[]);
    });

    return () => {
      unsubRentals();
      unsubVehicles();
      unsubClients();
    };
  }, [currentOffice]);

  const stats = {
    totalRevenue: rentals
      .filter(r => r.documentType !== 'quote' && r.documentType !== 'reservation')
      .reduce((acc, r) => acc + (r.paidAmount || 0), 0),
    pendingRevenue: rentals
      .filter(r => r.documentType !== 'quote' && r.documentType !== 'reservation')
      .reduce((acc, r) => acc + (r.totalAmount - (r.paidAmount || 0)), 0),
    unpaidCount: rentals.filter(r => r.documentType !== 'quote' && r.documentType !== 'reservation' && r.paymentStatus !== 'paid').length,
    paidCount: rentals.filter(r => r.documentType !== 'quote' && r.documentType !== 'reservation' && r.paymentStatus === 'paid').length
  };

  const filteredRentals = rentals
    .filter(r => {
      if (r.documentType === 'quote' || r.documentType === 'reservation') return false;
      if (filter === 'unpaid' && r.paymentStatus !== 'pending') return false;
      if (filter === 'partial' && r.paymentStatus !== 'partial') return false;
      if (filter === 'paid' && r.paymentStatus !== 'paid') return false;
      
      const client = clients.find(c => c.id === r.clientId);
      return (client?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
             (r.contractNumber || '').toLowerCase().includes(searchTerm.toLowerCase());
    })
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  const handlePrintIndividual = async (rental: Rental, type: 'contract' | 'invoice') => {
    const client = clients.find(c => c.id === rental.clientId);
    const vehicle = vehicles.find(v => v.id === rental.vehicleId);
    const secondDriver = rental.secondDriverId ? clients.find(c => c.id === rental.secondDriverId) : undefined;
    
    if (client) {
      const settingsDoc = await getDoc(doc(db, 'settings', 'system'));
      const settings = settingsDoc.exists() ? settingsDoc.data() as any : undefined;
      
      if (type === 'contract') {
        generateContractPDF(rental, vehicle, client, settings, secondDriver);
      } else {
        generateInvoicePDF(rental, vehicle, client, settings);
      }
    }
  };
  const handleConfirmPayment = async (rental: Rental, amount: number, method: string) => {
    setIsSaving(true);
    try {
      const newPaidAmount = (rental.paidAmount || 0) + amount;
      const newStatus = newPaidAmount >= rental.totalAmount ? 'paid' : 'partial';

      await updateDoc(doc(db, 'rentals', rental.id), {
        paymentStatus: newStatus,
        paidAmount: newPaidAmount,
        paymentMethod: method
      });
      addNotification('success', 'Paiement enregistré', `Le paiement de ${amount.toLocaleString()} TND pour ${rental.contractNumber} a été enregistré.`);
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'confirm_payment', `Paiement de ${amount} TND enregistré pour la location ${rental.contractNumber} via ${method}`, auth.currentUser.displayName || undefined);
      }
      setPaymentModal({ isOpen: false, rental: null });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rentals/${rental.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const exportFinancialReport = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Date,Contrat,Client,Total,Payé,Reste,Statut\n"
      + rentals.map(r => {
        const c = clients.find(cl => cl.id === r.clientId);
        const remaining = r.totalAmount - (r.paidAmount || 0);
        return `${r.startDate},${r.contractNumber},${c?.name},${r.totalAmount},${r.paidAmount || 0},${remaining},${r.paymentStatus}`;
      }).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `rapport_financier_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const today = format(new Date(), 'dd/MM/yyyy');
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(20, 20, 20);
    doc.text('RentX Auto - Rapport de Paiements', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Généré le: ${today}`, 14, 30);
    
    // Stats
    doc.setFontSize(12);
    doc.setTextColor(40, 40, 40);
    doc.text(`Total Encaissé: ${stats.totalRevenue.toLocaleString()} TND`, 14, 45);
    doc.text(`Reste à Percevoir: ${stats.pendingRevenue.toLocaleString()} TND`, 14, 52);
    doc.text(`Dossiers Payés: ${stats.paidCount}`, 14, 59);
    doc.text(`Dossiers Impayés: ${stats.unpaidCount}`, 14, 66);
    
    // Table
    const tableData = filteredRentals.map(r => {
      const client = clients.find(c => c.id === r.clientId);
      const remaining = r.totalAmount - (r.paidAmount || 0);
      return [
        client?.name || 'Inconnu',
        r.contractNumber || r.id.slice(-6).toUpperCase(),
        `${r.totalAmount.toLocaleString()} TND`,
        `${(r.paidAmount || 0).toLocaleString()} TND`,
        `${remaining.toLocaleString()} TND`,
        r.paymentStatus === 'paid' ? 'Payé' : r.paymentStatus === 'partial' ? 'Partiel' : 'Impayé'
      ];
    });
    
    autoTable(doc, {
      startY: 75,
      head: [['Client', 'Contrat', 'Total', 'Payé', 'Reste', 'Statut']],
      body: tableData,
      headStyles: { fillColor: [16, 185, 129] }, // Emerald-600
      alternateRowStyles: { fillColor: [245, 245, 240] },
    });
    
    doc.save(`rapport_paiements_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Comptabilité</h2>
            <p className="text-stone-500 italic serif">Gestion des paiements, factures et rapports financiers.</p>
          </div>
          <button 
            onClick={() => setIsHelpOpen(true)}
            className="p-2 bg-emerald-50 text-emerald-600 rounded-full hover:bg-emerald-100 transition-colors"
            title="Guide d'utilisation"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
        <div className="flex bg-stone-100 p-1 rounded-2xl">
          <button
            onClick={() => setActiveSubTab('payments')}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
              activeSubTab === 'payments' ? "bg-white text-emerald-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            <DollarSign className="w-4 h-4" />
            Paiements
          </button>
          <button
            onClick={() => setActiveSubTab('reports')}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
              activeSubTab === 'reports' ? "bg-white text-emerald-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            <PieChart className="w-4 h-4" />
            Rapports
          </button>
        </div>
      </div>

      {activeSubTab === 'payments' ? (
        <>
          {/* Financial Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Revenu Encaissé</p>
              <h3 className="text-2xl font-black text-stone-900">{(stats.totalRevenue || 0).toLocaleString()} TND</h3>
            </div>
          </div>
          <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: '100%' }} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Reste à Percevoir</p>
              <h3 className="text-2xl font-black text-stone-900">{(stats.pendingRevenue || 0).toLocaleString()} TND</h3>
            </div>
          </div>
          <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500" style={{ width: `${(stats.pendingRevenue / (stats.totalRevenue + stats.pendingRevenue)) * 100}%` }} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-red-50 text-red-600 rounded-2xl">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Impayés</p>
              <h3 className="text-2xl font-black text-stone-900">{stats.unpaidCount} Dossiers</h3>
            </div>
          </div>
          <p className="text-xs text-stone-400 italic">Dossiers en attente de règlement</p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Règlements Complets</p>
              <h3 className="text-2xl font-black text-stone-900">{stats.paidCount} Dossiers</h3>
            </div>
          </div>
          <p className="text-xs text-stone-400 italic">Totalité des paiements reçus</p>
        </div>
      </div>

      {/* Unpaid Rentals List */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-stone-100 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <h3 className="text-xl font-bold text-stone-900">Suivi des Paiements</h3>
            <div className="flex bg-stone-100 p-1 rounded-xl">
              <button 
                onClick={() => setFilter('all')}
                className={clsx("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", filter === 'all' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700")}
              >
                Tous
              </button>
              <button 
                onClick={() => setFilter('unpaid')}
                className={clsx("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", filter === 'unpaid' ? "bg-white text-red-600 shadow-sm" : "text-stone-500 hover:text-stone-700")}
              >
                Impayés
              </button>
              <button 
                onClick={() => setFilter('partial')}
                className={clsx("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", filter === 'partial' ? "bg-white text-amber-600 shadow-sm" : "text-stone-500 hover:text-stone-700")}
              >
                Partiels
              </button>
            </div>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="Rechercher client ou contrat..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-stone-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            onClick={generatePDF}
            className="flex items-center gap-2 bg-stone-900 text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-stone-800 transition-all shadow-md"
          >
            <Printer className="w-4 h-4" />
            Imprimer
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-stone-50/50 text-stone-400 text-xs font-bold uppercase tracking-widest">
                <th className="px-8 py-4">Client</th>
                <th className="px-8 py-4">Montant Total</th>
                <th className="px-8 py-4">Déjà Payé</th>
                <th className="px-8 py-4">Reste</th>
                <th className="px-8 py-4">Statut</th>
                <th className="px-8 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredRentals.map((rental) => {
                const client = clients.find(c => c.id === rental.clientId);
                const remaining = rental.totalAmount - (rental.paidAmount || 0);
                return (
                  <tr key={rental.id} className="hover:bg-stone-50/50 transition-all">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-stone-100 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-stone-400" />
                        </div>
                        <div>
                          <p className="font-bold text-stone-900">{client?.name || 'Client Inconnu'}</p>
                          <p className="text-xs text-stone-400">Contrat: {rental.contractNumber || rental.id.slice(-6).toUpperCase()}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="font-bold text-stone-900">{(rental.totalAmount || 0).toLocaleString()} TND</span>
                    </td>
                    <td className="px-8 py-5 text-emerald-600 font-medium">
                      {(rental.paidAmount || 0).toLocaleString()} TND
                    </td>
                    <td className="px-8 py-5 text-red-600 font-bold">
                      {(remaining || 0).toLocaleString()} TND
                    </td>
                    <td className="px-8 py-5">
                      <span className={clsx(
                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                        rental.paymentStatus === 'paid' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                        rental.paymentStatus === 'partial' ? "bg-amber-50 text-amber-700 border-amber-100" :
                        "bg-red-50 text-red-700 border-red-100"
                      )}>
                        {rental.paymentStatus === 'paid' ? 'Payé' : 
                         rental.paymentStatus === 'partial' ? 'Partiel' : 'Impayé'}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handlePrintIndividual(rental, 'contract')}
                          className="p-2 hover:bg-stone-100 text-stone-600 rounded-lg transition-all"
                          title="Imprimer Contrat"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handlePrintIndividual(rental, 'invoice')}
                          className="p-2 hover:bg-stone-100 text-stone-600 rounded-lg transition-all"
                          title="Imprimer Facture"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        {rental.paymentStatus !== 'paid' && (
                          <button 
                            onClick={() => setPaymentModal({ isOpen: true, rental })}
                            className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-500 transition-all"
                          >
                            Encaisser
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredRentals.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-8 py-12 text-center text-stone-400 italic">
                    Aucun dossier trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="p-8 border-t border-stone-100 flex justify-end">
          <button
            onClick={generatePDF}
            className="flex items-center gap-2 bg-stone-900 text-white px-8 py-3 rounded-2xl text-sm font-bold hover:bg-stone-800 transition-all shadow-lg"
          >
            <Printer className="w-5 h-5" />
            Imprimer le Rapport Complet
          </button>
        </div>
      </div>
        </>
      ) : (
        <FinancialReport />
      )}

      {paymentModal.isOpen && paymentModal.rental && (
        <PaymentModal
          rental={paymentModal.rental}
          isSaving={isSaving}
          onClose={() => setPaymentModal({ isOpen: false, rental: null })}
          onConfirm={(amount, method) => handleConfirmPayment(paymentModal.rental!, amount, method)}
        />
      )}

      <GuideModal 
        isOpen={isHelpOpen} 
        onClose={() => setIsHelpOpen(false)} 
        activeTab="accounting"
      />
    </div>
  );
}
