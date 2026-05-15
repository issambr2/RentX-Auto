import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Search, ArrowRight, Plane } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { clsx } from 'clsx';
import { db, doc, onSnapshot } from '../../lib/api';

interface VehicleSearchProps {
  onSearch: (data: {
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    pickupLocation: string;
    returnLocation: string;
    type?: 'rental' | 'transfer';
  }) => void;
}

export function Hero({ onSearch }: VehicleSearchProps) {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 3), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('10:00');
  const [pickupLocation, setPickupLocation] = useState('Agence Centrale');
  const [returnLocation, setReturnLocation] = useState('Agence Centrale');
  const [searchType, setSearchType] = useState<'rental' | 'transfer'>('rental');
  
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

  const [settings, setSettings] = useState({
    heroImageUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=1920',
    heroTitle: "Louez l'excellence pour vos trajets.",
    heroSubtitle: "Découvrez notre flotte de véhicules premium et profitez d'un service de location professionnel, flexible et sans compromis."
  });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'siteSettings', 'homepage'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setSettings({
          heroImageUrl: data.heroImageUrl || settings.heroImageUrl,
          heroTitle: data.heroTitle || settings.heroTitle,
          heroSubtitle: data.heroSubtitle || settings.heroSubtitle
        });
      }
    });

    return () => unsub();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({
      startDate,
      endDate,
      startTime,
      endTime,
      pickupLocation,
      returnLocation,
      type: searchType
    });
    const element = document.getElementById('vehicles');
    if (element) element.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="relative min-h-[100vh] flex items-center pt-20 pb-20 overflow-hidden">
      {/* Background with overlay */}
      <div className="absolute inset-0 z-0">
        <img 
          src={settings.heroImageUrl} 
          alt="Luxury Car" 
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-stone-900/90 via-stone-900/70 to-stone-900/40" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30 mb-6 backdrop-blur-sm">
            <span className="text-[10px] font-bold uppercase tracking-widest">Premium Car Rental</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-[1.1] tracking-tight whitespace-pre-line">
            {settings.heroTitle.includes('trajets.') ? (
              <>Louez l'excellence pour vos <span className="text-emerald-500 italic serif">trajets.</span></>
            ) : settings.heroTitle}
          </h1>
          <p className="text-lg text-stone-300 mb-10 max-w-lg leading-relaxed italic serif">
            {settings.heroSubtitle}
          </p>

          {/* Search Box */}
          <div className="bg-white/95 backdrop-blur-md p-6 rounded-[2.5rem] shadow-2xl shadow-black/40 border border-white/20">
            <div className="flex gap-2 mb-6 p-1 bg-stone-100 rounded-2xl w-fit">
              <button
                onClick={() => setSearchType('rental')}
                className={clsx(
                  "py-2.5 px-6 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                  searchType === 'rental' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:bg-stone-50"
                )}
              >
                <MapPin className="w-3.5 h-3.5" />
                Location
              </button>
              <button
                onClick={() => setSearchType('transfer')}
                className={clsx(
                  "py-2.5 px-6 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                  searchType === 'transfer' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:bg-stone-50"
                )}
              >
                <Plane className="w-3.5 h-3.5" />
                Transfert
              </button>
            </div>

            <form onSubmit={handleSearch} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Pickup Location */}
                <div className="flex flex-col gap-1 px-4 py-2 bg-stone-50 rounded-2xl border border-stone-100 hover:border-emerald-200 transition-all">
                  <label className="text-[9px] font-extrabold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                    <MapPin className="w-3 h-3 text-emerald-500" /> Prise en charge
                  </label>
                  <select 
                    value={pickupLocation}
                    onChange={(e) => setPickupLocation(e.target.value)}
                    className="bg-transparent border-none p-0 text-sm font-bold text-stone-900 focus:ring-0 w-full cursor-pointer"
                  >
                    {locations.map((loc) => (
                      <option key={loc.name} value={loc.name}>{loc.name}</option>
                    ))}
                  </select>
                </div>

                {/* Return Location */}
                <div className="flex flex-col gap-1 px-4 py-2 bg-stone-50 rounded-2xl border border-stone-100 hover:border-emerald-200 transition-all">
                  <label className="text-[9px] font-extrabold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                    <ArrowRight className="w-3 h-3 text-emerald-500" /> Restitution
                  </label>
                  <select 
                    value={returnLocation}
                    onChange={(e) => setReturnLocation(e.target.value)}
                    className="bg-transparent border-none p-0 text-sm font-bold text-stone-900 focus:ring-0 w-full cursor-pointer"
                  >
                    {locations.map((loc) => (
                      <option key={loc.name} value={loc.name}>{loc.name}</option>
                    ))}
                  </select>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1 px-4 py-2 bg-stone-50 rounded-2xl border border-stone-100 hover:border-emerald-200 transition-all">
                    <label className="text-[9px] font-extrabold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                      <Calendar className="w-3 h-3 text-emerald-500" /> Début
                    </label>
                    <input 
                      type="date" 
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="bg-transparent border-none p-0 text-sm font-bold text-stone-900 focus:ring-0 w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1 px-4 py-2 bg-stone-50 rounded-2xl border border-stone-100 hover:border-emerald-200 transition-all">
                    <label className="text-[9px] font-extrabold text-stone-400 uppercase tracking-widest">
                      Heure
                    </label>
                    <input 
                      type="time" 
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="bg-transparent border-none p-0 text-sm font-bold text-stone-900 focus:ring-0 w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1 px-4 py-2 bg-stone-50 rounded-2xl border border-stone-100 hover:border-emerald-200 transition-all">
                    <label className="text-[9px] font-extrabold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                      <Calendar className="w-3 h-3 text-emerald-500" /> Fin
                    </label>
                    <input 
                      type="date" 
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="bg-transparent border-none p-0 text-sm font-bold text-stone-900 focus:ring-0 w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1 px-4 py-2 bg-stone-50 rounded-2xl border border-stone-100 hover:border-emerald-200 transition-all">
                    <label className="text-[9px] font-extrabold text-stone-400 uppercase tracking-widest">
                      Heure
                    </label>
                    <input 
                      type="time" 
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="bg-transparent border-none p-0 text-sm font-bold text-stone-900 focus:ring-0 w-full"
                    />
                  </div>
                </div>
              </div>

              <button 
                type="submit"
                className="w-full bg-emerald-600 text-white px-8 py-5 rounded-2xl font-bold hover:bg-emerald-500 transition-all flex items-center justify-center gap-3 shadow-xl shadow-emerald-600/30 group"
              >
                <Search className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span className="text-lg">Rechercher un véhicule</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Decorative elements */}
      <div className="absolute bottom-10 right-10 hidden lg:block">
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-3xl font-bold text-white">24/7</p>
            <p className="text-xs text-stone-400 uppercase tracking-widest">Support Client</p>
          </div>
          <div className="w-px h-12 bg-white/20" />
          <div className="text-right">
            <p className="text-3xl font-bold text-white">+50</p>
            <p className="text-xs text-stone-400 uppercase tracking-widest">Véhicules</p>
          </div>
        </div>
      </div>
    </div>
  );
}
