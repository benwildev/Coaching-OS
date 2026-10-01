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

