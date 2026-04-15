 import { toast } from '../lib/toast';
import { auth } from '../firebase/config';

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
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export const errorHandler = {
  handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
      },
      operationType,
      path
    };
    
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    
    // User friendly message
    let message = 'An unexpected error occurred.';
    if (errInfo.error.includes('permission-denied')) {
      message = 'You do not have permission to perform this action.';
    } else if (errInfo.error.includes('not-found')) {
      message = 'The requested resource was not found.';
    }
    
    toast.error(message);
    throw new Error(JSON.stringify(errInfo));
  },

  handleGeneralError(error: unknown, context: string) {
    console.error(`Error in ${context}:`, error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    toast.error(message);
  }
};