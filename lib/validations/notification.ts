import { z } from 'zod';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_RECIPIENT_TYPES,
  NOTIFICATION_DELIVERY_CHANNELS,
} from '@/lib/notifications/events';

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

// ==========================================
// NOTIFICATION POLICY VALIDATIONS
// ==========================================

export const notificationDeliveryChannelSchema = z.enum(NOTIFICATION_DELIVERY_CHANNELS);
export const notificationRecipientTypeSchema = z.enum(NOTIFICATION_RECIPIENT_TYPES);

export const notificationChannelPolicyInputSchema = z.object({
  channel: notificationDeliveryChannelSchema,
  isEnabled: z.boolean(),
});

export const notificationRecipientPolicyInputSchema = z.object({
  recipientType: notificationRecipientTypeSchema,
  isEnabled: z.boolean(),
  isMandatory: z.boolean().optional(),
  channels: z.array(notificationChannelPolicyInputSchema).optional(),
});

export const notificationPolicyUpdateItemSchema = z.object({
  notificationType: z.string().min(1),
  isEnabled: z.boolean(),
  isMandatory: z.boolean().optional(),
  recipients: z.array(notificationRecipientPolicyInputSchema).optional(),
});

export const notificationPoliciesUpdateSchema = z.object({
  policies: z.array(notificationPolicyUpdateItemSchema).optional(),
  preferences: z.array(notificationPreferenceSchema).optional(),
});

export type NotificationChannelPolicyInput = z.infer<typeof notificationChannelPolicyInputSchema>;
export type NotificationRecipientPolicyInput = z.infer<typeof notificationRecipientPolicyInputSchema>;
export type NotificationPolicyUpdateItem = z.infer<typeof notificationPolicyUpdateItemSchema>;
export type NotificationPoliciesUpdateInput = z.infer<typeof notificationPoliciesUpdateSchema>;
