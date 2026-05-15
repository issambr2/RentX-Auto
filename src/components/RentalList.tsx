import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, getDoc } from '../lib/api';
import { db, auth } from '../lib/api';
import { Rental, Vehicle, Client, PaymentMethod, VehicleStatus } from '../types';
import { Plus, Search, Calendar, CheckCircle, XCircle, Clock, FileText, User, Car as CarIcon, Printer, Plane, CreditCard, Edit2, Trash2, DollarSign, AlertTriangle, Camera, Upload, Trash, X, RefreshCw, AlertCircle, Info, Droplets, TrendingUp, Scissors, Archive, History as LucideHistory, ArrowRight, Download, Globe, Play } from 'lucide-react';
import { format, differenceInDays, addDays, differenceInHours, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx } from 'clsx';
import { Receipt } from './Receipt';
import { compressImage } from '../utils/imageCompression';
import { logActivity } from '../services/logService';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { Filter as FilterIcon, PenTool } from 'lucide-react';
import { DeleteModal } from './DeleteModal';
import { ImageUpload } from './ImageUpload';
import { generateContractPDF, generateInvoicePDF } from '../services/pdfService';
import { exportToExcel } from '../services/excelService';
import { useNotifications } from './NotificationContext';
import { useOffice } from '../contexts/OfficeContext';

