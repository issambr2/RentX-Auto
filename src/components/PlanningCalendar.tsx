import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from '../lib/api';
import { db } from '../lib/api';
import { Vehicle, Rental, Client } from '../types';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isWithinInterval, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Car as CarIcon, Calendar as CalendarIcon, Info, User, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { useOffice } from '../contexts/OfficeContext';

export function PlanningCalendar({ setActiveTab }: { setActiveTab: (tab: any) => void }) {
  const { currentOffice } = useOffice();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'reserved' | 'completed'>('all');

  useEffect(() => {
    if (!currentOffice) return;

    const unsubVehicles = onSnapshot(query(collection(db, 'vehicles'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vehicle[]);
    });

    const unsubRentals = onSnapshot(query(collection(db, 'rentals'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setRentals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Rental[]);
    });

    const unsubClients = onSnapshot(query(collection(db, 'clients'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Client[]);
      setLoading(false);
    });

    return () => {
      unsubVehicles();
      unsubRentals();
      unsubClients();
    };
  }, [currentOffice]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getRentalForVehicleOnDay = (vehicleId: string, day: Date) => {
    return rentals.find(r => {
      if (r.vehicleId !== vehicleId || r.status === 'cancelled') return false;
      const start = parseISO(r.startDate);
      const end = parseISO(r.endDate);
      return isWithinInterval(day, { start, end });
    });
  };

  const getClient = (id: string) => clients.find(c => c.id === id);
  const getVehicle = (id: string) => vehicles.find(v => v.id === id);

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  if (loading) return <div className="p-8 text-center">Chargement du planning...</div>;

  const filteredRentals = rentals.filter(r => {
    if (filterStatus === 'all') return true;
    return r.status === filterStatus;
  }).sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <div className="space-y-6 max-w-full overflow-hidden pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between bg-white p-6 rounded-3xl border border-stone-200 shadow-sm gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-stone-900 tracking-tight capitalize">
              {format(currentDate, 'MMMM yyyy', { locale: fr })}
            </h2>
            <p className="text-stone-500 text-sm italic serif">Visualisation globale des disponibilités.</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-stone-100 p-1 rounded-xl">
            <button onClick={prevMonth} className="p-2 hover:bg-white rounded-lg transition-all text-stone-600">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={() => setCurrentDate(new Date())} className="px-4 py-2 hover:bg-white rounded-lg transition-all text-sm font-bold text-stone-900">
              Aujourd'hui
            </button>
            <button onClick={nextMonth} className="p-2 hover:bg-white rounded-lg transition-all text-stone-600">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          
          <button 
            onClick={() => setActiveTab('rentals')}
            className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-xl font-bold text-sm hover:bg-stone-800 transition-all shadow-sm"
          >
            <Clock className="w-4 h-4" />
            Gérer les Réservations
          </button>
          
          <button 
            onClick={() => setActiveTab('rentals')}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-500 transition-all shadow-sm"
          >
            <CalendarIcon className="w-4 h-4" />
            Nouvelle Réservation
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-stone-50/50">
                <th className="sticky left-0 z-20 bg-stone-50/50 p-4 border-b border-r border-stone-200 min-w-[200px] text-left text-xs font-bold text-stone-400 uppercase tracking-widest">
                  Véhicule
                </th>
                {days.map(day => (
                  <th 
                    key={day.toString()} 
                    className={clsx(
                      "p-2 border-b border-stone-200 min-w-[40px] text-center text-[10px] font-bold uppercase tracking-widest",
                      isSameDay(day, new Date()) ? "text-emerald-600 bg-emerald-50/50" : "text-stone-400"
                    )}
                  >
                    <div className="flex flex-col">
                      <span>{format(day, 'EEE', { locale: fr })}</span>
                      <span className="text-lg">{format(day, 'd')}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {vehicles.map(vehicle => (
                <tr key={vehicle.id} className="hover:bg-stone-50/30 transition-all group">
                  <td className="sticky left-0 z-10 bg-white group-hover:bg-stone-50 p-4 border-r border-stone-200">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-stone-100 rounded-lg flex items-center justify-center text-stone-400">
                        <CarIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-stone-900 text-sm truncate">{vehicle.brand} {vehicle.model}</p>
                        <p className="text-[10px] text-stone-400 font-mono">{vehicle.plate}</p>
                      </div>
                    </div>
                  </td>
                  {days.map(day => {
                    const rental = getRentalForVehicleOnDay(vehicle.id, day);
                    const isToday = isSameDay(day, new Date());
                    
                    return (
                      <td 
                        key={day.toString()} 
                        className={clsx(
                          "p-0 border-r border-stone-100 h-12 relative",
                          isToday && "bg-emerald-50/20"
                        )}
                      >
                        {rental && (
                          <div 
                            className={clsx(
                              "absolute inset-y-1 inset-x-0.5 rounded-md flex items-center justify-center text-[8px] font-bold text-white shadow-sm overflow-hidden cursor-help",
                              rental.status === 'active' ? "bg-emerald-500" : 
                              rental.status === 'reserved' ? "bg-amber-500" : 
                              rental.status === 'pending_confirmation' ? "bg-emerald-400" : 
                              "bg-stone-400"
                            )}
                            title={`Contrat: ${rental.contractNumber}\nP1: ${getClient(rental.clientId)?.name}${rental.secondDriverId ? `\nP2: ${getClient(rental.secondDriverId)?.name}` : ''}`}
                          >
                            <span className="truncate px-1">{getClient(rental.clientId)?.name?.split(' ')[0]}</span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6 p-4 bg-stone-50 rounded-2xl border border-stone-200">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-emerald-500 rounded-full" />
          <span className="text-xs font-bold text-stone-600 uppercase tracking-widest">Actif</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-amber-500 rounded-full" />
          <span className="text-xs font-bold text-stone-600 uppercase tracking-widest">Réservé</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-emerald-400 rounded-full" />
          <span className="text-xs font-bold text-stone-600 uppercase tracking-widest">A Confirmer</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-stone-400 rounded-full" />
          <span className="text-xs font-bold text-stone-600 uppercase tracking-widest">Terminé / Autre</span>
        </div>
        <div className="flex items-center gap-2 ml-auto text-stone-400">
          <Info className="w-4 h-4" />
          <span className="text-[10px] italic">Survolez une case pour voir les détails.</span>
        </div>
      </div>

      {/* Bottom Section: Rentals by Status */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
          <div>
            <h3 className="text-xl font-bold text-stone-900">Liste des Réservations & Locations</h3>
            <p className="text-sm text-stone-500 italic serif">Détails des contrats par statut.</p>
          </div>
          <div className="flex items-center gap-2 bg-stone-100 p-1 rounded-xl self-start sm:self-auto">
            <button 
              onClick={() => setFilterStatus('all')}
              className={clsx(
                "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                filterStatus === 'all' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
              )}
            >
              Tout
            </button>
            <button 
              onClick={() => setFilterStatus('active')}
              className={clsx(
                "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                filterStatus === 'active' ? "bg-emerald-500 text-white shadow-sm" : "text-stone-500 hover:text-stone-700"
              )}
            >
              Actif
            </button>
            <button 
              onClick={() => setFilterStatus('reserved')}
              className={clsx(
                "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                filterStatus === 'reserved' ? "bg-amber-500 text-white shadow-sm" : "text-stone-500 hover:text-stone-700"
              )}
            >
              Réservé
            </button>
            <button 
              onClick={() => setFilterStatus('completed')}
              className={clsx(
                "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                filterStatus === 'completed' ? "bg-emerald-500 text-white shadow-sm" : "text-stone-500 hover:text-stone-700"
              )}
            >
              Terminé
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredRentals.map(rental => {
            const vehicle = getVehicle(rental.vehicleId);
            const client = getClient(rental.clientId);
            return (
              <div key={rental.id} className="p-4 bg-stone-50 rounded-2xl border border-stone-100 hover:border-stone-200 transition-all group">
                <div className="flex justify-between items-start mb-3">
                  <span className={clsx(
                    "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md",
                    rental.status === 'active' ? "bg-emerald-50 text-emerald-600" :
                    rental.status === 'reserved' ? "bg-amber-50 text-amber-600" :
                    rental.status === 'pending_confirmation' ? "bg-emerald-50 text-emerald-600" :
                    "bg-stone-50 text-stone-600"
                  )}>
                    {rental.status === 'active' ? 'Actif' : 
                     rental.status === 'reserved' ? 'Réservé' : 
                     rental.status === 'pending_confirmation' ? 'A Confirmer' : 
                     'Terminé'}
                  </span>
                  <span className="text-[10px] font-mono text-stone-400">#{rental.contractNumber}</span>
                </div>
                <div className="space-y-1 mb-4">
                  <p className="font-bold text-stone-900 text-sm">{client?.name}</p>
                  <p className="text-xs text-stone-500">{vehicle?.brand} {vehicle?.model}</p>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-stone-200">
                  <div className="flex items-center gap-2 text-[10px] text-stone-400">
                    <CalendarIcon className="w-3 h-3" />
                    <span>{format(parseISO(rental.startDate), 'dd/MM')} - {format(parseISO(rental.endDate), 'dd/MM')}</span>
                  </div>
                  <span className="text-xs font-bold text-stone-900">{(rental.totalAmount || 0).toLocaleString()} TND</span>
                </div>
              </div>
            );
          })}
          {filteredRentals.length === 0 && (
            <div className="col-span-full py-12 text-center">
              <p className="text-stone-400 italic serif">Aucun contrat trouvé pour ce statut.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
