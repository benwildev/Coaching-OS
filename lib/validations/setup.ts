import { z } from 'zod';

export const setupWizardSchema = z.object({
  // Step 1: Coaching Center Profile
  centerName: z.string().min(3, 'Coaching Center Name is required'),
  centerBanglaName: z.string().optional(),
  centerCode: z.string().min(2, 'Code is required (e.g. ACC)').max(10),
  centerPhone: z.string().min(10, 'Valid phone number required'),
  centerEmail: z.string().email('Valid email required').optional().or(z.literal('')),
  centerAddress: z.string().optional(),
  centerCity: z.string().default('Dhaka'),
  centerDistrict: z.string().default('Dhaka'),

  // Step 2: Owner Account
  ownerName: z.string().min(2, 'Owner Full Name is required'),
  ownerBanglaName: z.string().optional(),
  ownerEmail: z.string().email('Owner valid email is required'),
  ownerPhone: z.string().min(10, 'Owner phone number is required'),
  ownerPassword: z.string().min(6, 'Password must be at least 6 characters'),

  // Step 3: Main Branch
  branchName: z.string().min(2, 'Main Campus / Branch name is required'),
  branchBanglaName: z.string().optional(),
  branchCode: z.string().default('MAIN'),
  branchAddress: z.string().optional(),

  // Step 4: Academic Session & Programs
  sessionName: z.string().min(4, 'Session name is required (e.g. 2026)'),
  sessionBanglaName: z.string().optional(),
  sessionStartDate: z.string().min(4, 'Start date required'),
  sessionEndDate: z.string().min(4, 'End date required'),
  selectedPrograms: z.array(z.string()).min(1, 'Select at least one academic program'),

  // Step 5: Branding
  primaryColor: z.string().default('#063B78'),
  accentColor: z.string().default('#FFD200'),
  logoUrl: z.string().optional(),
});

export type SetupWizardInput = z.infer<typeof setupWizardSchema>;
