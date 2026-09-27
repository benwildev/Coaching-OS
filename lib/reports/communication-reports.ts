import prisma from '@/lib/db';
import { Prisma, type CommunicationChannel } from '@prisma/client';
import { DICTIONARY } from '@/lib/i18n';
import type { ReportScope } from './access';
import type { ReportFilters } from './filters';
import { EXPORT_ROW_LIMIT } from './filters';
import { bucketKey, enumerateBuckets } from './dates';
import { dhakaDateOf, sqlAnd } from './sql';
import { int, pickName, resolveRange, type ViewHandler } from './report-utils';

/**
 * Communication reports over Phase 8 data. Every CommunicationLog status is
 * reported exactly as persisted (QUEUED / SENT / DELIVERED / FAILED /
 * SKIPPED) — a SKIPPED row (e.g. PROVIDER_NOT_CONFIGURED) is never folded
 * into "sent" or "delivered". Message bodies are not exposed.
 *
 * External channels are the CommunicationChannel enum (SMS, WHATSAPP,
 * EMAIL); in-app delivery is the Notification model, reported separately.
 */

export const COMM_CHANNELS: CommunicationChannel[] = ['SMS', 'WHATSAPP', 'EMAIL'];
export const COMM_STATUSES = ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED'];

function logWhere(scope: ReportScope, filters: ReportFilters, withRange = true): Prisma.CommunicationLogWhereInput {
  const and: Prisma.CommunicationLogWhereInput[] = [{ coachingCenterId: scope.coachingCenterId }];
  if (scope.branchId) and.push({ branchId: scope.branchId });
  if (filters.channel && (COMM_CHANNELS as string[]).includes(filters.channel)) and.push({ channel: filters.channel as CommunicationChannel });
  if (filters.status) and.push({ status: filters.status });
  if (filters.event) and.push({ event: filters.event });
  if (withRange) {
    const range = resolveRange(filters);
    and.push({ createdAt: { gte: range.start, lt: range.endExclusive } });
  }
  if (filters.search) {
    and.push({
      OR: [
        { recipientPhone: { contains: filters.search } },
        { guardian: { name: { contains: filters.search, mode: 'insensitive' } } },
        { student: { name: { contains: filters.search, mode: 'insensitive' } } },
      ],
    });
  }
  return { AND: and };
}

function recipientType(l: { guardianId: string | null; studentId: string | null }): 'GUARDIAN' | 'STUDENT' | 'OTHER' {
  if (l.guardianId) return 'GUARDIAN';
  if (l.studentId) return 'STUDENT';
  return 'OTHER';
}

