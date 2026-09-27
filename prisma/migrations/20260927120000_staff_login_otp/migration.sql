-- CreateTable
CREATE TABLE "staff_login_otps" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_login_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_login_otps_phone_createdAt_idx" ON "staff_login_otps"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "staff_login_otps_userId_createdAt_idx" ON "staff_login_otps"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "staff_login_otps" ADD CONSTRAINT "staff_login_otps_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_login_otps" ADD CONSTRAINT "staff_login_otps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
