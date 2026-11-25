-- 경찰청 습득물 사진 벡터 (서버 시작 때도 IF NOT EXISTS로 만들어서, 마이그레이션을 아직 안 돌린 DB에서도 동작)
CREATE TABLE IF NOT EXISTS "PublicItemEmbedding" (
    "publicItemId" INTEGER NOT NULL,
    "vector" vector(1024),
    "status" TEXT NOT NULL DEFAULT 'ok',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicItemEmbedding_pkey" PRIMARY KEY ("publicItemId"),
    CONSTRAINT "PublicItemEmbedding_publicItemId_fkey" FOREIGN KEY ("publicItemId") REFERENCES "PublicItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
