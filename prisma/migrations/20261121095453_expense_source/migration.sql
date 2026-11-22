-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "refId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT '';
