import { auth, getToken, logout } from '../lib/api';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  let errorMessage = '';
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'object' && error !== null) {
    try {
      errorMessage = JSON.stringify(error);
    } catch (e) {
      errorMessage = String(error);
    }
  } else {
    errorMessage = String(error);
  }

  const isPermissionDenied = errorMessage.toLowerCase().includes('permission') || 
                            errorMessage.toLowerCase().includes('insufficient') ||
                            errorMessage.includes('(403)');
  
  const isAuthError = errorMessage.includes('(401)') || 
                      errorMessage.includes('401') ||
                      errorMessage.toLowerCase().includes('non authentifié') ||
                      errorMessage.toLowerCase().includes('session expirée') ||
                      errorMessage.toLowerCase().includes('token invalide') ||
                      errorMessage.toLowerCase().includes('jwt malformed');

  const isQuotaExceeded = errorMessage.toLowerCase().includes('quota') || 
                         errorMessage.toLowerCase().includes('resource-exhausted') ||
                         errorMessage.toLowerCase().includes('rate limit');

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid || 'unauthenticated',
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified || false,
      isAnonymous: auth.currentUser?.isAnonymous || false,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map((provider: any) => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }

  // Log the error
  if (isPermissionDenied || isAuthError) {
    console.warn('Auth/Permission Error: ', JSON.stringify(errInfo));
  } else {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }

  // Double check if we should clear token on 401
  if (isAuthError) {
    const token = getToken();
    if (token) {
      console.warn('Clearing stale token from error handler');
      logout();
    }
    
    // Silence 401 errors for the UI - the logout() will trigger a redirect anyway
    if (operationType === OperationType.GET || operationType === OperationType.LIST) {
      return;
    }
  }

  // Handle Quota Exceeded silently for GET/LIST to avoid crashing dashboards
  if (isQuotaExceeded && (operationType === OperationType.GET || operationType === OperationType.LIST)) {
    return;
  }

  // For other operations or if we still want to throw, use a cleaner message for auth issues
  if (isAuthError) {
    throw new Error(JSON.stringify({
      ...errInfo,
      error: "Votre session a expiré. Veuillez vous reconnecter."
    }));
  }

  throw new Error(JSON.stringify(errInfo));
}
