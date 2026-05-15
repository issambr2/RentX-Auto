import { collection, addDoc } from '../lib/api';
import { db } from '../lib/api';
import { ActivityLog } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';

export async function logActivity(userId: string, action: string, description: string, userName?: string, officeId?: string) {
  try {
    const ipAddress = 'Unknown';
    const log: Omit<ActivityLog, 'id'> = {
      userId,
      officeId,
      userName: userName || 'Système',
      action,
      description,
      ipAddress,
      timestamp: new Date().toISOString()
    };
    await addDoc(collection(db, 'activity_logs'), log);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'activity_logs');
  }
}
