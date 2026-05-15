import React, { useState } from 'react';
import { X, Calendar, CreditCard, CheckCircle, Loader2, Info, Upload, Camera, FileText, User } from 'lucide-react';
import { Vehicle, UserProfile, Rental, Client } from '../../types';
import { collection, addDoc, query, where, getDocs, doc, setDoc } from '../../lib/api';
import { db } from '../../lib/api';
import { differenceInDays, parseISO } from 'date-fns';
import { clsx } from 'clsx';
import { useNotifications } from '../NotificationContext';
import { logActivity } from '../../services/logService';
import { compressImage } from '../../utils/imageCompression';

import { getAvailableVehicles } from '../../services/availabilityService';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  pickupLocation?: string;
  returnLocation?: string;
  user: any;
  profile: UserProfile | null;
  type?: 'rental' | 'transfer';
}

const locations = [
  { name: "Agence Centrale (M'saken)", fee: 0 },
  { name: 'Sousse Centre / Zone Touristique', fee: 30 },
  { name: 'Aéroport Tunis-Carthage (TUN)', fee: 120 },
  { name: 'Aéroport Enfidha-Hammamet (NBE)', fee: 80 },
  { name: 'Aéroport Monastir (MIR)', fee: 50 },
  { name: 'Aéroport Djerba-Zarzis (DJE)', fee: 250 },
  { name: 'Aéroport Tozeur-Nefta (TOE)', fee: 300 },
  { name: 'Aéroport Tabarka-Aïn Draham (TBJ)', fee: 200 },
  { name: 'Tunis Centre / Gammarth', fee: 100 },
  { name: 'Hammamet', fee: 60 },
  { name: 'Mahdia', fee: 60 },
];

