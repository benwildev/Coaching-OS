import { z } from 'zod';
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/events';

export interface NotificationListParams {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
}

export const notificationPreferenceSchema = z.object({
  category: z.enum(NOTIFICATION_CATEGORIES),
  inApp: z.boolean(),
  sms: z.boolean(),
  whatsapp: z.boolean(),
  email: z.boolean(),
});

export const notificationPreferencesUpdateSchema = z.object({
  preferences: z.array(notificationPreferenceSchema),
});

export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceSchema>;
export type NotificationPreferencesUpdateInput = z.infer<typeof notificationPreferencesUpdateSchema>;
