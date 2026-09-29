-- CreateTable
CREATE TABLE "communication_provider_configs" (
    "id" TEXT NOT NULL,
    "coachingCenterId" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "credentialsEncrypted" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "communication_provider_configs_coachingCenterId_channel_key" ON "communication_provider_configs"("coachingCenterId", "channel");

-- AddForeignKey
ALTER TABLE "communication_provider_configs" ADD CONSTRAINT "communication_provider_configs_coachingCenterId_fkey" FOREIGN KEY ("coachingCenterId") REFERENCES "coaching_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_provider_configs" ADD CONSTRAINT "communication_provider_configs_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

