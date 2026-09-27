/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS debug script (not app code) */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const fs = await prisma.feeStructure.findMany();
  console.log('FeeStructures in DB:', fs.map(f => ({ id: f.id, name: f.name, amount: f.amount })));

  const as = await prisma.studentFeeAssignment.findMany();
  console.log('StudentFeeAssignments in DB:', as.length);

  const inv = await prisma.feeInvoice.findMany();
  console.log('Invoices in DB:', inv.length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
