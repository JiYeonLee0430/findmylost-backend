const { PrismaClient } = require('@prisma/client');

const url = process.env.CHECK_DB_URL;
if (!url) {
  console.error('CHECK_DB_URL이 필요합니다.');
  process.exit(1);
}
const prisma = new PrismaClient({ datasources: { db: { url } } });

(async () => {
  console.log('접속 대상:', url.replace(/:\/\/[^@]+@/, '://****@'));

  const users = await prisma.$queryRaw`
    SELECT id, email, role, ("emailVerifiedAt" IS NOT NULL) AS verified, "mfaEnabled" AS mfa, "createdAt"::date AS created
    FROM "User" ORDER BY id`;
  console.log('\n[계정]');
  console.table(users);

  const items = await prisma.$queryRaw`
    SELECT i.id, i.title, i.type, i."authorId" AS author, i."createdAt"::date AS created,
           (SELECT count(*)::int FROM "ItemImage" m WHERE m."itemId" = i.id) AS images,
           (i."imageVector" IS NOT NULL) AS has_vector
    FROM "Item" i ORDER BY i.id`;
  console.log('\n[게시글]');
  console.table(items);

  await prisma.$disconnect();
})();