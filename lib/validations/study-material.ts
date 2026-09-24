import { z } from 'zod';

export const MATERIAL_TYPES = ['PDF', 'VIDEO', 'IMAGE', 'DOCUMENT', 'NOTE', 'LINK'] as const;
export const MATERIAL_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

export type MaterialType = (typeof MATERIAL_TYPES)[number];
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];

const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

/** http(s) URL or a site-relative path (e.g. "/uploads/..."). Nothing else. */
const resourceUrl = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v) || /^\/[^\s/][^\s]*$/.test(v), {
    message: 'Must be an http(s) URL or a site-relative path',
  });

/**
 * A material must point somewhere: every type except NOTE needs a resource
 * URL; a NOTE carries its body in the description instead.
 * Returns an error code, or null when valid.
 */
export function checkMaterialResource(m: {
  type: string;
  fileUrl?: string | null;
  description?: string | null;
  banglaDescription?: string | null;
}): string | null {
  if (m.type === 'NOTE') {
    return m.description || m.banglaDescription || m.fileUrl ? null : 'MATERIAL_RESOURCE_REQUIRED: a note needs content';
  }
  return m.fileUrl ? null : 'MATERIAL_RESOURCE_REQUIRED: a resource URL is required';
}

const materialFieldsSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  banglaTitle: optionalText,
  description: optionalText,
  banglaDescription: optionalText,
  academicClassId: z.string().trim().min(1, 'Class is required'),
  academicGroupId: optionalText,
  subjectId: z.string().trim().min(1, 'Subject is required'),
  subjectPaperId: optionalText,
  batchId: optionalText,
  type: z.enum(MATERIAL_TYPES, { message: 'INVALID_MATERIAL_TYPE' }),
  fileUrl: resourceUrl,
  thumbnailUrl: resourceUrl,
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
});

export const createMaterialSchema = materialFieldsSchema.superRefine((d, ctx) => {
  const err = checkMaterialResource(d);
  if (err) ctx.addIssue({ code: 'custom', path: ['fileUrl'], message: err });
});

export const updateMaterialSchema = createMaterialSchema;

export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;

export interface MaterialFilterParams {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: string;
  status?: string;
  subjectId?: string;
  academicClassId?: string;
  batchId?: string;
}