export const communicationSummary: ViewHandler = async ({ scope, filters }) => {
  const range = resolveRange(filters);
  const where = logWhere(scope, filters);
  const sqlParts: Prisma.Sql[] = [
    Prisma.sql`l."coachingCenterId" = ${scope.coachingCenterId}`,
    Prisma.sql`l."createdAt" >= ${range.start}`,
    Prisma.sql`l."createdAt" < ${range.endExclusive}`,
  ];
  if (scope.branchId) sqlParts.push(Prisma.sql`l."branchId" = ${scope.branchId}`);
  if (filters.channel) sqlParts.push(Prisma.sql`l."channel"::text = ${filters.channel}`);
  if (filters.status) sqlParts.push(Prisma.sql`l."status" = ${filters.status}`);
  if (filters.event) sqlParts.push(Prisma.sql`l."event" = ${filters.event}`);

  const [byChannelStatus, byEventStatus, guardians, studentsOnly, others, byDay] = await Promise.all([
    prisma.communicationLog.groupBy({ by: ['channel', 'status'], where, _count: { _all: true } }),
    prisma.communicationLog.groupBy({ by: ['event', 'status'], where, _count: { _all: true } }),
    prisma.communicationLog.count({ where: { AND: [where, { guardianId: { not: null } }] } }),
    prisma.communicationLog.count({ where: { AND: [where, { guardianId: null, studentId: { not: null } }] } }),
    prisma.communicationLog.count({ where: { AND: [where, { guardianId: null, studentId: null }] } }),
    prisma.$queryRaw<Array<{ day: string; status: string; n: bigint }>>`
      SELECT ${dhakaDateOf(Prisma.sql`l."createdAt"`)} AS day, l."status", COUNT(*) AS n
      FROM "communication_logs" l WHERE ${sqlAnd(sqlParts)} GROUP BY 1, 2`,
  ]);

  const statusTotals = new Map<string, number>();
  for (const r of byChannelStatus) statusTotals.set(r.status, (statusTotals.get(r.status) || 0) + r._count._all);
  const total = Array.from(statusTotals.values()).reduce((s, n) => s + n, 0);

  const pivot = <K extends string | null>(rows: Array<{ key: K; status: string; n: number }>) => {
    const m = new Map<string, { key: K; total: number; byStatus: Record<string, number> }>();
    for (const r of rows) {
      const k = String(r.key);
      const cur = m.get(k) || { key: r.key, total: 0, byStatus: {} };
      cur.total += r.n;
      cur.byStatus[r.status] = (cur.byStatus[r.status] || 0) + r.n;
      m.set(k, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  };

  const granularity = filters.granularity === 'day' && range.days > 93 ? 'week' : filters.granularity;
  const trendMap = new Map<string, Record<string, number>>();
  for (const r of byDay) {
    const k = bucketKey(r.day, granularity);
    const cur = trendMap.get(k) || {};
    cur[r.status] = (cur[r.status] || 0) + int(r.n);
    trendMap.set(k, cur);
  }
  // Statuses outside the documented set still show up (as persisted), never re-labelled.
  const statuses = [...COMM_STATUSES, ...Array.from(statusTotals.keys()).filter((s) => !COMM_STATUSES.includes(s))];

  return {
    data: {
      range: { from: range.from, to: range.to },
      granularity,
      total,
      statuses,
      byStatus: statuses.map((s) => ({ status: s, count: statusTotals.get(s) || 0 })),
      byChannel: pivot(byChannelStatus.map((r) => ({ key: r.channel as string, status: r.status, n: r._count._all }))),
      byEvent: pivot(byEventStatus.map((r) => ({ key: r.event, status: r.status, n: r._count._all }))),
      byRecipientType: [
        { type: 'GUARDIAN', count: guardians },
        { type: 'STUDENT', count: studentsOnly },
        { type: 'OTHER', count: others },
      ],
      trend: enumerateBuckets(range, granularity).map((b) => ({ bucket: b, byStatus: trendMap.get(b) || {} })),
    },
  };
};

export const communicationLogs: ViewHandler = async ({ scope, filters, forExport }) => {
  const where = logWhere(scope, filters);
  const total = await prisma.communicationLog.count({ where });
  if (forExport && total > EXPORT_ROW_LIMIT) throw new Error('EXPORT_TOO_LARGE');
  const logs = await prisma.communicationLog.findMany({
    where,
    orderBy: [{ createdAt: filters.dir === 'asc' ? 'asc' : 'desc' }, { id: 'asc' }],
    ...(forExport ? {} : { skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
    select: {
      id: true,
      channel: true,
      event: true,
      status: true,
      provider: true,
      errorMessage: true,
      recipientPhone: true,
      recipientEmail: true,
      createdAt: true,
      sentAt: true,
      guardianId: true,
      studentId: true,
      guardian: { select: { name: true, banglaName: true } },
      student: { select: { id: true, name: true, banglaName: true, studentIdCode: true } },
    },
  });
  const rows = logs.map((l) => ({
    id: l.id,
    channel: l.channel,
    event: l.event,
    status: l.status,
    provider: l.provider,
    errorMessage: l.errorMessage,
    recipient: l.recipientPhone || l.recipientEmail,
    recipientType: recipientType(l),
    guardian: l.guardian,
    student: l.student,
    createdAt: l.createdAt.toISOString(),
    sentAt: l.sentAt?.toISOString() ?? null,
  }));
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  type Row = (typeof rows)[number];
  return {
    data: { rows, total, page: filters.page, pageSize: filters.pageSize, totalPages: Math.max(1, Math.ceil(total / filters.pageSize)) },
    export: {
      rows,
      columns: [
        { header: R.col.date, value: (r: Row) => r.createdAt },
        { header: R.col.channel, value: (r: Row) => r.channel },
        { header: R.col.event, value: (r: Row) => r.event },
        { header: R.col.status, value: (r: Row) => r.status },
        { header: R.col.recipientType, value: (r: Row) => r.recipientType },
        { header: R.col.recipientName, value: (r: Row) => pickName(lang, r.guardian?.name ?? r.student?.name, r.guardian?.banglaName ?? r.student?.banglaName) },
        { header: R.col.recipient, value: (r: Row) => r.recipient },
        { header: R.col.provider, value: (r: Row) => r.provider },
        { header: R.col.errorMessage, value: (r: Row) => r.errorMessage },
      ],
    },
  };
};

export const communicationNotices: ViewHandler = async ({ scope, filters, forExport }) => {
  const range = resolveRange(filters);
  const and: Prisma.NoticeWhereInput[] = [{ coachingCenterId: scope.coachingCenterId }];
  // Same visibility rule as notice.service noticeVisibilityWhere.
  if (scope.branchId) and.push({ OR: [{ branchId: scope.branchId }, { branchId: null }] });
  if (filters.status) and.push({ status: filters.status });
  // Published notices by publish date; drafts/archived by creation date.
  and.push({
    OR: [
      { publishedAt: { gte: range.start, lt: range.endExclusive } },
      { publishedAt: null, createdAt: { gte: range.start, lt: range.endExclusive } },
    ],
  });
  if (filters.search) and.push({ OR: [{ title: { contains: filters.search, mode: 'insensitive' } }, { banglaTitle: { contains: filters.search } }] });
  const where: Prisma.NoticeWhereInput = { AND: and };
  const [total, byStatus] = await Promise.all([prisma.notice.count({ where }), prisma.notice.groupBy({ by: ['status'], where, _count: { _all: true } })]);
  if (forExport && total > EXPORT_ROW_LIMIT) throw new Error('EXPORT_TOO_LARGE');
  const notices = await prisma.notice.findMany({
    where,
    orderBy: [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    ...(forExport ? {} : { skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
    select: {
      id: true,
      title: true,
      banglaTitle: true,
      targetAudience: true,
      status: true,
      publishedAt: true,
      createdAt: true,
      branch: { select: { name: true, banglaName: true } },
      batch: { select: { name: true, banglaName: true } },
      academicClass: { select: { name: true, banglaName: true } },
      // Tracked data only: how many CommunicationLog rows reference this notice (not "recipients").
      _count: { select: { communicationLogs: true } },
    },
  });
  const rows = notices.map((n) => ({
    ...n,
    publishedAt: n.publishedAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
    loggedMessages: n._count.communicationLogs,
  }));
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  type Row = (typeof rows)[number];
  return {
    data: {
      range: { from: range.from, to: range.to },
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      rows,
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    },
    export: {
      rows,
      columns: [
        { header: R.col.notice, value: (r: Row) => pickName(lang, r.title, r.banglaTitle) },
        { header: R.col.publishedDate, value: (r: Row) => (r.publishedAt ? r.publishedAt.slice(0, 10) : '') },
        { header: R.col.audience, value: (r: Row) => r.targetAudience },
        { header: R.col.branch, value: (r: Row) => pickName(lang, r.branch?.name, r.branch?.banglaName) || R.allBranches },
        { header: R.col.status, value: (r: Row) => r.status },
        { header: R.col.loggedMessages, value: (r: Row) => r.loggedMessages },
      ],
    },
  };
};

export const communicationNotifications: ViewHandler = async ({ scope, filters, forExport }) => {
  const range = resolveRange(filters);
  const and: Prisma.NotificationWhereInput[] = [{ coachingCenterId: scope.coachingCenterId }, { createdAt: { gte: range.start, lt: range.endExclusive } }];
  if (scope.branchId) {
    const b = scope.branchId;
    and.push({
      OR: [
        { user: { branchId: b } },
        { student: { branchId: b } },
        { guardian: { studentGuardians: { some: { student: { branchId: b } } } } },
      ],
    });
  }
  if (filters.event) and.push({ type: filters.event });
  if (filters.status === 'READ') and.push({ isRead: true });
  if (filters.status === 'UNREAD') and.push({ isRead: false });
  const where: Prisma.NotificationWhereInput = { AND: and };

  const [total, byTypeRead, staff, students, guardians] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.groupBy({ by: ['type', 'isRead'], where, _count: { _all: true } }),
    prisma.notification.count({ where: { AND: [where, { userId: { not: null } }] } }),
    prisma.notification.count({ where: { AND: [where, { studentId: { not: null } }] } }),
    prisma.notification.count({ where: { AND: [where, { guardianId: { not: null } }] } }),
  ]);
  if (forExport && total > EXPORT_ROW_LIMIT) throw new Error('EXPORT_TOO_LARGE');
  const items = await prisma.notification.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    ...(forExport ? {} : { skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
    select: {
      id: true,
      type: true,
      title: true,
      isRead: true,
      readAt: true,
      createdAt: true,
      user: { select: { name: true, banglaName: true } },
      student: { select: { name: true, banglaName: true, studentIdCode: true } },
      guardian: { select: { name: true, banglaName: true } },
    },
  });
  const typeMap = new Map<string, { type: string; read: number; unread: number }>();
  for (const r of byTypeRead) {
    const cur = typeMap.get(r.type) || { type: r.type, read: 0, unread: 0 };
    if (r.isRead) cur.read += r._count._all;
    else cur.unread += r._count._all;
    typeMap.set(r.type, cur);
  }
  const rows = items.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    isRead: n.isRead,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
    recipientType: n.user ? 'STAFF' : n.student ? 'STUDENT' : n.guardian ? 'GUARDIAN' : 'OTHER',
    recipient: n.user ?? n.student ?? n.guardian ?? null,
  }));
  const lang = filters.lang;
  const R = DICTIONARY[lang].reports;
  type Row = (typeof rows)[number];
  return {
    data: {
      range: { from: range.from, to: range.to },
      byType: Array.from(typeMap.values()).sort((a, b) => b.read + b.unread - (a.read + a.unread)),
      byRecipientType: [
        { type: 'STAFF', count: staff },
        { type: 'STUDENT', count: students },
        { type: 'GUARDIAN', count: guardians },
      ],
      rows,
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    },
    export: {
      rows,
      columns: [
        { header: R.col.date, value: (r: Row) => r.createdAt },
        { header: R.col.notificationType, value: (r: Row) => r.type },
        { header: R.col.recipientType, value: (r: Row) => r.recipientType },
        { header: R.col.recipientName, value: (r: Row) => pickName(lang, r.recipient?.name, r.recipient?.banglaName) },
        { header: R.col.readStatus, value: (r: Row) => (r.isRead ? R.read : R.unread) },
      ],
    },
  };
};
