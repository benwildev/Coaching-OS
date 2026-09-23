import { z } from 'zod';

export const ROOM_STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE'] as const;

export const roomSchema = z.object({
  branchId: z.string().min(1, 'Branch is required'),
  name: z.string().min(1, 'Room name is required').max(100),
  code: z.string().min(1, 'Room code is required').max(30),
  floor: z.string().max(30).optional().or(z.literal('')),
  capacity: z.number().int().min(1).max(1000).default(50),
  status: z.enum(ROOM_STATUSES).default('ACTIVE'),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export type RoomInput = z.infer<typeof roomSchema>;
export const roomUpdateSchema = roomSchema.partial();
export type RoomUpdateInput = z.infer<typeof roomUpdateSchema>;
