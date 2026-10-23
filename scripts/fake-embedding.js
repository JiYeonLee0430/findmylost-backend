// 사용: node scripts/fake-embedding.js <게시글ID> <그룹번호> [노이즈]
// 같은 그룹번호면 비슷한 벡터, 다른 그룹번호면 전혀 다른 벡터가 만들어짐
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)) {
  console.error('중단: DATABASE_URL이 로컬 DB가 아닙니다. 서버 DB에는 가짜 벡터를 넣을 수 없어요.');
  process.exit(1);
}

function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

const [id, group, noise = '0'] = process.argv.slice(2);
if (!id || !group) {
  console.error('사용: node scripts/fake-embedding.js <게시글ID> <그룹번호> [노이즈]');
  process.exit(1);
}

const base = rng(Number(group) * 7919 + 1);
const jitter = rng(Number(id) * 104729 + 7);
const embedding = Array.from(
  { length: 1024 },
  () => base() - 0.5 + (jitter() - 0.5) * Number(noise),
);

fetch(`http://localhost:3000/api/internal/items/${id}/embedding`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-internal-api-key': process.env.INTERNAL_API_KEY,
  },
  body: JSON.stringify({ embedding }),
})
  .then(async (r) => console.log(r.status, await r.text()))
  .catch((e) => console.error(e));