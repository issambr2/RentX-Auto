import { doc, getDoc, setDoc, collection, addDoc, query, where, getDocs } from '../lib/api';
import { db } from '../lib/api';
import { UserProfile, Client } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';

export async function ensureUserProfile(
  user: { uid: string; email: string | null; displayName: string | null },
  extraData?: Partial<Client>
) {
  if (!user.uid) return null;

  const userDocRef = doc(db, 'users', user.uid);
  let userDoc;
  try {
    userDoc = await getDoc(userDocRef);
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, `users/${user.uid}`);
    return null;
  }

  if (!userDoc.exists()) {
    // Determine role: bootstrap admin or regular user
    const isBootstrapAdmin = user.email?.toLowerCase() === 'brahemdesign@gmail.com' || 
                            user.email?.toLowerCase() === 'siwarbraham98@gmail.com' ||
                            user.email?.toLowerCase() === 'admin@dhokkar.tn';
    const role = isBootstrapAdmin ? 'master_admin' : 'customer';
    
    const newUser: UserProfile = {
      id: user.uid,
      email: user.email || '',
      fullName: (user as any).fullName || user.displayName || (user.email && !user.email.includes('@') ? user.email : user.email?.split('@')[0]) || 'Utilisateur',
      role: role,
      permissions: role === 'customer' ? ['website'] : [],
      isActive: true,
      lastLogin: new Date().toISOString()
    };
    
    try {
      await setDoc(userDocRef, newUser);

      // If it's a customer, also create a Client entry in all active offices
      if (role === 'customer') {
        try {
          const officesSnapshot = await getDocs(collection(db, 'offices'));
          const activeOffices = officesSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter((o: any) => o.isActive)
            .map(o => o.id);

          const officesToCreateIn = activeOffices.length > 0 ? activeOffices : ['bureau-chedli', 'bureau-aymen'];
          
          for (const officeId of officesToCreateIn) {
            const clientData: Partial<Client> = {
              authUid: newUser.id,
              name: newUser.fullName,
              email: newUser.email,
              customerType: 'individual',
              category: 'regular',
              loyaltyPoints: 0,
              loyaltyStatus: 'bronze',
              phone: '',
              licenseNumber: '',
              licenseExpiry: '',
              address: '',
              city: '',
              source: 'website',
              officeId: officeId,
              createdAt: new Date().toISOString(),
              ...extraData
            };
            
            // Check if client already exists with this email and officeId to avoid duplicates
            const clientsRef = collection(db, 'clients');
            const q = query(clientsRef, where('email', '==', newUser.email), where('officeId', '==', officeId));
            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) {
              await addDoc(clientsRef, clientData);
            } else {
              // Update existing client with website source and extra data
              const existingClientDoc = querySnapshot.docs[0];
              await setDoc(existingClientDoc.ref, { ...extraData, authUid: newUser.id, source: 'website' }, { merge: true });
            }
          }
        } catch (e) {
          console.error('Error creating clients in offices:', e);
        }
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `users/${user.uid}`);
    }
    return newUser;
  } else {
    const data = userDoc.data() as UserProfile;
    // Force master_admin role and active status for bootstrap emails even if they already exist
    const isBootstrapAdmin = user.email?.toLowerCase() === 'brahemdesign@gmail.com' || 
                            user.email?.toLowerCase() === 'siwarbraham98@gmail.com' ||
                            user.email?.toLowerCase() === 'admin@dhokkar.tn';
    const updatedRole = isBootstrapAdmin ? 'master_admin' : data.role;
    const updatedActive = isBootstrapAdmin ? true : data.isActive;
    
    try {
      await setDoc(userDocRef, { 
        ...data, 
        role: updatedRole, 
        isActive: updatedActive,
        lastLogin: new Date().toISOString() 
      }, { merge: true });
      
      // Update the local data object too
      data.role = updatedRole;
      data.isActive = updatedActive;
      
      // If extra data is provided, update all client documents associated with this email
      if (extraData && Object.keys(extraData).length > 0) {
        try {
          const clientsRef = collection(db, 'clients');
          const q = query(clientsRef, where('email', '==', user.email));
          const querySnapshot = await getDocs(q);
          
          const updatePromises = querySnapshot.docs.map(clientDoc => 
            setDoc(clientDoc.ref, { ...extraData, authUid: user.uid, source: 'website' }, { merge: true })
          );
          
          await Promise.all(updatePromises);
        } catch (e) {
          console.error('Error updating client records:', e);
        }
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`);
    }
    return data;
  }
}

export async function getUserProfile(uid: string) {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    return userDoc.exists() ? (userDoc.data() as UserProfile) : null;
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, `users/${uid}`);
    return null;
  }
}
