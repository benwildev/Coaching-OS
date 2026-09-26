import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/events';
import type { NotificationPreferenceInput } from '@/lib/validations/notification';

export async function getNotificationPreferences(coachingCenterId: string, user: SessionUser) {
  const existing = await prisma.notificationPreference.findMany({
    where: { coachingCenterId, userId: user.userId },
  });
  const byCategory = new Map(existing.map((p) => [p.category, p]));

  // Every category always has a row in the response — defaults are
  // "in-app on, everything else off" until the user changes them.
  return NOTIFICATION_CATEGORIES.map((category) => {
    const row = byCategory.get(category);
    return {
      category,
      inApp: row?.inApp ?? true,
      sms: row?.sms ?? false,
      whatsapp: row?.whatsapp ?? false,
      email: row?.email ?? false,
    };
  });
}

export async function updateNotificationPreferences(
  coachingCenterId: string,
  user: SessionUser,
  preferences: NotificationPreferenceInput[]
) {
  await prisma.$transaction(
    preferences.map((p) =>
      prisma.notificationPreference.upsert({
        where: { userId_category: { userId: user.userId, category: p.category } },
        create: { coachingCenterId, userId: user.userId, category: p.category, inApp: p.inApp, sms: p.sms, whatsapp: p.whatsapp, email: p.email },
        update: { inApp: p.inApp, sms: p.sms, whatsapp: p.whatsapp, email: p.email },
      })
    )
  );
  return getNotificationPreferences(coachingCenterId, user);
}
