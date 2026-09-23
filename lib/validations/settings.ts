import { z } from 'zod';

export const centerProfileSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  banglaName: z.string().optional(),
  phone: z.string().min(10, 'Phone is required'),
  email: z.string().email('Valid email required').optional().or(z.literal('')),
  website: z.string().url().optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  district: z.string().default('Dhaka'),
  logo: z.string().optional(),
});

export const brandingSchema = z.object({
  primaryColor: z.string().min(4),
  secondaryColor: z.string().min(4),
  accentColor: z.string().min(4),
  logoUrl: z.string().optional(),
  faviconUrl: z.string().optional(),
});

export const regionSchema = z.object({
  language: z.enum(['en', 'bn']),
  currency: z.string().default('BDT'),
  timezone: z.string().default('Asia/Dhaka'),
  dateFormat: z.string().default('DD/MM/YYYY'),
  numberFormat: z.enum(['lakh', 'intl']).default('lakh'),
});
