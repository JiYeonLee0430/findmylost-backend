-- CreateEnum
CREATE TYPE "NoteScope" AS ENUM ('PRIVATE', 'INSTITUTION');

-- CreateTable
CREATE TABLE "ItemNote" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "scope" "NoteScope" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemNote_itemId_scope_idx" ON "ItemNote"("itemId", "scope");

-- CreateIndex
CREATE INDEX "ItemNote_authorId_idx" ON "ItemNote"("authorId");

-- AddForeignKey
ALTER TABLE "ItemNote" ADD CONSTRAINT "ItemNote_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemNote" ADD CONSTRAINT "ItemNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
