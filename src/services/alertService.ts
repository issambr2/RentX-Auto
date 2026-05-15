import { collection, getDocs, addDoc, query, where, Timestamp, doc, getDoc, setDoc } from '../lib/api';
import { db } from '../lib/api';
import { Vehicle, AppNotification } from '../types';
import { differenceInDays, parseISO } from 'date-fns';

const SETTINGS_DOC = 'settings/system';

export async function getWarningPeriod(): Promise<number> {
  try {
    const settingsDoc = await getDoc(doc(db, SETTINGS_DOC));
    if (settingsDoc.exists()) {
      return settingsDoc.data().warningPeriod || 15;
    }
    return 15;
  } catch (error) {
    console.error("Error getting warning period:", error);
    return 15;
  }
}

export async function setWarningPeriod(days: number): Promise<void> {
  try {
    await setDoc(doc(db, SETTINGS_DOC), { warningPeriod: days }, { merge: true });
  } catch (error) {
    console.error("Error setting warning period:", error);
  }
}

export async function checkVehicleExpirations() {
  try {
    const res = await fetch('/api/notifications/sync', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        'Content-Type': 'application/json'
      }
    });
    if (!res.ok) throw new Error('Erreur de synchronisation des notifications');
    return await res.json();
  } catch (error) {
    console.error("Error syncing notifications:", error);
  }
}
