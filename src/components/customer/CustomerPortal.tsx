import React, { useState, useEffect } from 'react';
import { CustomerNavbar } from './CustomerNavbar';
import { Hero } from './Hero';
import { VehicleCard } from './VehicleCard';
import { BookingModal } from './BookingModal';
import { CustomerReservations } from './CustomerReservations';
import { SettingsPanel } from '../SettingsPanel';
import { Rental, Vehicle, UserProfile } from '../../types';
import { getAvailableVehicles } from '../../services/availabilityService';
import { collection, getDocs, query, where, onSnapshot, doc, db } from '../../lib/api';
import { Loader2, AlertCircle, Info, ShieldCheck, Clock, MapPin as MapPinIcon, Phone, Mail, Instagram, Facebook, Car } from 'lucide-react';

import { Logo } from '../Logo';

interface CustomerPortalProps {
  user: any;
  profile: UserProfile | null;
  onLogout: () => void;
  onAuthClick: () => void;
  onDashboardClick: () => void;
}

export function CustomerPortal({ user, profile, onLogout, onAuthClick, onDashboardClick }: CustomerPortalProps) {
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
  const [displayVehicles, setDisplayVehicles] = useState<Vehicle[]>([]);
  const [activeRentals, setActiveRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchDates, setSearchDates] = useState<{ 
    start: string; 
    end: string; 
    startTime: string;
    endTime: string;
    pickupLocation: string;
    returnLocation: string;
    type?: 'rental' | 'transfer' 
  } | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isReservationsModalOpen, setIsReservationsModalOpen] = useState(false);
  const [siteSettings, setSiteSettings] = useState({
    contactEmail: 'contact@rentx-auto.tn',
    contactPhone: '+216 24 621 605',
    address: 'Msaken, Sousse, Tunisie',
    facebookUrl: '',
    instagramUrl: ''
  });

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'siteSettings', 'homepage'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setSiteSettings({
          contactEmail: data.contactEmail || 'contact@rentx-auto.tn',
          contactPhone: data.contactPhone || '+216 24 621 605',
          address: data.address || 'Msaken, Sousse, Tunisie',
          facebookUrl: data.facebookUrl || '',
          instagramUrl: data.instagramUrl || ''
        });
      }
    });

    setLoading(true);
    const unsubVehicles = onSnapshot(collection(db, 'vehicles'), (snapshot) => {
      const vehicles = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Vehicle))
        .filter(v => v.status !== 'inactive' && v.status !== 'maintenance');
      setAllVehicles(vehicles);
      if (!searchDates) {
        setDisplayVehicles(vehicles);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching vehicles:", error);
      setLoading(false);
    });

    const unsubRentals = onSnapshot(query(collection(db, 'rentals'), where('status', '==', 'active')), (snapshot) => {
      setActiveRentals(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Rental)));
    });

    return () => {
      unsubVehicles();
      unsubRentals();
    };
  }, [searchDates]);

  const handleSearch = async (data: {
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    pickupLocation: string;
    returnLocation: string;
    type?: 'rental' | 'transfer';
  }) => {
    setLoading(true);
    setSearchDates({ 
      start: data.startDate, 
      end: data.endDate, 
      startTime: data.startTime, 
      endTime: data.endTime,
      pickupLocation: data.pickupLocation,
      returnLocation: data.returnLocation,
      type: data.type 
    });
    const vehicles = await getAvailableVehicles(data.startDate, data.endDate);
    setDisplayVehicles(vehicles);
    setLoading(false);
  };

  const handleBook = (vehicle: Vehicle) => {
    if (!user) {
      onAuthClick();
      return;
    }
    setSelectedVehicle(vehicle);
    setIsBookingModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-white">
      <CustomerNavbar 
        user={user} 
        profile={profile} 
        onLogout={onLogout} 
        onAuthClick={onAuthClick}
        onDashboardClick={onDashboardClick}
        onSettingsClick={() => setIsSettingsModalOpen(true)}
        onReservationsClick={() => setIsReservationsModalOpen(true)}
      />
      
      <Hero onSearch={handleSearch} />

      <section id="vehicles" className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
          <div>
            <h2 className="text-4xl font-bold text-stone-900 mb-4 tracking-tight">Nos Véhicules <span className="text-emerald-600 italic serif">Disponibles</span></h2>
            <p className="text-stone-500 max-w-lg italic serif">
              {searchDates 
                ? `Véhicules disponibles du ${new Date(searchDates.start).toLocaleDateString()} au ${new Date(searchDates.end).toLocaleDateString()}`
                : "Sélectionnez vos dates pour voir les véhicules disponibles."}
            </p>
          </div>
          {searchDates && (
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
              <Info className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-widest">{displayVehicles.length} Véhicules trouvés</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
            <p className="text-stone-400 font-medium italic">Recherche des meilleures options pour vous...</p>
          </div>
        ) : displayVehicles.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {displayVehicles.map(vehicle => {
              const activeRental = activeRentals.find(r => r.vehicleId === vehicle.id);
              return (
                <VehicleCard 
                  key={vehicle.id} 
                  vehicle={vehicle} 
                  onBook={handleBook} 
                  returnDate={activeRental?.endDate}
                />
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center bg-stone-50 rounded-[3rem] border border-dashed border-stone-200">
            <div className="w-16 h-16 bg-stone-100 rounded-2xl flex items-center justify-center mb-6">
              <AlertCircle className="w-8 h-8 text-stone-400" />
            </div>
            <h3 className="text-2xl font-bold text-stone-900 mb-2">Aucun véhicule disponible</h3>
            <p className="text-stone-500 max-w-md mx-auto">
              Désolé, tous nos véhicules sont déjà réservés pour ces dates. Essayez d'autres dates ou contactez-nous directement.
            </p>
          </div>
        )}
      </section>

      {/* Services Section */}
      <section id="services" className="py-24 bg-stone-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-bold mb-4 tracking-tight">Pourquoi nous <span className="text-emerald-50 italic serif focus:ring-0">choisir ?</span></h2>
            <p className="text-stone-400 max-w-2xl mx-auto italic serif">Un service premium conçu pour votre confort et votre sécurité.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="p-8 bg-white/5 rounded-3xl border border-white/10 hover:bg-white/10 transition-all">
              <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-emerald-600/20">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-4">Sécurité Garantie</h3>
              <p className="text-stone-400 text-sm leading-relaxed">Tous nos véhicules sont rigoureusement entretenus et assurés pour votre tranquillité d'esprit.</p>
            </div>
            <div className="p-8 bg-white/5 rounded-3xl border border-white/10 hover:bg-white/10 transition-all">
              <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-emerald-600/20">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-4">Support 24/7</h3>
              <p className="text-stone-400 text-sm leading-relaxed">Notre équipe est à votre disposition à tout moment pour vous assister durant votre location.</p>
            </div>
            <div className="p-8 bg-white/5 rounded-3xl border border-white/10 hover:bg-white/10 transition-all">
              <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-emerald-600/20">
                <MapPinIcon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-4">Livraison Flexible</h3>
              <p className="text-stone-400 text-sm leading-relaxed">Nous livrons votre véhicule à l'aéroport, à votre hôtel ou à votre domicile selon vos besoins.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="py-20 bg-white border-t border-stone-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <Logo className="w-32" />
              </div>
              <p className="text-stone-500 max-w-sm leading-relaxed italic serif">
                Votre partenaire de confiance pour la location de véhicules premium en Tunisie. Excellence, confort et sécurité à chaque kilomètre.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-bold text-stone-900 uppercase tracking-widest mb-6">Contact</h4>
              <ul className="space-y-4 text-sm text-stone-500">
                <li className="flex items-center gap-3"><MapPinIcon className="w-4 h-4 text-emerald-600" /> {siteSettings.address}</li>
                <li className="flex items-center gap-3"><Phone className="w-4 h-4 text-emerald-600" /> {siteSettings.contactPhone}</li>
                <li className="flex items-center gap-3"><Mail className="w-4 h-4 text-emerald-600" /> {siteSettings.contactEmail}</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-bold text-stone-900 uppercase tracking-widest mb-6">Suivez-nous</h4>
              <div className="flex gap-4">
                {siteSettings.instagramUrl && (
                  <a href={siteSettings.instagramUrl} target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-stone-50 rounded-xl flex items-center justify-center hover:bg-emerald-50 hover:text-emerald-600 transition-all cursor-pointer">
                    <Instagram className="w-5 h-5" />
                  </a>
                )}
                {siteSettings.facebookUrl && (
                  <a href={siteSettings.facebookUrl} target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-stone-50 rounded-xl flex items-center justify-center hover:bg-emerald-50 hover:text-emerald-600 transition-all cursor-pointer">
                    <Facebook className="w-5 h-5" />
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="pt-8 border-t border-stone-100 text-center">
            <p className="text-xs text-stone-400 font-medium uppercase tracking-widest">&copy; {new Date().getFullYear()} RentX Auto. Design by Brahem Design.</p>
          </div>
        </div>
      </footer>

      {selectedVehicle && searchDates && (
        <BookingModal 
          isOpen={isBookingModalOpen}
          onClose={() => setIsBookingModalOpen(false)}
          vehicle={selectedVehicle}
          startDate={searchDates.start}
          endDate={searchDates.end}
          startTime={searchDates.startTime}
          endTime={searchDates.endTime}
          pickupLocation={searchDates.pickupLocation}
          returnLocation={searchDates.returnLocation}
          type={searchDates.type}
          user={user}
          profile={profile}
        />
      )}

      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="p-8 border-b border-stone-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-2xl font-bold text-stone-900">Mon Profil</h3>
              <button onClick={() => setIsSettingsModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
                <AlertCircle className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <div className="p-8">
              <SettingsPanel />
            </div>
          </div>
        </div>
      )}

      {isReservationsModalOpen && user && (
        <CustomerReservations 
          user={user}
          onClose={() => setIsReservationsModalOpen(false)}
        />
      )}
    </div>
  );
}
