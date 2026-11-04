import { Prisma } from '@prisma/client';

/** 우리 분류 선택지 → 공공 분류("대분류 > 소분류") 매핑 */
const CATEGORY_RULES: Record<string, { mains?: string[]; contains?: string[] }> = {
  전자기기: { mains: ['전자기기', '휴대폰'] },
  '지갑/카드': { mains: ['지갑', '카드', '증명서'] },
  지갑: { mains: ['지갑', '카드', '증명서'] }, // 목록 칸이 "지갑"일 때도 같게 처리
  귀중품: { mains: ['귀금속', '현금'] },
  가방: { mains: ['가방', '쇼핑백'] },
  의류: { mains: ['의류'] },
  우산: { contains: ['우산'] },
};
const KNOWN_MAINS = [...new Set(Object.values(CATEGORY_RULES).flatMap((r) => r.mains ?? []))];

export function publicCategoryWhere(category: string): Prisma.PublicItemWhereInput {
  const rule = CATEGORY_RULES[category];
  if (rule) {
    return {
      OR: [
        ...(rule.mains ?? []).map((m) => ({ category: { startsWith: m } })),
        ...(rule.contains ?? []).map((c) => ({ category: { contains: c } })),
      ],
    };
  }
  if (category === '기타') {
    return {
      OR: [
        { category: null },
        {
          NOT: [
            ...KNOWN_MAINS.map((m) => ({ category: { startsWith: m } })),
            { category: { contains: '우산' } },
          ],
        },
      ],
    };
  }
  return { category: { startsWith: category } };
}