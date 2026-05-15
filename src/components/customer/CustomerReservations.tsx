import React, { useState, useEffect } from 'react';
import { updateDoc, deleteDoc, doc, collection, query, where, onSnapshot, orderBy, auth as firebaseAuth } from '../../lib/api';
import { db } from '../../lib/api';
import { Rental, Vehicle, Maintenance } from '../../types';
import { format, differenceInHours } from 'date-fns';
import { fr } from 'date-fns/locale';
import { FileText, Download, Printer, Clock, CheckCircle, XCircle, AlertCircle, Car, Calendar, MapPin, Trash2, Loader2, X, Wrench } from 'lucide-react';
import { generateContractPDF, generateInvoicePDF } from '../../services/pdfService';
import { Receipt } from '../Receipt';
import { logActivity } from '../../services/logService';
import { clsx } from 'clsx';

interface CustomerReservationsProps {
  user: any;
  onClose: () => void;
}

export function CustomerReservations({ user, onClose }: CustomerReservationsProps) {
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRental, setSelectedRental] = useState<Rental | null>(null);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    if (!user?.email) return;

    const rentalsQuery = query(
      collection(db, 'rentals'),
      where('clientEmail', '==', user.email),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeRentals = onSnapshot(rentalsQuery, (snapshot) => {
      const rentalsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Rental));
      setRentals(rentalsData);
      setLoading(false);
    });

    const unsubscribeVehicles = onSnapshot(collection(db, 'vehicles'), (snapshot) => {
      const vehiclesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle));
      setVehicles(vehiclesData);
    });

    const unsubscribeMaintenances = onSnapshot(query(collection(db, 'maintenances'), where('clientEmail', '==', user.email)), (snapshot) => {
      setMaintenances(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Maintenance)));
    });

    return () => {
      unsubscribeRentals();
      unsubscribeVehicles();
      unsubscribeMaintenances();
    };
  }, [user?.email]);

  const [isCancelling, setIsCancelling] = useState<string | null>(null);

  const canCancel = (rental: Rental) => {
    // Permission to cancel pending, reserved, or confirmed rentals
    return ['pending_confirmation', 'reserved', 'confirmed'].includes(rental.status);
  };

  const handleCancelRental = async (rental: Rental) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer/annuler cette réservation ?')) return;
    
    setIsCancelling(rental.id);
    try {
      // If it's already cancelled, maybe delete it from DB?
      if (rental.status === 'cancelled') {
        await deleteDoc(doc(db, 'rentals', rental.id));
        logActivity(firebaseAuth.currentUser?.uid || 'anonymous', 'delete_reservation', `Réservation supprimée définitivement: ${rental.contractNumber}`);
      } else {
        await updateDoc(doc(db, 'rentals', rental.id), {
          status: 'cancelled',
          notes: (rental.notes || '') + '\nAnnulé par le client le ' + format(new Date(), 'dd/MM/yyyy HH:mm')
        });
        
        if (firebaseAuth.currentUser) {
          logActivity(firebaseAuth.currentUser.uid, 'cancel_reservation', `Réservation annulée par le client: ${rental.contractNumber}`);
        }
      }
    } catch (error) {
      console.error("Error cancelling rental:", error);
      alert("Une erreur est survenue lors de l'opération.");
    } finally {
      setIsCancelling(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'reserved': 
      case 'confirmed': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'pending_confirmation': return <Clock className="w-4 h-4 text-amber-500" />;
      case 'cancelled': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <AlertCircle className="w-4 h-4 text-stone-400" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'reserved':
      case 'confirmed': return 'Acceptée';
      case 'pending_confirmation': return 'En attente';
      case 'cancelled': return 'Annulée';
      case 'active': return 'En cours';
      case 'completed': return 'Terminée';
      default: return status;
    }
  };

  const handleDownload = (rental: Rental, type: 'contract' | 'invoice') => {
    const vehicle = vehicles.find(v => v.id === rental.vehicleId);
    // We need to fetch client data or use the one from rental
    const client = {
      id: rental.clientId,
      name: rental.clientName,
      email: rental.clientEmail,
      phone: rental.clientPhone,
      cin: rental.clientCIN,
      licenseNumber: rental.clientLicense,
      address: '',
      city: '',
      customerType: 'individual'
    } as any;

    if (type === 'contract') {
      generateContractPDF(rental, vehicle, client, settings);
    } else {
      generateInvoicePDF(rental, vehicle, client, settings);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 max-h-[90vh] flex flex-col">
        <div className="p-8 border-b border-stone-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-2xl font-bold text-stone-900">Mes Réservations</h3>
            <p className="text-stone-500 text-sm italic serif">Consultez l'historique de vos locations et téléchargez vos documents.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400 transition-all">
            <XCircle className="w-8 h-8" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-12 h-12 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin" />
              <p className="text-stone-400 font-medium italic">Chargement de vos données...</p>
            </div>
          ) : rentals.length > 0 || maintenances.length > 0 ? (
            <div className="space-y-12">
              {rentals.length > 0 && (
                <div className="space-y-6">
                  <h4 className="text-sm font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                    <Car className="w-4 h-4" />
                    Locations & Réservations
                  </h4>
                  <div className="grid grid-cols-1 gap-4">
                    {rentals.map((rental) => {
                      const vehicle = vehicles.find(v => v.id === rental.vehicleId);
                      return (
                        <div key={rental.id} className="bg-stone-50 rounded-2xl border border-stone-100 overflow-hidden hover:shadow-md transition-all group p-6">
                          <div className="flex flex-col md:flex-row gap-6">
                            {/* Rental content as before */}
                            <div className="flex items-center gap-4 md:w-1/3">
                              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-stone-100 shrink-0">
                                <Car className="w-6 h-6 text-stone-400" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-stone-900 truncate">{vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Véhicule à confirmer'}</p>
                                <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">{rental.contractNumber}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-6 md:w-1/3">
                              <div className="space-y-1">
                                <p className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">Départ</p>
                                <p className="text-xs font-bold text-stone-900">{format(new Date(rental.startDate), 'dd MMM yyyy', { locale: fr })}</p>
                              </div>
                              <div className="w-4 h-px bg-stone-200" />
                              <div className="space-y-1">
                                <p className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">Retour</p>
                                <p className="text-xs font-bold text-stone-900">{format(new Date(rental.endDate), 'dd MMM yyyy', { locale: fr })}</p>
                              </div>
                            </div>

                            <div className="flex items-center justify-between md:justify-end gap-4 md:w-1/3">
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1.5">
                                  {getStatusIcon(rental.status)}
                                  <span className="text-[10px] font-bold text-stone-700">{getStatusLabel(rental.status)}</span>
                                </div>
                                <p className="text-base font-black text-emerald-600">{(rental.totalAmount || 0).toLocaleString()} TND</p>
                              </div>
                              
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => setSelectedRental(rental)}
                                  className="p-2 bg-stone-100 hover:bg-emerald-50 text-stone-600 hover:text-emerald-600 rounded-xl border border-stone-100 shadow-sm transition-all"
                                >
                                  <FileText className="w-4 h-4" />
                                </button>
                                
                                {canCancel(rental) && (
                                  <button 
                                    onClick={() => handleCancelRental(rental)}
                                    disabled={isCancelling === rental.id}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl border border-red-100 transition-all font-bold group/cancel shadow-sm"
                                    title="Annuler la réservation"
                                  >
                                    {isCancelling === rental.id ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <>
                                        <X className="w-4 h-4 group-hover/cancel:scale-125 transition-transform" />
                                        <span className="text-[10px] uppercase tracking-widest">Annuler</span>
                                      </>
                                    )}
                                  </button>
                                )}
                                
                                {rental.status === 'cancelled' && (
                                  <button 
                                    onClick={() => handleCancelRental(rental)}
                                    disabled={isCancelling === rental.id}
                                    className="p-2 bg-red-600 text-white rounded-xl shadow-md hover:bg-red-700 transition-all"
                                    title="Supprimer définitivement"
                                  >
                                    {isCancelling === rental.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {maintenances.length > 0 && (
                <div className="space-y-6">
                  <h4 className="text-sm font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                    <Wrench className="w-4 h-4" />
                    Interventions & Maintenances
                  </h4>
                  <div className="grid grid-cols-1 gap-4">
                    {maintenances.map((m) => {
                      const vehicle = vehicles.find(v => v.id === m.vehicleId);
                      return (
                        <div key={m.id} className="bg-stone-50 rounded-2xl border border-stone-100 overflow-hidden hover:shadow-md transition-all group p-6">
                          <div className="flex flex-col md:flex-row gap-6">
                            <div className="flex items-center gap-4 md:w-1/3">
                              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-stone-100 shrink-0 text-amber-500">
                                <Wrench className="w-6 h-6" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-stone-900 truncate">{m.type.toUpperCase()}</p>
                                <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
                                  {vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.plate})` : 'Véhicule inconnu'}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-6 md:w-1/3">
                              <div className="space-y-1">
                                <p className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">Date Intervention</p>
                                <p className="text-xs font-bold text-stone-900">{format(new Date(m.date), 'dd MMM yyyy', { locale: fr })}</p>
                              </div>
                            </div>

                            <div className="flex items-center justify-between md:justify-end gap-4 md:w-1/3">
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1.5">
                                  <CheckCircle className="w-3 h-3 text-emerald-500" />
                                  <span className="text-[10px] font-bold text-stone-700">Facturé</span>
                                </div>
                                <p className="text-base font-black text-amber-600">{(m.cost || 0).toLocaleString()} TND</p>
                              </div>
                            </div>
                          </div>
                          {m.description && (
                            <p className="mt-4 text-xs text-stone-500 italic border-t border-stone-100 pt-3">{m.description}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 bg-stone-50 rounded-[2rem] flex items-center justify-center mb-6 border border-dashed border-stone-200">
                <Calendar className="w-10 h-10 text-stone-300" />
              </div>
              <h4 className="text-xl font-bold text-stone-900 mb-2">Aucune réservation</h4>
              <p className="text-stone-500 max-w-xs mx-auto italic serif">Vous n'avez pas encore effectué de réservation. Découvrez nos véhicules disponibles !</p>
            </div>
          )}
        </div>
      </div>

      {selectedRental && (
        <Receipt 
          rental={selectedRental}
          vehicle={vehicles.find(v => v.id === selectedRental.vehicleId)}
          client={{
            id: selectedRental.clientId,
            name: selectedRental.clientName,
            email: selectedRental.clientEmail,
            phone: selectedRental.clientPhone,
            cin: selectedRental.clientCIN,
            licenseNumber: selectedRental.clientLicense,
            address: '',
            city: '',
            customerType: 'individual'
          } as any}
          onClose={() => setSelectedRental(null)}
        />
      )}
    </div>
  );
}
