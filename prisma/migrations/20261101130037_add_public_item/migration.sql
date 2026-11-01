-- CreateTable
CREATE TABLE "PublicItem" (
    "id" SERIAL NOT NULL,
    "atcId" TEXT NOT NULL,
    "fdSn" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "foundDate" DATE,
    "storagePlace" TEXT,
    "imageUrl" TEXT,
    "institutionName" TEXT,
    "phone" TEXT,
    "content" TEXT,
    "region" TEXT,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublicItem_foundDate_idx" ON "PublicItem"("foundDate");

-- CreateIndex
CREATE INDEX "PublicItem_category_idx" ON "PublicItem"("category");

-- CreateIndex
CREATE INDEX "PublicItem_region_idx" ON "PublicItem"("region");

-- CreateIndex
CREATE UNIQUE INDEX "PublicItem_atcId_fdSn_key" ON "PublicItem"("atcId", "fdSn");
