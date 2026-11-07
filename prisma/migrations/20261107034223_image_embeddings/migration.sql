-- CreateTable
CREATE TABLE "ImageEmbedding" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "s3Key" TEXT NOT NULL,
    "vector" vector(1024) NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImageEmbedding_s3Key_key" ON "ImageEmbedding"("s3Key");

-- CreateIndex
CREATE INDEX "ImageEmbedding_itemId_idx" ON "ImageEmbedding"("itemId");

-- AddForeignKey
ALTER TABLE "ImageEmbedding" ADD CONSTRAINT "ImageEmbedding_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 기존 글의 벡터를 첫 번째 사진의 벡터로 옮김 (서버 글은 모두 사진 1장)
INSERT INTO "ImageEmbedding" ("itemId", "s3Key", "vector", "model", "createdAt", "updatedAt")
SELECT DISTINCT ON (i."itemId") i."itemId", i."s3Key", it."imageVector", 'migrated-from-item', now(), now()
FROM "ItemImage" i
JOIN "Item" it ON it.id = i."itemId"
WHERE it."imageVector" IS NOT NULL
ORDER BY i."itemId", i."sortOrder" ASC, i.id ASC;