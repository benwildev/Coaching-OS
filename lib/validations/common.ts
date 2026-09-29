import { z } from 'zod';

/**
 * http(s) URL or a site-relative path (e.g. "/uploads/..."). Nothing else —
 * blocks javascript:/data: URIs and arbitrary schemes from being stored in
 * any field that later renders as an <img src>/<a href> (Phase 11 hardening).
 */
export function isHttpOrRelativeUrl(value: string | null | undefined): boolean {
  if (!value) return true;
  return /^https?:\/\/\S+$/i.test(value) || /^\/[^\s/][^\s]*$/.test(value);
}

export const RESOURCE_URL_MESSAGE = 'Must be an http(s) URL or a site-relative path';

/** http(s) URL or a site-relative path (e.g. "/uploads/..."). Nothing else. */
export const resourceUrl = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => isHttpOrRelativeUrl(v), { message: RESOURCE_URL_MESSAGE });
