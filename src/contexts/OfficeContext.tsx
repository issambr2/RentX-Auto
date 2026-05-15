import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, doc, getDoc, setDoc, getDocs, deleteDoc } from '../lib/api';
import { db, auth } from '../lib/api';
import { Office, UserProfile } from '../types';

interface OfficeContextType {
  offices: Office[];
  currentOffice: Office | null;
  setCurrentOffice: (office: Office | null) => void;
  loading: boolean;
}

const OfficeContext = createContext<OfficeContextType | undefined>(undefined);

export function OfficeProvider({ children }: { children: React.ReactNode }) {
  const [offices, setOffices] = useState<Office[]>([]);
  const [currentOffice, setCurrentOffice] = useState<Office | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize offices if they don't exist
    const initOffices = async () => {
      const defaultOffices = [
        { id: 'bureau-central', name: 'Bureau Central', isActive: true }
      ];

      for (const office of defaultOffices) {
        try {
          const officeRef = doc(db, 'offices', office.id);
          const officeSnap = await getDoc(officeRef);
          if (!officeSnap.exists()) {
            if (auth.currentUser) {
              await setDoc(officeRef, office);
            }
          }
        } catch (e) {
          console.warn(`Could not initialize office ${office.id}:`, e);
        }
      }
    };

    initOffices();

    const unsub = onSnapshot(collection(db, 'offices'), (snapshot) => {
      const officeData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Office[];
      setOffices(officeData);
      
      // Try to restore last selected office from localStorage or user profile
      const restoreOffice = async () => {
        const savedOfficeId = localStorage.getItem('selectedOfficeId');
        let officeToSet = savedOfficeId ? officeData.find(o => o.id === savedOfficeId) : null;

        if (!officeToSet && auth.currentUser) {
          const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
          if (userSnap.exists()) {
            const profileId = userSnap.data().currentOfficeId;
            if (profileId) {
              officeToSet = officeData.find(o => o.id === profileId) || null;
            }
          }
        }

        // Auto-select if only one office exists
        if (!officeToSet && officeData.length === 1) {
          officeToSet = officeData[0];
        }

        if (officeToSet) {
          setCurrentOffice(officeToSet);
        }
        setLoading(false);
      };

      restoreOffice();
    });

    return () => unsub();
  }, []);

  const handleSetCurrentOffice = async (office: Office | null) => {
    setCurrentOffice(office);
    if (office) {
      localStorage.setItem('selectedOfficeId', office.id);
    } else {
      localStorage.removeItem('selectedOfficeId');
    }
    
    if (auth.currentUser) {
      try {
        await setDoc(doc(db, 'users', auth.currentUser.uid), {
          currentOfficeId: office?.id || null
        }, { merge: true });
      } catch (e) {
        console.error("Error saving current office to profile:", e);
      }
    }
  };

  return (
    <OfficeContext.Provider value={{ 
      offices, 
      currentOffice, 
      setCurrentOffice: handleSetCurrentOffice, 
      loading 
    }}>
      {children}
    </OfficeContext.Provider>
  );
}

export function useOffice() {
  const context = useContext(OfficeContext);
  if (context === undefined) {
    throw new Error('useOffice must be used within an OfficeProvider');
  }
  return context;
}
