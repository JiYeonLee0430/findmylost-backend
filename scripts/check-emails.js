const { PrismaClient } = require('@prisma/client');

const url = process.env.CHECK_DB_URL;
if (!url) {
  console.error('CHECK_DB_URL이 필요합니다.');
  process.exit(1);
}
const prisma = new PrismaClient({ datasources: { db: { url } } });

(async () => {
  console.log('접속 대상:', url.replace(/:\/\/[^@]+@/, '://****@'));
  const mixed = await prisma.$queryRaw`SELECT id, email FROM "User" WHERE email <> lower(email) ORDER BY id`;
  const dup = await prisma.$queryRaw`SELECT lower(email) AS email, count(*)::int AS n FROM "User" GROUP BY lower(email) HAVING count(*) > 1`;
  console.log('대문자가 섞인 이메일:');
  console.table(mixed);
  console.log('소문자로 바꾸면 중복되는 이메일:');
  console.table(dup);
  await prisma.$disconnect();
})();