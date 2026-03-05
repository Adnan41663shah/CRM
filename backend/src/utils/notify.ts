import logger from './logger';

export async function notifyUsers(userIds: string[] = [], message: string) {
  try {
    // Placeholder for real notification integration (email/push/etc.)
    logger.info('Notify users', { userIds, message });
  } catch (e) {
    logger.warn('Notification send failed', e);
  }
}

