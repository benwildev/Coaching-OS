-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "billingType" TEXT NOT NULL DEFAULT 'ONE_TIME';

-- AlterTable
ALTER TABLE "student_fee_assignments" ADD COLUMN     "courseId" TEXT;

-- CreateTable
CREATE TABLE "course_fee_items" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "banglaName" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_fee_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_installments" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "banglaName" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "dueAfterDays" INTEGER NOT NULL DEFAULT 0,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_installments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_fee_items_courseId_displayOrder_idx" ON "course_fee_items"("courseId", "displayOrder");

-- CreateIndex
CREATE INDEX "course_installments_courseId_displayOrder_idx" ON "course_installments"("courseId", "displayOrder");

-- CreateIndex
CREATE INDEX "student_fee_assignments_courseId_idx" ON "student_fee_assignments"("courseId");

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_fee_items" ADD CONSTRAINT "course_fee_items_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_installments" ADD CONSTRAINT "course_installments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
