import React, { useState } from 'react';
import { Car, Fuel, Gauge, Users, ArrowRight, X, ChevronLeft, ChevronRight, Info, CheckCircle2 } from 'lucide-react';
import { Vehicle } from '../../types';
import { clsx } from 'clsx';

interface VehicleCardProps {
  vehicle: Vehicle;
  onBook: (vehicle: Vehicle) => void;
  returnDate?: string;
}

export function VehicleCard({ vehicle, onBook, returnDate }: VehicleCardProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const getVehicleImage = (index: number = 0) => {
    if (vehicle.images && vehicle.images.length > index) {
      return vehicle.images[index];
    }
    const images: Record<string, string> = {
      economy: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&q=80&w=800',
      compact: 'https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&q=80&w=800',
      sedan: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&q=80&w=800',
      suv: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=800',
      luxury: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=800',
      van: 'https://images.unsplash.com/photo-1536700503339-1e4b06520771?auto=format&fit=crop&q=80&w=800',
    };
    return images[vehicle.type] || images.sedan;
  };

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (vehicle.images && vehicle.images.length > 0) {
      setCurrentImageIndex((prev) => (prev + 1) % vehicle.images!.length);
    }
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (vehicle.images && vehicle.images.length > 0) {
      setCurrentImageIndex((prev) => (prev - 1 + vehicle.images!.length) % vehicle.images!.length);
    }
  };

  return (
    <>
      <div className="group bg-white rounded-[2rem] border border-stone-100 overflow-hidden hover:shadow-2xl hover:shadow-stone-200/50 transition-all duration-500 flex flex-col">
        <div className="relative h-64 overflow-hidden cursor-pointer" onClick={() => setIsDetailsOpen(true)}>
          <img 
            src={getVehicleImage(0)} 
            alt={`${vehicle.brand} ${vehicle.model}`}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            referrerPolicy="no-referrer"
          />
          <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
            <div className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl shadow-sm">
              <p className="text-lg font-black text-stone-900">{vehicle.pricePerDay} <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">TND / Jour</span></p>
            </div>
            <div className="bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-sm flex items-center gap-2">
              <div className="w-12 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div 
                  className={clsx(
                    "h-full transition-all",
                    (vehicle.fuelLevel || 0) > 50 ? "bg-emerald-500" : (vehicle.fuelLevel || 0) > 20 ? "bg-amber-500" : "bg-red-500"
                  )}
                  style={{ width: `${vehicle.fuelLevel || 0}%` }}
                />
              </div>
              <span className="text-[10px] font-bold text-stone-600">{vehicle.fuelLevel || 0}%</span>
            </div>
          </div>
          
          {vehicle.images && vehicle.images.length > 1 && (
            <div className="absolute bottom-4 right-4 bg-stone-900/60 backdrop-blur-md px-2 py-1 rounded-lg text-[10px] text-white font-bold">
              +{vehicle.images.length - 1} photos
            </div>
          )}

          <div className="absolute bottom-4 left-4 flex gap-2">
            <span className="px-3 py-1 bg-stone-900/80 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-widest rounded-full">
              {vehicle.transmission === 'automatic' ? 'Auto' : 'Manuel'}
            </span>
            <span className="px-3 py-1 bg-emerald-500/80 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-widest rounded-full">
              {vehicle.fuelType}
            </span>
            {vehicle.status === 'rented' || vehicle.status === 'occupied' ? (
              <span className="px-3 py-1 bg-red-500/80 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-widest rounded-full">
                Occupé {returnDate ? `jusqu'au ${new Date(returnDate).toLocaleDateString()}` : ''}
              </span>
            ) : (
              <span className="px-3 py-1 bg-emerald-600/80 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-widest rounded-full">
                Disponible
              </span>
            )}
          </div>
        </div>

        <div className="p-8 flex-1 flex flex-col">
          <div className="mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-bold text-stone-900 group-hover:text-emerald-600 transition-colors">{vehicle.brand} {vehicle.model}</h3>
                <p className="text-sm text-stone-400 italic serif">
                  {vehicle.type ? (vehicle.type.charAt(0).toUpperCase() + vehicle.type.slice(1)) : 'Véhicule'} • {vehicle.year}
                </p>
              </div>
              <button 
                onClick={() => setIsDetailsOpen(true)}
                className="p-2 bg-stone-50 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                title="Plus de détails"
              >
                <Info className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="flex items-center gap-3 text-stone-500">
              <div className="w-8 h-8 bg-stone-50 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <span className="text-xs font-medium">5 Places</span>
            </div>
            <div className="flex items-center gap-3 text-stone-500">
              <div className="w-8 h-8 bg-stone-50 rounded-lg flex items-center justify-center">
                <Gauge className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-stone-900">{(vehicle.mileage || 0).toLocaleString()} km</span>
            </div>
          </div>

          <button 
            onClick={() => onBook(vehicle)}
            disabled={vehicle.status === 'rented' || vehicle.status === 'occupied'}
            className="mt-auto w-full flex items-center justify-center gap-3 bg-stone-50 text-stone-900 py-4 rounded-2xl font-bold group-hover:bg-emerald-600 group-hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:group-hover:bg-stone-50 disabled:group-hover:text-stone-900"
          >
            <span>{vehicle.status === 'rented' || vehicle.status === 'occupied' ? 'Indisponible' : 'Réserver maintenant'}</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>

      {/* Details Modal */}
      {isDetailsOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 flex flex-col md:flex-row max-h-[90vh]">
            {/* Image Gallery */}
            <div className="relative w-full md:w-1/2 h-64 md:h-auto bg-stone-100">
              <img 
                src={getVehicleImage(currentImageIndex)} 
                alt={`${vehicle.brand} ${vehicle.model}`}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              
              {vehicle.images && vehicle.images.length > 1 && (
                <>
                  <button 
                    onClick={prevImage}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/20 hover:bg-white/40 text-white rounded-full backdrop-blur-md transition-all"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button 
                    onClick={nextImage}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/20 hover:bg-white/40 text-white rounded-full backdrop-blur-md transition-all"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                    {vehicle.images.map((_, i) => (
                      <div 
                        key={i} 
                        className={`w-2 h-2 rounded-full transition-all ${i === currentImageIndex ? 'bg-white w-4' : 'bg-white/40'}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Vehicle Info */}
            <div className="flex-1 p-10 overflow-y-auto custom-scrollbar">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-4xl font-bold text-stone-900">{vehicle.brand} {vehicle.model}</h3>
                  <p className="text-lg text-stone-400 italic serif">{vehicle.type} • {vehicle.year}</p>
                </div>
                <button 
                  onClick={() => setIsDetailsOpen(false)}
                  className="p-2 bg-stone-50 text-stone-400 hover:text-stone-900 rounded-full transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-10">
                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Transmission</p>
                  <p className="font-bold text-stone-900 capitalize">{vehicle.transmission}</p>
                </div>
                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Carburant</p>
                  <p className="font-bold text-stone-900 capitalize">{vehicle.fuelType}</p>
                </div>
                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Kilométrage</p>
                  <p className="font-bold text-stone-900">{(vehicle.mileage || 0).toLocaleString()} km</p>
                </div>
                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Couleur</p>
                  <p className="font-bold text-stone-900">{vehicle.color || 'Non spécifiée'}</p>
                </div>
              </div>

              <div className="space-y-6 mb-10">
                <h4 className="text-sm font-bold text-stone-900 uppercase tracking-widest">Équipements & Options</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 text-sm text-stone-600">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Climatisation</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-stone-600">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Bluetooth / USB</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-stone-600">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>GPS Intégré</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-stone-600">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Aide au stationnement</span>
                  </div>
                </div>
              </div>

              {vehicle.notes && (
                <div className="mb-10">
                  <h4 className="text-sm font-bold text-stone-900 uppercase tracking-widest mb-4">Description</h4>
                  <p className="text-stone-500 text-sm leading-relaxed italic serif">{vehicle.notes}</p>
                </div>
              )}

              <div className="flex items-center justify-between p-6 bg-emerald-50 rounded-3xl border border-emerald-100">
                <div>
                  <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Prix par jour</p>
                  <p className="text-3xl font-black text-emerald-600">{vehicle.pricePerDay} TND</p>
                </div>
                <button 
                  onClick={() => { setIsDetailsOpen(false); onBook(vehicle); }}
                  disabled={vehicle.status === 'rented' || vehicle.status === 'occupied'}
                  className="py-4 px-8 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-xl shadow-stone-900/20 disabled:opacity-50"
                >
                  {vehicle.status === 'rented' || vehicle.status === 'occupied' ? 'Indisponible' : 'Réserver'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
