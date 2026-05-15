// --- INTEGRATED SQLITE API CLIENT ---
// This file talks to the local Express backend (SQLite).

const API_BASE = '/api';

// Types for TS compatibility
export type User = any;
export type Unsubscribe = () => void;

// Auth State
let currentUser: any = null;
const authListeners: ((user: any) => void)[] = [];

// Helper to get token
export const getToken = () => {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token || token === 'null' || token === 'undefined' || token === '[object Object]') {
      // Try to get from cookie as fallback
      const cookies = document.cookie.split(';');
      const authCookie = cookies.find(c => c.trim().startsWith('auth_token='));
      if (authCookie) {
        const val = authCookie.split('=')[1];
        if (val && val !== 'null' && val !== 'undefined') return val;
      }
      return null;
    }
    // Basic JWT validity check (must have 3 parts separated by dots)
    if (!token.includes('.') || token.split('.').length !== 3) {
      return null;
    }
    return token;
  } catch (e) {
    return null;
  }
};

// Helper to sync token to cookie
const syncTokenToCookie = (token: string | null) => {
  if (token) {
    // Set cookie that lives for 7 days
    document.cookie = `auth_token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
  } else {
    // Remove cookie
    document.cookie = `auth_token=; path=/; max-age=0; SameSite=Lax`;
  }
};

// Helper for auth headers
const getAuthHeaders = (extraHeaders: any = {}) => {
  const token = getToken();
  const headers: any = { ...extraHeaders };
  if (token) {
    const bearer = `Bearer ${token}`;
    headers['Authorization'] = bearer;
    headers['X-Authorization'] = bearer;
    headers['X-Auth-Token'] = token;
  }
  return headers;
};

// Helper for safe JSON parsing
const safeJson = async (res: Response) => {
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      const text = await res.text();
      if (!text) return null;
      return JSON.parse(text);
    } catch (e) {
      console.error('JSON parsing error:', e);
      return null;
    }
  }
  return null;
};

// Helper for resilient fetch
const resilientFetch = async (url: string, options: any = {}, retries = 10) => {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (e: any) {
      if (i === retries - 1) throw e;
      const isNetworkError = e.message?.includes('Failed to fetch') || 
                            e.message?.includes('NetworkError') || 
                            e.message?.includes('network error') ||
                            e.name === 'TypeError';
                            
      if (isNetworkError) {
        console.warn(`[API] Fetch failed for ${url}, retrying (${i + 1}/${retries})...`);
        await new Promise(resolve => setTimeout(resolve, 500 * (i + 1))); // Faster backoff for more retries
      } else {
        throw e;
      }
    }
  }
  throw new Error('All retries failed');
};

// Helper for auth init
const initAuth = async () => {
  const token = getToken();
  if (token) {
    try {
      const url = `${API_BASE}/auth/me`;
      const res = await resilientFetch(url, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const user = await safeJson(res);
        if (user) {
          const latestToken = getToken();
          syncTokenToCookie(latestToken); 
          currentUser = { ...user, uid: user.id };
          authListeners.forEach(l => l(currentUser));
        }
      } else {
        if (res.status === 401) {
          localStorage.removeItem('auth_token');
          syncTokenToCookie(null);
          currentUser = null;
          authListeners.forEach(l => l(null));
        } else {
          console.error(`Auth check failed for ${url}:`, res.status);
        }
      }
    } catch (e) {
      console.error(`Auth init error for ${API_BASE}/auth/me:`, e);
      authListeners.forEach(l => l(null));
    }
  } else {
    setTimeout(() => authListeners.forEach(l => l(null)), 10);
  }
};

initAuth();

// --- AUTH API ---

export const auth: any = {
  currentUser: null,
  onAuthStateChanged: (callback: (user: any) => void) => {
    authListeners.push(callback);
    if (currentUser !== undefined) {
      setTimeout(() => callback(currentUser), 0);
    }
    return () => {
      const index = authListeners.indexOf(callback);
      if (index > -1) authListeners.splice(index, 1);
    };
  },
  app: {} as any
};

// Update currentUser periodically or on change
Object.defineProperty(auth, 'currentUser', {
  get: () => currentUser
});

export const getAuth = () => auth;
export const onAuthStateChanged = (authInstance: any, callback: (user: any) => void) => auth.onAuthStateChanged(callback);

export const loginWithEmail = async (email: string, pass: string) => {
  const url = `${API_BASE}/auth/login`;
  try {
    const res = await resilientFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    });
    
    if (!res.ok) {
      const error = await safeJson(res);
      throw new Error(error?.error || 'Identifiants invalides');
    }
    
    const data = await safeJson(res);
    if (!data) throw new Error('Données de connexion invalides');
    const { token, user } = data;
    localStorage.setItem('auth_token', token);
    syncTokenToCookie(token);
    currentUser = { ...user, uid: user.id };
    authListeners.forEach(l => l(currentUser));
    return { user: currentUser };
  } catch (e: any) {
    if (e.message?.includes('Failed to fetch')) {
      console.error(`Network error (Failed to fetch) for ${url}. Check if server is running.`);
    }
    throw e;
  }
};

export const signInWithEmailAndPassword = (authInstance: any, email: string, pass: string) => loginWithEmail(email, pass);

export const logout = async () => {
  localStorage.removeItem('auth_token');
  syncTokenToCookie(null);
  currentUser = null;
  authListeners.forEach(l => l(null));
};

export const signOut = logout;

export const resetPassword = async (email: string) => {
  return true;
};

export const sendPasswordResetEmail = (authInstance: any, email: string) => resetPassword(email);

export const registerWithEmail = async (email: string, pass: string, extraData: any = {}) => {
    const url = `${API_BASE}/auth/register`;
    try {
        const res = await resilientFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pass, ...extraData })
        });
        
        if (!res.ok) {
            const errorData = await safeJson(res);
            throw new Error(errorData?.error || 'Erreur lors de l\'inscription');
        }
        
        const data = await safeJson(res);
        if (data && data.token) {
            localStorage.setItem('auth_token', data.token);
            syncTokenToCookie(data.token);
            if (data.user) {
                currentUser = { ...data.user, uid: data.user.id };
                authListeners.forEach(l => l(currentUser));
            }
        }
        return data;
    } catch (e: any) {
        if (e.message?.includes('Failed to fetch')) {
            console.error(`Network error (Failed to fetch) for ${url}. Check if server is running.`);
        }
        throw e;
    }
};

export const createUserWithEmailAndPassword = (authInstance: any, email: string, pass: string) => registerWithEmail(email, pass);

export const updatePassword = async (user: any, newPassword: string) => {
  const url = `${API_BASE}/users/${currentUser.id}`;
  try {
    const res = await resilientFetch(url, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ password: newPassword })
    });
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('auth_token');
        currentUser = null;
        authListeners.forEach(l => l(null));
      }
      throw new Error('Échec de la mise à jour du mot de passe');
    }
    return true;
  } catch (e: any) {
    if (e.message?.includes('Failed to fetch')) {
      console.error(`Network error (Failed to fetch) for ${url}. Check if server is running.`);
    }
    throw e;
  }
};

// --- DATABASE API ---

export const db: any = {
  type: 'sqlite',
  toJSON: () => ({}),
  app: {} as any
};

export const getFirestore = () => db;

export const collection = (dbInstance: any, path: string) => ({ 
  type: 'collection', 
  path,
  id: path.split('/').pop(),
  parent: null,
  firestore: dbInstance
} as any);

const randomId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

export function doc(dbOrCol: any, path?: string, id?: string) {
  let dbInstance = dbOrCol;
  let docPath = path;
  let docId = id;
  
  if (dbOrCol && dbOrCol.type === 'collection') {
    dbInstance = dbOrCol.firestore;
    docPath = dbOrCol.path;
    docId = path || randomId(); // Use second arg as ID if collection is first arg
  } else if (typeof path === 'string' && path.includes('/') && !id) {
    const parts = path.split('/');
    docPath = parts[0];
    docId = parts[1];
  }
  
  return { 
    type: 'document', 
    path: docPath, 
    id: docId, 
    ref: { path: docPath, id: docId },
    firestore: dbInstance,
    parent: { path: docPath }
  } as any;
}

export const getDoc = async (docRef: any) => {
  const url = `${API_BASE}/${docRef.path}/${docRef.id}`;
  try {
    const res = await resilientFetch(url, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('auth_token');
        syncTokenToCookie(null);
        currentUser = null;
        authListeners.forEach(l => l(null));
      }
      const error = new Error(`Erreur de lecture (${res.status}) de ${url}`) as any;
      error.status = res.status;
      error.code = res.status === 401 ? 'unauthenticated' : 'unavailable';
      if (res.status === 401 || res.status === 404) return { exists: () => false, data: () => null, id: docRef.id, ref: docRef };
      throw error;
    }
    const data = await safeJson(res);
    return {
      exists: () => !!data,
      data: () => data,
      id: data?.id,
      ref: docRef
    };
  } catch (e: any) {
    if (e.message?.includes('Failed to fetch')) {
      console.error(`Network error (Failed to fetch) for ${url}. Check if server is running.`);
    }
    throw e;
  }
};

export const getDocs = async (queryRef: any) => {
  const path = queryRef.path || (queryRef.collection && queryRef.collection.path);
  
  let url = `${API_BASE}/${path}`;
  const queryParams = new URLSearchParams();

  // Optimized: Pass equality constraints to backend
  if (queryRef.constraints && Array.isArray(queryRef.constraints)) {
    queryRef.constraints.forEach((c: any) => {
      if (c.type === 'where' && c.op === '==') {
        queryParams.append(c.field, c.value);
      } else if (c.type === 'orderBy') {
        queryParams.append('_sort', c.field);
        queryParams.append('_order', c.direction || 'desc');
      } else if (c.type === 'limit') {
        queryParams.append('_limit', String(c.n));
      }
    });
  }
  
  const queryString = queryParams.toString();
  if (queryString) {
    url += `?${queryString}`;
  }

  try {
    const res = await resilientFetch(url, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      if (res.status === 404) return { docs: [], empty: true, size: 0, forEach: () => {} };
      if (res.status === 401 || (res.status === 403 && !path.includes('users'))) {
        const isLoggingOut = !localStorage.getItem('auth_token');
        localStorage.removeItem('auth_token');
        syncTokenToCookie(null);
        currentUser = null;
        authListeners.forEach(l => l(null));
        if (isLoggingOut) return { docs: [], empty: true, size: 0, forEach: () => {} };
      }
      let errorMsg = 'Erreur de récupération';
      try {
        const errorData = await safeJson(res);
        errorMsg = errorData?.error || errorMsg;
      } catch (e) {}
      
      const error = new Error(`${errorMsg} (${res.status}) for ${url}`) as any;
      error.code = res.status === 401 ? 'unauthenticated' : (res.status === 403 ? 'permission-denied' : 'unavailable');
      error.status = res.status;
      throw error;
    }
    let items = await safeJson(res) || [];

    // Basic client-side filtering safely for non-equality operators
    if (queryRef.constraints && Array.isArray(queryRef.constraints)) {
      queryRef.constraints.forEach((c: any) => {
        if (c.type === 'where') {
          if (c.op === '==') {
            // Already filtered by backend, but safe to double check if items contain field
            // items = items.filter((item: any) => item[c.field] === c.value);
          } else if (c.op === 'in' && Array.isArray(c.value)) {
            items = items.filter((item: any) => c.value && c.value.includes(item[c.field]));
          }
        }
      });
    }

    return {
      docs: items.map((item: any) => ({
        id: item.id,
        data: () => item,
        ref: { path: path, id: item.id }
      })),
      empty: items.length === 0,
      size: items.length,
      forEach: (cb: any) => items.forEach((item: any) => cb({ id: item.id, data: () => item }))
    };
  } catch (e: any) {
    if (e.message?.includes('Failed to fetch')) {
      console.error(`Network error (Failed to fetch) for ${url}. Check if server is running.`);
    }
    throw e;
  }
};

// Event bus for fast synchronization
const listeners: Set<() => void> = new Set();
const notifyListeners = () => {
  listeners.forEach(l => l());
};

export const setDoc = async (docRef: any, data: any, options?: any) => {
  const url = `${API_BASE}/${docRef.path}/${docRef.id}`;
  try {
    const res = await resilientFetch(url, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('auth_token');
        syncTokenToCookie(null);
        currentUser = null;
        authListeners.forEach(l => l(null));
      }
      let errorMsg = 'Erreur d\'enregistrement';
      try {
        const errorData = await safeJson(res);
        errorMsg = errorData?.error || errorMsg;
      } catch (e) {}
      const error = new Error(`${errorMsg} (${res.status}) for ${url}`) as any;
      error.status = res.status;
      error.code = res.status === 401 ? 'unauthenticated' : 'unavailable';
      throw error;
    }
    const result = await safeJson(res);
    notifyListeners();
    return result;
  } catch (e: any) {
    if (e.message?.includes('Failed to fetch')) {
      console.error(`Network error (Failed to fetch) for ${url}. Check if server is running.`);
    }
    throw e;
  }
};

export const addDoc = async (colRef: any, data: any) => {
  const url = `${API_BASE}/${colRef.path}`;
  try {
    const res = await resilientFetch(url, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('auth_token');
        syncTokenToCookie(null);
        currentUser = null;
        authListeners.forEach(l => l(null));
      }
      let errorMsg = 'Erreur d\'ajout';
      try {
        const errorData = await safeJson(res);
        errorMsg = errorData?.error || errorMsg;
      } catch (e) {}
      const error = new Error(`${errorMsg} (${res.status}) for ${url}`) as any;
      error.status = res.status;
      error.code = res.status === 401 ? 'unauthenticated' : 'unavailable';
      throw error;
    }
    const saved = await safeJson(res);
    notifyListeners();
    return { id: saved.id, data: () => saved, ref: { path: colRef.path, id: saved.id } };
  } catch (e: any) {
    if (e.message?.includes('Failed to fetch')) {
      console.error(`Network error (Failed to fetch) for ${url}. Check if server is running.`);
    }
    throw e;
  }
};

export const updateDoc = (docRef: any, data: any) => setDoc(docRef, data, { merge: true });

export const deleteDoc = async (docRef: any) => {
  const url = `${API_BASE}/${docRef.path}/${docRef.id}`;
  try {
    const res = await resilientFetch(url, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      if (res.status === 404) return true; // Treat already deleted as success
      if (res.status === 401) {
        localStorage.removeItem('auth_token');
        syncTokenToCookie(null);
        currentUser = null;
        authListeners.forEach(l => l(null));
      }
      const error = new Error(`Erreur de suppression (${res.status}) de ${url}`) as any;
      error.status = res.status;
      error.code = res.status === 401 ? 'unauthenticated' : 'unavailable';
      throw error;
    }
    notifyListeners();
    return true;
  } catch (e: any) {
    if (e.message?.includes('Failed to fetch')) {
      console.error(`Network error (Failed to fetch) for ${url}. Check if server is running.`);
    }
    throw e;
  }
};

export const onSnapshot = (queryRef: any, successCallback: any, errorCallback?: any) => {
  let timeoutId: any;
  let isStopped = false;
  let lastDataJson: string | null = null;
  let lastError: string | null = null;

  const poll = async () => {
    if (isStopped) return;
    try {
      let snap;
      if (queryRef.id && queryRef.type === 'document') {
        snap = await getDoc(queryRef);
      } else {
        snap = await getDocs(queryRef);
      }
      
      // Reset error tracking on success
      lastError = null;

      // Compare JSON to detect real changes
      const currentData = snap.docs ? snap.docs.map(d => d.data()) : (snap.exists() ? snap.data() : null);
      const currentJson = JSON.stringify(currentData);
      
      if (currentJson !== lastDataJson) {
        lastDataJson = currentJson;
        successCallback(snap);
      }
    } catch (e: any) {
      // Only call error callback if the error message changed or if it's the first error
      if (errorCallback && e.message !== lastError) {
        lastError = e.message;
        errorCallback(e);
      }
      
      // STOP polling on auth errors to avoid spamming the server/console
      if (e.status === 401 || e.message?.includes('(401)') || e.message?.includes('401')) {
        isStopped = true;
        if (timeoutId) clearTimeout(timeoutId);
        
        // Also ensure auth state is synced if we hit a 401
        if (localStorage.getItem('auth_token')) {
          localStorage.removeItem('auth_token');
          syncTokenToCookie(null);
          currentUser = null;
          authListeners.forEach(l => l(null));
        }
      }
    }
  };

  const scheduleNext = () => {
    if (isStopped) return;
    // Increase polling interval to 5 seconds to reduce server load and noise
    timeoutId = setTimeout(async () => {
      await poll();
      scheduleNext();
    }, 5000);
  };

  // Add to listeners for immediate update on local changes
  const onLocalChange = () => {
    poll();
  };
  listeners.add(onLocalChange);

  poll();
  scheduleNext();

  return () => {
    isStopped = true;
    if (timeoutId) clearTimeout(timeoutId);
    listeners.delete(onLocalChange);
  };
};

export const query = (ref: any, ...constraints: any[]) => {
  return { ...ref, constraints };
};

export const where = (field: string, op: string, value: any) => ({ type: 'where', field, op, value });
export const orderBy = (field: string, direction: string = 'asc') => ({ type: 'orderBy', field, direction });
export const limit = (n: number) => ({ type: 'limit', n });
export const serverTimestamp = () => new Date().toISOString();
export const increment = (n: number) => n; 
export const arrayUnion = (...items: any[]) => items;
export const arrayRemove = (...items: any[]) => [];

export function writeBatch(firestore?: any) {
  const operations: (() => Promise<any>)[] = [];
  const batch = {
    set: (docRef: any, data: any) => {
      operations.push(() => setDoc(docRef, data));
      return batch;
    },
    update: (docRef: any, data: any) => {
      operations.push(() => updateDoc(docRef, data));
      return batch;
    },
    delete: (docRef: any) => {
      operations.push(() => deleteDoc(docRef));
      return batch;
    },
    commit: async () => {
      for (const op of operations) {
        await op();
      }
      return true;
    }
  };
  return batch;
}

export const Timestamp = {
  now: () => ({ toDate: () => new Date(), toMillis: () => Date.now() }),
  fromDate: (d: Date) => ({ toDate: () => d, toMillis: () => d.getTime() })
};

export const initializeApp = () => ({});
