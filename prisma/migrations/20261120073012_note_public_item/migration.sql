-- AlterTable
ALTER TABLE "ItemNote" ADD COLUMN     "publicItemId" INTEGER,
ALTER COLUMN "itemId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ItemNote_publicItemId_authorId_idx" ON "ItemNote"("publicItemId", "authorId");

-- AddForeignKey
ALTER TABLE "ItemNote" ADD CONSTRAINT "ItemNote_publicItemId_fkey" FOREIGN KEY ("publicItemId") REFERENCES "PublicItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 메모는 우리 글 또는 경찰청 습득물 중 정확히 하나에만 붙음
ALTER TABLE "ItemNote" ADD CONSTRAINT "ItemNote_one_target_check" CHECK (("itemId" IS NULL) <> ("publicItemId" IS NULL));
