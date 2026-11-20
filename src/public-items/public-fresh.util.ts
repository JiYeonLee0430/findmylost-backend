import { Prisma } from '@prisma/client';

/** PUBLIC_STALE_DAYS일 넘게 수집에 안 잡힌 공공 습득물은 목록에서 숨김. 값이 없거나 0이면 끔 */
function staleDays(): number {
  const n = Number(process.env.PUBLIC_STALE_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const cutoff = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/** 목록/피드 where에 넣는 조건. 꺼져 있으면 빈 조건 */
export function publicFreshWhere(): Prisma.PublicItemWhereInput {
  const d = staleDays();
  return d ? { lastSyncedAt: { gte: cutoff(d) } } : {};
}

/** 상세 화면용: 지금 목록에 보이는 물건인지 */
export function isListed(lastSyncedAt: Date): boolean {
  const d = staleDays();
  return !d || lastSyncedAt >= cutoff(d);
}