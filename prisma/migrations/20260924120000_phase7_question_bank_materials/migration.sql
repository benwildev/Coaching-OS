-- AlterTable
ALTER TABLE "question_options" ADD COLUMN     "banglaOptionText" TEXT,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "academicClassId" TEXT,
ADD COLUMN     "academicGroupId" TEXT,
ADD COLUMN     "academicProgramId" TEXT,
ADD COLUMN     "academicSessionId" TEXT,
ADD COLUMN     "answer" TEXT,
ADD COLUMN     "banglaAnswer" TEXT,
ADD COLUMN     "banglaExplanation" TEXT,
ADD COLUMN     "banglaQuestionText" TEXT,
ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "chapter" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "explanation" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "subjectPaperId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedById" TEXT,
ALTER COLUMN "difficulty" SET DEFAULT 'MEDIUM';

-- AlterTable
ALTER TABLE "study_materials" ADD COLUMN     "academicGroupId" TEXT,
ADD COLUMN     "banglaDescription" TEXT,
ADD COLUMN     "banglaTitle" TEXT,
ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "subjectPaperId" TEXT,
ADD COLUMN     "thumbnailUrl" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedById" TEXT,
ALTER COLUMN "fileUrl" DROP NOT NULL;

-- CreateTable
CREATE TABLE "question_papers" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT,
    "academicSessionId" TEXT,
    "academicProgramId" TEXT,
    "academicClassId" TEXT,
    "academicGroupId" TEXT,
    "subjectId" TEXT NOT NULL,
    "subjectPaperId" TEXT,
    "title" TEXT NOT NULL,
    "banglaTitle" TEXT,
    "examType" TEXT,
    "examDate" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "totalMarks" DECIMAL(6,2) NOT NULL,
    "instructions" TEXT,
    "banglaInstructions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "finalizedAt" TIMESTAMP(3),
    "finalizedById" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_paper_items" (
    "id" TEXT NOT NULL,
    "questionPaperId" TEXT NOT NULL,
    "questionId" TEXT,
    "order" INTEGER NOT NULL,
    "questionTypeSnapshot" TEXT NOT NULL,
    "questionTextSnapshot" TEXT NOT NULL,
    "banglaQuestionTextSnapshot" TEXT,
    "marksSnapshot" DECIMAL(4,2) NOT NULL,
    "difficultySnapshot" TEXT,
    "optionsSnapshot" JSONB,
    "answerSnapshot" TEXT,
    "explanationSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_paper_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_papers_coachingCenterId_subjectId_idx" ON "question_papers"("coachingCenterId", "subjectId");

-- CreateIndex
CREATE INDEX "question_papers_coachingCenterId_status_idx" ON "question_papers"("coachingCenterId", "status");

-- CreateIndex
CREATE INDEX "question_paper_items_questionId_idx" ON "question_paper_items"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "question_paper_items_questionPaperId_questionId_key" ON "question_paper_items"("questionPaperId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "question_paper_items_questionPaperId_order_key" ON "question_paper_items"("questionPaperId", "order");

-- CreateIndex
CREATE INDEX "question_options_questionId_order_idx" ON "question_options"("questionId", "order");

-- CreateIndex
CREATE INDEX "questions_coachingCenterId_subjectId_idx" ON "questions"("coachingCenterId", "subjectId");

-- CreateIndex
CREATE INDEX "questions_coachingCenterId_status_idx" ON "questions"("coachingCenterId", "status");

-- CreateIndex
CREATE INDEX "questions_coachingCenterId_difficulty_idx" ON "questions"("coachingCenterId", "difficulty");

-- CreateIndex
CREATE INDEX "questions_coachingCenterId_type_idx" ON "questions"("coachingCenterId", "type");

-- CreateIndex
CREATE INDEX "questions_coachingCenterId_academicClassId_idx" ON "questions"("coachingCenterId", "academicClassId");

-- CreateIndex
CREATE INDEX "study_materials_coachingCenterId_subjectId_idx" ON "study_materials"("coachingCenterId", "subjectId");

-- CreateIndex
CREATE INDEX "study_materials_coachingCenterId_status_idx" ON "study_materials"("coachingCenterId", "status");

-- CreateIndex
CREATE INDEX "study_materials_coachingCenterId_type_idx" ON "study_materials"("coachingCenterId", "type");

-- CreateIndex
CREATE INDEX "study_materials_coachingCenterId_academicClassId_idx" ON "study_materials"("coachingCenterId", "academicClassId");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "academic_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_academicProgramId_fkey" FOREIGN KEY ("academicProgramId") REFERENCES "academic_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_academicClassId_fkey" FOREIGN KEY ("academicClassId") REFERENCES "academic_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_academicGroupId_fkey" FOREIGN KEY ("academicGroupId") REFERENCES "academic_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_subjectPaperId_fkey" FOREIGN KEY ("subjectPaperId") REFERENCES "subject_papers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_papers" ADD CONSTRAINT "question_papers_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_papers" ADD CONSTRAINT "question_papers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_papers" ADD CONSTRAINT "question_papers_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "academic_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_papers" ADD CONSTRAINT "question_papers_academicProgramId_fkey" FOREIGN KEY ("academicProgramId") REFERENCES "academic_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_papers" ADD CONSTRAINT "question_papers_academicClassId_fkey" FOREIGN KEY ("academicClassId") REFERENCES "academic_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_papers" ADD CONSTRAINT "question_papers_academicGroupId_fkey" FOREIGN KEY ("academicGroupId") REFERENCES "academic_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_papers" ADD CONSTRAINT "question_papers_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_papers" ADD CONSTRAINT "question_papers_subjectPaperId_fkey" FOREIGN KEY ("subjectPaperId") REFERENCES "subject_papers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_papers" ADD CONSTRAINT "question_papers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_papers" ADD CONSTRAINT "question_papers_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_papers" ADD CONSTRAINT "question_papers_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_paper_items" ADD CONSTRAINT "question_paper_items_questionPaperId_fkey" FOREIGN KEY ("questionPaperId") REFERENCES "question_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_paper_items" ADD CONSTRAINT "question_paper_items_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_academicGroupId_fkey" FOREIGN KEY ("academicGroupId") REFERENCES "academic_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_subjectPaperId_fkey" FOREIGN KEY ("subjectPaperId") REFERENCES "subject_papers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

