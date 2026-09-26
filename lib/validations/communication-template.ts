import { z } from 'zod';
import { NOTIFICATION_EVENTS } from '@/lib/notifications/events';

export const COMMUNICATION_CHANNELS = ['SMS', 'WHATSAPP', 'EMAIL'] as const;

export const communicationTemplateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  channel: z.enum(COMMUNICATION_CHANNELS, { message: 'INVALID_CHANNEL' }),
  bodyEn: z.string().trim().min(1, 'English body is required'),
  bodyBn: z.string().trim().min(1, 'Bangla body is required'),
  triggerEvent: z.enum(NOTIFICATION_EVENTS, { message: 'INVALID_TRIGGER_EVENT' }).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type CommunicationTemplateInput = z.infer<typeof communicationTemplateSchema>;

export interface TemplateFilterParams {
  page?: number;
  pageSize?: number;
  channel?: string;
  triggerEvent?: string;
  isActive?: boolean;
}

export interface LogFilterParams {
  page?: number;
  pageSize?: number;
  channel?: string;
  event?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}