export function BookingModal({ 
  isOpen, 
  onClose, 
  vehicle, 
  startDate, 
  endDate, 
  startTime = '10:00',
  endTime = '10:00',
  pickupLocation = 'Agence Centrale (M\'saken)',
  returnLocation = 'Agence Centrale (M\'saken)',
  user, 
  profile, 
  type = 'rental' 
}: BookingModalProps) {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'details' | 'documents' | 'success'>('details');
  const [chauffeurPrice, setChauffeurPrice] = useState(50);
  const [docs, setDocs] = useState({
    phone: '',
    cinNumber: '',
    licenseNumber: '',
    cinRecto: '',
    cinVerso: '',
    licenseRecto: '',
    licenseVerso: '',
    withChauffeur: type === 'transfer',
    transferType: 'one_way' as 'one_way' | 'round_trip',
    airportName: 'Tunis-Carthage',
    customAmount: 0,
    pickupLoc: pickupLocation,
    returnLoc: returnLocation
  });

  const getDeliveryFee = (locName: string) => {
    return locations.find(l => l.name === locName)?.fee || 0;
  };

  const deliveryFee = type === 'transfer' ? 0 : (getDeliveryFee(docs.pickupLoc) + getDeliveryFee(docs.returnLoc));

  React.useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settingsSnap = await getDocs(collection(db, 'settings'));
        const systemSettings = settingsSnap.docs.find(d => d.id === 'system');
        if (systemSettings) {
          const data = systemSettings.data();
          if (data.chauffeurPrice) {
            setChauffeurPrice(data.chauffeurPrice);
          }
        }
      } catch (error) {
        console.error("Error fetching settings:", error);
      }
    };
    fetchSettings();
  }, []);

  React.useEffect(() => {
    if (isOpen && user?.email) {
      const fetchClientData = async () => {
        try {
          const clientsRef = collection(db, 'clients');
          const q = query(clientsRef, where('email', '==', user.email));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            const clientData = querySnapshot.docs[0].data();
            setDocs(prev => ({
              ...prev,
              phone: clientData.phone || '',
              cinNumber: clientData.cin || '',
              licenseNumber: clientData.licenseNumber || '',
              cinRecto: clientData.cinRecto || '',
              cinVerso: clientData.cinVerso || '',
              licenseRecto: clientData.licenseRecto || '',
              licenseVerso: clientData.licenseVerso || ''
            }));
          }
        } catch (error) {
          console.error("Error fetching client data:", error);
        }
      };
      fetchClientData();
    }
  }, [isOpen, user?.email]);

  if (!isOpen) return null;

  const totalDays = Math.max(1, differenceInDays(parseISO(endDate), parseISO(startDate)));
  const chauffeurTotal = docs.withChauffeur ? (chauffeurPrice * totalDays) : 0;
  const subtotal = type === 'transfer' 
    ? (docs.customAmount || 80)
    : (totalDays * vehicle.pricePerDay) + chauffeurTotal + deliveryFee;
  
  // For transfers, we assume the custom amount is the final total (TTC)
  const taxAmount = type === 'transfer' ? 0 : subtotal * 0.19;
  const totalAmount = subtotal + taxAmount;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, key: string) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 800, 800, 0.6);
        setDocs(prev => ({ ...prev, [key]: compressed }));
      } catch (error) {
        console.error("Error compressing image:", error);
        addNotification('error', 'Erreur', 'Impossible de compresser l\'image.');
      }
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      // 0. Re-verify availability
      const availableVehicles = await getAvailableVehicles(startDate, endDate);
      const isStillAvailable = availableVehicles.some(v => v.id === vehicle.id);
      
      if (!isStillAvailable) {
        addNotification('error', 'Indisponible', 'Désolé, ce véhicule vient d\'être réservé pour ces dates.');
        setLoading(false);
        return;
      }

      // 1. Find or Create the Client document
      const clientsRef = collection(db, 'clients');
      const q = query(clientsRef, where('email', '==', user.email));
      const querySnapshot = await getDocs(q);
      
      let actualClientId = user.uid;
      let clientName = profile?.fullName || 
                       (user.displayName && !user.displayName.includes('@') ? user.displayName : user.email?.split('@')[0]) || 
                       'Client Web';
      let clientPhone = docs.phone;
      let clientEmail = user.email;

      if (!querySnapshot.empty) {
        const clientDoc = querySnapshot.docs[0];
        actualClientId = clientDoc.id;
        const clientData = clientDoc.data() as Client;
        
        clientName = clientData.name || clientName;
        clientPhone = clientData.phone || clientPhone;
        clientEmail = clientData.email || clientEmail;
        
        // Update client documents if they were provided
        const updates: any = {};
        if (docs.cinRecto && docs.cinRecto !== clientData.cinRecto) updates.cinRecto = docs.cinRecto;
        if (docs.cinVerso && docs.cinVerso !== clientData.cinVerso) updates.cinVerso = docs.cinVerso;
        if (docs.licenseRecto && docs.licenseRecto !== clientData.licenseRecto) updates.licenseRecto = docs.licenseRecto;
        if (docs.licenseVerso && docs.licenseVerso !== clientData.licenseVerso) updates.licenseVerso = docs.licenseVerso;
        if (docs.cinNumber && docs.cinNumber !== clientData.cin) updates.cin = docs.cinNumber;
        if (docs.licenseNumber && docs.licenseNumber !== clientData.licenseNumber) updates.licenseNumber = docs.licenseNumber;
        if (docs.phone && docs.phone !== clientData.phone) {
          updates.phone = docs.phone;
          clientPhone = docs.phone;
        }

        if (Object.keys(updates).length > 0) {
          await setDoc(doc(db, 'clients', actualClientId), updates, { merge: true });
        }
      } else {
        // Create new client automatically
        const newClient: Client = {
          id: user.uid, // Use UID as ID for consistency
          customerType: 'individual',
          name: clientName,
          email: clientEmail,
          phone: clientPhone,
          cin: docs.cinNumber,
          licenseNumber: docs.licenseNumber,
          licenseExpiry: '', // To be filled later
          address: '',
          city: '',
          category: 'regular',
          loyaltyPoints: 0,
          loyaltyStatus: 'bronze',
          cinRecto: docs.cinRecto,
          cinVerso: docs.cinVerso,
          licenseRecto: docs.licenseRecto,
          licenseVerso: docs.licenseVerso,
          source: 'website',
          officeId: vehicle.officeId || 'bureau-chedli',
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'clients', user.uid), newClient);
        actualClientId = user.uid;
      }

      const officeId = vehicle.officeId || 'bureau-chedli';

      const rentalData: Partial<Rental> = {
        contractNumber: `RES-${Date.now().toString().slice(-6)}`,
        vehicleId: vehicle.id,
        officeId: officeId,
        clientId: actualClientId,
        clientName,
        clientPhone,
        clientEmail,
        clientCIN: docs.cinNumber,
        clientLicense: docs.licenseNumber,
        clientDocs: {
          cinRecto: docs.cinRecto,
          cinVerso: docs.cinVerso,
          licenseRecto: docs.licenseRecto,
          licenseVerso: docs.licenseVerso
        },
        userId: user.uid,
        agentName: clientName,
        startDate,
        endDate,
        startTime,
        endTime,
        pickupLocation: docs.pickupLoc,
        returnLocation: docs.returnLoc,
        dailyRate: vehicle.pricePerDay,
        withChauffeur: docs.withChauffeur,
        chauffeurPrice: docs.withChauffeur ? chauffeurPrice : 0,
        totalDays,
        subtotal,
        taxRate: 19,
        taxAmount,
        totalAmount,
        depositAmount: 500, // Default deposit
        depositReturned: false,
        status: 'pending_confirmation',
        documentType: 'reservation',
        isTransfer: type === 'transfer',
        airportName: docs.airportName,
        transferType: docs.transferType,
        paymentStatus: 'pending',
        paymentMethod: 'cash',
        paidAmount: 0,
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'rentals'), rentalData);

      // Create notification for admin
      await addDoc(collection(db, 'notifications'), {
        title: 'Nouvelle Réservation (Site Web)',
        message: type === 'transfer' 
          ? `Demande de réservation pour transfert ${docs.transferType === 'one_way' ? 'aller simple' : 'aller-retour'} vers ${docs.airportName} par ${clientName}`
          : `Demande de réservation (${docs.pickupLoc} -> ${docs.returnLoc}) pour ${vehicle.brand} ${vehicle.model} par ${clientName}${clientPhone ? ` (Tél: ${clientPhone})` : ''}`,
        type: 'info',
        timestamp: new Date().toISOString(),
        read: false,
        isWebsite: true,
        vehicleId: vehicle.id,
        officeId: officeId
      });

      await addDoc(collection(db, 'notifications'), {
        title: 'Réservation Enregistrée',
        message: `Votre demande de réservation pour ${type === 'transfer' ? docs.airportName : `${vehicle.brand} ${vehicle.model}`} a été envoyée avec succès. Elle est en attente de confirmation.`,
        type: 'success',
        timestamp: new Date().toISOString(),
        read: false,
        userId: user.uid,
        officeId: officeId
      });

      await logActivity(
        user.uid, 
        'create_reservation', 
        `Nouvelle réservation en ligne pour ${vehicle.brand} ${vehicle.model}`,
        user.displayName || user.email || undefined,
        officeId
      );
      
      setStep('success');
      addNotification('info', 'Demande envoyée', 'Votre demande de réservation est en attente de confirmation.');
    } catch (error) {
      console.error("Error creating booking:", error);
      addNotification('error', 'Erreur', 'Une erreur est survenue lors de la réservation. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        {step === 'details' ? (
          <>
            <div className="relative h-48 bg-stone-900">
              <img 
                src={vehicle.type === 'luxury' ? 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=800' : 'https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&q=80&w=800'} 
                alt="Vehicle" 
                className="w-full h-full object-cover opacity-60"
                referrerPolicy="no-referrer"
              />
              <button 
                onClick={onClose}
                className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="absolute bottom-6 left-8">
                <h3 className="text-3xl font-bold text-white">
                  {type === 'transfer' ? `Transfert Aéroport ${docs.airportName}` : `${vehicle.brand} ${vehicle.model}`}
                </h3>
                <p className="text-stone-300 italic serif">
                  {type === 'transfer' ? 'Service de transport privé' : `${vehicle.type} • ${vehicle.year}`}
                </p>
              </div>
            </div>

            <div className="p-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-10">
                <div className="space-y-6">
                  {type === 'transfer' ? (
                    <>
                      <h4 className="text-sm font-bold text-stone-900 uppercase tracking-widest">Détails du transfert</h4>
                      <div className="space-y-4">
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Aéroport</label>
                          <select 
                            value={docs.airportName}
                            onChange={(e) => setDocs(prev => ({ ...prev, airportName: e.target.value }))}
                            className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="Tunis-Carthage">Tunis-Carthage (TUN)</option>
                            <option value="Enfidha-Hammamet">Enfidha-Hammamet (NBE)</option>
                            <option value="Monastir">Monastir (MIR)</option>
                            <option value="Djerba-Zarzis">Djerba-Zarzis (DJE)</option>
                            <option value="Tozeur-Nefta">Tozeur-Nefta (TOE)</option>
                            <option value="Tabarka-Aïn Draham">Tabarka-Aïn Draham (TBJ)</option>
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setDocs(prev => ({ ...prev, transferType: 'one_way' }))}
                            className={clsx(
                              "flex-1 py-3 rounded-xl text-xs font-bold transition-all",
                              docs.transferType === 'one_way' ? "bg-stone-900 text-white" : "bg-stone-50 text-stone-400"
                            )}
                          >
                            Aller Simple
                          </button>
                          <button
                            onClick={() => setDocs(prev => ({ ...prev, transferType: 'round_trip' }))}
                            className={clsx(
                              "flex-1 py-3 rounded-xl text-xs font-bold transition-all",
                              docs.transferType === 'round_trip' ? "bg-stone-900 text-white" : "bg-stone-50 text-stone-400"
                            )}
                          >
                            Aller-Retour
                          </button>
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Montant personnalisé (TND)</label>
                          <input 
                            type="number"
                            value={docs.customAmount}
                            onChange={(e) => setDocs(prev => ({ ...prev, customAmount: parseFloat(e.target.value) || 0 }))}
                            className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold text-emerald-600"
                            placeholder="Ex: 80"
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <h4 className="text-sm font-bold text-stone-900 uppercase tracking-widest">Détails de la période</h4>
                      <div className="flex items-center gap-4 p-4 bg-stone-50 rounded-2xl border border-stone-100">
                        <Calendar className="w-5 h-5 text-emerald-600" />
                        <div>
                          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest leading-none mb-1">Du {new Date(startDate).toLocaleDateString()} {startTime}</p>
                          <p className="text-sm font-bold text-stone-900 leading-none">Au {new Date(endDate).toLocaleDateString()} {endTime}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Lieu de prise en charge</label>
                          <select 
                            value={docs.pickupLoc}
                            onChange={(e) => setDocs(prev => ({ ...prev, pickupLoc: e.target.value }))}
                            className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 font-medium text-sm"
                          >
                            {locations.map(loc => (
                              <option key={`pickup-${loc.name}`} value={loc.name}>{loc.name} {loc.fee > 0 ? `(+${loc.fee} TND)` : ''}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Lieu de restitution</label>
                          <select 
                            value={docs.returnLoc}
                            onChange={(e) => setDocs(prev => ({ ...prev, returnLoc: e.target.value }))}
                            className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 font-medium text-sm"
                          >
                            {locations.map(loc => (
                              <option key={`return-${loc.name}`} value={loc.name}>{loc.name} {loc.fee > 0 ? `(+${loc.fee} TND)` : ''}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-stone-500 text-xs italic serif">
                        <Info className="w-4 h-4" />
                        <span>Durée totale : {totalDays} jour(s)</span>
                      </div>

                      <div className="pt-4 border-t border-stone-100">
                        <button
                          type="button"
                          onClick={() => setDocs(prev => ({ ...prev, withChauffeur: !prev.withChauffeur }))}
                          className={clsx(
                            "w-full p-4 rounded-2xl border transition-all flex items-center justify-between group",
                            docs.withChauffeur ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-stone-50 border-stone-100 text-stone-600 hover:border-emerald-200"
                          )}
                        >
                          <div className="flex items-center gap-3 text-left">
                            <div className={clsx(
                              "p-2 rounded-xl transition-colors",
                              docs.withChauffeur ? "bg-emerald-600 text-white" : "bg-stone-200 text-stone-500 group-hover:bg-emerald-100 group-hover:text-emerald-600"
                            )}>
                              <User className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-bold">Avec Chauffeur</p>
                              <p className="text-[10px] opacity-70">Service professionnel (+{chauffeurPrice} TND/j)</p>
                            </div>
                          </div>
                          <div className={clsx(
                            "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                            docs.withChauffeur ? "bg-emerald-600 border-emerald-600" : "border-stone-300"
                          )}>
                            {docs.withChauffeur && <CheckCircle className="w-4 h-4 text-white" />}
                          </div>
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-6">
                  <h4 className="text-sm font-bold text-stone-900 uppercase tracking-widest">Résumé financier</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-500">Prix journalier</span>
                      <span className="font-bold text-stone-900">{vehicle.pricePerDay} TND</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-500">Sous-total</span>
                      <span className="font-bold text-stone-900">{subtotal - chauffeurTotal - deliveryFee} TND</span>
                    </div>
                    {deliveryFee > 0 && (
                      <div className="flex justify-between text-sm text-emerald-600">
                        <span className="font-medium">Frais de livraison</span>
                        <span className="font-bold">{deliveryFee} TND</span>
                      </div>
                    )}
                    {docs.withChauffeur && (
                      <div className="flex justify-between text-sm text-emerald-600">
                        <span className="font-medium">Service Chauffeur</span>
                        <span className="font-bold">{chauffeurTotal} TND</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-500">TVA (19%)</span>
                      <span className="font-bold text-stone-900">{taxAmount.toFixed(2)} TND</span>
                    </div>
                    <div className="pt-3 border-t border-stone-100 flex justify-between items-center">
                      <span className="text-stone-900 font-bold">Total à payer</span>
                      <span className="text-2xl font-black text-emerald-600">{totalAmount.toFixed(2)} TND</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={onClose}
                  className="flex-1 py-4 px-6 border border-stone-200 text-stone-600 rounded-2xl font-bold hover:bg-stone-50 transition-all"
                >
                  Annuler
                </button>
                <button 
                  onClick={() => setStep('documents')}
                  className="flex-[2] py-4 px-6 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-xl shadow-stone-900/20 flex items-center justify-center gap-3"
                >
                  Continuer
                </button>
              </div>
            </div>
          </>
        ) : step === 'documents' ? (
          <div className="p-10">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-bold text-stone-900">Vos Documents</h3>
              <button 
                onClick={() => setStep('details')}
                className="text-sm font-bold text-stone-400 hover:text-stone-600 transition-all"
              >
                Retour
              </button>
            </div>

            <div className="space-y-8 max-h-[60vh] overflow-y-auto pr-4 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">N° Téléphone</label>
                  <input 
                    type="tel"
                    required
                    value={docs.phone}
                    onChange={(e) => setDocs(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    placeholder="Ex: 24 123 456"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">N° CIN / Passeport</label>
                  <input 
                    type="text"
                    required
                    value={docs.cinNumber}
                    onChange={(e) => setDocs(prev => ({ ...prev, cinNumber: e.target.value }))}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    placeholder="Ex: 01234567"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">N° Permis</label>
                  <input 
                    type="text"
                    required
                    value={docs.licenseNumber}
                    onChange={(e) => setDocs(prev => ({ ...prev, licenseNumber: e.target.value }))}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    placeholder="Ex: 99/123456"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-bold text-stone-900 uppercase tracking-widest flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  Photos CIN / Passeport
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <DocumentUpload 
                    label="Recto" 
                    value={docs.cinRecto} 
                    onChange={(e) => handleFileUpload(e, 'cinRecto')} 
                  />
                  <DocumentUpload 
                    label="Verso" 
                    value={docs.cinVerso} 
                    onChange={(e) => handleFileUpload(e, 'cinVerso')} 
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-bold text-stone-900 uppercase tracking-widest flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  Photos Permis
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <DocumentUpload 
                    label="Recto" 
                    value={docs.licenseRecto} 
                    onChange={(e) => handleFileUpload(e, 'licenseRecto')} 
                  />
                  <DocumentUpload 
                    label="Verso" 
                    value={docs.licenseVerso} 
                    onChange={(e) => handleFileUpload(e, 'licenseVerso')} 
                  />
                </div>
              </div>
            </div>

            <div className="mt-10">
              <button 
                onClick={handleConfirm}
                disabled={loading || !docs.cinNumber || !docs.licenseNumber || !docs.phone}
                className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-xl shadow-stone-900/20 flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <CheckCircle className="w-5 h-5" />
                )}
                Confirmer la réservation
              </button>
              <p className="text-[10px] text-stone-400 text-center mt-4 italic">
                Vos documents sont nécessaires pour valider votre identité et préparer le contrat.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-16 text-center">
            <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8 animate-bounce">
              <CheckCircle className="w-12 h-12" />
            </div>
            <h3 className="text-3xl font-bold text-stone-900 mb-4">Demande Envoyée !</h3>
            <p className="text-stone-500 mb-10 max-w-sm mx-auto italic serif">
              Votre demande de réservation pour la {vehicle.brand} {vehicle.model} a été enregistrée. <span className="font-bold text-emerald-600">Veuillez attendre la confirmation</span> de notre équipe sur votre compte.
            </p>
            <button 
              onClick={onClose}
              className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20"
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentUpload({ label, value, onChange }: { label: string, value: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div className="relative group">
      <div className={`aspect-[4/3] rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center overflow-hidden ${value ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200 bg-stone-50 hover:border-emerald-400 hover:bg-emerald-50/30'}`}>
        {value ? (
          <>
            <img src={value} alt={label} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-6 h-6 text-white" />
            </div>
          </>
        ) : (
          <>
            <Upload className="w-6 h-6 text-stone-400 mb-2" />
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">{label}</span>
          </>
        )}
        <input 
          type="file" 
          accept="image/*" 
          onChange={onChange}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}
