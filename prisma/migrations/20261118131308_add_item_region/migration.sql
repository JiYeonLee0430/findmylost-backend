-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "region" TEXT;

-- CreateIndex
CREATE INDEX "Item_region_idx" ON "Item"("region");
