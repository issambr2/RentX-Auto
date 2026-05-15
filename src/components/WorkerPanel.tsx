import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, addDoc, updateDoc, doc, deleteDoc, getDocs, setDoc } from '../lib/api';
import { db, auth } from '../lib/api';
import { Worker, Attendance, SalaryTransaction, PaymentMethod } from '../types';
import { Users, Plus, Calendar, DollarSign, Clock, Search, Edit2, Trash2, X, CheckCircle, AlertCircle, UserPlus, Briefcase, Phone, Mail, ChevronLeft, ChevronRight, Info, AlertTriangle, CheckCircle2, XCircle, Plane, Stethoscope, Download, FileText, History, CreditCard, TrendingUp } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, isSameMonth, getDaysInMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx } from 'clsx';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { useNotifications } from './NotificationContext';
import { useOffice } from '../contexts/OfficeContext';
import { DeleteModal } from './DeleteModal';
import { generateWorkerReportPDF, generateWorkerDetailedReportPDF } from '../services/pdfService';

export function WorkerPanel() {
  const { currentOffice } = useOffice();
  const { addNotification } = useNotifications();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id: string }>({ isOpen: false, id: '' });
  const [selectedStatus, setSelectedStatus] = useState<Attendance['status']>('present');
  const [isPaidStatus, setIsPaidStatus] = useState(true);
  const [salaryTransactions, setSalaryTransactions] = useState<SalaryTransaction[]>([]);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    type: 'advance' as SalaryTransaction['type'],
    amount: 0,
    paymentMethod: 'cash' as PaymentMethod,
    note: ''
  });

  const [newWorker, setNewWorker] = useState({
    fullName: '',
    role: '',
    phone: '',
    email: '',
    address: '',
    cin: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    baseSalary: 0,
    salaryType: 'fixed' as Worker['salaryType'],
    bankDetails: '',
    notes: ''
  });

  const [initialTransaction, setInitialTransaction] = useState({
    amount: 0,
    type: 'advance' as SalaryTransaction['type'],
    paymentMethod: 'cash' as PaymentMethod,
    note: ''
  });

  useEffect(() => {
    if (!currentOffice) return;

    const unsubWorkers = onSnapshot(query(collection(db, 'workers'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setWorkers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Worker[]);
    });

    const unsubAttendance = onSnapshot(query(collection(db, 'attendance')), (snapshot) => {
      setAttendances(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Attendance[]);
    });

    const unsubTransactions = onSnapshot(query(collection(db, 'salaryTransactions'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setSalaryTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SalaryTransaction[]);
    });

    setLoading(false);

    return () => {
      unsubWorkers();
      unsubAttendance();
      unsubTransactions();
    };
  }, [currentOffice]);

  const handleAddWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOffice) return;
    setIsSaving(true);
    try {
      const res = await addDoc(collection(db, 'workers'), {
        ...newWorker,
        status: 'active',
        officeId: currentOffice.id,
        createdAt: new Date().toISOString()
      });

      // If there's an initial salary transaction requested
      if (initialTransaction.amount > 0) {
        const transactionRef = await addDoc(collection(db, 'salaryTransactions'), {
          workerId: res.id,
          officeId: currentOffice.id,
          type: initialTransaction.type,
          amount: initialTransaction.amount,
          paymentMethod: initialTransaction.paymentMethod,
          note: 'Initial: ' + initialTransaction.note,
          date: new Date().toISOString(),
          month: format(new Date(), 'yyyy-MM')
        });

        // Also record as expense if it's money leaving the agency
        if (['payment', 'advance', 'bonus'].includes(initialTransaction.type)) {
          const typeLabel = initialTransaction.type === 'payment' ? 'Salaire' : 
                            initialTransaction.type === 'advance' ? 'Avance Salaire' : 'Prime';
          
          const amountTTC = initialTransaction.amount;
          const amountHT = amountTTC / 1.19;
          const vatAmount = amountTTC - amountHT;

          await addDoc(collection(db, 'expenses'), {
            date: format(new Date(), 'yyyy-MM-dd'),
            type: 'salary',
            description: `${typeLabel}: ${newWorker.fullName} (Initial)`,
            amount: amountTTC,
            amountHT,
            vatAmount,
            amountTTC,
            paymentMethod: initialTransaction.paymentMethod,
            officeId: currentOffice.id,
            salaryTransactionId: transactionRef.id,
            createdBy: auth.currentUser?.uid || 'system',
            agentName: auth.currentUser?.displayName || 'Agent',
            createdAt: new Date().toISOString()
          });
        }
      }

      setIsAddModalOpen(false);
      setNewWorker({ fullName: '', role: '', phone: '', email: '', address: '', cin: '', startDate: format(new Date(), 'yyyy-MM-dd'), baseSalary: 0, salaryType: 'fixed', bankDetails: '', notes: '' });
      setInitialTransaction({ amount: 0, type: 'advance', paymentMethod: 'cash', note: '' });
      addNotification('success', 'Travailleur ajouté', 'Le nouveau travailleur a été enregistré.');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'workers');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorker) return;
    setIsSaving(true);
    try {
      const { id, ...data } = selectedWorker;
      await updateDoc(doc(db, 'workers', id), {
        ...data,
        updatedAt: new Date().toISOString()
      });
      setIsEditModalOpen(false);
      addNotification('success', 'Travailleur modifié', 'Les informations ont été mises à jour.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `workers/${selectedWorker.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteWorker = async (id: string) => {
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, 'workers', id));
      addNotification('success', 'Travailleur supprimé', 'Le travailleur a été retiré.');
      setDeleteModal({ isOpen: false, id: '' });
      if (selectedWorker?.id === id) setSelectedWorker(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `workers/${id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleAttendance = async (workerId: string, date: string, currentStatus?: string) => {
    // If clicking the same status, remove it. Otherwise, apply selectedStatus.
    const nextStatus = currentStatus === selectedStatus ? null : selectedStatus;

    const attendanceId = `${workerId}_${date}`;
    try {
      if (nextStatus) {
        await setDoc(doc(db, 'attendance', attendanceId), {
          workerId,
          date,
          status: nextStatus,
          isPaid: (nextStatus === 'leave' || nextStatus === 'sick') ? isPaidStatus : (nextStatus === 'present'),
          updatedAt: new Date().toISOString()
        });
      } else {
        await deleteDoc(doc(db, 'attendance', attendanceId));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `attendance/${attendanceId}`);
    }
  };

  const calculateSalary = (worker: Worker) => {
    const monthStr = format(currentMonth, 'yyyy-MM');
    const monthAttendances = attendances.filter(a => a.workerId === worker.id && a.date.startsWith(monthStr));
    const workerTransactions = salaryTransactions.filter(t => t.workerId === worker.id && t.month === monthStr);
    
    const presentDays = monthAttendances.filter(a => a.status === 'present').length;
    const absentDays = monthAttendances.filter(a => a.status === 'absent').length;
    const leaveDays = monthAttendances.filter(a => a.status === 'leave').length;
    const sickDays = monthAttendances.filter(a => a.status === 'sick').length;
    
    const paidLeaveDays = monthAttendances.filter(a => a.status === 'leave' && a.isPaid).length;
    const paidSickDays = monthAttendances.filter(a => a.status === 'sick' && a.isPaid).length;

    let earned = 0;
    const baseSalary = Number(worker.baseSalary) || 0;
    const dailyRate = baseSalary / 26; // Assuming 26 working days avg

    if (worker.salaryType === 'daily') {
      earned = (presentDays + paidLeaveDays + paidSickDays) * baseSalary;
    } else if (worker.salaryType === 'hourly') {
      // Since we don't track hours yet, we assume 8 hours per present/paid day
      earned = (presentDays + paidLeaveDays + paidSickDays) * (baseSalary * 8);
    } else {
      // Fixed monthly salary
      // Deduct for unpaid days (absent, unpaid leave, unpaid sick)
      const unpaidDays = absentDays + (leaveDays - paidLeaveDays) + (sickDays - paidSickDays);
      earned = baseSalary - (unpaidDays * dailyRate);
    }

    const advances = workerTransactions.filter(t => t.type === 'advance').reduce((sum, t) => sum + t.amount, 0);
    const returns = workerTransactions.filter(t => t.type === 'return').reduce((sum, t) => sum + t.amount, 0);
    const payments = workerTransactions.filter(t => t.type === 'payment').reduce((sum, t) => sum + t.amount, 0);
    const bonuses = workerTransactions.filter(t => t.type === 'bonus').reduce((sum, t) => sum + t.amount, 0);
    const deductions = workerTransactions.filter(t => t.type === 'deduction').reduce((sum, t) => sum + t.amount, 0);

    const netToPay = earned + bonuses - deductions - (advances - returns);
    const remaining = netToPay - payments;

    return {
      earned: Math.max(0, earned),
      presentDays,
      absentDays,
      leaveDays,
      sickDays,
      paidLeaveDays,
      paidSickDays,
      advances,
      payments,
      bonuses,
      deductions,
      netToPay,
      remaining
    };
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorker || !currentOffice) return;

    if (newTransaction.amount <= 0) {
      addNotification('error', 'Montant invalide', 'Le montant doit être supérieur à 0.');
      return;
    }

    setIsSaving(true);
    try {
      const transactionRef = await addDoc(collection(db, 'salaryTransactions'), {
        workerId: selectedWorker.id,
        officeId: currentOffice.id,
        type: newTransaction.type,
        amount: newTransaction.amount,
        paymentMethod: newTransaction.paymentMethod,
        note: newTransaction.note,
        date: new Date().toISOString(),
        month: format(currentMonth, 'yyyy-MM')
      });
      
      // Also add as an expense if it's a payment, advance, or bonus (money leaving the agency)
      if (['payment', 'advance', 'bonus'].includes(newTransaction.type)) {
        const typeLabel = newTransaction.type === 'payment' ? 'Salaire' : 
                          newTransaction.type === 'advance' ? 'Avance Salaire' : 'Prime';
        
        const amountTTC = newTransaction.amount;
        const amountHT = amountTTC / 1.19;
        const vatAmount = amountTTC - amountHT;

        await addDoc(collection(db, 'expenses'), {
          date: format(new Date(), 'yyyy-MM-dd'),
          type: 'salary',
          description: `${typeLabel}: ${selectedWorker.fullName} ${newTransaction.note ? '- ' + newTransaction.note : ''}`,
          amount: amountTTC,
          amountHT,
          vatAmount,
          amountTTC,
          paymentMethod: newTransaction.paymentMethod,
          officeId: currentOffice.id,
          salaryTransactionId: transactionRef.id, // Link to allow deletion
          createdBy: auth.currentUser?.uid || 'system',
          agentName: auth.currentUser?.displayName || 'Agent',
          createdAt: new Date().toISOString()
        });
      }

      setIsTransactionModalOpen(false);
      setNewTransaction({ type: 'advance', amount: 0, paymentMethod: 'cash', note: '' });
      addNotification('success', 'Compte Trace enregistré', 'Le mouvement de salaire a été ajouté.');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'salaryTransactions');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!confirm('Supprimer ce mouvement ? (Ceci supprimera également la dépense associée)')) return;
    try {
      // 1. Delete the salary transaction
      await deleteDoc(doc(db, 'salaryTransactions', id));

      // 2. Find and delete associated expense if exists
      const expensesRef = collection(db, 'expenses');
      const q = query(expensesRef, where('salaryTransactionId', '==', id));
      const querySnapshot = await getDocs(q);
      
      for (const expenseDoc of querySnapshot.docs) {
        await deleteDoc(doc(db, 'expenses', expenseDoc.id));
      }

      addNotification('success', 'Compte Trace supprimé', 'Le mouvement et sa dépense associée ont été retirés.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `salaryTransactions/${id}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-stone-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Gestion des Travailleurs</h2>
          <p className="text-stone-500 italic serif">Suivi simplifié du personnel, des présences et des salaires.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => generateWorkerReportPDF(format(currentMonth, 'yyyy-MM'), workers, attendances, salaryTransactions, currentOffice?.name || '')}
            className="flex items-center justify-center gap-2 bg-stone-100 text-stone-600 py-3 px-6 rounded-2xl font-semibold hover:bg-stone-200 transition-all"
          >
            <Download className="w-5 h-5" />
            Rapport Mensuel
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-stone-900 text-white py-3 px-6 rounded-2xl font-semibold hover:bg-stone-800 transition-all shadow-lg"
          >
            <UserPlus className="w-5 h-5" />
            Nouveau Travailleur
          </button>
        </div>
      </div>

      {/* Quick Attendance Section */}
      <div className="bg-white rounded-[2rem] border border-stone-200 shadow-sm p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-stone-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-600" />
            Pointage rapide - {format(new Date(), 'dd MMMM yyyy', { locale: fr })}
          </h3>
          <div className="flex items-center gap-3">
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mr-2">Sélectionner Statut :</p>
            <button 
              onClick={() => setSelectedStatus('present')}
              className={clsx(
                "px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all border-2",
                selectedStatus === 'present' ? "bg-emerald-500 text-white border-emerald-600" : "bg-emerald-50 text-emerald-600 border-emerald-100"
              )}
            >
              Présent
            </button>
            <button 
              onClick={() => setSelectedStatus('absent')}
              className={clsx(
                "px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all border-2",
                selectedStatus === 'absent' ? "bg-red-500 text-white border-red-600" : "bg-red-50 text-red-600 border-red-100"
              )}
            >
              Absent
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {workers.filter(w => w.status === 'active').map(worker => {
            const dateStr = format(new Date(), 'yyyy-MM-dd');
            const attendance = attendances.find(a => a.workerId === worker.id && a.date === dateStr);
            const status = attendance?.status;
            
            return (
              <button
                key={worker.id}
                onClick={() => toggleAttendance(worker.id, dateStr, status)}
                className={clsx(
                  "px-4 py-2 rounded-2xl text-xs font-bold transition-all border-2 flex items-center gap-2",
                  status === 'present' ? "bg-emerald-50 border-emerald-500 text-emerald-700" :
                  status === 'absent' ? "bg-red-50 border-red-500 text-red-700" :
                  status === 'leave' ? "bg-purple-50 border-purple-500 text-purple-700" :
                  status === 'sick' ? "bg-amber-50 border-amber-500 text-amber-700" :
                  "bg-stone-50 border-transparent text-stone-600 hover:border-stone-200"
                )}
              >
                {worker.fullName}
                {status === 'present' && <CheckCircle2 className="w-3.5 h-3.5" />}
                {status === 'absent' && <XCircle className="w-3.5 h-3.5" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Worker List Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-[2rem] border border-stone-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-100">
              <h3 className="font-bold text-stone-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-stone-400" />
                Liste du Personnel
              </h3>
            </div>
            <div className="divide-y divide-stone-50 max-h-[600px] overflow-y-auto">
              {workers.length === 0 ? (
                <div className="p-8 text-center text-stone-400 italic text-sm">
                  Aucun travailleur enregistré.
                </div>
              ) : (
                workers.map((worker) => (
                  <button
                    key={worker.id}
                    onClick={() => setSelectedWorker(worker)}
                    className={clsx(
                      "w-full p-6 text-left transition-all hover:bg-stone-50 flex items-center justify-between group",
                      selectedWorker?.id === worker.id ? "bg-stone-50 border-l-4 border-stone-900" : "border-l-4 border-transparent"
                    )}
                  >
                    <div>
                      <p className="font-bold text-stone-900 group-hover:text-stone-900">{worker.fullName}</p>
                      <p className="text-xs text-stone-500 uppercase tracking-widest font-medium">{worker.role}</p>
                    </div>
                    <ChevronRight className={clsx(
                      "w-5 h-5 transition-all",
                      selectedWorker?.id === worker.id ? "text-stone-900 translate-x-1" : "text-stone-300"
                    )} />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Worker Details & Calendar */}
        <div className="lg:col-span-8">
          {selectedWorker ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              {/* Header Info */}
              <div className="bg-white rounded-[2.5rem] border border-stone-200 shadow-sm p-8">
                <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                  <div className="flex items-center gap-6">
                    <div className="w-20 h-20 bg-stone-900 text-white rounded-3xl flex items-center justify-center text-3xl font-bold">
                      {(selectedWorker.fullName || '?').charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-stone-900">{selectedWorker.fullName}</h3>
                      <p className="text-emerald-600 font-bold text-sm uppercase tracking-widest">{selectedWorker.role}</p>
                      <div className="flex items-center gap-4 mt-2 text-stone-500 text-sm">
                        <span className="flex items-center gap-1"><Phone className="w-4 h-4" /> {selectedWorker.phone}</span>
                        <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" /> {format(new Date(selectedWorker.startDate), 'dd MMM yyyy', { locale: fr })}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => generateWorkerDetailedReportPDF(format(currentMonth, 'yyyy-MM'), selectedWorker, attendances, salaryTransactions, currentOffice?.name || '')}
                      className="p-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-2xl transition-all"
                      title="Télécharger Fiche de Paie"
                    >
                      <FileText className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => setIsEditModalOpen(true)}
                      className="p-3 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-2xl transition-all"
                      title="Modifier"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => setDeleteModal({ isOpen: true, id: selectedWorker.id })}
                      className="p-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl transition-all"
                      title="Supprimer"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8 pt-8 border-t border-stone-100">
                  <div className="p-4 bg-stone-50 rounded-2xl">
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Salaire de Base</p>
                    <p className="font-bold text-stone-900">{(selectedWorker.baseSalary || 0).toLocaleString()} DT</p>
                  </div>
                  <div className="p-4 bg-stone-50 rounded-2xl">
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Salaire Dû</p>
                    <p className="font-bold text-stone-900">{(calculateSalary(selectedWorker).earned || 0).toLocaleString()} DT</p>
                  </div>
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mb-1">Avances</p>
                    <p className="font-bold text-amber-900">{(calculateSalary(selectedWorker).advances || 0).toLocaleString()} DT</p>
                  </div>
                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-1">Reste à Payer</p>
                    <p className="text-lg font-black text-emerald-900">{(calculateSalary(selectedWorker).remaining || 0).toLocaleString()} DT</p>
                  </div>
                </div>
              </div>

              {/* Calendar Section */}
              <div className="bg-white rounded-[2.5rem] border border-stone-200 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-stone-100 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <h3 className="text-xl font-bold text-stone-900 min-w-[150px] text-center">
                      {format(currentMonth, 'MMMM yyyy', { locale: fr })}
                    </h3>
                    <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mr-2">Sélectionner Statut :</p>
                    <button 
                      onClick={() => setSelectedStatus('present')}
                      className={clsx(
                        "px-4 py-2 rounded-xl text-xs font-bold transition-all border-2",
                        selectedStatus === 'present' ? "bg-emerald-500 text-white border-emerald-600" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                      )}
                    >
                      Présent
                    </button>
                    <button 
                      onClick={() => setSelectedStatus('absent')}
                      className={clsx(
                        "px-4 py-2 rounded-xl text-xs font-bold transition-all border-2",
                        selectedStatus === 'absent' ? "bg-red-500 text-white border-red-600" : "bg-red-50 text-red-600 border-red-100"
                      )}
                    >
                      Absent
                    </button>
                    <button 
                      onClick={() => setSelectedStatus('leave')}
                      className={clsx(
                        "px-4 py-2 rounded-xl text-xs font-bold transition-all border-2",
                        selectedStatus === 'leave' ? "bg-purple-500 text-white border-purple-600" : "bg-purple-50 text-purple-600 border-purple-100"
                      )}
                    >
                      Congé
                    </button>
                    <button 
                      onClick={() => setSelectedStatus('sick')}
                      className={clsx(
                        "px-4 py-2 rounded-xl text-xs font-bold transition-all border-2",
                        selectedStatus === 'sick' ? "bg-amber-500 text-white border-amber-600" : "bg-amber-50 text-amber-600 border-amber-100"
                      )}
                    >
                      Maladie
                    </button>

                    {(selectedStatus === 'leave' || selectedStatus === 'sick') && (
                      <div className="flex items-center gap-2 ml-4 px-4 py-2 bg-stone-100 rounded-xl border border-stone-200">
                        <span className="text-[10px] font-bold text-stone-500 uppercase">Payé ?</span>
                        <button
                          onClick={() => setIsPaidStatus(!isPaidStatus)}
                          className={clsx(
                            "w-10 h-5 rounded-full transition-all relative",
                            isPaidStatus ? "bg-emerald-500" : "bg-stone-300"
                          )}
                        >
                          <div className={clsx(
                            "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all",
                            isPaidStatus ? "right-0.5" : "left-0.5"
                          )} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-8">
                  <div className="grid grid-cols-7 gap-2">
                    {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => (
                      <div key={day} className="text-center text-[10px] font-bold text-stone-400 uppercase tracking-widest py-2">
                        {day}
                      </div>
                    ))}
                    {Array.from({ length: (new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay() + 6) % 7 }).map((_, i) => (
                      <div key={`empty-${i}`} className="aspect-square"></div>
                    ))}
                    {eachDayOfInterval({
                      start: startOfMonth(currentMonth),
                      end: endOfMonth(currentMonth)
                    }).map((day) => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const attendance = attendances.find(a => a.workerId === selectedWorker.id && a.date === dateStr);
                      const status = attendance?.status;

                      return (
                        <button
                          key={dateStr}
                          onClick={() => toggleAttendance(selectedWorker.id, dateStr, status)}
                          className={clsx(
                            "aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 transition-all border-2",
                            status === 'present' ? "bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm shadow-emerald-100" :
                            status === 'absent' ? "bg-red-50 border-red-500 text-red-700 shadow-sm shadow-red-100" :
                            status === 'leave' ? "bg-purple-50 border-purple-500 text-purple-700 shadow-sm shadow-purple-100" :
                            status === 'sick' ? "bg-amber-50 border-amber-500 text-amber-700 shadow-sm shadow-amber-100" :
                            "bg-stone-50 border-transparent text-stone-400 hover:border-stone-200"
                          )}
                        >
                          <span className="text-sm font-bold">{format(day, 'd')}</span>
                          {status === 'present' && <CheckCircle2 className="w-3 h-3" />}
                          {status === 'absent' && <XCircle className="w-3 h-3" />}
                          {status === 'leave' && (
                            <div className="flex flex-col items-center">
                              <Plane className="w-3 h-3" />
                              <span className="text-[8px] font-bold">{attendance?.isPaid ? 'P' : 'NP'}</span>
                            </div>
                          )}
                          {status === 'sick' && (
                            <div className="flex flex-col items-center">
                              <Stethoscope className="w-3 h-3" />
                              <span className="text-[8px] font-bold">{attendance?.isPaid ? 'P' : 'NP'}</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-8 p-6 bg-stone-50 rounded-3xl border border-stone-100">
                    <div className="flex items-center gap-2 mb-4">
                      <Info className="w-4 h-4 text-stone-400" />
                      <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">Résumé du mois</p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <p className="text-2xl font-black text-emerald-600">{calculateSalary(selectedWorker).presentDays}</p>
                        <p className="text-[10px] font-bold text-stone-400 uppercase">Présences</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-black text-red-600">{calculateSalary(selectedWorker).absentDays}</p>
                        <p className="text-[10px] font-bold text-stone-400 uppercase">Absences</p>
                      </div>
                      <div className="text-center">
                        <div className="flex flex-col">
                          <p className="text-2xl font-black text-purple-600">{calculateSalary(selectedWorker).leaveDays}</p>
                          <p className="text-[8px] font-bold text-purple-400 uppercase">({calculateSalary(selectedWorker).paidLeaveDays} Payés)</p>
                        </div>
                        <p className="text-[10px] font-bold text-stone-400 uppercase">Congés</p>
                      </div>
                      <div className="text-center">
                        <div className="flex flex-col">
                          <p className="text-2xl font-black text-amber-600">{calculateSalary(selectedWorker).sickDays}</p>
                          <p className="text-[8px] font-bold text-amber-400 uppercase">({calculateSalary(selectedWorker).paidSickDays} Payés)</p>
                        </div>
                        <p className="text-[10px] font-bold text-stone-400 uppercase">Maladies</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Compte Trace Section */}
              <div className="bg-white rounded-[2.5rem] border border-stone-200 shadow-sm p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-stone-900 flex items-center gap-2">
                    <History className="w-5 h-5 text-stone-400" />
                    Compte Trace
                  </h3>
                  <button
                    onClick={() => setIsTransactionModalOpen(true)}
                    className="flex items-center gap-2 text-emerald-600 font-bold hover:text-emerald-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Ajouter un mouvement
                  </button>
                </div>

                <div className="space-y-4">
                  {salaryTransactions
                    .filter(t => t.workerId === selectedWorker.id && t.month === format(currentMonth, 'yyyy-MM'))
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((transaction) => (
                      <div key={transaction.id} className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-100 group">
                        <div className="flex items-center gap-4">
                          <div className={clsx(
                            "w-10 h-10 rounded-xl flex items-center justify-center",
                            transaction.type === 'advance' ? "bg-amber-100 text-amber-600" :
                            transaction.type === 'payment' ? "bg-emerald-100 text-emerald-600" :
                            transaction.type === 'bonus' ? "bg-purple-100 text-purple-600" : 
                            transaction.type === 'return' ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                          )}>
                            <DollarSign className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-bold text-stone-900 capitalize">
                              {transaction.type === 'advance' ? 'Avance' : 
                               transaction.type === 'payment' ? 'Paiement' : 
                               transaction.type === 'bonus' ? 'Prime' : 
                               transaction.type === 'return' ? 'Retour' : 'Retenue'}
                            </p>
                            <p className="text-[10px] text-stone-400 font-bold uppercase">{format(new Date(transaction.date), 'dd MMM yyyy HH:mm', { locale: fr })}</p>
                            {transaction.note && <p className="text-xs text-stone-500 mt-1 italic">"{transaction.note}"</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <p className={clsx(
                            "font-black text-lg",
                            transaction.type === 'payment' || transaction.type === 'advance' || transaction.type === 'deduction' || transaction.type === 'return' ? "text-stone-900" : "text-emerald-600"
                          )}>
                            {transaction.type === 'bonus' || transaction.type === 'return' ? '+' : '-'} {(transaction.amount || 0).toLocaleString()} DT
                          </p>
                          <button
                            onClick={() => handleDeleteTransaction(transaction.id)}
                            className="p-2 text-stone-300 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  
                  {salaryTransactions.filter(t => t.workerId === selectedWorker.id && t.month === format(currentMonth, 'yyyy-MM')).length === 0 && (
                    <div className="text-center py-8 text-stone-400 italic text-sm">
                      Aucun mouvement enregistré pour ce mois.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center bg-white rounded-[2.5rem] border border-stone-200 border-dashed p-12 text-center space-y-4">
              <div className="w-20 h-20 bg-stone-50 rounded-full flex items-center justify-center text-stone-300">
                <Users className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-stone-900">Sélectionnez un travailleur</h3>
                <p className="text-stone-500 text-sm max-w-xs mx-auto">Choisissez un membre de votre équipe pour gérer ses présences et visualiser son salaire.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Worker Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm" onClick={() => setIsAddModalOpen(false)}>
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-stone-900">Nouveau Travailleur</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleAddWorker} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Nom Complet</label>
                  <input
                    type="text" required
                    value={newWorker.fullName || ''}
                    onChange={(e) => setNewWorker({...newWorker, fullName: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Poste / Rôle</label>
                  <input
                    type="text" required
                    value={newWorker.role || ''}
                    onChange={(e) => setNewWorker({...newWorker, role: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Téléphone</label>
                  <input
                    type="tel" required
                    value={newWorker.phone || ''}
                    onChange={(e) => setNewWorker({...newWorker, phone: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">CIN</label>
                  <input
                    type="text" required
                    value={newWorker.cin || ''}
                    onChange={(e) => setNewWorker({...newWorker, cin: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Date d'embauche</label>
                  <input
                    type="date" required
                    value={newWorker.startDate || ''}
                    onChange={(e) => setNewWorker({...newWorker, startDate: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Type de Salaire</label>
                  <select
                    value={newWorker.salaryType}
                    onChange={(e) => setNewWorker({...newWorker, salaryType: e.target.value as any})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="fixed">Forfait (Mensuel)</option>
                    <option value="daily">Par Jour</option>
                    <option value="hourly">Par Heure</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                    {newWorker.salaryType === 'fixed' ? 'Salaire Mensuel (DT)' : newWorker.salaryType === 'daily' ? 'Taux Journalier (DT)' : 'Taux Horaire (DT)'}
                  </label>
                  <input
                    type="number" required
                    value={newWorker.baseSalary || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setNewWorker({...newWorker, baseSalary: isNaN(val) ? 0 : val});
                    }}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Initial Transaction Fields */}
              <div className="p-6 bg-stone-50 rounded-3xl border border-stone-100 space-y-4">
                <h4 className="text-xs font-bold text-stone-900 uppercase">Mouvement Initial (Facultatif)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-stone-400 uppercase">Montant (DT)</label>
                    <input
                      type="number"
                      value={initialTransaction.amount || ''}
                      onChange={(e) => setInitialTransaction({...initialTransaction, amount: parseFloat(e.target.value) || 0})}
                      className="w-full px-4 py-2 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-stone-400 uppercase">Type</label>
                    <select
                      value={initialTransaction.type}
                      onChange={(e) => setInitialTransaction({...initialTransaction, type: e.target.value as any})}
                      className="w-full px-4 py-2 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="advance">Avance</option>
                      <option value="payment">Paiement</option>
                      <option value="bonus">Prime</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Mode de paiement</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'cash', label: 'Espèces', icon: DollarSign },
                      { id: 'card', label: 'Carte', icon: CreditCard },
                      { id: 'transfer', label: 'Virement', icon: TrendingUp }
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setInitialTransaction({...initialTransaction, paymentMethod: m.id as PaymentMethod})}
                        className={clsx(
                          "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                          initialTransaction.paymentMethod === m.id ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-stone-100 text-stone-400 hover:border-stone-200"
                        )}
                      >
                        <m.icon className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase">Note initiale</label>
                  <input
                    type="text"
                    placeholder="Ex: Avance à l'embauche"
                    value={initialTransaction.note}
                    onChange={(e) => setInitialTransaction({...initialTransaction, note: e.target.value})}
                    className="w-full px-4 py-2 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <button
                type="submit" disabled={isSaving}
                className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg mt-4 disabled:opacity-50"
              >
                {isSaving ? 'Enregistrement...' : 'Enregistrer le Travailleur'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Worker Modal */}
      {isEditModalOpen && selectedWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm" onClick={() => setIsEditModalOpen(false)}>
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-stone-900">Modifier Travailleur</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleEditWorker} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Nom Complet</label>
                  <input
                    type="text" required
                    value={selectedWorker.fullName || ''}
                    onChange={(e) => setSelectedWorker({...selectedWorker, fullName: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Poste / Rôle</label>
                  <input
                    type="text" required
                    value={selectedWorker.role || ''}
                    onChange={(e) => setSelectedWorker({...selectedWorker, role: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Téléphone</label>
                  <input
                    type="tel" required
                    value={selectedWorker.phone || ''}
                    onChange={(e) => setSelectedWorker({...selectedWorker, phone: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">CIN</label>
                  <input
                    type="text" required
                    value={selectedWorker.cin || ''}
                    onChange={(e) => setSelectedWorker({...selectedWorker, cin: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Type de Salaire</label>
                  <select
                    value={selectedWorker.salaryType || 'fixed'}
                    onChange={(e) => setSelectedWorker({...selectedWorker, salaryType: e.target.value as any})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="fixed">Forfait (Mensuel)</option>
                    <option value="daily">Par Jour</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                    {selectedWorker.salaryType === 'fixed' ? 'Salaire Mensuel (DT)' : 'Taux Journalier (DT)'}
                  </label>
                  <input
                    type="number" required
                    value={selectedWorker.baseSalary || 0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setSelectedWorker({...selectedWorker, baseSalary: isNaN(val) ? 0 : val});
                    }}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <button
                type="submit" disabled={isSaving}
                className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg mt-4 disabled:opacity-50"
              >
                {isSaving ? 'Mise à jour...' : 'Mettre à jour le Travailleur'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Compte Trace Modal */}
      {isTransactionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm" onClick={() => setIsTransactionModalOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-stone-900">Nouveau Compte Trace</h3>
              <button onClick={() => setIsTransactionModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddTransaction} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Type de mouvement</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewTransaction({ ...newTransaction, type: 'advance' })}
                    className={clsx(
                      "py-3 rounded-xl text-xs font-bold transition-all border-2",
                      newTransaction.type === 'advance' ? "bg-amber-50 border-amber-500 text-amber-700" : "bg-stone-50 border-transparent text-stone-500"
                    )}
                  >
                    Avance
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewTransaction({ ...newTransaction, type: 'payment' })}
                    className={clsx(
                      "py-3 rounded-xl text-xs font-bold transition-all border-2",
                      newTransaction.type === 'payment' ? "bg-emerald-50 border-emerald-500 text-emerald-700" : "bg-stone-50 border-transparent text-stone-500"
                    )}
                  >
                    Paiement
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewTransaction({ ...newTransaction, type: 'bonus' })}
                    className={clsx(
                      "py-3 rounded-xl text-xs font-bold transition-all border-2",
                      newTransaction.type === 'bonus' ? "bg-purple-50 border-purple-500 text-purple-700" : "bg-stone-50 border-transparent text-stone-500"
                    )}
                  >
                    Prime
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewTransaction({ ...newTransaction, type: 'return' })}
                    className={clsx(
                      "py-3 rounded-xl text-xs font-bold transition-all border-2",
                      newTransaction.type === 'return' ? "bg-emerald-50 border-emerald-500 text-emerald-700" : "bg-stone-50 border-transparent text-stone-500"
                    )}
                  >
                    Retour
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewTransaction({ ...newTransaction, type: 'deduction' })}
                    className={clsx(
                      "py-3 rounded-xl text-xs font-bold transition-all border-2",
                      newTransaction.type === 'deduction' ? "bg-red-50 border-red-500 text-red-700" : "bg-stone-50 border-transparent text-stone-500"
                    )}
                  >
                    Retenue
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Montant (DT)</label>
                <input
                  type="number" required min="1"
                  value={newTransaction.amount || 0}
                  onChange={(e) => setNewTransaction({ ...newTransaction, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  placeholder="0.000"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Mode de paiement</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'cash', label: 'Espèces', icon: DollarSign },
                    { id: 'card', label: 'Carte', icon: CreditCard },
                    { id: 'transfer', label: 'Virement', icon: TrendingUp }
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setNewTransaction({...newTransaction, paymentMethod: m.id as PaymentMethod})}
                      className={clsx(
                        "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                        newTransaction.paymentMethod === m.id ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-stone-100 text-stone-400 hover:border-stone-200"
                      )}
                    >
                      <m.icon className="w-5 h-5" />
                      <span className="text-[10px] font-bold uppercase">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Note / Motif</label>
                <textarea
                  value={newTransaction.note || ''}
                  onChange={(e) => setNewTransaction({ ...newTransaction, note: e.target.value })}
                  className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 h-24 resize-none"
                  placeholder="Détails du paiement..."
                />
              </div>

              <button
                type="submit"
                disabled={isSaving || newTransaction.amount <= 0}
                className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    Enregistrer le mouvement
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ ...deleteModal, isOpen: false })}
        onConfirm={() => handleDeleteWorker(deleteModal.id)}
        title="Supprimer le travailleur"
        message="Êtes-vous sûr de vouloir supprimer ce travailleur ? Cette action est irréversible."
      />
    </div>
  );
}