export function RentalList() {
  const { currentOffice } = useOffice();
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [editingRental, setEditingRental] = useState<Rental | null>(null);
  const [paymentRental, setPaymentRental] = useState<Rental | null>(null);
  const [closureRental, setClosureRental] = useState<Rental | null>(null);
  const [cutRental, setCutRental] = useState<Rental | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed' | 'reserved' | 'pending_confirmation'>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'company' | 'subcontracted'>('all');
  const [selectedRentalForReceipt, setSelectedRentalForReceipt] = useState<{rental: Rental, vehicle?: Vehicle, client: Client, secondDriver?: Client} | null>(null);
  const [swapRental, setSwapRental] = useState<Rental | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [extensionRental, setExtensionRental] = useState<Rental | null>(null);
  const [extensionHistoryRental, setExtensionHistoryRental] = useState<Rental | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, rental: Rental | null }>({ isOpen: false, rental: null });
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
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'vehicles');
    });
    const unsubClients = onSnapshot(query(collection(db, 'clients'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Client[]);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'clients');
    });

    return () => {
      unsubRentals();
      unsubVehicles();
      unsubClients();
    };
  }, [currentOffice]);

  useEffect(() => {
    const refreshVehicleStatuses = async () => {
      if (vehicles.length === 0 || rentals.length === 0 || isSaving) return;

      const today = format(new Date(), 'yyyy-MM-dd');
      const vehiclesToUpdate: {id: string, status: VehicleStatus}[] = [];

      for (const vehicle of vehicles) {
        const currentRental = rentals.find(r => 
          r.vehicleId === vehicle.id && 
          r.status !== 'completed' && 
          r.status !== 'cancelled' &&
          today >= r.startDate && today <= r.endDate
        );

        let expectedStatus: VehicleStatus = 'available';
        if (currentRental) {
          expectedStatus = currentRental.status === 'active' ? 'rented' : 'reserved';
        }

        // Only update if actually different and not manually set to maintenance
        if (vehicle.status !== expectedStatus && vehicle.status !== 'maintenance') {
          vehiclesToUpdate.push({ id: vehicle.id, status: expectedStatus });
        }
      }

      if (vehiclesToUpdate.length > 0) {
        setIsSaving(true);
        try {
          // Use sequential updates or batch to avoid rate limiting
          for (const item of vehiclesToUpdate) {
            await updateDoc(doc(db, 'vehicles', item.id), { status: item.status });
          }
        } catch (error) {
          console.error("Error auto-updating vehicle statuses:", error);
        } finally {
          setIsSaving(false);
        }
      }
    };

    // Throttle: only run every 5 minutes if something changed, or on initial load
    const lastSync = sessionStorage.getItem('last_status_sync');
    const now = Date.now();
    if (!lastSync || now - parseInt(lastSync) > 5 * 60 * 1000) {
      refreshVehicleStatuses();
      sessionStorage.setItem('last_status_sync', now.toString());
    }
  }, [vehicles.length, rentals.length]);

  const getVehicle = (id: string) => vehicles.find(v => v.id === id);
  const getClient = (id: string) => clients.find(c => c.id === id);
  const formatClientName = (clientId: string, name?: string) => {
    const client = getClient(clientId);
    const displayName = client?.name || name || 'Inconnu';
    if (displayName.includes('@')) {
      return displayName.split('@')[0];
    }
    return displayName;
  };

  const handleComplete = (rental: Rental) => {
    setClosureRental(rental);
  };

  const calculateLateHours = (rental: Rental, returnData: any) => {
    try {
      const plannedEnd = parseISO(`${rental.endDate}T${rental.endTime || '09:00'}:00`);
      const actualEnd = parseISO(`${returnData.returnDate}T${returnData.returnTime}:00`);
      
      const diffHours = differenceInHours(actualEnd, plannedEnd);
      return Math.max(0, diffHours);
    } catch (e) {
      console.error("Error calculating late hours:", e);
      return 0;
    }
  };

  const handleConfirmClosure = async (rentalId: string, vehicleId: string, data: any) => {
    setIsSaving(true);
    try {
      const rental = rentals.find(r => r.id === rentalId);
      if (!rental) return;

      const vehicle = vehicles.find(v => v.id === vehicleId);

      const washPrice = Number(data.washPrice) || 0;
      const totalWashPrice = data.washStatus === 'dirty' ? washPrice : 0;
      const lateFee = Number(data.lateFee) || 0;
      
      // Update total amount to include washing fee and late fee
      const newTotalAmount = (rental.totalAmount || 0) + totalWashPrice + lateFee;
      
      // Calculate new paid amount
      const newPaidAmount = Number(data.paidAmount) || 0;
      const newStatus = newPaidAmount >= newTotalAmount ? 'paid' : (newPaidAmount > 0 ? 'partial' : 'pending');

      await updateDoc(doc(db, 'rentals', rentalId), {
        status: 'completed',
        returnDate: data.returnDate,
        returnTime: data.returnTime,
        actualEndDate: data.returnDate,
        actualEndTime: data.returnTime,
        lateHours: calculateLateHours(rental, data),
        lateFee: lateFee,
        returnMileage: data.returnMileage,
        returnFuelLevel: data.returnFuelLevel,
        paymentStatus: newStatus,
        paidAmount: newPaidAmount,
        totalAmount: newTotalAmount,
        washStatus: data.washStatus,
        washPrice: totalWashPrice,
        checkedInBy: data.checkedInBy || auth.currentUser?.displayName || 'Inconnu',
        updatedAt: new Date().toISOString()
      });

      // Register the wash in the 'washes' collection to "mettre en caisse direct"
      if (totalWashPrice > 0 && currentOffice) {
        const washHT = totalWashPrice / 1.19;
        const washVAT = totalWashPrice - washHT;
        
        await addDoc(collection(db, 'washes'), {
          officeId: currentOffice.id,
          vehicleId: vehicleId,
          vehiclePlate: rental.vehiclePlate || '',
          clientId: rental.clientId || null,
          clientName: rental.clientName || null,
          rentalId: rentalId,
          date: data.returnDate,
          time: data.returnTime,
          priceHT: washHT,
          vatAmount: washVAT,
          priceTTC: totalWashPrice,
          price: totalWashPrice,
          isPaid: true, // Marked as paid to show up in "caisse"
          paymentMethod: data.paymentMethod || rental.paymentMethod || 'cash',
          notes: `Frais de lavage à la restitution (Contrat: ${rental.contractNumber || rental.id})`,
          createdBy: auth.currentUser?.uid || 'system',
          agentName: auth.currentUser?.displayName || 'Agent',
          createdAt: new Date().toISOString()
        });

        // Add to log activity
        logActivity(auth.currentUser?.uid || 'system', 'wash_recorded', `Lavage encaissé: ${totalWashPrice} TND pour ${rental.vehiclePlate}`, auth.currentUser?.displayName || undefined);
      }
      
      // Update vehicle status and mileage
      await updateDoc(doc(db, 'vehicles', vehicleId), {
        status: 'available',
        mileage: data.returnMileage,
        washStatus: data.washStatus,
        parkingLocation: data.parkingLocation,
        lastWashDate: data.washStatus === 'clean' ? data.returnDate : (vehicle?.lastWashDate || null)
      });

      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'complete_rental', `Location terminée - Retour KM: ${data.returnMileage} - État: ${data.washStatus}`, auth.currentUser.displayName || undefined);
      }
      
      addNotification('success', 'Location clôturée', `Le véhicule est de nouveau disponible. KM Retour: ${data.returnMileage}`);
      setClosureRental(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rentals/${rentalId}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmSwap = async (rentalId: string, oldVehicleId: string, data: { newVehicleId: string, reason: string, mileageAtSwap: number }) => {
    setIsSaving(true);
    try {
      const rental = rentals.find(r => r.id === rentalId);
      if (!rental) return;

      const swapEntry = {
        oldVehicleId,
        newVehicleId: data.newVehicleId,
        date: new Date().toISOString(),
        reason: data.reason,
        mileageAtSwap: data.mileageAtSwap
      };

      const updatedSwaps = [...(rental.vehicleSwaps || []), swapEntry];

      // Update Rental
      await updateDoc(doc(db, 'rentals', rentalId), {
        vehicleId: data.newVehicleId,
        vehicleSwaps: updatedSwaps
      });

      // Update Old Vehicle
      await updateDoc(doc(db, 'vehicles', oldVehicleId), {
        status: 'available',
        mileage: data.mileageAtSwap
      });

      // Update New Vehicle
      await updateDoc(doc(db, 'vehicles', data.newVehicleId), {
        status: 'rented'
      });

      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'swap_vehicle', `Véhicule échangé pour la location ${rental.contractNumber}`, auth.currentUser.displayName || undefined);
      }
      setSwapRental(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rentals/${rentalId}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmCut = async (rental: Rental, data: { cutDate: string, cutTime: string, mileage: number, firstPartAmount: number }) => {
    setIsSaving(true);
    try {
      const year = new Date().getFullYear();
      const count = rentals.length + 1;
      const number = count.toString().padStart(4, '0');
      const prefix = 'CON';
      const newContractNumber = `${prefix}-${year}-${number}`;

      // 1. Update original rental
      await updateDoc(doc(db, 'rentals', rental.id), {
        status: 'completed',
        endDate: data.cutDate,
        endTime: data.cutTime,
        actualEndDate: data.cutDate,
        actualEndTime: data.cutTime,
        returnMileage: data.mileage,
        totalAmount: data.firstPartAmount,
        notes: `${rental.notes || ''} [COUPURE effectuée le ${data.cutDate}]`.trim()
      });

      // 2. Create new rental starting from cutDate
      const { id, ...rentalData } = rental;
      const newRental = {
        ...rentalData,
        contractNumber: newContractNumber,
        startDate: data.cutDate,
        startTime: data.cutTime,
        departureMileage: data.mileage,
        paidAmount: 0,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notes: `Suite du contrat ${rental.contractNumber || rental.id}`
      };

      await addDoc(collection(db, 'rentals'), newRental);

      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'cut_rental', `Coupure effectuée sur ${rental.contractNumber || rental.id}`, auth.currentUser.displayName || undefined);
      }
      
      setCutRental(null);
      addNotification('success', 'Succès', 'La location a été coupée avec succès. Un nouveau contrat a été créé pour la période restante.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rentals/${rental.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartRental = async (rental: Rental) => {
    try {
      await updateDoc(doc(db, 'rentals', rental.id), {
        status: 'active',
        updatedAt: new Date().toISOString()
      });
      addNotification('success', 'Location démarrée', 'Le contrat est maintenant actif.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rentals/${rental.id}`);
    }
  };

  const handlePrintReceipt = (rental: Rental) => {
    const vehicle = rental.vehicleId ? getVehicle(rental.vehicleId) : undefined;
    let client = getClient(rental.clientId);
    const secondDriver = rental.secondDriverId ? getClient(rental.secondDriverId) : undefined;
    
    // If client document not found, create a virtual client from denormalized data
    if (!client && rental.clientName) {
      client = {
        id: rental.clientId,
        name: rental.clientName,
        phone: rental.clientPhone || '',
        email: rental.clientEmail || '',
        address: '',
        city: '',
        customerType: 'individual',
        licenseNumber: '',
        licenseExpiry: '',
        category: 'regular',
        loyaltyPoints: 0,
        loyaltyStatus: 'bronze',
        officeId: rental.officeId
      } as Client;
    }

    if (client) {
      setSelectedRentalForReceipt({ rental, vehicle, client, secondDriver });
    }
  };

  const handleDelete = async (rental: Rental) => {
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, 'rentals', rental.id));
      // If it was active or reserved, make vehicle available again
      if ((rental.status === 'active' || rental.status === 'reserved') && rental.vehicleId) {
        await updateDoc(doc(db, 'vehicles', rental.vehicleId), { status: 'available' });
      }
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'delete_rental', `Location supprimée pour ${getClient(rental.clientId)?.name}`, auth.currentUser.displayName || undefined);
      }
      setDeleteModal({ isOpen: false, rental: null });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `rentals/${rental.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePayment = async (rental: Rental, amount: number, method: PaymentMethod) => {
    setIsSaving(true);
    try {
      const newPaidAmount = (rental.paidAmount || 0) + amount;
      const newStatus = newPaidAmount >= rental.totalAmount ? 'paid' : 'partial';
      
      await updateDoc(doc(db, 'rentals', rental.id), {
        paidAmount: newPaidAmount,
        paymentStatus: newStatus,
        paymentMethod: method
      });
      
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'update_payment', `Paiement de ${amount} TND reçu pour la location ${rental.contractNumber} via ${method}`, auth.currentUser.displayName || undefined);
      }
      setPaymentRental(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rentals/${rental.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const isVehicleBusyDuringPeriod = (vId: string, start: string, end: string, excludeId?: string) => {
    return rentals.some(r => 
      r.vehicleId === vId && 
      r.id !== excludeId &&
      r.status !== 'completed' &&
      r.status !== 'cancelled' &&
      (start < r.endDate && end > r.startDate)
    );
  };

  const handleConfirmReservation = async (rental: Rental) => {
    setIsSaving(true);
    try {
      const vehicle = getVehicle(rental.vehicleId);
      
      // Check if vehicle is busy
      const isBusy = isVehicleBusyDuringPeriod(rental.vehicleId, rental.startDate, rental.endDate, rental.id);
      if (isBusy) {
        addNotification('error', 'Véhicule indisponible', 'Ce véhicule est déjà occupé sur cette période.');
        setIsSaving(false);
        return;
      }

      // Update the rental status
      await updateDoc(doc(db, 'rentals', rental.id), {
        status: 'reserved'
      });
      
      // Notify client
      const client = clients.find(c => c.id === rental.clientId);
      if (client?.authUid) {
        await addDoc(collection(db, 'notifications'), {
          userId: client.authUid,
          title: 'Réservation Confirmée',
          message: `Votre réservation pour le véhicule ${vehicle ? `${vehicle.brand} ${vehicle.model}` : 'demandé'} a été confirmée.`,
          type: 'success',
          timestamp: new Date().toISOString(),
          read: false,
          officeId: currentOffice?.id
        });
      }

      // Update vehicle status immediately if it's for today
      if (vehicle) {
        const today = format(new Date(), 'yyyy-MM-dd');
        if (today >= rental.startDate && today <= rental.endDate) {
          await updateDoc(doc(db, 'vehicles', vehicle.id), { status: 'reserved' });
        }
      }

      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'confirm_reservation', `Réservation confirmée pour ${rental.clientName || getClient(rental.clientId)?.name}`, auth.currentUser.displayName || undefined);
      }
      addNotification('success', 'Réservation confirmée', 'Le client a été notifié.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rentals/${rental.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const exportRentals = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Date,Client,Véhicule,Montant,Statut\n"
      + rentals.map(r => {
        const c = getClient(r.clientId);
        const v = getVehicle(r.vehicleId);
        return `${r.startDate},${c?.name},${v?.brand} ${v?.model},${r.totalAmount},${r.status}`;
      }).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `locations_dhokkar_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    const data = rentals.map(r => {
      const c = getClient(r.clientId);
      const v = getVehicle(r.vehicleId);
      return {
        'Date': r.startDate,
        'Client': c?.name || 'Inconnu',
        'Véhicule': `${v?.brand} ${v?.model}`,
        'Montant Total': r.totalAmount,
        'Montant Payé': r.paidAmount,
        'Reste': r.totalAmount - r.paidAmount,
        'Statut': r.status,
        'Paiement': r.paymentStatus
      };
    });
    exportToExcel(data, `rapport_locations_${format(new Date(), 'yyyy-MM-dd')}`);
  };

  const downloadPDF = async (rental: Rental, type: 'contract' | 'invoice') => {
    let client = getClient(rental.clientId);
    const vehicle = rental.vehicleId ? getVehicle(rental.vehicleId) : undefined;
    const secondDriver = rental.secondDriverId ? getClient(rental.secondDriverId) : undefined;
    
    // If client document not found, create a virtual client from denormalized data
    if (!client && rental.clientName) {
      client = {
        id: rental.clientId,
        name: rental.clientName,
        phone: rental.clientPhone || '',
        email: rental.clientEmail || '',
        address: '',
        city: '',
        customerType: 'individual',
        licenseNumber: '',
        licenseExpiry: '',
        category: 'regular',
        loyaltyPoints: 0,
        loyaltyStatus: 'bronze',
        officeId: rental.officeId
      } as Client;
    }
    
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

  const filteredRentals = rentals.filter(rental => {
    if (statusFilter !== 'all' && rental.status !== statusFilter) return false;
    const vehicle = getVehicle(rental.vehicleId || '');
    const client = getClient(rental.clientId);
    
    const matchesSearch = `${vehicle?.brand} ${vehicle?.model} ${client?.name || rental.clientName || ''} ${rental.clientPhone || ''} ${rental.clientEmail || ''}`.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesOwnership = ownershipFilter === 'all' || 
      (ownershipFilter === 'company' && vehicle && !vehicle.isSubcontracted) ||
      (ownershipFilter === 'subcontracted' && vehicle && vehicle.isSubcontracted);
    
    return matchesSearch && matchesOwnership;
  });

  const handleCloseModal = (closeFn: () => void) => {
    closeFn();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Locations</h2>
            <p className="text-stone-500 italic serif">Suivi des contrats et réservations en cours.</p>
          </div>
          <button 
            onClick={() => setIsHelpOpen(true)}
            className="p-2 bg-emerald-50 text-emerald-600 rounded-full hover:bg-emerald-100 transition-colors"
            title="Guide d'utilisation"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 px-6 rounded-2xl font-semibold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20"
        >
          <Plus className="w-5 h-5" />
          Nouvelle location
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-100 flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="text"
              placeholder="Rechercher une location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all"
            />
          </div>
          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-4 py-2 bg-stone-50 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Tous les statuts</option>
              <option value="pending_confirmation">En attente</option>
              <option value="reserved">Confirmées</option>
              <option value="active">Actives</option>
              <option value="completed">Terminées</option>
            </select>
            <select
              value={ownershipFilter}
              onChange={(e) => setOwnershipFilter(e.target.value as any)}
              className="px-4 py-2 bg-stone-50 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Tous les véhicules</option>
              <option value="company">Ma Société</option>
              <option value="subcontracted">Sous-traitance</option>
            </select>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-all"
            >
              <Download className="w-4 h-4" />
              Excel
            </button>
            <button
              onClick={exportRentals}
              className="flex items-center gap-2 bg-stone-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-stone-800 transition-all"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-stone-50/50 text-stone-400 text-xs font-bold uppercase tracking-widest">
                <th className="px-8 py-4">Client & Véhicule</th>
                <th className="px-8 py-4">Agent (Sortie)</th>
                <th className="px-8 py-4">Agent (Entrée)</th>
                <th className="px-8 py-4">Créé le</th>
                <th className="px-8 py-4">Période</th>
                <th className="px-8 py-4">Document</th>
                <th className="px-8 py-4">Paiement</th>
                <th className="px-8 py-4">Remise</th>
                <th className="px-8 py-4">Total</th>
                <th className="px-8 py-4">Reste</th>
                <th className="px-8 py-4">Statut</th>
                <th className="px-8 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredRentals.map((rental) => {
                const validStatuses = ['pending_confirmation', 'reserved', 'active', 'completed', 'cancelled'];
                const effectiveStatus = (rental.status && validStatuses.includes(rental.status)) 
                  ? rental.status 
                  : (
                    rental.documentType === 'quote' ? 'pending_confirmation' : 
                    rental.documentType === 'reservation' ? 'reserved' : 
                    (rental.actualEndDate ? 'completed' : 'active')
                  );

                return (
                <tr key={rental.id} className="hover:bg-stone-50/50 transition-all group">
                  <td className="px-8 py-5">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 mb-0.5">
                          <User className="w-3 h-3 text-emerald-600" />
                          <span className="font-bold text-stone-900">{formatClientName(rental.clientId, rental.clientName)}</span>
                          <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-bold uppercase">P1</span>
                          {rental.documentType === 'reservation' && (
                            <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1 border border-blue-100">
                              <Globe className="w-2.5 h-2.5" />
                              Site Web
                            </span>
                          )}
                          {(rental as any).isTransfer && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1">
                              <Plane className="w-2 h-2" />
                              Transfert
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-stone-400 ml-5">
                          <span>Tél: {getClient(rental.clientId)?.phone || rental.clientPhone || '-'}</span>
                          <span>Permis: {getClient(rental.clientId)?.licenseNumber || '-'}</span>
                        </div>
                      </div>
                      
                      {rental.secondDriverId && (
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2 mb-0.5">
                            <User className="w-3 h-3 text-emerald-600" />
                            <span className="text-sm font-medium text-stone-700">{getClient(rental.secondDriverId)?.name || 'Inconnu'}</span>
                            <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-bold uppercase">P2</span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-stone-400 ml-5">
                            <span>Tél: {getClient(rental.secondDriverId)?.phone}</span>
                            <span>Permis: {getClient(rental.secondDriverId)?.licenseNumber}</span>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 mt-1 border-t border-stone-100 pt-1">
                        <CarIcon className="w-3 h-3 text-stone-400" />
                        <span className="text-sm text-stone-500">
                          {getVehicle(rental.vehicleId)?.brand} {getVehicle(rental.vehicleId)?.model || 'Inconnu'}
                          {getVehicle(rental.vehicleId)?.color && (
                            <span className="ml-1 text-[10px] text-stone-400 italic">({getVehicle(rental.vehicleId)?.color})</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3 text-emerald-600" />
                      <span className="text-sm font-medium text-stone-900">{rental.checkedOutBy || rental.agentName || 'Inconnu'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3 text-emerald-600" />
                      <span className="text-sm font-medium text-stone-900">{rental.checkedInBy || '-'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    {rental.createdAt && (
                      <div className="flex items-center gap-2 text-xs text-stone-400">
                        <Clock className="w-3 h-3" />
                        <span>{format(new Date(rental.createdAt), 'dd/MM/yy HH:mm', { locale: fr })}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-sm text-stone-600">
                        <Calendar className="w-4 h-4 text-stone-400" />
                        <span>{format(new Date(rental.startDate), 'dd MMM', { locale: fr })} - {format(new Date(rental.endDate), 'dd MMM yyyy', { locale: fr })}</span>
                      </div>
                      {rental.lateHours && rental.lateHours > 0 && (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full w-fit">
                          <Clock className="w-3 h-3" />
                          Retard: {rental.lateHours}H
                        </div>
                      )}
                      {rental.status === 'active' && (
                        <div className={clsx(
                          "flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full w-fit",
                          new Date() > parseISO(`${rental.endDate}T${rental.endTime || '09:00'}:00`) 
                            ? "text-red-600 bg-red-50 border border-red-100 animate-pulse" 
                            : "text-amber-600 bg-amber-50"
                        )}>
                          <Clock className="w-3 h-3" />
                          {new Date() > parseISO(`${rental.endDate}T${rental.endTime || '09:00'}:00`) 
                            ? `Retard en cours: ${differenceInHours(new Date(), parseISO(`${rental.endDate}T${rental.endTime || '09:00'}:00`))}H` 
                            : `Retour prévu: ${format(new Date(rental.endDate), 'dd/MM/yyyy')}`}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md border ${
                      rental.documentType === 'quote' ? 'bg-stone-100 text-stone-600 border-stone-200' :
                      rental.documentType === 'reservation' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                      rental.documentType === 'credit_note' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                      'bg-emerald-50 text-emerald-700 border-emerald-100'
                    }`}>
                      {rental.documentType === 'quote' ? 'Devis' : 
                       rental.documentType === 'reservation' ? 'Réservation (Non facturée)' :
                       rental.documentType === 'credit_note' ? 'Avoir' : 'Facture'}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest bg-stone-100 px-2 py-1 rounded-md text-stone-600 w-fit">
                        {rental.paymentMethod}
                      </span>
                      <PaymentStatusBadge status={rental.paymentStatus} rental={rental} />
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    {rental.discountAmount ? (
                      <div className="flex flex-col">
                        <span className="font-bold text-emerald-600">
                          -{(rental.discountAmount || 0).toLocaleString()} {rental.discountType === 'percentage' ? '%' : 'TND'}
                        </span>
                        {rental.discountType === 'percentage' && (
                          <span className="text-[10px] text-emerald-500 font-medium">
                            ({((rental.dailyRate * rental.totalDays) * ((rental.discountAmount || 0) / 100)).toLocaleString()} TND)
                          </span>
                        )}
                        <span className="text-[10px] text-stone-400 uppercase tracking-tighter">
                          {rental.discountType === 'percentage' ? 'Pourcentage' : 'Fixe'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-stone-300">-</span>
                    )}
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col">
                      <p className="font-bold text-stone-900">{(rental.totalAmount || 0).toLocaleString()} TND</p>
                      <p className="text-[10px] text-stone-400 uppercase tracking-tighter">TTC</p>
                      <p className="text-[10px] text-stone-400">HT: {((rental.totalAmountHT || (rental.totalAmount / 1.19)) || 0).toFixed(3)}</p>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <p className={clsx(
                      "font-bold",
                      ((rental.totalAmount || 0) - (rental.paidAmount || 0)) > 0 ? "text-red-600" : "text-emerald-600"
                    )}>
                      {((rental.totalAmount || 0) - (rental.paidAmount || 0)).toLocaleString()} TND
                    </p>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col gap-1">
                      <RentalStatusBadge rental={rental} />
                      {rental.washStatus === 'dirty' && (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full w-fit border border-emerald-100">
                          <Droplets className="w-3 h-3" />
                          Lavage: {rental.washPrice?.toLocaleString() || 0} TND
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-2 transition-all">
                      <button 
                        onClick={() => downloadPDF(rental, 'contract')}
                        className="p-2 hover:bg-stone-100 text-stone-600 rounded-lg transition-all"
                        title="Télécharger Contrat"
                      >
                        <FileText className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => downloadPDF(rental, 'invoice')}
                        className="p-2 hover:bg-stone-100 text-stone-600 rounded-lg transition-all"
                        title="Télécharger Facture"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                      {effectiveStatus === 'pending_confirmation' && (
                        <button 
                          onClick={() => handleConfirmReservation(rental)}
                          className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                          title="Confirmer la réservation"
                        >
                          <CheckCircle className="w-5 h-5" />
                        </button>
                      )}
                      {effectiveStatus === 'reserved' && (
                        <button 
                          onClick={() => handleStartRental(rental)}
                          className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg transition-all shadow-sm font-bold text-[10px] uppercase tracking-wider h-9 hover:bg-emerald-500"
                          title="Démarrer la location (Départ véhicule)"
                        >
                          <Play className="w-4 h-4" />
                          <span>Démarrer</span>
                        </button>
                      )}
                      {effectiveStatus === 'active' && (
                        <button 
                          onClick={() => handleComplete(rental)}
                          className={clsx(
                            "flex items-center gap-2 px-3 py-2 rounded-lg transition-all shadow-sm font-bold text-[10px] uppercase tracking-wider h-9",
                            new Date() > parseISO(`${rental.endDate}T${rental.endTime || '09:00'}:00`)
                              ? "bg-red-100 text-red-700 hover:bg-red-200 border border-red-200 animate-pulse min-w-[100px]"
                              : "bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-500/20"
                          )}
                          title={new Date() > parseISO(`${rental.endDate}T${rental.endTime || '09:00'}:00`) ? "Clôturer (RETARD DÉTECTÉ)" : "Clôturer la location (Retour véhicule)"}
                        >
                          <CheckCircle className="w-4 h-4 shrink-0" />
                          <span>Clôturer</span>
                        </button>
                      )}
                      <button 
                        onClick={() => handlePrintReceipt(rental)}
                        className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all border border-transparent hover:border-emerald-100"
                        title="Voir le reçu"
                      >
                        <Printer className="w-5 h-5" />
                      </button>
                      {rental.paymentStatus !== 'paid' && (
                        <button 
                          onClick={() => setPaymentRental(rental)}
                          className="p-2 hover:bg-amber-50 text-amber-600 rounded-lg transition-all"
                          title="Enregistrer un paiement"
                        >
                          <CreditCard className="w-5 h-5" />
                        </button>
                      )}
                      {effectiveStatus === 'active' && (
                        <button 
                          onClick={() => setSwapRental(rental)}
                          className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                          title="Échanger le véhicule"
                        >
                          <RefreshCw className="w-5 h-5" />
                        </button>
                      )}
                      {rental.status === 'active' && (
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => setExtensionRental(rental)}
                            className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all bg-emerald-50/50"
                            title="Prolonger la location"
                          >
                            <RefreshCw className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => setExtensionHistoryRental(rental)}
                            className="p-2 hover:bg-stone-100 text-stone-600 rounded-lg transition-all"
                            title="Historique prolongations"
                          >
                            <LucideHistory className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => setCutRental(rental)}
                            className="p-2 hover:bg-orange-50 text-orange-600 rounded-lg transition-all"
                            title="Coupure de location"
                          >
                            <Scissors className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                      <button 
                        onClick={() => { setEditingRental(rental); setIsModalOpen(true); }}
                        className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                        title="Modifier"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setDeleteModal({ isOpen: true, rental })}
                        className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-all"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <RentalModal 
          isOpen={isModalOpen} 
          onClose={() => { setIsModalOpen(false); setEditingRental(null); }} 
          onCloseWithConfirm={() => handleCloseModal(() => { setIsModalOpen(false); setEditingRental(null); })}
          vehicles={vehicles}
          clients={clients}
          rentals={rentals}
          rental={editingRental}
        />
      )}

      {paymentRental && (
        <PaymentModal
          rental={paymentRental}
          isSaving={isSaving}
          onClose={() => setPaymentRental(null)}
          onConfirm={(amount, method) => handleUpdatePayment(paymentRental, amount, method)}
        />
      )}

      {extensionRental && (
        <RentalExtensionModal
          rental={extensionRental}
          isSaving={isSaving}
          onClose={() => setExtensionRental(null)}
          onConfirm={async (data) => {
            setIsSaving(true);
            try {
              const rental = extensionRental;
              const newExtension = {
                id: Math.random().toString(36).substr(2, 9),
                previousEndDate: rental.endDate,
                newEndDate: data.newEndDate,
                newEndTime: data.newEndTime,
                extensionDays: data.extensionDays,
                pricePerDay: data.pricePerDay,
                totalExtensionAmount: data.totalAmount,
                paidAmount: data.paidAmount,
                paymentMethod: data.paymentMethod,
                date: new Date().toISOString(),
                agentName: auth.currentUser?.displayName || 'Agent'
              };

              const updatedExtensions = [...(rental.extensions || []), newExtension];
              const updatedTotalAmount = (rental.totalAmount || 0) + data.totalAmount;
              const updatedPaidAmount = (rental.paidAmount || 0) + data.paidAmount;
              const updatedPaymentStatus = updatedPaidAmount >= updatedTotalAmount ? 'paid' : (updatedPaidAmount > 0 ? 'partial' : 'pending');

              await updateDoc(doc(db, 'rentals', rental.id), {
                endDate: data.newEndDate,
                endTime: data.newEndTime,
                totalAmount: updatedTotalAmount,
                paidAmount: updatedPaidAmount,
                paymentStatus: updatedPaymentStatus,
                extensions: updatedExtensions,
                updatedAt: new Date().toISOString()
              });

              if (auth.currentUser) {
                logActivity(auth.currentUser.uid, 'extend_rental', `Location prolongée jusqu'au ${data.newEndDate} (+${data.extensionDays}j) pour ${rental.contractNumber}`, auth.currentUser.displayName || undefined);
              }
              addNotification('success', 'Location prolongée', `Le contrat a été prolongé de ${data.extensionDays} jours.`);
              setExtensionRental(null);
            } catch (error) {
              handleFirestoreError(error, OperationType.UPDATE, `rentals/${extensionRental.id}`);
            } finally {
              setIsSaving(false);
            }
          }}
        />
      )}

      {extensionHistoryRental && (
        <ExtensionHistoryModal
          rental={extensionHistoryRental}
          onClose={() => setExtensionHistoryRental(null)}
        />
      )}

      {closureRental && (
        <RentalClosureModal
          rental={closureRental}
          vehicle={getVehicle(closureRental.vehicleId)}
          isSaving={isSaving}
          onClose={() => setClosureRental(null)}
          onConfirm={(data) => handleConfirmClosure(closureRental.id, closureRental.vehicleId, data)}
        />
      )}

      {cutRental && (
        <RentalCutModal
          rental={cutRental}
          isSaving={isSaving}
          onClose={() => setCutRental(null)}
          onConfirm={(data) => handleConfirmCut(cutRental, data)}
        />
      )}

      {swapRental && (
        <VehicleSwapModal
          rental={swapRental}
          currentVehicle={getVehicle(swapRental.vehicleId)}
          availableVehicles={vehicles.filter(v => v.status === 'available')}
          isSaving={isSaving}
          onClose={() => setSwapRental(null)}
          onConfirm={(data) => handleConfirmSwap(swapRental.id, swapRental.vehicleId!, data)}
        />
      )}

      {selectedRentalForReceipt && (
        <Receipt 
          rental={selectedRentalForReceipt.rental}
          vehicle={selectedRentalForReceipt.vehicle}
          client={selectedRentalForReceipt.client}
          secondDriver={selectedRentalForReceipt.secondDriver}
          onClose={() => setSelectedRentalForReceipt(null)}
        />
      )}

      {isHelpOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-stone-100 flex items-center justify-between bg-emerald-600 text-white">
              <div className="flex items-center gap-3">
                <Info className="w-6 h-6" />
                <h3 className="text-xl font-bold">Guide: Locations & Réservations</h3>
              </div>
              <button onClick={() => setIsHelpOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-8 space-y-4 text-stone-600">
              <div className="space-y-2">
                <p className="font-bold text-stone-900">1. Création de Contrat</p>
                <p className="text-sm">Cliquez sur "Nouvelle Location" pour créer un contrat. Vous pouvez choisir entre Facture, Devis ou Réservation.</p>
              </div>
              <div className="space-y-2">
                <p className="font-bold text-stone-900">2. Gestion des Paiements</p>
                <p className="text-sm">Les paiements sont suivis dans l'onglet "Comptabilité". Un contrat peut être payé totalement, partiellement ou rester impayé.</p>
              </div>
              <div className="space-y-2">
                <p className="font-bold text-stone-900">3. Documents</p>
                <p className="text-sm">Vous pouvez imprimer le contrat ou la facture à tout moment via les boutons d'action.</p>
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

      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, rental: null })}
        onConfirm={() => deleteModal.rental && handleDelete(deleteModal.rental)}
        title="Supprimer la location"
        message="Êtes-vous sûr de vouloir supprimer cette location ? Cette action est irréversible et supprimera tout l'historique de paiement associé."
      />
    </div>
  );
}

function RentalStatusBadge({ rental }: { rental: Rental }) {
  const validStatuses = ['pending_confirmation', 'reserved', 'active', 'completed', 'cancelled'];
  const effectiveStatus = (rental.status && validStatuses.includes(rental.status)) 
    ? rental.status 
    : (
      rental.documentType === 'quote' ? 'pending_confirmation' : 
      rental.documentType === 'reservation' ? 'reserved' : 
      (rental.actualEndDate ? 'completed' : 'active')
    );

  const getStyle = () => {
    switch (effectiveStatus) {
      case 'pending_confirmation': return "bg-amber-50 text-amber-700 border-amber-100";
      case 'reserved': return "bg-blue-50 text-blue-700 border-blue-100";
      case 'active': return "bg-emerald-50 text-emerald-700 border-emerald-100";
      case 'completed': return "bg-stone-50 text-stone-700 border-stone-100";
      case 'cancelled': return "bg-red-50 text-red-700 border-red-100";
      default: return "bg-stone-50 text-stone-700 border-stone-100";
    }
  };

  const getLabel = () => {
    switch (effectiveStatus) {
      case 'pending_confirmation': return "En attente";
      case 'reserved': return "Confirmée";
      case 'active': return "En cours";
      case 'completed': return "Terminée";
      case 'cancelled': return "Annulée";
      default: return "En cours";
    }
  };

  const getIcon = () => {
    switch (effectiveStatus) {
      case 'pending_confirmation': return Clock;
      case 'reserved': return Calendar;
      case 'active': return Clock;
      case 'completed': return CheckCircle;
      case 'cancelled': return XCircle;
      default: return Clock;
    }
  };

  const Icon = getIcon();

  return (
    <span className={clsx("px-3 py-1 rounded-full text-[10px] font-bold border flex items-center gap-1.5 w-fit uppercase tracking-wider", getStyle())}>
      {Icon && <Icon className="w-3 h-3" />}
      {getLabel()}
    </span>
  );
}

function PaymentStatusBadge({ status, rental }: { status: Rental['paymentStatus'], rental?: Rental }) {
  const effectiveStatus = status || (
    rental ? (
      (rental.paidAmount || 0) >= (rental.totalAmount || 0) ? 'paid' : 
      ((rental.paidAmount || 0) > 0 ? 'partial' : 'pending')
    ) : 'pending'
  );

  const getStyle = () => {
    switch (effectiveStatus) {
      case 'paid': return "bg-emerald-50 text-emerald-700 border-emerald-100";
      case 'partial': return "bg-amber-50 text-amber-700 border-amber-100";
      case 'pending': return "bg-red-50 text-red-700 border-red-100";
      default: return "bg-stone-50 text-stone-700 border-stone-100";
    }
  };

  const getLabel = () => {
    switch (effectiveStatus) {
      case 'paid': return "Payé";
      case 'partial': return "Partiel";
      case 'pending': return "Impayé";
      default: return "Impayé";
    }
  };

  const getIcon = () => {
    switch (effectiveStatus) {
      case 'paid': return CheckCircle;
      case 'partial': return Clock;
      case 'pending': return AlertTriangle;
      default: return AlertTriangle;
    }
  };

  const Icon = getIcon();
  
  return (
    <span className={clsx("px-2 py-0.5 rounded-full text-[10px] font-bold border w-fit flex items-center gap-1", getStyle())}>
      {Icon && <Icon className="w-3 h-3" />}
      {getLabel()}
    </span>
  );
}

export function RentalModal({ isOpen, onClose, onCloseWithConfirm, vehicles, clients, rentals, rental }: { isOpen: boolean, onClose: () => void, onCloseWithConfirm?: () => void, vehicles: Vehicle[], clients: Client[], rentals: Rental[], rental?: Rental | null }) {
  const { addNotification } = useNotifications();
  const { currentOffice } = useOffice();
  const [isSaving, setIsSaving] = useState(false);
  const initialVehicle = vehicles.find(v => v.id === (rental?.vehicleId || ''));

  const handleClose = () => {
    if (onCloseWithConfirm) {
      onCloseWithConfirm();
    } else {
      onClose();
    }
  };

  const [formData, setFormData] = useState({
    contractNumber: rental?.contractNumber || '',
    vehicleId: rental?.vehicleId || '',
    clientId: rental?.clientId || '',
    clientName: rental?.clientName || '',
    clientPhone: rental?.clientPhone || '',
    clientEmail: rental?.clientEmail || '',
    secondDriverId: rental?.secondDriverId || '',
    startDate: rental?.startDate || format(new Date(), 'yyyy-MM-dd'),
    endDate: rental?.endDate || format(new Date(Date.now() + 86400000), 'yyyy-MM-dd'),
    pickupLocation: rental?.pickupLocation || 'Agence',
    returnLocation: rental?.returnLocation || 'Agence',
    depositAmount: rental?.depositAmount || 500,
    paymentMethod: rental?.paymentMethod || 'cash' as PaymentMethod,
    documentType: rental?.documentType || 'invoice' as Rental['documentType'],
    paymentStatus: rental?.paymentStatus || 'pending' as Rental['paymentStatus'],
    paidAmount: rental?.paidAmount || 0,
    taxRate: rental?.taxRate || 19,
    checkedOutBy: rental?.checkedOutBy || auth.currentUser?.displayName || '',
    manualTotalAmount: rental?.totalAmount || 0,
    dailyRate: rental?.dailyRate || initialVehicle?.pricePerDay || 0,
    departureMileage: rental?.departureMileage || initialVehicle?.mileage || 0,
    startTime: rental?.startTime || '09:00',
    endTime: rental?.endTime || '09:00',
    withChauffeur: rental?.withChauffeur || false,
    chauffeurPrice: rental?.chauffeurPrice || 0,
    discountAmount: rental?.discountAmount || 0,
    discountType: rental?.discountType || 'fixed' as 'percentage' | 'fixed',
    fuelLevel: rental?.fuelLevel || 100,
    washStatus: rental?.washStatus || 'clean' as 'clean' | 'dirty',
    contractPhoto: rental?.contractPhoto || '',
    clientDocs: rental?.clientDocs || {
      cinRecto: '',
      cinVerso: '',
      licenseRecto: '',
      licenseVerso: ''
    },
    vehiclePhotos: rental?.vehiclePhotos || {
      front: '',
      back: '',
      left: '',
      right: ''
    }
  });

  const [clientSearch, setClientSearch] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [activeSection, setActiveSection] = useState<'info' | 'period' | 'photos'>('info');

  const filteredClientsForSelect = clients.filter(c => 
    (c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.phone.includes(clientSearch)) && !c.isBlocked
  );

  const filteredVehiclesForSelect = vehicles.filter(v => 
    `${v.brand} ${v.model} ${v.plate}`.toLowerCase().includes(vehicleSearch.toLowerCase())
  );
  
  // Update dailyRate if vehicle changes and it's a new rental or dailyRate was 0
  const selectedVehicle = vehicles.find(v => v.id === formData.vehicleId);

  useEffect(() => {
    if (selectedVehicle && (!rental || formData.dailyRate === 0)) {
      setFormData(prev => ({ ...prev, dailyRate: selectedVehicle.pricePerDay }));
    }
  }, [formData.vehicleId, selectedVehicle]);

  const days = differenceInDays(new Date(formData.endDate), new Date(formData.startDate)) || 1;
  
  // Calculate subtotal based on dailyRate and days
  const subtotal = (formData.dailyRate * days) + (formData.withChauffeur ? (formData.chauffeurPrice * days) : 0);
  
  // Calculate discount
  const discount = formData.discountType === 'percentage' 
    ? (subtotal * (formData.discountAmount / 100)) 
    : formData.discountAmount;
    
  const amountAfterDiscount = subtotal - discount;
  
  // Calculate total (dailyRate is already TTC)
  const calculatedTotalAmount = amountAfterDiscount;

  const isVehicleBusyDuringPeriod = (vId: string, start: string, end: string, excludeId?: string) => {
    return rentals.some(r => 
      r.vehicleId === vId && 
      r.id !== excludeId &&
      r.status !== 'completed' &&
      r.status !== 'cancelled' &&
      ((start >= r.startDate && start <= r.endDate) || 
       (end >= r.startDate && end <= r.endDate) ||
       (start <= r.startDate && end >= r.endDate))
    );
  };

  const isCurrentPeriod = (start: string, end: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return today >= start && today <= end;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.clientId) {
      addNotification('error', 'Validation', 'Veuillez sélectionner un client.');
      return;
    }
    
    if (formData.documentType !== 'reservation' && !formData.vehicleId) {
      addNotification('error', 'Validation', 'Veuillez sélectionner un véhicule.');
      return;
    }

    // Overlap check
    if (formData.vehicleId) {
      const isBusy = isVehicleBusyDuringPeriod(formData.vehicleId, formData.startDate, formData.endDate, rental?.id);
      if (isBusy) {
        addNotification('error', 'Doublage de réservation', 'Ce véhicule est déjà réservé ou loué pour la période sélectionnée.');
        return;
      }
    }

    // Contract number duplicate check
    if (formData.contractNumber) {
      const duplicateContract = rentals.find(r => r.contractNumber === formData.contractNumber && r.id !== rental?.id);
      if (duplicateContract) {
        addNotification('error', 'Doublage de document', `Le numéro de contrat/devis "${formData.contractNumber}" est déjà utilisé.`);
        return;
      }
    }

    const finalTotalAmount = formData.vehicleId ? calculatedTotalAmount : formData.manualTotalAmount;
    const totalAmountHT = finalTotalAmount / 1.19;
    const vatAmount = finalTotalAmount - totalAmountHT;

    setIsSaving(true);
    try {
      const startDate = formData.startDate; // Use local const for generation
      
      let generatedContractNumber = formData.contractNumber;
      if (!generatedContractNumber) {
        const prefix = formData.documentType === 'quote' ? 'DEV' : (formData.documentType === 'reservation' ? 'RES' : 'CON');
        const year = new Date().getFullYear();
        const count = rentals.filter(r => r.createdAt && new Date(r.createdAt).getFullYear() === year).length + 1;
        const number = count.toString().padStart(4, '0');
        generatedContractNumber = `${prefix}-${year}-${number}`;
      }

      if (rental) {
        // Update existing rental
        await updateDoc(doc(db, 'rentals', rental.id), {
          ...formData,
          clientId: formData.clientId || null,
          vehicleId: formData.vehicleId || null,
          contractNumber: generatedContractNumber,
          subtotal,
          totalDays: days,
          taxAmount: vatAmount,
          totalAmountHT,
          vatAmount,
          totalAmountTTC: finalTotalAmount,
          totalAmount: finalTotalAmount,
          status: formData.documentType === 'quote' ? 'pending_confirmation' : (formData.documentType === 'reservation' ? 'reserved' : 'active'),
          paymentStatus: formData.documentType === 'quote' ? 'pending' : (formData.paidAmount >= finalTotalAmount ? 'paid' : (formData.paidAmount > 0 ? 'partial' : 'pending'))
        });
        
        // Handle vehicle status changes
        if (formData.vehicleId && rental.vehicleId !== formData.vehicleId) {
          // Vehicle changed or added
          if (rental.vehicleId) {
            await updateDoc(doc(db, 'vehicles', rental.vehicleId), { status: 'available' });
          }
          
          if (isCurrentPeriod(formData.startDate, formData.endDate)) {
            const newStatus = (formData.documentType === 'quote' || formData.documentType === 'reservation') ? 'reserved' : 'rented';
            await updateDoc(doc(db, 'vehicles', formData.vehicleId), { status: newStatus });
          }
        } else if (!formData.vehicleId && rental.vehicleId) {
          // Vehicle removed
          await updateDoc(doc(db, 'vehicles', rental.vehicleId), { status: 'available' });
        } else if (formData.vehicleId) {
          // Same vehicle: check if documentType changed status AND if it's current
          const oldIsReserved = rental.documentType === 'quote' || rental.documentType === 'reservation';
          const newIsReserved = formData.documentType === 'quote' || formData.documentType === 'reservation';
          
          if (isCurrentPeriod(formData.startDate, formData.endDate)) {
            if (oldIsReserved && !newIsReserved) {
              await updateDoc(doc(db, 'vehicles', formData.vehicleId), { status: 'rented' });
            } else if (!oldIsReserved && newIsReserved) {
              await updateDoc(doc(db, 'vehicles', formData.vehicleId), { status: 'reserved' });
            }
          } else {
            // Not current period anymore (maybe dates changed)
            await updateDoc(doc(db, 'vehicles', formData.vehicleId), { status: 'available' });
          }
        }
        
        if (auth.currentUser) {
          const client = clients.find(c => c.id === formData.clientId);
          const clientName = client?.name || formData.clientName;
          logActivity(auth.currentUser.uid, 'edit_rental', `Location modifiée pour ${clientName}`, auth.currentUser.displayName || undefined);

          // Add notification for the customer if they have an account
          if (client?.authUid) {
            await addDoc(collection(db, 'notifications'), {
              userId: client.authUid,
              title: 'Mise à jour de votre dossier',
              message: `Votre document (${formData.documentType}) a été mis à jour par l'agence.`,
              type: 'info',
              timestamp: new Date().toISOString(),
              read: false,
              officeId: currentOffice?.id
            });
          }
        }
      } else {
        // Create new rental
        const startDate = formData.startDate; 
        
        let generatedContractNumber = formData.contractNumber;
        if (!generatedContractNumber) {
          const prefix = formData.documentType === 'quote' ? 'DEV' : (formData.documentType === 'reservation' ? 'RES' : 'CON');
          const year = new Date().getFullYear();
          const count = rentals.filter(r => r.createdAt && new Date(r.createdAt).getFullYear() === year).length + 1;
          const number = count.toString().padStart(4, '0');
          generatedContractNumber = `${prefix}-${year}-${number}`;
        }

        const docRef = await addDoc(collection(db, 'rentals'), {
          ...formData,
          clientId: formData.clientId || null,
          vehicleId: formData.vehicleId || null,
          contractNumber: generatedContractNumber,
          subtotal,
          totalDays: days,
          taxAmount: vatAmount,
          totalAmountHT,
          vatAmount,
          totalAmountTTC: finalTotalAmount,
          totalAmount: finalTotalAmount,
          userId: auth.currentUser?.uid || '',
          agentName: auth.currentUser?.displayName || null,
          checkedOutBy: auth.currentUser?.displayName || null,
          status: formData.documentType === 'quote' ? 'pending_confirmation' : (formData.documentType === 'reservation' ? 'reserved' : 'active'),
          paymentStatus: formData.documentType === 'quote' ? 'pending' : (formData.paidAmount >= finalTotalAmount ? 'paid' : (formData.paidAmount > 0 ? 'partial' : 'pending')),
          createdAt: new Date().toISOString(),
          officeId: currentOffice?.id
        });
        
        // Add automatic notification for admins
        const client = clients.find(c => c.id === formData.clientId);
        const clientName = client?.name || formData.clientName;
        const vehicle = vehicles.find(v => v.id === formData.vehicleId);
        
        await addDoc(collection(db, 'notifications'), {
          title: formData.documentType === 'quote' ? 'Nouveau Devis' : (formData.documentType === 'reservation' ? 'Nouvelle Réservation' : 'Nouvelle Location'),
          message: `${clientName} a ${formData.documentType === 'quote' ? 'demandé un devis pour' : (formData.documentType === 'reservation' ? 'réservé' : 'loué')} ${vehicle ? `le véhicule ${vehicle.brand} ${vehicle.model}` : 'un service'}`,
          type: 'info',
          timestamp: new Date().toISOString(),
          read: false,
          isManual: false,
          officeId: currentOffice?.id
        });

        // Add notification for the customer if they have an account
        if (client?.authUid) {
          await addDoc(collection(db, 'notifications'), {
            userId: client.authUid,
            title: formData.documentType === 'quote' ? 'Votre Devis' : (formData.documentType === 'reservation' ? 'Votre Réservation' : 'Votre Contrat de Location'),
            message: `Un nouveau document (${formData.documentType}) a été créé pour votre dossier concernant le véhicule ${vehicle ? `${vehicle.brand} ${vehicle.model}` : 'loué'}.`,
            type: 'success',
            timestamp: new Date().toISOString(),
            read: false,
            officeId: currentOffice?.id
          });
        }

        // Set vehicle status if selected and period includes today
        if (formData.vehicleId && isCurrentPeriod(formData.startDate, formData.endDate)) {
          const vehicleStatus = (formData.documentType === 'quote' || formData.documentType === 'reservation') ? 'reserved' : 'rented';
          await updateDoc(doc(db, 'vehicles', formData.vehicleId), { status: vehicleStatus });
        }

        if (auth.currentUser) {
          logActivity(auth.currentUser.uid, 'add_rental', `Nouvelle location créée pour ${clientName}`, auth.currentUser.displayName || undefined);
        }
      }
      onClose();
    } catch (error) {
      handleFirestoreError(error, rental ? OperationType.UPDATE : OperationType.CREATE, 'rentals');
    } finally {
      setIsSaving(false);
    }
  };

  const generateContractNumber = () => {
    const prefix = formData.documentType === 'quote' ? 'DEV' : (formData.documentType === 'reservation' ? 'RES' : 'CON');
    const year = new Date().getFullYear();
    const count = rentals.filter(r => r.createdAt && new Date(r.createdAt).getFullYear() === year).length + 1;
    const number = count.toString().padStart(4, '0');
    setFormData({ ...formData, contractNumber: `${prefix}-${year}-${number}` });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200 resizable-modal" onClick={e => e.stopPropagation()}>
        <div className="p-8 border-b border-stone-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-2xl font-bold text-stone-900">{rental ? 'Modifier la Location' : 'Nouvelle Location'}</h3>
            <div className="flex gap-4 mt-2">
              <button 
                type="button"
                onClick={() => setActiveSection('info')}
                className={clsx("text-xs font-bold uppercase tracking-widest pb-1 border-b-2 transition-all", activeSection === 'info' ? "border-emerald-500 text-emerald-600" : "border-transparent text-stone-400")}
              >
                Informations
              </button>
              <button 
                type="button"
                onClick={() => setActiveSection('period')}
                className={clsx("text-xs font-bold uppercase tracking-widest pb-1 border-b-2 transition-all", activeSection === 'period' ? "border-emerald-500 text-emerald-600" : "border-transparent text-stone-400")}
              >
                Période & Tarifs
              </button>
              <button 
                type="button"
                onClick={() => setActiveSection('photos')}
                className={clsx("text-xs font-bold uppercase tracking-widest pb-1 border-b-2 transition-all", activeSection === 'photos' ? "border-emerald-500 text-emerald-600" : "border-transparent text-stone-400")}
              >
                Photos
              </button>
              <button 
                type="button"
                onClick={() => setActiveSection('documents' as any)}
                className={clsx("text-xs font-bold uppercase tracking-widest pb-1 border-b-2 transition-all", activeSection === ('documents' as any) ? "border-emerald-500 text-emerald-600" : "border-transparent text-stone-400")}
              >
                Documents Client
              </button>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 overflow-y-auto flex-1">
            {activeSection === 'info' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">N° de Document / Contrat</label>
                  <div className="flex gap-2">
                    <input
                      required
                      placeholder="Ex: CON-2024-001"
                      value={formData.contractNumber}
                      onChange={(e) => setFormData({...formData, contractNumber: e.target.value})}
                      className="flex-1 px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={generateContractNumber}
                      className="px-4 py-2 bg-stone-100 text-stone-600 rounded-xl hover:bg-stone-200 transition-all text-xs font-bold"
                    >
                      Auto
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Client</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-stone-400" />
                    <input 
                      type="text"
                      placeholder="Rechercher un client..."
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-100 rounded-xl text-sm mb-2"
                    />
                    <select
                      required
                      value={formData.clientId}
                      onChange={(e) => {
                        const client = clients.find(c => c.id === e.target.value);
                        setFormData({
                          ...formData, 
                          clientId: e.target.value,
                          clientName: client?.name || formData.clientName,
                          clientPhone: client?.phone || formData.clientPhone,
                          clientEmail: client?.email || formData.clientEmail
                        });
                      }}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Sélectionner le conducteur principal</option>
                      {filteredClientsForSelect.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Denormalized Client Info (Visible if no client doc or for web bookings) */}
                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100 space-y-4">
                  <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Coordonnées Client (Auto-rempli)</h4>
                  <div className="grid grid-cols-1 gap-4">
                    <input
                      placeholder="Nom complet"
                      value={formData.clientName}
                      onChange={(e) => setFormData({...formData, clientName: e.target.value})}
                      className="w-full px-4 py-2 bg-white border border-stone-100 rounded-xl text-sm"
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <input
                        placeholder="Téléphone"
                        value={formData.clientPhone}
                        onChange={(e) => setFormData({...formData, clientPhone: e.target.value})}
                        className="w-full px-4 py-2 bg-white border border-stone-100 rounded-xl text-sm"
                      />
                      <input
                        placeholder="Email"
                        value={formData.clientEmail}
                        onChange={(e) => setFormData({...formData, clientEmail: e.target.value})}
                        className="w-full px-4 py-2 bg-white border border-stone-100 rounded-xl text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">2ème Conducteur (Optionnel)</label>
                  <select
                    value={formData.secondDriverId}
                    onChange={(e) => setFormData({...formData, secondDriverId: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Aucun conducteur additionnel</option>
                    {filteredClientsForSelect.filter(c => c.id !== formData.clientId).map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Véhicule {formData.documentType !== 'reservation' && <span className="text-red-500">*</span>}</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-stone-400" />
                    <input 
                      type="text"
                      placeholder="Rechercher un véhicule..."
                      value={vehicleSearch}
                      onChange={(e) => setVehicleSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-100 rounded-xl text-sm mb-2"
                    />
                    <select
                      required={formData.documentType !== 'reservation'}
                      value={formData.vehicleId}
                      onChange={(e) => {
                        const v = vehicles.find(veh => veh.id === e.target.value);
                        setFormData({
                          ...formData, 
                          vehicleId: e.target.value,
                          dailyRate: v?.pricePerDay || formData.dailyRate,
                          departureMileage: v?.mileage || formData.departureMileage
                        });
                      }}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">{formData.documentType === 'reservation' ? 'Aucun véhicule (Optionnel)' : 'Sélectionner un véhicule'}</option>
                      {filteredVehiclesForSelect.map(v => {
                        const isBusy = isVehicleBusyDuringPeriod(v.id, formData.startDate, formData.endDate, rental?.id);
                        return (
                          <option key={v.id} value={v.id} disabled={isBusy && v.id !== rental?.vehicleId}>
                            {v.brand} {v.model} ({v.plate}) - {v.pricePerDay} TND/j
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Type de Document</label>
                  <select
                    required
                    value={formData.documentType}
                    onChange={(e) => {
                      const newType = e.target.value as any;
                      setFormData({
                        ...formData, 
                        documentType: newType,
                        paidAmount: newType === 'quote' ? 0 : formData.paidAmount,
                        paymentStatus: newType === 'quote' ? 'pending' : formData.paymentStatus
                      });
                    }}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="invoice">Facture</option>
                    <option value="quote">Devis</option>
                    <option value="reservation">Réservation</option>
                    <option value="credit_note">Avoir</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Agent (Sortie)</label>
                  <input
                    type="text"
                    required
                    value={formData.checkedOutBy}
                    onChange={(e) => setFormData({...formData, checkedOutBy: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Niveau de Carburant (%)</label>
                  <select
                    value={formData.fuelLevel}
                    onChange={(e) => setFormData({...formData, fuelLevel: Number(e.target.value)})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value={0}>0% (Vide)</option>
                    <option value={12.5}>1/8 (12.5%)</option>
                    <option value={25}>1/4 (25%)</option>
                    <option value={37.5}>3/8 (37.5%)</option>
                    <option value={50}>1/2 (50%)</option>
                    <option value={62.5}>5/8 (62.5%)</option>
                    <option value={75}>3/4 (75%)</option>
                    <option value={87.5}>7/8 (87.5%)</option>
                    <option value={100}>100% (Plein)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">État de Lavage (Départ)</label>
                  <select
                    value={formData.washStatus}
                    onChange={(e) => setFormData({...formData, washStatus: e.target.value as any})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="clean">Propre</option>
                    <option value="dirty">Sale</option>
                  </select>
                </div>
              </div>
            )}

            {activeSection === 'period' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Début</label>
                    <input
                      type="date"
                      required
                      value={formData.startDate}
                      onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Heure Début</label>
                    <input
                      type="time"
                      required
                      value={formData.startTime}
                      onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Fin</label>
                    <input
                      type="date"
                      required
                      value={formData.endDate}
                      onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Heure Fin</label>
                    <input
                      type="time"
                      required
                      value={formData.endTime}
                      onChange={(e) => setFormData({...formData, endTime: e.target.value})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Lieu de départ</label>
                    <input
                      type="text"
                      value={formData.pickupLocation}
                      onChange={(e) => setFormData({...formData, pickupLocation: e.target.value})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Lieu de retour</label>
                    <input
                      type="text"
                      value={formData.returnLocation}
                      onChange={(e) => setFormData({...formData, returnLocation: e.target.value})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Prix Journalier (TND)</label>
                    <input
                      type="number"
                      required
                      value={formData.dailyRate}
                      onChange={(e) => setFormData({...formData, dailyRate: Number(e.target.value)})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Caution (TND)</label>
                    <input
                      type="number"
                      value={formData.depositAmount}
                      onChange={(e) => setFormData({...formData, depositAmount: Number(e.target.value)})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-emerald-800 uppercase tracking-widest">Avec Chauffeur</label>
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, withChauffeur: !formData.withChauffeur})}
                      className={clsx(
                        "w-12 h-6 rounded-full transition-all relative",
                        formData.withChauffeur ? "bg-emerald-600" : "bg-stone-300"
                      )}
                    >
                      <div className={clsx(
                        "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                        formData.withChauffeur ? "left-7" : "left-1"
                      )} />
                    </button>
                  </div>
                  {formData.withChauffeur && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Prix Chauffeur / Jour (TND)</label>
                      <input
                        type="number"
                        value={formData.chauffeurPrice}
                        onChange={(e) => setFormData({...formData, chauffeurPrice: Number(e.target.value)})}
                        className="w-full px-4 py-2 bg-white border border-emerald-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                        placeholder="Ex: 50"
                      />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Remise</label>
                    <input
                      type="number"
                      value={formData.discountAmount}
                      onChange={(e) => setFormData({...formData, discountAmount: Number(e.target.value)})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Type Remise</label>
                    <select
                      value={formData.discountType}
                      onChange={(e) => setFormData({...formData, discountType: e.target.value as any})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="fixed">Fixe (TND)</option>
                      <option value="percentage">Pourcentage (%)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'photos' && (
              <div className="space-y-6 col-span-full">
                <div className="bg-stone-50 p-6 rounded-3xl border border-stone-100">
                  <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">Photos du véhicule (État des lieux)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <ImageUpload 
                      label="Avant" 
                      value={formData.vehiclePhotos.front} 
                      onChange={(val) => setFormData({...formData, vehiclePhotos: {...formData.vehiclePhotos, front: val}})} 
                    />
                    <ImageUpload 
                      label="Arrière" 
                      value={formData.vehiclePhotos.back} 
                      onChange={(val) => setFormData({...formData, vehiclePhotos: {...formData.vehiclePhotos, back: val}})} 
                    />
                    <ImageUpload 
                      label="Gauche" 
                      value={formData.vehiclePhotos.left} 
                      onChange={(val) => setFormData({...formData, vehiclePhotos: {...formData.vehiclePhotos, left: val}})} 
                    />
                    <ImageUpload 
                      label="Droite" 
                      value={formData.vehiclePhotos.right} 
                      onChange={(val) => setFormData({...formData, vehiclePhotos: {...formData.vehiclePhotos, right: val}})} 
                    />
                  </div>
                </div>
                <div className="bg-stone-50 p-6 rounded-3xl border border-stone-100">
                  <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">Documents du contrat</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <ImageUpload 
                      label="Contrat Signé" 
                      value={(formData as any).contractPhoto} 
                      onChange={(val) => setFormData({...formData, contractPhoto: val} as any)} 
                    />
                  </div>
                </div>
                <div className="bg-stone-50 p-6 rounded-3xl border border-stone-100">
                  <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">Papiers du client</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <ImageUpload 
                      label="CIN/Passport (Recto)" 
                      value={formData.clientDocs?.cinRecto} 
                      onChange={(val) => setFormData({...formData, clientDocs: {...(formData.clientDocs || {}), cinRecto: val}})} 
                    />
                    <ImageUpload 
                      label="CIN/Passport (Verso)" 
                      value={formData.clientDocs?.cinVerso} 
                      onChange={(val) => setFormData({...formData, clientDocs: {...(formData.clientDocs || {}), cinVerso: val}})} 
                    />
                    <ImageUpload 
                      label="Permis (Recto)" 
                      value={formData.clientDocs?.licenseRecto} 
                      onChange={(val) => setFormData({...formData, clientDocs: {...(formData.clientDocs || {}), licenseRecto: val}})} 
                    />
                    <ImageUpload 
                      label="Permis (Verso)" 
                      value={formData.clientDocs?.licenseVerso} 
                      onChange={(val) => setFormData({...formData, clientDocs: {...(formData.clientDocs || {}), licenseVerso: val}})} 
                    />
                  </div>
                </div>
              </div>
            )}

            {activeSection === ('documents' as any) && (
              <div className="space-y-6 col-span-full">
                <div className="bg-stone-50 p-6 rounded-3xl border border-stone-100">
                  <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">Documents d'identité du client</h4>
                  {rental || formData.clientId ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <p className="text-[10px] font-bold text-stone-900 uppercase tracking-widest">CIN / Passeport</p>
                        <div className="grid grid-cols-2 gap-4">
                          <ImageUpload 
                            label="CIN Recto" 
                            value={clients.find(c => c.id === formData.clientId)?.cinRecto || rental?.clientDocs?.cinRecto} 
                            onChange={async (val) => {
                              const clientId = formData.clientId;
                              if (clientId) {
                                await updateDoc(doc(db, 'clients', clientId), { cinRecto: val });
                                addNotification('success', 'Document mis à jour', 'Le recto de la CIN a été enregistré sur la fiche client.');
                              }
                            }} 
                          />
                          <ImageUpload 
                            label="CIN Verso" 
                            value={clients.find(c => c.id === formData.clientId)?.cinVerso || rental?.clientDocs?.cinVerso} 
                            onChange={async (val) => {
                              const clientId = formData.clientId;
                              if (clientId) {
                                await updateDoc(doc(db, 'clients', clientId), { cinVerso: val });
                                addNotification('success', 'Document mis à jour', 'Le verso de la CIN a été enregistré sur la fiche client.');
                              }
                            }} 
                          />
                        </div>
                      </div>
                      <div className="space-y-4">
                        <p className="text-[10px] font-bold text-stone-900 uppercase tracking-widest">Permis de conduire</p>
                        <div className="grid grid-cols-2 gap-4">
                          <ImageUpload 
                            label="Permis Recto" 
                            value={clients.find(c => c.id === formData.clientId)?.licenseRecto || rental?.clientDocs?.licenseRecto} 
                            onChange={async (val) => {
                              const clientId = formData.clientId;
                              if (clientId) {
                                await updateDoc(doc(db, 'clients', clientId), { licenseRecto: val });
                                addNotification('success', 'Document mis à jour', 'Le recto du permis a été enregistré sur la fiche client.');
                              }
                            }} 
                          />
                          <ImageUpload 
                            label="Permis Verso" 
                            value={clients.find(c => c.id === formData.clientId)?.licenseVerso || rental?.clientDocs?.licenseVerso} 
                            onChange={async (val) => {
                              const clientId = formData.clientId;
                              if (clientId) {
                                await updateDoc(doc(db, 'clients', clientId), { licenseVerso: val });
                                addNotification('success', 'Document mis à jour', 'Le verso du permis a été enregistré sur la fiche client.');
                              }
                            }} 
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-stone-400 italic">
                      Veuillez sélectionner un client pour voir ou modifier ses documents.
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-stone-50 p-8 rounded-3xl flex flex-col justify-between border border-stone-100 h-fit sticky top-0">
              <div>
                <h4 className="text-sm font-bold text-stone-400 uppercase tracking-widest mb-6">Récapitulatif</h4>
                <div className="space-y-4">
                  <div className="flex justify-between text-stone-600">
                    <span>Durée</span>
                    <span className="font-bold">{days} jours</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>Prix journalier</span>
                    <span className="font-bold">{formData.dailyRate} TND</span>
                  </div>
                  {formData.withChauffeur && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Chauffeur ({days}j x {formData.chauffeurPrice} TND)</span>
                      <span className="font-bold">+{formData.chauffeurPrice * days} TND</span>
                    </div>
                  )}
                  {discount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Remise</span>
                      <span className="font-bold">-{(discount || 0).toLocaleString()} TND</span>
                    </div>
                  )}
                  <div className="h-px bg-stone-200 my-4" />
                  
                  <div className="space-y-4">
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
                            onClick={() => setFormData({...formData, paymentMethod: m.id as PaymentMethod})}
                            className={clsx(
                              "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                              formData.paymentMethod === m.id ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-stone-100 text-stone-400 hover:border-stone-200"
                            )}
                          >
                            <m.icon className="w-5 h-5" />
                            <span className="text-[10px] font-bold uppercase">{m.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-stone-200 my-4" />
                  <div className="flex justify-between text-stone-900">
                    <span className="font-medium">Total TTC</span>
                    {formData.vehicleId ? (
                      <span className="text-2xl font-bold text-emerald-600">{(calculatedTotalAmount || 0).toLocaleString()} TND</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={formData.manualTotalAmount}
                          onChange={(e) => setFormData({...formData, manualTotalAmount: Number(e.target.value)})}
                          className="w-24 px-2 py-1 bg-white border border-stone-200 rounded text-right font-bold text-emerald-600 focus:ring-1 focus:ring-emerald-500"
                        />
                        <span className="font-bold text-emerald-600">TND</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="submit"
                disabled={isSaving || !formData.clientId || (formData.documentType !== 'reservation' && !formData.vehicleId)}
                className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-8"
              >
                {isSaving ? 'Enregistrement...' : (rental ? 'Enregistrer' : 'Confirmer')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function PaymentModal({ rental, onClose, onConfirm, isSaving }: { rental: Rental, onClose: () => void, onConfirm: (amount: number, method: PaymentMethod) => void, isSaving: boolean }) {
  const [amount, setAmount] = useState(rental.totalAmount - (rental.paidAmount || 0));
  const [operationType, setOperationType] = useState<'payment' | 'credit_note'>('payment');
  const [method, setMethod] = useState<PaymentMethod>(rental.paymentMethod || 'cash');

  const handleConfirm = () => {
    const finalAmount = operationType === 'credit_note' ? -Math.abs(amount) : Math.abs(amount);
    onConfirm(finalAmount, method);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 resizable-modal" onClick={e => e.stopPropagation()}>
        <div className="p-8 border-b border-stone-100 flex items-center justify-between">
          <h3 className="text-2xl font-bold text-stone-900">Enregistrer une opération</h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        <div className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Type d'opération</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setOperationType('payment')}
                className={clsx(
                  "py-2 px-4 rounded-xl text-sm font-bold transition-all border",
                  operationType === 'payment' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white text-stone-500 border-stone-200"
                )}
              >
                Paiement
              </button>
              <button
                onClick={() => setOperationType('credit_note')}
                className={clsx(
                  "py-2 px-4 rounded-xl text-sm font-bold transition-all border",
                  operationType === 'credit_note' ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-white text-stone-500 border-stone-200"
                )}
              >
                Avoir (Retour)
              </button>
            </div>
          </div>

          <div className="bg-stone-50 p-4 rounded-2xl space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Total à payer:</span>
              <span className="font-bold">{(rental.totalAmount || 0).toLocaleString()} TND</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Déjà payé:</span>
              <span className="font-bold text-emerald-600">{(rental.paidAmount || 0).toLocaleString()} TND</span>
            </div>
            <div className="h-px bg-stone-200 my-2" />
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Reste:</span>
              <span className="font-bold text-red-600">{((rental.totalAmount || 0) - (rental.paidAmount || 0)).toLocaleString()} TND</span>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                {operationType === 'payment' ? 'Montant du versement (TND)' : 'Montant du remboursement (TND)'}
              </label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
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
                    onClick={() => setMethod(m.id as PaymentMethod)}
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

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-stone-100 text-stone-600 rounded-xl font-bold hover:bg-stone-200 transition-all"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              disabled={isSaving}
              className={clsx(
                "flex-1 py-3 text-white rounded-xl font-bold transition-all shadow-lg disabled:opacity-50",
                operationType === 'payment' ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20" : "bg-amber-600 hover:bg-amber-500 shadow-amber-600/20"
              )}
            >
              {isSaving ? '...' : 'Confirmer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RentalClosureModal({ rental, vehicle, onClose, onConfirm, isSaving }: { rental: Rental, vehicle: Vehicle | undefined, onClose: () => void, onConfirm: (data: any) => void, isSaving: boolean }) {
  const [formData, setFormData] = useState({
    returnDate: format(new Date(), 'yyyy-MM-dd'),
    returnTime: format(new Date(), 'HH:mm'),
    returnMileage: vehicle?.mileage || rental.departureMileage || 0,
    returnFuelLevel: 100,
    parkingLocation: vehicle?.parkingLocation || '',
    paymentStatus: rental.paymentStatus || 'pending',
    paidAmount: rental.paidAmount || 0,
    washStatus: 'clean' as 'clean' | 'dirty',
    washPrice: 0,
    paymentMethod: rental.paymentMethod || 'cash' as PaymentMethod,
    checkedInBy: rental.checkedInBy || auth.currentUser?.displayName || ''
  });

  const calculateLateHours = () => {
    try {
      const plannedEnd = parseISO(`${rental.endDate}T${rental.endTime || '09:00'}:00`);
      const actualEnd = parseISO(`${formData.returnDate}T${formData.returnTime}:00`);
      
      const diffHours = differenceInHours(actualEnd, plannedEnd);
      return Math.max(0, diffHours);
    } catch (e) {
      return 0;
    }
  };

  const [lateHours, setLateHours] = useState(0);
  const [lateFee, setLateFee] = useState(0);
  const rentalTotalInitial = rental.totalAmount || 0;
  const currentTotalAmount = rentalTotalInitial + (formData.washStatus === 'dirty' ? (Number(formData.washPrice) || 0) : 0) + (Number(lateFee) || 0);
  const remainingToPay = Math.max(0, currentTotalAmount - (Number(formData.paidAmount) || 0));
  
  useEffect(() => {
    const hours = calculateLateHours();
    setLateHours(hours);
    
    // Basic late fee calculation: dailyRate / 24 * hours * some multiplier
    if (hours > 0) {
      const hourlyRate = (rental.dailyRate / 24) * 1.5; // 50% penalty for late return
      setLateFee(Math.round(hourlyRate * hours));
    } else {
      setLateFee(0);
    }
  }, [formData.returnDate, formData.returnTime, rental.dailyRate, rental.endDate, rental.endTime]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200 resizable-modal" onClick={e => e.stopPropagation()}>
        <div className="p-8 border-b border-stone-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-2xl font-bold text-stone-900">Clôture de Location</h3>
            <p className="text-xs text-stone-400 mt-1">Saisie du retour - Contrat {rental.contractNumber}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onConfirm({ ...formData, lateFee }); }} className="p-8 space-y-6 overflow-y-auto">
          <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest leading-none mb-1">État au Départ</span>
              <div className="flex items-center gap-1.5">
                <div className={clsx(
                  "w-2 h-2 rounded-full",
                  rental.washStatus === 'dirty' ? "bg-amber-500" : "bg-emerald-500"
                )} />
                <span className="text-xs font-bold text-stone-900 uppercase">
                  {rental.washStatus === 'dirty' ? 'Sale' : 'Propre'}
                </span>
              </div>
            </div>
            <div className="w-px h-8 bg-stone-200 mx-4" />
            <div className="flex flex-col text-right">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest leading-none mb-1">Date Prévue Retour</span>
              <span className="text-sm font-bold text-stone-900">{format(new Date(rental.endDate), 'dd/MM/yyyy')} à {rental.endTime || '09:00'}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Date de Retour <span className="text-red-500">*</span></label>
              <input
                type="date"
                required
                value={formData.returnDate}
                onChange={(e) => setFormData({...formData, returnDate: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Heure de Retour <span className="text-red-500">*</span></label>
              <input
                type="time"
                required
                value={formData.returnTime}
                onChange={(e) => setFormData({...formData, returnTime: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          {lateHours > 0 && (
            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 space-y-3 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-amber-600" />
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-amber-700">Retard détecté : {lateHours} heure(s)</span>
                  <span className="text-[10px] text-amber-500 font-medium">Fin prévue: {format(new Date(rental.endDate), 'dd/MM/yyyy')} à {rental.endTime || '09:00'}</span>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-amber-600 uppercase tracking-widest ml-1">Frais de Retard (TND)</label>
                <div className="relative">
                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400" />
                  <input
                    type="number"
                    value={lateFee}
                    onChange={(e) => setLateFee(Number(e.target.value))}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-500 font-bold text-amber-700"
                  />
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Kilométrage Retour <span className="text-red-500">*</span></label>
              <input
                type="number"
                required
                min={rental.departureMileage || 0}
                value={formData.returnMileage}
                onChange={(e) => setFormData({...formData, returnMileage: Number(e.target.value)})}
                className="w-full px-4 py-3 bg-white border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 text-lg font-bold"
              />
              <p className="text-[10px] text-emerald-600 font-bold uppercase flex items-center gap-1 mt-1">
                <TrendingUp className="w-3 h-3" />
                Distance: {formData.returnMileage - (rental.departureMileage || 0)} KM
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Niveau Carburant (%)</label>
              <input
                type="number"
                required
                min="0"
                max="100"
                value={formData.returnFuelLevel}
                onChange={(e) => setFormData({...formData, returnFuelLevel: Number(e.target.value)})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5 text-emerald-600" />
                État de Lavage (Retour) <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formData.washStatus}
                onChange={(e) => {
                  const newStatus = e.target.value as 'clean' | 'dirty';
                  // Rule: Charge for wash if it returns dirty AND it went out clean
                  // (If it went out dirty, charging for wash at return might be unfair unless specifically requested)
                  const defaultWashPrice = (newStatus === 'dirty' && rental.washStatus === 'clean') ? 20 : 0;
                  
                  setFormData({
                    ...formData, 
                    washStatus: newStatus,
                    washPrice: defaultWashPrice
                  });
                }}
                className={clsx(
                  "w-full px-4 py-3 rounded-xl border-none focus:ring-2 focus:ring-emerald-500 font-bold",
                  formData.washStatus === 'dirty' ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                )}
              >
                <option value="clean">Propre (Sans frais)</option>
                <option value="dirty">Sale (Avec frais)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Emplacement Parking</label>
              <input
                type="text"
                required
                value={formData.parkingLocation}
                onChange={(e) => setFormData({...formData, parkingLocation: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                placeholder="Ex: Parking A"
              />
            </div>
          </div>

          {formData.washStatus === 'dirty' && (
            <div className={clsx(
              "p-6 rounded-3xl border space-y-4 animate-in slide-in-from-top-2 duration-300",
              rental.washStatus === 'dirty' ? "bg-amber-50 border-amber-100" : "bg-emerald-50 border-emerald-100"
            )}>
              <div className="flex items-center justify-between">
                <div className={clsx(
                  "flex items-center gap-2",
                  rental.washStatus === 'dirty' ? "text-amber-700" : "text-emerald-700"
                )}>
                  <div className="p-1.5 bg-white rounded-lg shadow-sm">
                    <Droplets className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-bold uppercase tracking-widest">Frais de Lavage</span>
                </div>
                {rental.washStatus === 'dirty' ? (
                  <div className="text-[10px] bg-amber-600 text-white px-2 py-0.5 rounded uppercase font-bold">Sortie Sale</div>
                ) : (
                  <div className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded uppercase font-bold">Sortie Propre</div>
                )}
              </div>
              <div className="space-y-2">
                <label className={clsx(
                  "text-xs font-bold uppercase ml-1",
                  rental.washStatus === 'dirty' ? "text-amber-600/60" : "text-emerald-600/60"
                )}>Montant à encaisser (TND)</label>
                <div className="relative">
                  <DollarSign className={clsx(
                    "absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4",
                    rental.washStatus === 'dirty' ? "text-amber-400" : "text-emerald-400"
                  )} />
                  <input
                    type="number"
                    step="0.001"
                    value={formData.washPrice}
                    onChange={(e) => {
                      const newPrice = Number(e.target.value);
                      setFormData({...formData, washPrice: newPrice});
                    }}
                    className={clsx(
                      "w-full pl-10 pr-4 py-3 bg-white border rounded-2xl focus:ring-2 font-black text-xl",
                      rental.washStatus === 'dirty' 
                        ? "border-amber-100 focus:ring-amber-500 text-amber-700" 
                        : "border-emerald-100 focus:ring-emerald-500 text-emerald-700"
                    )}
                  />
                </div>
                <p className={clsx(
                  "text-[10px] italic flex items-center gap-1",
                  rental.washStatus === 'dirty' ? "text-amber-600/70" : "text-emerald-600/70"
                )}>
                  <Info className="w-3 h-3" />
                  {rental.washStatus === 'dirty' 
                    ? "Le véhicule était sale au départ. Facturation optionnelle recommandée."
                    : "Le véhicule était propre au départ. Facturation recommandée si retour sale."
                  }
                </p>
              </div>
            </div>
          )}

          <div className="bg-stone-50 p-6 rounded-3xl space-y-6 border border-stone-100 shadow-inner">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Règlement Final</h4>
              {remainingToPay > 0 ? (
                <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold">Reste: {remainingToPay.toLocaleString()} TND</span>
              ) : (
                <span className="text-[10px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded font-bold">Soldé</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Total à encaisser (TND)</label>
                <div className="p-3 bg-white border border-stone-200 rounded-xl font-black text-stone-900 text-xl text-center">
                  {currentTotalAmount.toLocaleString()}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Déjà Payé (TND)</label>
                <div className="relative">
                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                  <input
                    type="number"
                    value={formData.paidAmount}
                    onChange={(e) => setFormData({...formData, paidAmount: Number(e.target.value)})}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-emerald-100 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold text-emerald-600 text-xl"
                  />
                  {formData.paidAmount < currentTotalAmount && (
                    <button 
                      type="button"
                      onClick={() => setFormData({...formData, paidAmount: currentTotalAmount})}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-600 hover:underline"
                    >
                      Tout payé
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Mode de règlement dominant</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'cash', label: 'Espèces', icon: DollarSign },
                  { id: 'card', label: 'Carte', icon: CreditCard },
                  { id: 'transfer', label: 'Virement', icon: TrendingUp }
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setFormData({...formData, paymentMethod: m.id as PaymentMethod})}
                    className={clsx(
                      "flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all",
                      formData.paymentMethod === m.id ? "border-emerald-600 bg-emerald-50 text-emerald-600 shadow-sm" : "border-white bg-white text-stone-400 hover:border-stone-100"
                    )}
                  >
                    <m.icon className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-stone-100">
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest ml-1">Agent de réception</label>
              <input
                type="text"
                required
                value={formData.checkedInBy}
                onChange={(e) => setFormData({...formData, checkedInBy: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                placeholder="Nom de l'agent"
              />
            </div>
            
            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-5 bg-stone-900 text-white rounded-3xl font-black text-lg hover:bg-stone-800 transition-all shadow-xl shadow-stone-900/10 disabled:opacity-50"
            >
              {isSaving ? 'Enregistrement en cours...' : 'CONFIRMER LE RETOUR'}
            </button>
            <p className="text-[10px] text-center text-stone-400 italic">En confirmant, le véhicule reviendra dans le stock disponible et la mise à jour sera effectuée en temps réel.</p>
          </div>
        </form>
      </div>
    </div>
  );
}

function VehicleSwapModal({ rental, currentVehicle, availableVehicles, onClose, onConfirm, isSaving }: { rental: Rental, currentVehicle: Vehicle | undefined, availableVehicles: Vehicle[], onClose: () => void, onConfirm: (data: any) => void, isSaving: boolean }) {
  const [formData, setFormData] = useState({
    newVehicleId: '',
    reason: '',
    mileageAtSwap: currentVehicle?.mileage || 0
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200 resizable-modal" onClick={e => e.stopPropagation()}>
        <div className="p-8 border-b border-stone-100 flex items-center justify-between shrink-0">
          <h3 className="text-2xl font-bold text-stone-900">Échange de Véhicule</h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onConfirm(formData); }} className="p-8 space-y-6 overflow-y-auto">
          <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex items-start gap-3 mb-4">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800">
              <p className="font-bold mb-1">Attention</p>
              <p>L'échange libérera le véhicule actuel ({currentVehicle?.brand} {currentVehicle?.model}) et affectera le nouveau véhicule à cette location.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Nouveau Véhicule</label>
              <select
                required
                value={formData.newVehicleId}
                onChange={(e) => setFormData({...formData, newVehicleId: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Sélectionner un véhicule disponible</option>
                {availableVehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plate})</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Kilométrage actuel ({currentVehicle?.brand})</label>
              <input
                type="number"
                required
                min={currentVehicle?.mileage || 0}
                value={formData.mileageAtSwap}
                onChange={(e) => setFormData({...formData, mileageAtSwap: Number(e.target.value)})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Motif de l'échange</label>
              <textarea
                required
                value={formData.reason}
                onChange={(e) => setFormData({...formData, reason: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 min-h-[100px]"
                placeholder="Ex: Panne mécanique, demande client..."
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
          >
            {isSaving ? 'Échange en cours...' : 'Confirmer l\'échange'}
          </button>
        </form>
      </div>
    </div>
  );
}

function RentalExtensionModal({ rental, onClose, onConfirm, isSaving }: { rental: Rental, onClose: () => void, onConfirm: (data: any) => void, isSaving: boolean }) {
  const [newEndDate, setNewEndDate] = useState(format(addDays(new Date(rental.endDate), 1), 'yyyy-MM-dd'));
  const [newEndTime, setNewEndTime] = useState(rental.endTime || '09:00');
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [pricePerDay, setPricePerDay] = useState(rental.dailyRate);

  const extensionDays = differenceInDays(new Date(newEndDate), new Date(rental.endDate));
  const totalAmount = Math.max(0, extensionDays * pricePerDay);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (extensionDays < 0) return; // Allow 0 days if time is extended? Actually differenceInDays might be 0 if same day
    onConfirm({
      newEndDate,
      newEndTime,
      extensionDays,
      pricePerDay,
      totalAmount,
      paidAmount,
      paymentMethod
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-8 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-stone-900">Prolonger Location</h3>
            <p className="text-xs text-stone-400 mt-1">Contrat {rental.contractNumber}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex justify-between items-center text-sm">
            <span className="text-emerald-700">Fin actuelle :</span>
            <span className="font-bold text-emerald-900">{format(new Date(rental.endDate), 'dd/MM/yyyy')} à {rental.endTime || '09:00'}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Nouvelle Date de Fin</label>
              <input
                type="date"
                required
                min={rental.endDate}
                value={newEndDate}
                onChange={(e) => setNewEndDate(e.target.value)}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Nouvelle Heure</label>
              <input
                type="time"
                required
                value={newEndTime}
                onChange={(e) => setNewEndTime(e.target.value)}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Prix/Jour (TND)</label>
              <input
                type="number"
                required
                value={pricePerDay}
                onChange={(e) => setPricePerDay(Number(e.target.value))}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Jours en +</label>
              <div className="w-full px-4 py-3 bg-stone-100 rounded-xl text-stone-600 font-black text-center">
                {extensionDays > 0 ? extensionDays : 0}
              </div>
            </div>
          </div>

          <div className="p-6 bg-stone-50 rounded-3xl border border-stone-100 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">Total Extension</span>
              <span className="text-2xl font-black text-emerald-600">{totalAmount.toLocaleString()} TND</span>
            </div>
            <div className="h-px bg-stone-200" />
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Versement immédiat (TND)</label>
              <input
                type="number"
                value={paidAmount}
                onChange={(e) => setPaidAmount(Number(e.target.value))}
                className="w-full px-4 py-3 bg-white border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold text-emerald-600"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Mode de paiement</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'cash', label: 'Cash', icon: DollarSign },
                  { id: 'card', label: 'Carte', icon: CreditCard },
                  { id: 'transfer', label: 'Virement', icon: TrendingUp }
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id as PaymentMethod)}
                    className={clsx(
                      "flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all",
                      paymentMethod === m.id ? "border-emerald-500 bg-emerald-50 text-emerald-600 shadow-sm" : "border-white bg-white text-stone-400 hover:border-stone-100"
                    )}
                  >
                    <m.icon className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={onClose}
              type="button"
              className="flex-1 px-6 py-3.5 rounded-2xl font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all"
            >
              Annuler
            </button>
            <button
              disabled={isSaving || extensionDays <= 0}
              type="submit"
              className="flex-1 px-6 py-3.5 rounded-2xl font-bold text-white bg-stone-900 hover:bg-stone-800 shadow-xl shadow-stone-900/20 transition-all disabled:opacity-50"
            >
              {isSaving ? 'Prolongation...' : 'Confirmer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ExtensionHistoryModal({ rental, onClose }: { rental: Rental, onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-8 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-stone-900">Historique des Prolongations</h3>
            <p className="text-xs text-stone-400 mt-1">Contrat {rental.contractNumber}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        <div className="p-8 max-h-[70vh] overflow-y-auto">
          {(!rental.extensions || rental.extensions.length === 0) ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <LucideHistory className="w-8 h-8 text-stone-300" />
              </div>
              <p className="text-stone-400 font-medium">Aucune prolongation effectuée pour ce contrat.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {rental.extensions.map((ext, idx) => (
                <div key={ext.id} className="relative pl-8 pb-4">
                  <div className="absolute left-3 top-0 bottom-0 w-px bg-stone-100" />
                  <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-emerald-50 border-2 border-emerald-500 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-emerald-600">{rental.extensions!.length - idx}</span>
                  </div>
                  <div className="bg-stone-50 rounded-2xl p-4 border border-stone-100 hover:border-emerald-200 transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Effectuée le {format(new Date(ext.date), 'dd/MM/yyyy HH:mm')}</p>
                        <p className="font-bold text-stone-900 mt-1">Extension de {ext.extensionDays} jours</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-black text-emerald-600">{ext.totalExtensionAmount.toLocaleString()} TND</p>
                        <span className={clsx(
                          "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                          ext.paidAmount >= ext.totalExtensionAmount ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        )}>
                          {ext.paidAmount >= ext.totalExtensionAmount ? 'Payé' : `Payé: ${ext.paidAmount} TND`}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-stone-200/50">
                      <div>
                        <p className="text-[10px] text-stone-400 uppercase font-bold tracking-widest leading-none">Période d'extension</p>
                        <p className="text-xs font-medium text-stone-600 mt-1">
                          Du {format(new Date(ext.previousEndDate), 'dd/MM/yyyy')} 
                          <ArrowRight className="inline w-3 h-3 mx-1" />
                          Au {format(new Date(ext.newEndDate), 'dd/MM/yyyy')} à {ext.newEndTime || '09:00'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-stone-400 uppercase font-bold tracking-widest leading-none">Agent</p>
                        <p className="text-xs font-medium text-stone-600 mt-1">{ext.agentName || 'Non spécifié'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-8 bg-stone-50 border-t border-stone-100">
          <button
            onClick={onClose}
            className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function RentalCutModal({ rental, onClose, onConfirm, isSaving }: { rental: Rental, onClose: () => void, onConfirm: (data: any) => void, isSaving: boolean }) {
  const [cutDate, setCutDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [cutTime, setCutTime] = useState(format(new Date(), 'HH:mm'));
  const [mileage, setMileage] = useState(rental.departureMileage || 0);

  // Calculate days for the first part
  const daysUsed = Math.max(1, differenceInDays(new Date(cutDate), new Date(rental.startDate)));
  const firstPartAmount = daysUsed * (rental.dailyRate || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-8 border-b border-stone-100 flex items-center justify-between">
          <h3 className="text-2xl font-bold text-stone-900">Coupure de Location</h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        <div className="p-8 space-y-6 overflow-y-auto max-h-[70vh]">
          <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100 flex items-start gap-3">
            <Scissors className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
            <div className="text-xs text-orange-800">
              <p className="font-bold mb-1">Spliter le contrat</p>
              <p>Cette action va clôturer le contrat actuel à la date sélectionnée et en créer un nouveau pour la période restante.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Date de Coupure</label>
              <input
                type="date"
                required
                value={cutDate}
                min={rental.startDate}
                max={rental.endDate}
                onChange={(e) => setCutDate(e.target.value)}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Heure de Coupure</label>
              <input
                type="time"
                required
                value={cutTime}
                onChange={(e) => setCutTime(e.target.value)}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Kilométrage Actuel</label>
            <input
              type="number"
              required
              min={rental.departureMileage || 0}
              value={mileage}
              onChange={(e) => setMileage(Number(e.target.value))}
              className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-stone-400 font-bold uppercase">Ancien Contrat ({daysUsed} j)</span>
              <span className="text-stone-900 font-black">{firstPartAmount.toLocaleString()} TND</span>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              onClick={onClose}
              type="button"
              className="flex-1 px-6 py-3.5 rounded-2xl font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all"
            >
              Annuler
            </button>
            <button
              onClick={() => onConfirm({ cutDate, cutTime, mileage, firstPartAmount })}
              type="button"
              disabled={isSaving}
              className="flex-1 px-6 py-3.5 rounded-2xl font-bold text-white bg-orange-600 hover:bg-orange-700 shadow-lg shadow-orange-600/20 transition-all disabled:opacity-50"
            >
              {isSaving ? 'Traitement...' : 'Confirmer la Coupure'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
