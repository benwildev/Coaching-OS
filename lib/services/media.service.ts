import prisma from '@/lib/db';

export interface MediaUploadRecord {
  coachingCenterId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  path: string;
  uploaderId?: string;
}

export async function recordMediaUpload(record: MediaUploadRecord) {
  return prisma.media.create({
    data: record,
  });
}

export async function getMediaList(coachingCenterId: string, limit: number = 20) {
  return prisma.media.findMany({
    where: { coachingCenterId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
