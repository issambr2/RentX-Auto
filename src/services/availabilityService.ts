import { collection, getDocs, query, where } from '../lib/api';
import { db } from '../lib/api';
import { Rental, Vehicle } from '../types';
import { isWithinInterval, parseISO, areIntervalsOverlapping } from 'date-fns';

export async function getAvailableVehicles(startDate: string, endDate: string): Promise<Vehicle[]> {
  try {
    // 1. Get all active vehicles (from all offices)
    const vehiclesSnap = await getDocs(collection(db, 'vehicles'));
    const allVehicles = vehiclesSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Vehicle))
      .filter(v => v.status !== 'inactive' && v.status !== 'maintenance');

    // 2. Get all rentals that overlap with the requested period
    const rentalsSnap = await getDocs(collection(db, 'rentals'));
    const allRentals = rentalsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Rental));

    const requestedInterval = {
      start: parseISO(startDate),
      end: parseISO(endDate)
    };

    const unavailableVehicleIds = new Set<string>();

    allRentals.forEach(rental => {
      if (['cancelled', 'completed', 'terminated'].includes(rental.status) || !rental.vehicleId) return;

      const rentalInterval = {
        start: parseISO(rental.startDate),
        end: parseISO(rental.endDate)
      };

      if (areIntervalsOverlapping(requestedInterval, rentalInterval)) {
        unavailableVehicleIds.add(rental.vehicleId);
      }
    });

    // 3. Return vehicles that are not in the unavailable set
    return allVehicles.filter(v => !unavailableVehicleIds.has(v.id));
  } catch (error) {
    console.error("Error checking availability:", error);
    return [];
  }
}
