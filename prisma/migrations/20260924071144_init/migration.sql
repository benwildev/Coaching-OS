-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('OWNER', 'ADMIN', 'STAFF', 'TEACHER');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('ADMISSION', 'MONTHLY', 'COURSE', 'BATCH', 'EXAM', 'MODEL_TEST', 'MATERIAL', 'SPECIAL_CLASS', 'REGISTRATION', 'OTHER');

-- CreateEnum
CREATE TYPE "FeeFrequency" AS ENUM ('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "FeeAssignmentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'WAIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('COMPLETED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'VOIDED');

-- CreateEnum
CREATE TYPE "FeeAdjustmentType" AS ENUM ('DISCOUNT', 'WAIVER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BKASH', 'NAGAD', 'BANK', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "CommunicationChannel" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

-- CreateTable
CREATE TABLE "coaching_centers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "banglaName" TEXT,
    "code" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "website" TEXT,
    "address" TEXT,
    "city" TEXT,
    "district" TEXT DEFAULT 'Dhaka',
    "logo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coaching_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "banglaName" TEXT,
    "code" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "banglaName" TEXT,
    "avatar" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT,
    "name" TEXT NOT NULL,
    "code" "RoleCode" NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_sessions" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "banglaName" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_programs" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "banglaName" TEXT,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_classes" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "academicProgramId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "banglaName" TEXT,
    "code" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_groups" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "academicClassId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "banglaName" TEXT,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "education_boards" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "banglaName" TEXT,
    "code" TEXT NOT NULL,
    "isGeneral" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "education_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "academicClassId" TEXT NOT NULL,
    "academicGroupId" TEXT,
    "name" TEXT NOT NULL,
    "banglaName" TEXT,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_papers" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "banglaName" TEXT,
    "paperNumber" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,

    CONSTRAINT "subject_papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "academicProgramId" TEXT NOT NULL,
    "academicClassId" TEXT NOT NULL,
    "academicGroupId" TEXT,
    "name" TEXT NOT NULL,
    "banglaName" TEXT,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "durationMonths" INTEGER NOT NULL DEFAULT 12,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_subjects" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectPaperId" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "totalMarks" DECIMAL(6,2),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "course_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT,
    "studentIdCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "banglaName" TEXT,
    "gender" TEXT,
    "dob" TIMESTAMP(3),
    "bloodGroup" TEXT,
    "religion" TEXT,
    "nationality" TEXT DEFAULT 'Bangladeshi',
    "phone" TEXT,
    "email" TEXT,
    "photoUrl" TEXT,
    "address" TEXT,
    "permanentAddress" TEXT,
    "schoolName" TEXT,
    "educationBoardId" TEXT,
    "nidBirthReg" TEXT,
    "sscRoll" TEXT,
    "sscReg" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_id_sequences" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "academicYear" INTEGER NOT NULL,
    "currentNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_id_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "banglaName" TEXT,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "altPhone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "occupation" TEXT,
    "address" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "preferredChannel" "CommunicationChannel" NOT NULL DEFAULT 'SMS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_guardians" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "canPickup" BOOLEAN NOT NULL DEFAULT false,
    "isEmergencyContact" BOOLEAN NOT NULL DEFAULT false,
    "canReceiveNotifications" BOOLEAN NOT NULL DEFAULT true,
    "preferredChannel" "CommunicationChannel" NOT NULL DEFAULT 'SMS',
    "notes" TEXT,

    CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_enrollments" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "branchId" TEXT,
    "academicSessionId" TEXT NOT NULL,
    "academicProgramId" TEXT NOT NULL,
    "academicClassId" TEXT NOT NULL,
    "academicGroupId" TEXT,
    "courseId" TEXT,
    "educationBoardId" TEXT,
    "rollNumber" TEXT,
    "admissionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ENROLLED',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT,
    "userId" TEXT,
    "teacherCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "banglaName" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "designation" TEXT,
    "qualification" TEXT,
    "bio" TEXT,
    "photoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "joiningDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_subjects" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,

    CONSTRAINT "teacher_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "academicSessionId" TEXT NOT NULL,
    "academicProgramId" TEXT NOT NULL,
    "academicClassId" TEXT NOT NULL,
    "academicGroupId" TEXT,
    "courseId" TEXT,
    "name" TEXT NOT NULL,
    "banglaName" TEXT,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 40,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_subjects" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "batch_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_teacher_assignments" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "batch_teacher_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_batches" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "rollCode" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "student_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "floor" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 50,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_schedules" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT,
    "roomId" TEXT,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "effectiveStartDate" TIMESTAMP(3),
    "effectiveEndDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "classScheduleId" TEXT,
    "subjectId" TEXT,
    "teacherId" TEXT,
    "roomId" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "date" DATE NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CLASS',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "isIncomplete" BOOLEAN NOT NULL DEFAULT false,
    "markedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_attendances" (
    "id" TEXT NOT NULL,
    "attendanceSessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "inTime" TEXT,
    "remarks" TEXT,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_attendances" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "inTime" TEXT,
    "outTime" TEXT,
    "remarks" TEXT,

    CONSTRAINT "teacher_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structures" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT,
    "academicSessionId" TEXT,
    "academicClassId" TEXT,
    "courseId" TEXT,
    "feeType" "FeeType" NOT NULL DEFAULT 'MONTHLY',
    "name" TEXT NOT NULL,
    "banglaName" TEXT,
    "code" TEXT,
    "description" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "frequency" "FeeFrequency" NOT NULL DEFAULT 'MONTHLY',
    "dueDay" INTEGER NOT NULL DEFAULT 10,
    "lateFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_fee_assignments" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT,
    "studentId" TEXT NOT NULL,
    "feeStructureId" TEXT,
    "batchId" TEXT,
    "academicSessionId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "originalAmount" DECIMAL(10,2) NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "waiverAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "finalAmount" DECIMAL(10,2) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "FeeAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_fee_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_invoices" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT,
    "studentId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "subtotalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "waiverAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "dueAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "studentFeeAssignmentId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmount" DECIMAL(10,2) NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(10,2) NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "fee_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_discounts" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "feeInvoiceId" TEXT,
    "studentFeeAssignmentId" TEXT,
    "type" "FeeAdjustmentType" NOT NULL DEFAULT 'DISCOUNT',
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT,
    "studentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "transactionId" TEXT,
    "referenceNumber" TEXT,
    "senderMobile" TEXT,
    "bankName" TEXT,
    "chequeNumber" TEXT,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
    "collectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_refunds" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "refundedById" TEXT,
    "refundDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_sequences" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "currentNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "banglaName" TEXT,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "paidTo" TEXT,
    "invoiceNo" TEXT,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "branchId" TEXT,
    "academicSessionId" TEXT NOT NULL,
    "academicProgramId" TEXT NOT NULL,
    "academicClassId" TEXT NOT NULL,
    "batchId" TEXT,
    "title" TEXT NOT NULL,
    "banglaTitle" TEXT,
    "examType" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "totalMarks" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "passMarks" DECIMAL(5,2) NOT NULL DEFAULT 40,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_subjects" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "examDate" TIMESTAMP(3),
    "startTime" TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "totalMarks" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "passMarks" DECIMAL(5,2) NOT NULL DEFAULT 40,

    CONSTRAINT "exam_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_students" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "rollNumber" TEXT,

    CONSTRAINT "exam_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "results" (
    "id" TEXT NOT NULL,
    "examSubjectId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "marksObtained" DECIMAL(5,2) NOT NULL,
    "highestMarks" DECIMAL(5,2),
    "grade" TEXT,
    "gpa" DECIMAL(3,2),
    "isPassed" BOOLEAN NOT NULL DEFAULT true,
    "rank" INTEGER,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "marks" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "difficulty" TEXT,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "optionText" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_materials" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "academicClassId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PDF',

    CONSTRAINT "study_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "banglaTitle" TEXT,
    "content" TEXT NOT NULL,
    "targetAudience" TEXT NOT NULL DEFAULT 'ALL',
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_templates" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL DEFAULT 'SMS',
    "bodyEn" TEXT NOT NULL,
    "bodyBn" TEXT NOT NULL,
    "triggerEvent" TEXT,

    CONSTRAINT "communication_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_logs" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "recipientPhone" TEXT,
    "recipientEmail" TEXT,
    "channel" "CommunicationChannel" NOT NULL DEFAULT 'SMS',
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cost" DECIMAL(5,2),

    CONSTRAINT "communication_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'GENERAL',

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branding_settings" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#063B78',
    "secondaryColor" TEXT NOT NULL DEFAULT '#00296b',
    "accentColor" TEXT NOT NULL DEFAULT '#FFD200',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branding_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "uploaderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "maxStudents" INTEGER NOT NULL DEFAULT 200,
    "maxBranches" INTEGER NOT NULL DEFAULT 1,
    "priceMonthly" DECIMAL(10,2) NOT NULL,
    "priceYearly" DECIMAL(10,2) NOT NULL,
    "features" JSONB,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coaching_centers_code_key" ON "coaching_centers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "branches_coachingCenterId_code_key" ON "branches"("coachingCenterId", "code");

-- CreateIndex
CREATE INDEX "users_coachingCenterId_phone_idx" ON "users"("coachingCenterId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_coachingCenterId_email_key" ON "users"("coachingCenterId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_coachingCenterId_code_key" ON "roles"("coachingCenterId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "role_assignments_userId_roleId_branchId_key" ON "role_assignments"("userId", "roleId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "academic_sessions_coachingCenterId_name_key" ON "academic_sessions"("coachingCenterId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "academic_programs_coachingCenterId_code_key" ON "academic_programs"("coachingCenterId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "academic_classes_academicProgramId_code_key" ON "academic_classes"("academicProgramId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "academic_groups_academicClassId_code_key" ON "academic_groups"("academicClassId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "education_boards_code_key" ON "education_boards"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_academicClassId_code_key" ON "subjects"("academicClassId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "subject_papers_subjectId_paperNumber_key" ON "subject_papers"("subjectId", "paperNumber");

-- CreateIndex
CREATE INDEX "courses_coachingCenterId_status_idx" ON "courses"("coachingCenterId", "status");

-- CreateIndex
CREATE INDEX "courses_academicProgramId_idx" ON "courses"("academicProgramId");

-- CreateIndex
CREATE INDEX "courses_academicClassId_idx" ON "courses"("academicClassId");

-- CreateIndex
CREATE UNIQUE INDEX "courses_coachingCenterId_code_key" ON "courses"("coachingCenterId", "code");

-- CreateIndex
CREATE INDEX "course_subjects_courseId_displayOrder_idx" ON "course_subjects"("courseId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "course_subjects_courseId_subjectId_key" ON "course_subjects"("courseId", "subjectId");

-- CreateIndex
CREATE INDEX "students_coachingCenterId_phone_idx" ON "students"("coachingCenterId", "phone");

-- CreateIndex
CREATE INDEX "students_coachingCenterId_branchId_idx" ON "students"("coachingCenterId", "branchId");

-- CreateIndex
CREATE INDEX "students_coachingCenterId_status_idx" ON "students"("coachingCenterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "students_coachingCenterId_studentIdCode_key" ON "students"("coachingCenterId", "studentIdCode");

-- CreateIndex
CREATE UNIQUE INDEX "student_id_sequences_coachingCenterId_academicYear_key" ON "student_id_sequences"("coachingCenterId", "academicYear");

-- CreateIndex
CREATE INDEX "guardians_coachingCenterId_phone_idx" ON "guardians"("coachingCenterId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "student_guardians_studentId_guardianId_key" ON "student_guardians"("studentId", "guardianId");

-- CreateIndex
CREATE INDEX "student_enrollments_coachingCenterId_academicSessionId_acad_idx" ON "student_enrollments"("coachingCenterId", "academicSessionId", "academicClassId");

-- CreateIndex
CREATE INDEX "student_enrollments_coachingCenterId_branchId_idx" ON "student_enrollments"("coachingCenterId", "branchId");

-- CreateIndex
CREATE INDEX "student_enrollments_coachingCenterId_status_idx" ON "student_enrollments"("coachingCenterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_userId_key" ON "teachers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_coachingCenterId_teacherCode_key" ON "teachers"("coachingCenterId", "teacherCode");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_subjects_teacherId_subjectId_key" ON "teacher_subjects"("teacherId", "subjectId");

-- CreateIndex
CREATE INDEX "batches_coachingCenterId_branchId_idx" ON "batches"("coachingCenterId", "branchId");

-- CreateIndex
CREATE INDEX "batches_coachingCenterId_academicSessionId_idx" ON "batches"("coachingCenterId", "academicSessionId");

-- CreateIndex
CREATE INDEX "batches_coachingCenterId_academicProgramId_idx" ON "batches"("coachingCenterId", "academicProgramId");

-- CreateIndex
CREATE INDEX "batches_coachingCenterId_academicClassId_idx" ON "batches"("coachingCenterId", "academicClassId");

-- CreateIndex
CREATE INDEX "batches_coachingCenterId_academicGroupId_idx" ON "batches"("coachingCenterId", "academicGroupId");

-- CreateIndex
CREATE INDEX "batches_coachingCenterId_courseId_idx" ON "batches"("coachingCenterId", "courseId");

-- CreateIndex
CREATE INDEX "batches_coachingCenterId_status_idx" ON "batches"("coachingCenterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "batches_coachingCenterId_code_key" ON "batches"("coachingCenterId", "code");

-- CreateIndex
CREATE INDEX "batch_subjects_batchId_idx" ON "batch_subjects"("batchId");

-- CreateIndex
CREATE INDEX "batch_subjects_subjectId_idx" ON "batch_subjects"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "batch_subjects_batchId_subjectId_key" ON "batch_subjects"("batchId", "subjectId");

-- CreateIndex
CREATE INDEX "batch_teacher_assignments_coachingCenterId_teacherId_idx" ON "batch_teacher_assignments"("coachingCenterId", "teacherId");

-- CreateIndex
CREATE INDEX "batch_teacher_assignments_coachingCenterId_batchId_idx" ON "batch_teacher_assignments"("coachingCenterId", "batchId");

-- CreateIndex
CREATE INDEX "batch_teacher_assignments_coachingCenterId_subjectId_idx" ON "batch_teacher_assignments"("coachingCenterId", "subjectId");

-- CreateIndex
CREATE INDEX "student_batches_coachingCenterId_status_idx" ON "student_batches"("coachingCenterId", "status");

-- CreateIndex
CREATE INDEX "student_batches_studentId_batchId_idx" ON "student_batches"("studentId", "batchId");

-- CreateIndex
CREATE INDEX "student_batches_batchId_idx" ON "student_batches"("batchId");

-- CreateIndex
CREATE INDEX "student_batches_joinedAt_idx" ON "student_batches"("joinedAt");

-- CreateIndex
CREATE INDEX "student_batches_endDate_idx" ON "student_batches"("endDate");

-- CreateIndex
CREATE INDEX "rooms_coachingCenterId_branchId_idx" ON "rooms"("coachingCenterId", "branchId");

-- CreateIndex
CREATE INDEX "rooms_coachingCenterId_status_idx" ON "rooms"("coachingCenterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_branchId_code_key" ON "rooms"("branchId", "code");

-- CreateIndex
CREATE INDEX "class_schedules_coachingCenterId_branchId_idx" ON "class_schedules"("coachingCenterId", "branchId");

-- CreateIndex
CREATE INDEX "class_schedules_coachingCenterId_batchId_idx" ON "class_schedules"("coachingCenterId", "batchId");

-- CreateIndex
CREATE INDEX "class_schedules_coachingCenterId_teacherId_idx" ON "class_schedules"("coachingCenterId", "teacherId");

-- CreateIndex
CREATE INDEX "class_schedules_coachingCenterId_roomId_idx" ON "class_schedules"("coachingCenterId", "roomId");

-- CreateIndex
CREATE INDEX "class_schedules_coachingCenterId_dayOfWeek_idx" ON "class_schedules"("coachingCenterId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "class_schedules_coachingCenterId_startTime_idx" ON "class_schedules"("coachingCenterId", "startTime");

-- CreateIndex
CREATE INDEX "attendance_sessions_coachingCenterId_branchId_idx" ON "attendance_sessions"("coachingCenterId", "branchId");

-- CreateIndex
CREATE INDEX "attendance_sessions_coachingCenterId_batchId_idx" ON "attendance_sessions"("coachingCenterId", "batchId");

-- CreateIndex
CREATE INDEX "attendance_sessions_coachingCenterId_teacherId_idx" ON "attendance_sessions"("coachingCenterId", "teacherId");

-- CreateIndex
CREATE INDEX "attendance_sessions_coachingCenterId_date_idx" ON "attendance_sessions"("coachingCenterId", "date");

-- CreateIndex
CREATE INDEX "attendance_sessions_coachingCenterId_status_idx" ON "attendance_sessions"("coachingCenterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_batchId_date_type_key" ON "attendance_sessions"("batchId", "date", "type");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_classScheduleId_date_key" ON "attendance_sessions"("classScheduleId", "date");

-- CreateIndex
CREATE INDEX "student_attendances_studentId_idx" ON "student_attendances"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "student_attendances_attendanceSessionId_studentId_key" ON "student_attendances"("attendanceSessionId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_attendances_teacherId_date_key" ON "teacher_attendances"("teacherId", "date");

-- CreateIndex
CREATE INDEX "fee_structures_coachingCenterId_isActive_idx" ON "fee_structures"("coachingCenterId", "isActive");

-- CreateIndex
CREATE INDEX "fee_structures_coachingCenterId_feeType_idx" ON "fee_structures"("coachingCenterId", "feeType");

-- CreateIndex
CREATE INDEX "fee_structures_coachingCenterId_branchId_idx" ON "fee_structures"("coachingCenterId", "branchId");

-- CreateIndex
CREATE INDEX "fee_structures_coachingCenterId_academicSessionId_idx" ON "fee_structures"("coachingCenterId", "academicSessionId");

-- CreateIndex
CREATE INDEX "student_fee_assignments_coachingCenterId_studentId_idx" ON "student_fee_assignments"("coachingCenterId", "studentId");

-- CreateIndex
CREATE INDEX "student_fee_assignments_coachingCenterId_status_idx" ON "student_fee_assignments"("coachingCenterId", "status");

-- CreateIndex
CREATE INDEX "student_fee_assignments_coachingCenterId_branchId_idx" ON "student_fee_assignments"("coachingCenterId", "branchId");

-- CreateIndex
CREATE INDEX "student_fee_assignments_batchId_idx" ON "student_fee_assignments"("batchId");

-- CreateIndex
CREATE INDEX "student_fee_assignments_feeStructureId_idx" ON "student_fee_assignments"("feeStructureId");

-- CreateIndex
CREATE INDEX "fee_invoices_coachingCenterId_studentId_idx" ON "fee_invoices"("coachingCenterId", "studentId");

-- CreateIndex
CREATE INDEX "fee_invoices_coachingCenterId_status_idx" ON "fee_invoices"("coachingCenterId", "status");

-- CreateIndex
CREATE INDEX "fee_invoices_coachingCenterId_branchId_idx" ON "fee_invoices"("coachingCenterId", "branchId");

-- CreateIndex
CREATE INDEX "fee_invoices_coachingCenterId_invoiceDate_idx" ON "fee_invoices"("coachingCenterId", "invoiceDate");

-- CreateIndex
CREATE INDEX "fee_invoices_coachingCenterId_dueDate_idx" ON "fee_invoices"("coachingCenterId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "fee_invoices_coachingCenterId_invoiceNumber_key" ON "fee_invoices"("coachingCenterId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "fee_invoice_items_invoiceId_idx" ON "fee_invoice_items"("invoiceId");

-- CreateIndex
CREATE INDEX "fee_invoice_items_studentFeeAssignmentId_idx" ON "fee_invoice_items"("studentFeeAssignmentId");

-- CreateIndex
CREATE INDEX "fee_discounts_coachingCenterId_idx" ON "fee_discounts"("coachingCenterId");

-- CreateIndex
CREATE INDEX "fee_discounts_feeInvoiceId_idx" ON "fee_discounts"("feeInvoiceId");

-- CreateIndex
CREATE INDEX "fee_discounts_studentFeeAssignmentId_idx" ON "fee_discounts"("studentFeeAssignmentId");

-- CreateIndex
CREATE INDEX "payments_coachingCenterId_studentId_idx" ON "payments"("coachingCenterId", "studentId");

-- CreateIndex
CREATE INDEX "payments_coachingCenterId_invoiceId_idx" ON "payments"("coachingCenterId", "invoiceId");

-- CreateIndex
CREATE INDEX "payments_coachingCenterId_paymentDate_idx" ON "payments"("coachingCenterId", "paymentDate");

-- CreateIndex
CREATE INDEX "payments_coachingCenterId_status_idx" ON "payments"("coachingCenterId", "status");

-- CreateIndex
CREATE INDEX "payments_coachingCenterId_branchId_idx" ON "payments"("coachingCenterId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_coachingCenterId_receiptNumber_key" ON "payments"("coachingCenterId", "receiptNumber");

-- CreateIndex
CREATE INDEX "payment_refunds_coachingCenterId_idx" ON "payment_refunds"("coachingCenterId");

-- CreateIndex
CREATE INDEX "payment_refunds_paymentId_idx" ON "payment_refunds"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_sequences_coachingCenterId_type_year_key" ON "financial_sequences"("coachingCenterId", "type", "year");

-- CreateIndex
CREATE UNIQUE INDEX "exam_subjects_examId_subjectId_key" ON "exam_subjects"("examId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_students_examId_studentId_key" ON "exam_students"("examId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "results_examSubjectId_studentId_key" ON "results"("examSubjectId", "studentId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_coachingCenterId_key_key" ON "system_settings"("coachingCenterId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "branding_settings_coachingCenterId_key" ON "branding_settings"("coachingCenterId");

-- CreateIndex
CREATE INDEX "audit_logs_coachingCenterId_action_idx" ON "audit_logs"("coachingCenterId", "action");

-- CreateIndex
CREATE INDEX "audit_logs_coachingCenterId_createdAt_idx" ON "audit_logs"("coachingCenterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_programs" ADD CONSTRAINT "academic_programs_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_classes" ADD CONSTRAINT "academic_classes_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_classes" ADD CONSTRAINT "academic_classes_academicProgramId_fkey" FOREIGN KEY ("academicProgramId") REFERENCES "academic_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_groups" ADD CONSTRAINT "academic_groups_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_groups" ADD CONSTRAINT "academic_groups_academicClassId_fkey" FOREIGN KEY ("academicClassId") REFERENCES "academic_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_academicClassId_fkey" FOREIGN KEY ("academicClassId") REFERENCES "academic_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_academicGroupId_fkey" FOREIGN KEY ("academicGroupId") REFERENCES "academic_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_papers" ADD CONSTRAINT "subject_papers_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_academicProgramId_fkey" FOREIGN KEY ("academicProgramId") REFERENCES "academic_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_academicClassId_fkey" FOREIGN KEY ("academicClassId") REFERENCES "academic_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_academicGroupId_fkey" FOREIGN KEY ("academicGroupId") REFERENCES "academic_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_subjects" ADD CONSTRAINT "course_subjects_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_subjects" ADD CONSTRAINT "course_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_subjects" ADD CONSTRAINT "course_subjects_subjectPaperId_fkey" FOREIGN KEY ("subjectPaperId") REFERENCES "subject_papers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_educationBoardId_fkey" FOREIGN KEY ("educationBoardId") REFERENCES "education_boards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_id_sequences" ADD CONSTRAINT "student_id_sequences_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "academic_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_academicProgramId_fkey" FOREIGN KEY ("academicProgramId") REFERENCES "academic_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_academicClassId_fkey" FOREIGN KEY ("academicClassId") REFERENCES "academic_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_academicGroupId_fkey" FOREIGN KEY ("academicGroupId") REFERENCES "academic_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_educationBoardId_fkey" FOREIGN KEY ("educationBoardId") REFERENCES "education_boards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "academic_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_academicProgramId_fkey" FOREIGN KEY ("academicProgramId") REFERENCES "academic_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_academicClassId_fkey" FOREIGN KEY ("academicClassId") REFERENCES "academic_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_academicGroupId_fkey" FOREIGN KEY ("academicGroupId") REFERENCES "academic_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_subjects" ADD CONSTRAINT "batch_subjects_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_subjects" ADD CONSTRAINT "batch_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_teacher_assignments" ADD CONSTRAINT "batch_teacher_assignments_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_teacher_assignments" ADD CONSTRAINT "batch_teacher_assignments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_teacher_assignments" ADD CONSTRAINT "batch_teacher_assignments_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_teacher_assignments" ADD CONSTRAINT "batch_teacher_assignments_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_teacher_assignments" ADD CONSTRAINT "batch_teacher_assignments_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_batches" ADD CONSTRAINT "student_batches_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_batches" ADD CONSTRAINT "student_batches_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_batches" ADD CONSTRAINT "student_batches_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_classScheduleId_fkey" FOREIGN KEY ("classScheduleId") REFERENCES "class_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendances" ADD CONSTRAINT "student_attendances_attendanceSessionId_fkey" FOREIGN KEY ("attendanceSessionId") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendances" ADD CONSTRAINT "student_attendances_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_attendances" ADD CONSTRAINT "teacher_attendances_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_attendances" ADD CONSTRAINT "teacher_attendances_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "academic_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_academicClassId_fkey" FOREIGN KEY ("academicClassId") REFERENCES "academic_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "fee_structures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "academic_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoice_items" ADD CONSTRAINT "fee_invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoice_items" ADD CONSTRAINT "fee_invoice_items_studentFeeAssignmentId_fkey" FOREIGN KEY ("studentFeeAssignmentId") REFERENCES "student_fee_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_discounts" ADD CONSTRAINT "fee_discounts_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_discounts" ADD CONSTRAINT "fee_discounts_feeInvoiceId_fkey" FOREIGN KEY ("feeInvoiceId") REFERENCES "fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_discounts" ADD CONSTRAINT "fee_discounts_studentFeeAssignmentId_fkey" FOREIGN KEY ("studentFeeAssignmentId") REFERENCES "student_fee_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_discounts" ADD CONSTRAINT "fee_discounts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_refundedById_fkey" FOREIGN KEY ("refundedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_sequences" ADD CONSTRAINT "financial_sequences_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "academic_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_academicProgramId_fkey" FOREIGN KEY ("academicProgramId") REFERENCES "academic_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_academicClassId_fkey" FOREIGN KEY ("academicClassId") REFERENCES "academic_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_students" ADD CONSTRAINT "exam_students_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_students" ADD CONSTRAINT "exam_students_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_examSubjectId_fkey" FOREIGN KEY ("examSubjectId") REFERENCES "exam_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_academicClassId_fkey" FOREIGN KEY ("academicClassId") REFERENCES "academic_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_templates" ADD CONSTRAINT "communication_templates_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branding_settings" ADD CONSTRAINT "branding_settings_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
