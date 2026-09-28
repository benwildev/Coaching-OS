import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { uploadBufferToCloudinary } from '@/lib/cloudinary';
import { recordMediaUpload } from '@/lib/services/media.service';
import { apiErrorResponse } from '@/lib/api-error';

/**
 * Generic authenticated file-upload endpoint backing every upload widget in
 * the app (branding logo/favicon, student/teacher photos, study material
 * files). `scope` picks the size/type limits and the Cloudinary folder —
 * never trust the client for either.
 */
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const SCOPES = {
  logo: { folder: 'branding/logo', resourceType: 'image' as const, maxBytes: 5 * 1024 * 1024, mimeTypes: IMAGE_TYPES },
  favicon: { folder: 'branding/favicon', resourceType: 'image' as const, maxBytes: 2 * 1024 * 1024, mimeTypes: IMAGE_TYPES },
  photo: { folder: 'photos', resourceType: 'image' as const, maxBytes: 5 * 1024 * 1024, mimeTypes: IMAGE_TYPES },
  thumbnail: { folder: 'materials/thumbnails', resourceType: 'image' as const, maxBytes: 5 * 1024 * 1024, mimeTypes: IMAGE_TYPES },
  material: {
    folder: 'materials',
    resourceType: 'auto' as const,
    maxBytes: 25 * 1024 * 1024,
    mimeTypes: [
      ...IMAGE_TYPES,
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'video/mp4',
      'video/webm',
    ],
  },
} as const;

type Scope = keyof typeof SCOPES;

export async function POST(req: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();

    const formData = await req.formData();
    const file = formData.get('file');
    const scopeRaw = formData.get('scope');

    if (!(file instanceof File)) {
      throw new Error('VALIDATION_FAILED: A file is required');
    }
    if (typeof scopeRaw !== 'string' || !(scopeRaw in SCOPES)) {
      throw new Error('VALIDATION_FAILED: A valid upload scope is required');
    }
    const scope = scopeRaw as Scope;
    const config = SCOPES[scope];

    if (file.size === 0) {
      throw new Error('VALIDATION_FAILED: The uploaded file is empty');
    }
    if (file.size > config.maxBytes) {
      throw new Error(`VALIDATION_FAILED: File exceeds the ${Math.round(config.maxBytes / (1024 * 1024))}MB limit for this upload type`);
    }
    if (!(config.mimeTypes as readonly string[]).includes(file.type)) {
      throw new Error(`VALIDATION_FAILED: Unsupported file type "${file.type || 'unknown'}" for this upload type`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadBufferToCloudinary(buffer, {
      folder: `coaching-os/${coachingCenterId}/${config.folder}`,
      resourceType: config.resourceType,
    });

    await recordMediaUpload({
      coachingCenterId,
      filename: uploaded.publicId,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      url: uploaded.url,
      path: uploaded.publicId,
      uploaderId: user.userId,
    });

    return NextResponse.json({ success: true, url: uploaded.url, publicId: uploaded.publicId });
  } catch (error) {
    return apiErrorResponse(error, 'upload POST');
  }
}
