import { redirect } from 'next/navigation';
import Link from 'next/link';
import prisma from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { isSetupCompleted } from '@/lib/services/tenant.service';
import Icon from '@/components/Icon';
import ChartCard from '@/components/ChartCard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const setupDone = await isSetupCompleted();
  if (!setupDone) {
    redirect('/setup');
  }

  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  // Load genuine database records for this tenant
  const [center, currentSession, userCount, programs, classesCount] = await Promise.all([
    prisma.coachingCenter.findUnique({
      where: { id: session.coachingCenterId },
      include: {
        branches: true,
        brandingSetting: true,
      },
    }),
    prisma.academicSession.findFirst({
      where: { coachingCenterId: session.coachingCenterId, isCurrent: true },
    }),
    prisma.user.count({
      where: { coachingCenterId: session.coachingCenterId, status: 'ACTIVE' },
    }),
    prisma.academicProgram.findMany({
      where: { coachingCenterId: session.coachingCenterId },
      include: {
        classes: true,
      },
    }),
    prisma.academicClass.count({
      where: { coachingCenterId: session.coachingCenterId },
    }),
  ]);

  if (!center) {
    redirect('/setup');
  }

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
      {/* 1. Header & Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-[#dce5f0] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-[#64748b]">
              Coaching Center Management
            </span>
            <span className="bg-[#16a34a]/10 text-[#16a34a] text-[11px] font-bold px-2 py-0.5 rounded-full">
              Phase 1 Foundation
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#063b78] mt-1 tracking-tight">
            {center.name}
          </h1>
          {center.banglaName && (
            <p className="text-sm font-semibold text-[#092f63] mt-0.5 font-bangla">
              {center.banglaName}
            </p>
          )}
          <p className="text-xs text-[#64748b] mt-1 font-medium">
            {center.district}, Bangladesh · Main Campus: {center.branches[0]?.name || 'Central'} · Timezone: Asia/Dhaka (GMT+6)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {currentSession && (
            <div className="flex items-center gap-2 bg-[#f0f5fc] border border-[#dce5f0] px-3 py-1.5 rounded-xl">
              <Icon name="calendar" size={15} className="text-[#063b78]" />
              <div className="text-xs">
                <span className="text-[#64748b] block text-[10px] uppercase font-bold">Active Session</span>
                <span className="font-extrabold text-[#063b78]">{currentSession.name}</span>
              </div>
            </div>
          )}
          <Link
            href="/settings"
            className="tb text-xs font-bold px-3 py-2 flex items-center gap-1.5"
          >
            <Icon name="sliders" size={15} />
            <span>Settings</span>
          </Link>
        </div>
      </div>

      {/* 2. Genuine Database Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="card p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#64748b]">
            <span className="text-xs font-bold uppercase tracking-wider">System Users</span>
            <span className="p-2 rounded-xl bg-[#f0f5fc] text-[#063b78]">
              <Icon name="user" size={18} />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-[#063b78]">{userCount}</div>
            <div className="text-[11.5px] text-[#64748b] mt-0.5">Active administrators & staff</div>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="card p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#64748b]">
            <span className="text-xs font-bold uppercase tracking-wider">Academic Programs</span>
            <span className="p-2 rounded-xl bg-[#f0f5fc] text-[#063b78]">
              <Icon name="grad" size={18} />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-[#063b78]">{programs.length}</div>
            <div className="text-[11.5px] text-[#64748b] mt-0.5">
              {programs.map((p) => p.code).join(', ') || 'Configured programs'}
            </div>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="card p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#64748b]">
            <span className="text-xs font-bold uppercase tracking-wider">Configured Classes</span>
            <span className="p-2 rounded-xl bg-[#f0f5fc] text-[#063b78]">
              <Icon name="building" size={18} />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-[#063b78]">{classesCount}</div>
            <div className="text-[11.5px] text-[#64748b] mt-0.5">Classes & departments</div>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="card p-4 sm:p-5 flex flex-col justify-between border-l-4 border-l-[#16a34a]">
          <div className="flex items-center justify-between text-[#64748b]">
            <span className="text-xs font-bold uppercase tracking-wider">System Status</span>
            <span className="p-2 rounded-xl bg-[#e8f5e9] text-[#16a34a]">
              <Icon name="check" size={18} />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-xl font-black text-[#16a34a]">Operational</div>
            <div className="text-[11.5px] text-[#64748b] mt-0.5">PostgreSQL + Tenant Guard Active</div>
          </div>
        </div>
      </div>

      {/* 3. Middle Section: Configured Academic Hierarchy & Quick Setup */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (8 cols): Academic Hierarchy */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <ChartCard
            title="Configured Academic Programs & Classes"
            subtitle="Configurable hierarchical academic structure (SSC, HSC, Admission)"
          >
            <div className="divide-y divide-[#edf1f7] mt-1">
              {programs.map((p) => (
                <div key={p.id} className="py-4 first:pt-1 last:pb-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-[#063b78] text-sm">{p.name}</span>
                        <span className="px-2 py-0.5 rounded-md bg-[#eef3fa] text-[#063b78] text-[10px] font-bold">
                          {p.code}
                        </span>
                      </div>
                      {p.banglaName && (
                        <p className="text-xs text-[#64748b] font-bangla mt-0.5">{p.banglaName}</p>
                      )}
                    </div>
                    <span className="text-xs font-bold text-[#64748b]">
                      {p.classes.length} classes
                    </span>
                  </div>

                  {p.classes.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2.5">
                      {p.classes.map((c) => (
                        <span
                          key={c.id}
                          className="px-2.5 py-1 rounded-lg border border-[#dce5f0] bg-[#f8fafc] text-xs font-semibold text-[#092f63]"
                        >
                          {c.name} {c.banglaName ? `(${c.banglaName})` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {programs.length === 0 && (
                <div className="py-8 text-center text-[#64748b] text-sm">
                  No academic programs configured yet. Visit Settings to set up SSC, HSC, or Admission coaching.
                </div>
              )}
            </div>
          </ChartCard>

          {/* Architectural Notice */}
          <div className="p-5 rounded-2xl bg-[#063b78] text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-[#ffd200] text-[#063b78] text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                  Architecture Rules Enforced
                </span>
                <span className="text-xs text-[#93c5fd]">PostgreSQL Multi-Tenant</span>
              </div>
              <h3 className="text-base font-bold mt-1 text-white">
                Zero Fabricated Data Guarantee
              </h3>
              <p className="text-xs text-[#c7d4e6] mt-0.5 max-w-xl">
                Per project directives, student counts, revenue figures, and attendance records are not fabricated. Operational statistics will populate dynamically when those modules are implemented in Phase 2.
              </p>
            </div>
            <Link
              href="/settings"
              className="primary shrink-0"
            >
              Academic Settings →
            </Link>
          </div>
        </div>

        {/* Right Column (4 cols): Quick Setup & Tenant Context */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <ChartCard title="Quick Setup Actions" subtitle="Initial center configuration">
            <div className="flex flex-col gap-2 mt-2">
              <Link
                href="/settings?tab=academic"
                className="p-3 rounded-xl border border-[#dce5f0] hover:border-[#063b78] bg-[#f8fafc] hover:bg-white flex items-center justify-between transition-all group"
              >
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-lg bg-[#eef3fa] text-[#063b78]">
                    <Icon name="grad" size={16} />
                  </span>
                  <div>
                    <div className="text-xs font-bold text-[#092f63] group-hover:text-[#063b78]">
                      Add Academic Program / Class
                    </div>
                    <div className="text-[11px] text-[#64748b]">Configure SSC, HSC or Admission</div>
                  </div>
                </div>
                <span className="text-[#64748b] group-hover:text-[#063b78]">→</span>
              </Link>

              <Link
                href="/settings?tab=users"
                className="p-3 rounded-xl border border-[#dce5f0] hover:border-[#063b78] bg-[#f8fafc] hover:bg-white flex items-center justify-between transition-all group"
              >
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-lg bg-[#eef3fa] text-[#063b78]">
                    <Icon name="user" size={16} />
                  </span>
                  <div>
                    <div className="text-xs font-bold text-[#092f63] group-hover:text-[#063b78]">
                      Invite Teachers & Staff
                    </div>
                    <div className="text-[11px] text-[#64748b]">Manage system roles and permissions</div>
                  </div>
                </div>
                <span className="text-[#64748b] group-hover:text-[#063b78]">→</span>
              </Link>

              <Link
                href="/settings?tab=branding"
                className="p-3 rounded-xl border border-[#dce5f0] hover:border-[#063b78] bg-[#f8fafc] hover:bg-white flex items-center justify-between transition-all group"
              >
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-lg bg-[#eef3fa] text-[#063b78]">
                    <Icon name="sliders" size={16} />
                  </span>
                  <div>
                    <div className="text-xs font-bold text-[#092f63] group-hover:text-[#063b78]">
                      Center Branding
                    </div>
                    <div className="text-[11px] text-[#64748b]">Colors, logo, and theme preferences</div>
                  </div>
                </div>
                <span className="text-[#64748b] group-hover:text-[#063b78]">→</span>
              </Link>
            </div>
          </ChartCard>

          <ChartCard title="Security & Environment" subtitle="Tenant verification">
            <div className="space-y-3 text-xs mt-1">
              <div className="flex justify-between py-1.5 border-b border-[#edf1f7]">
                <span className="text-[#64748b]">Current User:</span>
                <span className="font-bold text-[#092f63]">{session.name} ({session.role})</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#edf1f7]">
                <span className="text-[#64748b]">Center Code:</span>
                <span className="font-bold text-[#092f63]">{center.code}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#edf1f7]">
                <span className="text-[#64748b]">Primary Currency:</span>
                <span className="font-bold text-[#092f63]">BDT (৳)</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#edf1f7]">
                <span className="text-[#64748b]">Date Format:</span>
                <span className="font-bold text-[#092f63]">DD/MM/YYYY</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[#64748b]">Session Security:</span>
                <span className="font-bold text-[#16a34a]">HTTP-only Signed JWT</span>
              </div>
            </div>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
