import prisma from '@/lib/db';
import { recordAuditLog } from './audit.service';
import type { RoomInput, RoomUpdateInput } from '@/lib/validations/room';

export async function getRoomsList(coachingCenterId: string, branchId?: string) {
  return prisma.room.findMany({
    where: {
      coachingCenterId,
      ...(branchId && branchId !== 'all' ? { branchId } : {}),
    },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      _count: { select: { classSchedules: true } },
    },
    orderBy: [{ branchId: 'asc' }, { name: 'asc' }],
  });
}

export async function getRoomById(coachingCenterId: string, roomId: string) {
  return prisma.room.findFirst({
    where: { id: roomId, coachingCenterId },
    include: { branch: true },
  });
}

export async function createRoom(coachingCenterId: string, input: RoomInput, actorId?: string) {
  const branch = await prisma.branch.findFirst({ where: { id: input.branchId, coachingCenterId } });
  if (!branch) throw new Error('BRANCH_NOT_FOUND');

  const dupe = await prisma.room.findFirst({
    where: { branchId: input.branchId, code: input.code.trim().toUpperCase() },
  });
  if (dupe) throw new Error('A room with this code already exists in this branch');

  const room = await prisma.room.create({
    data: {
      coachingCenterId,
      branchId: input.branchId,
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      floor: input.floor?.trim() || null,
      capacity: input.capacity ?? 50,
      status: input.status ?? 'ACTIVE',
      notes: input.notes?.trim() || null,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'ROOM_CREATED',
    entity: 'Room',
    entityId: room.id,
    details: { name: room.name, code: room.code, branchId: room.branchId },
  });

  return room;
}

export async function updateRoom(
  coachingCenterId: string,
  roomId: string,
  input: RoomUpdateInput,
  actorId?: string
) {
  const existing = await prisma.room.findFirst({ where: { id: roomId, coachingCenterId } });
  if (!existing) throw new Error('ROOM_NOT_FOUND');

  if (input.code && input.code.trim().toUpperCase() !== existing.code) {
    const dupe = await prisma.room.findFirst({
      where: {
        branchId: input.branchId || existing.branchId,
        code: input.code.trim().toUpperCase(),
        NOT: { id: roomId },
      },
    });
    if (dupe) throw new Error('A room with this code already exists in this branch');
  }

  const room = await prisma.room.update({
    where: { id: roomId },
    data: {
      name: input.name?.trim() ?? existing.name,
      code: input.code ? input.code.trim().toUpperCase() : existing.code,
      floor: input.floor !== undefined ? input.floor?.trim() || null : existing.floor,
      capacity: input.capacity ?? existing.capacity,
      status: input.status ?? existing.status,
      notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'ROOM_UPDATED',
    entity: 'Room',
    entityId: room.id,
    details: { name: room.name, status: room.status },
  });

  return room;
}
