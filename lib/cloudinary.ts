import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';

/**
 * Lazily configured so importing this module (e.g. during `next build`'s
 * route-manifest collection) never throws — only an actual upload attempt
 * does, matching the pattern in lib/auth/secret.ts.
 */
let configured = false;
function ensureConfigured() {
  if (configured) return;
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) {
    throw new Error(
      'CLOUDINARY_NOT_CONFIGURED: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET must all be set before files can be uploaded.'
    );
  }
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  configured = true;
}

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  bytes: number;
  format?: string;
}

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  options: { folder: string; resourceType: 'image' | 'raw' | 'video' | 'auto' }
): Promise<CloudinaryUploadResult> {
  ensureConfigured();
  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: options.folder, resource_type: options.resourceType },
      (error, res) => {
        if (error || !res) return reject(error ?? new Error('CLOUDINARY_UPLOAD_FAILED'));
        resolve(res);
      }
    );
    stream.end(buffer);
  });

  return { url: result.secure_url, publicId: result.public_id, bytes: result.bytes, format: result.format };
}

export async function deleteFromCloudinary(publicId: string, resourceType: 'image' | 'raw' | 'video' = 'image'): Promise<void> {
  ensureConfigured();
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}
