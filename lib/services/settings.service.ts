import prisma from '@/lib/db';
import { recordAuditLog } from './audit.service';

export async function getBrandingSettings(coachingCenterId: string) {
  return prisma.brandingSetting.findUnique({
    where: { coachingCenterId },
  });
}

export async function updateBrandingSettings(
  coachingCenterId: string,
  data: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    logoUrl?: string;
    faviconUrl?: string;
  },
  userId?: string
) {
  const branding = await prisma.brandingSetting.upsert({
    where: { coachingCenterId },
    update: data,
    create: {
      coachingCenterId,
      ...data,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId,
    action: 'BRANDING_SETTINGS_UPDATED',
    entity: 'BrandingSetting',
    entityId: branding.id,
    details: data,
  });

  return branding;
}

export async function getSystemSettings(coachingCenterId: string) {
  const settings = await prisma.systemSetting.findMany({
    where: { coachingCenterId },
  });

  const map: Record<string, string> = {};
  for (const s of settings) {
    map[s.key] = s.value;
  }
  return map;
}

export async function updateSystemSetting(
  coachingCenterId: string,
  key: string,
  value: string,
  group: string = 'GENERAL',
  userId?: string
) {
  const setting = await prisma.systemSetting.upsert({
    where: {
      coachingCenterId_key: {
        coachingCenterId,
        key,
      },
    },
    update: { value, group },
    create: {
      coachingCenterId,
      key,
      value,
      group,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId,
    action: 'SYSTEM_SETTING_UPDATED',
    entity: 'SystemSetting',
    entityId: setting.id,
    details: { key, value },
  });

  return setting;
}
