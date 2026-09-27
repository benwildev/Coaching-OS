import { Prisma } from '@prisma/client';

/** Joins raw-SQL predicates with AND (always parameterised — never string-concatenated values). */
export function sqlAnd(parts: Prisma.Sql[]): Prisma.Sql {
  if (parts.length === 0) return Prisma.sql`TRUE`;
  return Prisma.join(parts, ' AND ');
}

export function sqlIn(column: Prisma.Sql, ids: string[]): Prisma.Sql {
  if (ids.length === 0) return Prisma.sql`FALSE`;
  return Prisma.sql`${column} IN (${Prisma.join(ids)})`;
}

/**
 * A timestamp column (stored as UTC `timestamp without time zone`) converted
 * to the Asia/Dhaka local calendar date, as YYYY-MM-DD text.
 */
export function dhakaDateOf(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`to_char((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD')`;
}
