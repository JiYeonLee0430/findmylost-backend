-- AlterTable
ALTER TABLE "PublicItem" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "PublicItem_lastSyncedAt_idx" ON "PublicItem"("lastSyncedAt");

-- 기존 물건은 Lambda가 마지막으로 저장한 시각으로 채움
UPDATE "PublicItem" SET "lastSyncedAt" = "updatedAt";
