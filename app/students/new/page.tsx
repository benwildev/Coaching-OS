'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY, localizeApiError } from '@/lib/i18n';
import {
  type AdmissionInput,
  GUARDIAN_RELATIONS,
  COMMUNICATION_CHANNELS,
  BLOOD_GROUPS,
  isValidBdPhone,
} from '@/lib/validations/student';
import EnglishInput from '@/components/EnglishInput';
import FileUploadButton from '@/components/FileUploadButton';
import BanglaInput from '@/components/BanglaInput';
import { hasBangla, hasEnglish } from '@/lib/format';
import { buildPricingLines, fromPaisa, toPaisa, computePricingTotals, type CoursePricingConfig } from '@/lib/course-pricing';

interface ScheduleInfo {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  room?: { id: string; name: string; code: string } | null;
}

interface BatchTeacherInfo {
  teacher: {
    id: string;
    name: string;
    banglaName?: string | null;
  };
}

interface BatchItem {
  id: string;
  name: string;
  banglaName?: string | null;
  code: string;
  branchId: string;
  academicSessionId: string;
  academicProgramId: string;
  academicClassId: string;
  academicGroupId?: string | null;
  courseId?: string | null;
  capacity: number;
  enrolledCount?: number;
  availableSeats?: number;
  classSchedules?: ScheduleInfo[];
  batchTeacherAssignments?: BatchTeacherInfo[];
}

interface FeeStructureItem {
  id: string;
  name: string;
  banglaName?: string | null;
  amount: number;
  feeType: string;
  academicSessionId?: string | null;
  academicProgramId?: string | null;
  academicClassId?: string | null;
  courseId?: string | null;
}

interface HierarchyData {
  sessions: Array<{ id: string; name: string; banglaName?: string | null; isCurrent: boolean }>;
  branches: Array<{ id: string; name: string; banglaName?: string | null; isMain: boolean }>;
  programs: Array<{
    id: string;
    name: string;
    banglaName?: string | null;
    classes: Array<{
      id: string;
      name: string;
      banglaName?: string | null;
      groups: Array<{ id: string; name: string; banglaName?: string | null }>;
    }>;
  }>;
  courses: Array<{
    id: string;
    name: string;
    banglaName?: string | null;
    academicProgramId: string;
    academicClassId: string;
    academicGroupId?: string | null;
    fee: number;
    billingType?: string;
    feeItems?: Array<{ id: string; name: string; banglaName?: string | null; amount: number; isRequired: boolean; isActive: boolean }>;
    installments?: Array<{ name: string; banglaName?: string | null; amount: number; dueAfterDays: number }>;
  }>;
  batches: BatchItem[];
  feeStructures: FeeStructureItem[];
  boards: Array<{ id: string; name: string; banglaName?: string | null; code: string }>;
}

interface GuardianLookupResult {
  id: string;
  name: string;
  banglaName?: string | null;
  phone: string;
  altPhone?: string | null;
  email?: string | null;
  occupation?: string | null;
  relationship?: string;
  students: Array<{
    id: string;
    studentId: string;
    name: string;
    banglaName?: string | null;
    enrollmentStatus: string;
  }>;
}

interface AdmissionSuccessResult {
  student: {
    id: string;
    studentId: string;
    name: string;
    banglaName?: string | null;
  };
  enrollment?: {
    id: string;
    rollNumber?: string | null;
  } | null;
  invoice?: {
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    dueAmount: number;
    status: string;
  } | null;
  payment?: {
    id: string;
    amount: number;
    paymentMethod: string;
    receiptNumber?: string | null;
  } | null;
  receiptNumber?: string | null;
  discountApproved: boolean;
  message?: string;
  portalAccount?: {
    id: string;
    loginIdentifier: string;
    setupLink?: string | null;
    expiresAt?: string | null;
  } | null;
  portalProvisioning?: {
    status: 'SUCCESS' | 'QUOTA_EXCEEDED' | 'ALREADY_EXISTS';
  } | null;
}

const formatTaka = (amount: number) => '৳' + Math.round(amount).toLocaleString('en-IN');

/** A course is "priced" when it has a Course Fee or at least one required additional fee. */
const courseIsPriced = (c: Pick<CoursePricingConfig, 'fee' | 'additionalFees'>) =>
  c.fee > 0 || c.additionalFees.some((f) => f.isActive && f.isRequired);

export default function NewStudentPage() {
  const { lang, showToast, currentUser, currentCenter, can } = useApp();
  const dict = DICTIONARY[lang];

  const [step, setStep] = useState<number>(1);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedSetupLink, setCopiedSetupLink] = useState<boolean>(false);

  // Hierarchy Data
  const [options, setOptions] = useState<HierarchyData>({
    sessions: [],
    branches: [],
    programs: [],
    courses: [],
    batches: [],
    feeStructures: [],
    boards: [],
  });
  const [optionsLoading, setOptionsLoading] = useState(true);

  // Guardian Lookup State
  const [guardianSearchPhone, setGuardianSearchPhone] = useState('');
  const [guardianSearching, setGuardianSearching] = useState(false);
  const [foundGuardian, setFoundGuardian] = useState<GuardianLookupResult | null>(null);
  const [guardianSearchError, setGuardianSearchError] = useState<string | null>(null);

  // Initial Payment Toggle
  const [recordInitialPayment, setRecordInitialPayment] = useState(false);

  // Admission Completed State
  const [admissionResult, setAdmissionResult] = useState<AdmissionSuccessResult | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Form State
  const [form, setForm] = useState<AdmissionInput>(() => ({
    // Step 1: Student
    name: '',
    banglaName: '',
    gender: 'MALE',
    dob: '',
    bloodGroup: '',
    religion: 'Islam',
    nationality: 'Bangladeshi',
    phone: '',
    email: '',
    photoUrl: '',
    address: '',
    permanentAddress: '',
    schoolName: '',
    educationBoardId: '',
    nidBirthReg: '',
    sscRoll: '',
    sscReg: '',

    // Step 2: Guardian
    guardianId: undefined,
    guardianName: '',
    guardianBanglaName: '',
    guardianRelationship: 'FATHER',
    guardianPhone: '',
    guardianAltPhone: '',
    guardianWhatsapp: '',
    guardianEmail: '',
    guardianOccupation: '',
    guardianAddress: '',
    preferredChannel: 'SMS',
    hasSecondaryGuardian: false,
    secondaryName: '',
    secondaryRelationship: 'MOTHER',
    secondaryPhone: '',

    // Step 3: Academic
    academicSessionId: '',
    branchId: '',
    academicProgramId: '',
    academicClassId: '',
    academicGroupId: '',
    rollNumber: '',
    admissionDate: new Date().toISOString().split('T')[0],

    // Step 4: Course
    courseId: '',

    // Step 5: Batch
    batchId: '',
    remarks: '',

    // Step 6: Fee Assignment
    feeStructureId: '',
    feeAmount: undefined,
    feeDueDate: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],

    // Step 7: Discount / Waiver
    discountAmount: 0,
    waiverAmount: 0,
    discountReason: '',

    // Step 8: Initial Payment
    initialPayment: undefined,
  }));

  // Load academic hierarchy
  useEffect(() => {
    async function loadOptions() {
      try {
        const res = await fetch('/api/academic/options');
        if (res.ok) {
          const data: HierarchyData = await res.json();
          setOptions(data);

          const currentSession = data.sessions.find((s) => s.isCurrent) || data.sessions[0];
          const mainBranch = data.branches.find((b) => b.isMain) || data.branches[0];
          const defaultProgram = data.programs[0];
          const defaultClass = defaultProgram?.classes[0];
          const defaultGroup = defaultClass?.groups[0];

          setForm((prev) => ({
            ...prev,
            academicSessionId: currentSession?.id || '',
            branchId: mainBranch?.id || '',
            academicProgramId: defaultProgram?.id || '',
            academicClassId: defaultClass?.id || '',
            academicGroupId: defaultGroup?.id || '',
          }));
        }
      } catch (err) {
        console.error('Failed to load academic options', err);
      } finally {
        setOptionsLoading(false);
      }
    }
    loadOptions();
  }, []);

  // Filter dependent classes based on program
  const selectedProgram = options.programs.find((p) => p.id === form.academicProgramId);
  const availableClasses = selectedProgram ? selectedProgram.classes : [];

  // Filter dependent groups based on class
  const selectedClass = availableClasses.find((c) => c.id === form.academicClassId);
  const availableGroups = selectedClass ? selectedClass.groups : [];

  // Filter dependent courses
  const availableCourses = options.courses.filter((c) => {
    if (c.academicProgramId !== form.academicProgramId) return false;
    if (c.academicClassId !== form.academicClassId) return false;
    if (form.academicGroupId && c.academicGroupId && c.academicGroupId !== form.academicGroupId) {
      return false;
    }
    return true;
  });

  // Filter dependent batches (matching branch, session, program, class, group, and optionally course)
  const availableBatches = options.batches.filter((b) => {
    if (b.branchId !== form.branchId) return false;
    if (b.academicSessionId !== form.academicSessionId) return false;
    if (b.academicProgramId !== form.academicProgramId) return false;
    if (b.academicClassId !== form.academicClassId) return false;
    if (form.academicGroupId && b.academicGroupId && b.academicGroupId !== form.academicGroupId) {
      return false;
    }
    if (form.courseId && b.courseId && b.courseId !== form.courseId) {
      return false;
    }
    return true;
  });

  // Filter fee structures
  const availableFeeStructures = options.feeStructures.filter((fs) => {
    if (fs.academicSessionId && fs.academicSessionId !== form.academicSessionId) return false;
    if (fs.academicProgramId && fs.academicProgramId !== form.academicProgramId) return false;
    if (fs.academicClassId && fs.academicClassId !== form.academicClassId) return false;
    if (form.courseId && fs.courseId && fs.courseId !== form.courseId) return false;
    return true;
  });

  // Course pricing (Phase 11.2): when the selected course has a Fee & Payment
  // Plan, its lines ARE the student's fees — shown here for preview only; the
  // server re-reads the plan and computes the real amounts at admission.
  const selectedCourse = options.courses.find((c) => c.id === form.courseId);
  const courseConfig: CoursePricingConfig | null = selectedCourse
    ? {
        fee: Number(selectedCourse.fee) || 0,
        billingType: selectedCourse.billingType === 'INSTALLMENT' ? 'INSTALLMENT' : 'ONE_TIME',
        additionalFees: selectedCourse.feeItems ?? [],
        installments: selectedCourse.installments ?? [],
      }
    : null;
  const usePricing = courseConfig ? courseIsPriced(courseConfig) : false;
  const courseLines = courseConfig && usePricing
    ? buildPricingLines(courseConfig, form.optionalFeeIds ?? [], dict.coursePricing.courseFee)
    : [];
  const optionalFees = courseConfig ? courseConfig.additionalFees.filter((f) => f.isActive && !f.isRequired) : [];

  // Live Financial Calculation
  const originalFee = useMemo(() => {
    if (usePricing) {
      return fromPaisa(courseLines.reduce((s, l) => s + toPaisa(l.amount), 0));
    }
    if (form.feeAmount !== undefined && form.feeAmount !== null && form.feeAmount > 0) {
      return Number(form.feeAmount);
    }
    if (form.feeStructureId) {
      const fs = options.feeStructures.find((f) => f.id === form.feeStructureId);
      if (fs) return fs.amount;
    }
    return 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usePricing, form.optionalFeeIds, form.courseId, form.feeAmount, form.feeStructureId, options]);

  const discount = Number(form.discountAmount) || 0;
  const waiver = Number(form.waiverAmount) || 0;
  const totalAdjustments = discount + waiver;

  const isOwner = can('fees.discount.approve');
  const effectivePayable = Math.max(0, originalFee - (isOwner ? totalAdjustments : 0));
  const requestedPayable = Math.max(0, originalFee - totalAdjustments);

  // Initial Payment calculations
  const initialPaymentAmount = recordInitialPayment ? Number(form.initialPayment?.amount) || 0 : 0;
  const remainingDue = Math.max(0, (isOwner ? effectivePayable : originalFee) - initialPaymentAmount);

  // Search existing guardian by phone
  const handleGuardianSearch = async () => {
    if (!guardianSearchPhone.trim()) return;
    setGuardianSearching(true);
    setGuardianSearchError(null);
    try {
      const res = await fetch(`/api/guardians/lookup?phone=${encodeURIComponent(guardianSearchPhone.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Guardian not found');
      }
      setFoundGuardian(data.guardian);
    } catch (err: any) {
      setFoundGuardian(null);
      setGuardianSearchError(err?.message || 'No existing guardian found with this mobile number');
    } finally {
      setGuardianSearching(false);
    }
  };

  const handleUseExistingGuardian = (g: GuardianLookupResult) => {
    setForm((prev) => ({
      ...prev,
      guardianId: g.id,
      guardianName: g.name,
      guardianBanglaName: g.banglaName || '',
      guardianPhone: g.phone,
      guardianAltPhone: g.altPhone || '',
      guardianEmail: g.email || '',
      guardianOccupation: g.occupation || '',
      guardianRelationship: (g.relationship as any) || 'FATHER',
    }));
    showToast(lang === 'bn' ? 'বিদ্যমান অভিভাবক নির্বাচন করা হয়েছে।' : 'Existing guardian selected.');
  };

  const handleClearGuardianSelection = () => {
    setForm((prev) => ({
      ...prev,
      guardianId: undefined,
      guardianName: '',
      guardianBanglaName: '',
      guardianPhone: '',
      guardianAltPhone: '',
      guardianEmail: '',
      guardianOccupation: '',
    }));
    setFoundGuardian(null);
  };

  // Step Validation before continuing
  const validateStep = (currentStep: number): boolean => {
    setError(null);

    // Step 1: Student Information
    if (currentStep === 1) {
      if (!form.name.trim()) {
        setError(lang === 'bn' ? 'শিক্ষার্থীর ইংরেজি নাম আবশ্যক।' : 'Student English name is required.');
        return false;
      }
      if (hasBangla(form.name)) {
        setError(lang === 'bn' ? 'শিক্ষার্থীর ইংরেজি নামে বাংলা বর্ণ গ্রহণযোগ্য নয়।' : 'Student English name cannot contain Bangla characters.');
        return false;
      }
      if (form.banglaName && hasEnglish(form.banglaName)) {
        setError(lang === 'bn' ? 'শিক্ষার্থীর বাংলা নামে ইংরেজি বর্ণ গ্রহণযোগ্য নয়।' : 'Student Bangla name cannot contain English letters.');
        return false;
      }
      if (form.phone && !isValidBdPhone(form.phone)) {
        setError(
          lang === 'bn'
            ? 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন (১১ ডিজিট, যেমন: 017XXXXXXXX)।'
            : 'Enter a valid Bangladeshi mobile number (11 digits, e.g. 017XXXXXXXX).'
        );
        return false;
      }
    }

    // Step 2: Guardian Information
    if (currentStep === 2) {
      if (!form.guardianId) {
        if (!form.guardianName?.trim()) {
          setError(lang === 'bn' ? 'অভিভাবকের নাম আবশ্যক।' : 'Guardian name is required.');
          return false;
        }
        if (hasBangla(form.guardianName)) {
          setError(lang === 'bn' ? 'অভিভাবকের ইংরেজি নামে বাংলা বর্ণ গ্রহণযোগ্য নয়।' : 'Guardian English name cannot contain Bangla characters.');
          return false;
        }
        if (!form.guardianPhone?.trim() || !isValidBdPhone(form.guardianPhone)) {
          setError(
            lang === 'bn'
              ? 'অভিভাবকের সঠিক বাংলাদেশি মোবাইল নম্বর আবশ্যক।'
              : 'Valid Bangladeshi mobile number is required for guardian.'
          );
          return false;
        }
        if (form.guardianAltPhone && !isValidBdPhone(form.guardianAltPhone)) {
          setError(lang === 'bn' ? 'বিকল্প মোবাইল নম্বর সঠিক নয়।' : 'Invalid alternative mobile number.');
          return false;
        }
        if (form.hasSecondaryGuardian && form.secondaryPhone && !isValidBdPhone(form.secondaryPhone)) {
          setError(lang === 'bn' ? 'দ্বিতীয় অভিভাবকের মোবাইল নম্বর সঠিক নয়।' : 'Invalid secondary guardian mobile number.');
          return false;
        }
      }
    }

    // Step 3: Academic Enrollment
    if (currentStep === 3) {
      if (!form.academicSessionId) {
        setError(lang === 'bn' ? 'শিক্ষাবর্ষ নির্বাচন করুন।' : 'Please select an academic session.');
        return false;
      }
      if (!form.branchId) {
        setError(lang === 'bn' ? 'শাখা / ক্যাম্পাস নির্বাচন করুন।' : 'Please select a branch.');
        return false;
      }
      if (!form.academicProgramId) {
        setError(lang === 'bn' ? 'একাডেমিক প্রোগ্রাম নির্বাচন করুন।' : 'Please select an academic program.');
        return false;
      }
      if (!form.academicClassId) {
        setError(lang === 'bn' ? 'শ্রেণি নির্বাচন করুন।' : 'Please select a class.');
        return false;
      }
    }

    // Step 5: Batch Selection
    if (currentStep === 5) {
      if (form.batchId) {
        const batch = options.batches.find((b) => b.id === form.batchId);
        if (batch && (batch.enrolledCount ?? 0) >= batch.capacity) {
          setError(lang === 'bn' ? 'নির্বাচিত ব্যাচে কোনো আসন ফাঁকা নেই।' : 'Selected batch has reached full capacity.');
          return false;
        }
      }
    }

    // Step 6: Fee Assignment
    if (currentStep === 6) {
      if (originalFee <= 0) {
        setError(lang === 'bn' ? 'দয়া করে ফি কাঠামো নির্বাচন করুন অথবা ফি পরিমাণ উল্লেখ করুন।' : 'Please select a fee structure or specify a valid fee amount.');
        return false;
      }
      if (!form.feeDueDate) {
        setError(lang === 'bn' ? 'ফি পরিশোধের শেষ তারিখ আবশ্যক।' : 'Fee due date is required.');
        return false;
      }
    }

    // Step 7: Discount & Fee Adjustments
    if (currentStep === 7) {
      if (totalAdjustments > originalFee) {
        setError(lang === 'bn' ? 'ছাড় ও মওকুফের যোগফল মূল ফির চেয়ে বেশি হতে পারে না।' : 'Total discounts cannot exceed the original fee amount.');
        return false;
      }
      if (totalAdjustments > 0 && !form.discountReason?.trim()) {
        setError(lang === 'bn' ? 'ছাড় বা মওকুফের কারণ উল্লেখ করা আবশ্যক।' : 'A reason is required when applying a discount or waiver.');
        return false;
      }
    }

    // Step 8: Initial Payment
    if (currentStep === 8) {
      if (recordInitialPayment) {
        const paid = Number(form.initialPayment?.amount) || 0;
        if (paid <= 0) {
          setError(lang === 'bn' ? 'পরিশোধিত টাকার পরিমাণ শূন্যের চেয়ে বেশি হতে হবে।' : 'Payment amount must be greater than zero.');
          return false;
        }
        if (paid > originalFee) {
          setError(lang === 'bn' ? 'পরিশোধিত অর্থ মূল ফি ছাড়িয়ে যেতে পারে না।' : 'Payment amount cannot exceed the fee obligation.');
          return false;
        }
        const method = form.initialPayment?.paymentMethod;
        if (['BKASH', 'NAGAD', 'ROCKET'].includes(method || '')) {
          if (!form.initialPayment?.transactionId?.trim()) {
            setError(lang === 'bn' ? 'মোবাইল ফিন্যান্সিয়াল সার্ভিসের (MFS) জন্য ট্রানজেকশন আইডি আবশ্যক।' : 'Transaction ID is required for mobile financial service payments.');
            return false;
          }
        }
      }
    }

    return true;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((prev) => Math.min(9, prev + 1));
    }
  };

  const handlePrev = () => {
    setError(null);
    setStep((prev) => Math.max(1, prev - 1));
  };

  // Complete Admission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(step)) return;

    setSubmitting(true);
    setError(null);

    try {
      const payload: AdmissionInput = {
        ...form,
        // Priced course: send only the intent (+ chosen optional fees); the server derives every amount itself.
        ...(usePricing
          ? { useCoursePricing: true, optionalFeeIds: form.optionalFeeIds ?? [], feeAmount: undefined, feeStructureId: '' }
          : { useCoursePricing: false, optionalFeeIds: [], feeAmount: originalFee }),
        discountAmount: discount,
        waiverAmount: waiver,
        initialPayment: recordInitialPayment && form.initialPayment?.amount
          ? {
              ...form.initialPayment,
              amount: Number(form.initialPayment.amount),
              paymentMethod: form.initialPayment.paymentMethod || 'CASH',
              idempotencyKey: form.initialPayment.idempotencyKey || `ADM-PAY-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            }
          : undefined,
        idempotencyKey: form.idempotencyKey || `ADM-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      };
      if (!form.idempotencyKey) {
        setForm((prev) => ({ ...prev, idempotencyKey: payload.idempotencyKey }));
      }

      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(localizeApiError(lang, data.error, data.message) || data.message || data.error || 'Failed to complete admission');
      }

      showToast(dict.admission.successToast);
      setAdmissionResult(data);
      setStep(9);
    } catch (err: any) {
      setError(err?.message || 'Failed to complete admission');
    } finally {
      setSubmitting(false);
    }
  };

  // Check if current user is teacher
  if (currentUser && !can('students.create')) {
    return (
      <div className="max-w-[700px] mx-auto p-8 rounded-2xl bg-white border border-rose-200 text-center shadow-xs">
        <Icon name="lock" size={36} className="mx-auto text-rose-500 mb-3" />
        <h2 className="text-xl font-bold text-slate-800">
          {lang === 'bn' ? 'অননুমোদিত প্রবেশাধিকার' : 'Unauthorized Access'}
        </h2>
        <p className="text-slate-600 text-[14px] mt-2">
          {lang === 'bn'
            ? 'শিক্ষক অ্যাকাউন্টের মাধ্যমে শিক্ষার্থী ভর্তি ও আর্থিক লেনদেন পরিচালনা করার অনুমতি নেই।'
            : 'Teachers are not authorized to perform student admission or financial operations.'}
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-block rounded-xl bg-[#063b78] px-5 py-2 text-white font-semibold text-sm hover:bg-[#052e5e]"
        >
          {lang === 'bn' ? 'ড্যাশবোর্ডে ফিরুন' : 'Back to Dashboard'}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1240px] mx-auto flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/students"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#063b78] hover:underline mb-1"
          >
            <Icon name="chevronleft" size={15} />
            <span>{dict.profile.back}</span>
          </Link>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">
            {dict.admission.title}
          </h1>
          <p className="text-[13.5px] text-[#64748b] font-medium mt-0.5">
            {dict.admission.subtitle}
          </p>
        </div>
      </div>

      {/* Stepper Progress Bar */}
      <div className="card p-3 md:p-4 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-x-auto">
        <div className="flex items-center justify-between min-w-[650px] gap-2 text-center">
          {[
            { num: 1, label: dict.admission.step1 },
            { num: 2, label: dict.admission.step2 },
            { num: 3, label: dict.admission.step3 },
            { num: 4, label: dict.admission.step4 },
            { num: 5, label: dict.admission.step5 },
            { num: 6, label: dict.admission.step6 },
            { num: 7, label: dict.admission.step7 },
            { num: 8, label: dict.admission.step8 },
            { num: 9, label: dict.admission.step9 },
          ].map((s) => {
            const isDone = s.num < step || (step === 9 && admissionResult !== null);
            const isCurrent = s.num === step;

            return (
              <div key={s.num} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                    isCurrent
                      ? 'bg-[#063b78] text-white ring-4 ring-blue-100 shadow-sm'
                      : isDone
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {isDone ? <Icon name="check" size={14} /> : s.num}
                </div>
                <span
                  className={`text-[11px] font-semibold truncate max-w-[85px] ${
                    isCurrent
                      ? 'text-[#063b78]'
                      : isDone
                      ? 'text-emerald-600'
                      : 'text-slate-400'
                  }`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[13.5px] font-medium flex items-center gap-2.5">
          <Icon name="alert" size={18} className="shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Grid: Form (Left) & Sticky Summary Sidebar (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Form Container (8 Cols on Desktop) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="card p-6 md:p-8 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
            {optionsLoading ? (
              <div className="py-16 text-center text-[#64748b]">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
                <p className="mt-3 text-[14px] font-medium">Loading admission system…</p>
              </div>
            ) : admissionResult ? (
              /* ADMISSION COMPLETED SUCCESS SCREEN */
              <div className="flex flex-col items-center text-center py-6 gap-6">
                <div className="h-16 w-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center ring-8 ring-emerald-50">
                  <Icon name="check" size={32} />
                </div>

                <div>
                  <h2 className="text-2xl font-black text-[#063b78]">
                    {dict.admission.completionTitle}
                  </h2>
                  <p className="text-[14px] text-slate-600 mt-1">
                    {lang === 'bn'
                      ? 'শিক্ষার্থীর রোল নম্বর, একাডেমিক ব্যাচ ও ফি সংক্রান্ত বিবরণী সফলভাবে রেকর্ড করা হয়েছে।'
                      : 'Student registration, batch assignment, and financial records have been finalized.'}
                  </p>
                </div>

                {/* Admission Info Badges */}
                <div className="w-full max-w-lg p-5 rounded-2xl bg-slate-50 border border-slate-200 text-left grid grid-cols-2 gap-4 text-[13.5px]">
                  <div>
                    <span className="text-slate-500 block text-xs">{dict.admission.summaryStudent}</span>
                    <strong className="text-[#063b78] text-[15px]">{admissionResult.student.name}</strong>
                    <div className="font-mono text-xs text-slate-600 mt-0.5">ID: {admissionResult.student.studentId}</div>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-xs">{dict.admission.branch}</span>
                    <strong className="text-slate-800">
                      {options.branches.find((b) => b.id === form.branchId)?.name || 'Main Branch'}
                    </strong>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-xs">{dict.admission.batch}</span>
                    <strong className="text-slate-800">
                      {options.batches.find((b) => b.id === form.batchId)?.name || (lang === 'bn' ? 'অনির্ধারিত' : 'Unassigned')}
                    </strong>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-xs">{dict.admission.summaryFee}</span>
                    <strong className="text-slate-800">{formatTaka(originalFee)}</strong>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-xs">{dict.admission.discount}</span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                        admissionResult.discountApproved
                          ? 'bg-emerald-100 text-emerald-800'
                          : totalAdjustments > 0
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {totalAdjustments > 0
                        ? `${formatTaka(totalAdjustments)} (${
                            admissionResult.discountApproved ? dict.admission.statusApproved : dict.admission.statusPendingApproval
                          })`
                        : '৳0'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-xs">{dict.admission.summaryPaid}</span>
                    <strong className="text-emerald-700">
                      {admissionResult.payment ? formatTaka(admissionResult.payment.amount) : '৳0'}
                    </strong>
                    {admissionResult.receiptNumber && (
                      <div className="text-xs text-slate-500 mt-0.5">
                        Receipt: <span className="font-mono font-bold text-slate-700">{admissionResult.receiptNumber}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Student Portal Account Provisioning Card */}
                {admissionResult.portalAccount ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-left shadow-xs mb-4">
                    <div className="flex items-center justify-between pb-3 border-b border-emerald-200/60">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
                          <Icon name="key" size={18} />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-800">
                            {lang === 'bn' ? 'শিক্ষার্থী পোর্টাল একাউন্ট' : 'Student Portal Account'}
                          </h4>
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            {lang === 'bn' ? 'স্ট্যাটাস: প্রস্তুত' : 'Status: Ready'}
                          </span>
                        </div>
                      </div>
                      <span className="rounded-full bg-emerald-100/90 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-800">
                        {lang === 'bn' ? 'মেয়াদ: ৪৮ ঘণ্টা' : 'Expires: 48 hours'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                      <div className="bg-white/70 rounded-xl p-2.5 border border-emerald-100">
                        <span className="block text-xs font-medium text-slate-500">
                          {lang === 'bn' ? 'লগইন আইডি' : 'Login ID'}
                        </span>
                        <strong className="font-mono text-sm font-bold text-slate-900">
                          {admissionResult.portalAccount.loginIdentifier}
                        </strong>
                      </div>
                      <div className="bg-white/70 rounded-xl p-2.5 border border-emerald-100">
                        <span className="block text-xs font-medium text-slate-500">
                          {lang === 'bn' ? 'পাসওয়ার্ড সেটআপ' : 'Setup Password'}
                        </span>
                        <span className="text-xs text-slate-600 font-medium">
                          {lang === 'bn' ? 'শিক্ষার্থী নিজের পাসওয়ার্ড নিজে সেট করবে' : 'Student sets their own password'}
                        </span>
                      </div>
                    </div>

                    {admissionResult.portalAccount.setupLink && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 pt-2.5 border-t border-emerald-200/50">
                        <button
                          type="button"
                          onClick={() => {
                            const fullUrl = `${window.location.origin}${admissionResult.portalAccount!.setupLink}`;
                            navigator.clipboard.writeText(fullUrl);
                            setCopiedSetupLink(true);
                            setTimeout(() => setCopiedSetupLink(false), 2500);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-xs"
                        >
                          <Icon name="copy" size={14} />
                          <span>{copiedSetupLink ? (lang === 'bn' ? 'লিঙ্ক কপি হয়েছে!' : 'Link Copied!') : (lang === 'bn' ? 'সেটআপ লিঙ্ক কপি করুন' : 'Copy Setup Link')}</span>
                        </button>
                        <a
                          href={admissionResult.portalAccount.setupLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 transition-colors shadow-2xs"
                        >
                          <Icon name="external-link" size={14} />
                          <span>{lang === 'bn' ? 'সেটআপ পেজ খুলুন' : 'Open Setup Page'}</span>
                        </a>
                      </div>
                    )}
                  </div>
                ) : admissionResult.portalProvisioning?.status === 'QUOTA_EXCEEDED' ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-left shadow-xs mb-4">
                    <div className="flex items-center gap-2.5 pb-2 border-b border-amber-200/60">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
                        <Icon name="alert-triangle" size={18} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">
                          {lang === 'bn' ? 'শিক্ষার্থী পোর্টাল একাউন্ট' : 'Student Portal Account'}
                        </h4>
                        <span className="text-[11px] font-semibold text-amber-800">
                          {lang === 'bn' ? 'স্ট্যাটাস: তৈরি হয়নি (কোটা শেষ)' : 'Status: Not Provisioned (Quota Exceeded)'}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-700 mt-2.5 leading-relaxed">
                      {lang === 'bn'
                        ? 'ভর্তি সফলভাবে সম্পন্ন হয়েছে, তবে আপনার সাবস্ক্রিপশন প্ল্যানের পোর্টাল একাউন্ট লিমিট শেষ হওয়ায় এই শিক্ষার্থীর জন্য স্বয়ংক্রিয় পোর্টাল তৈরি করা সম্ভব হয়নি।'
                        : 'Student admitted successfully, but portal access could not be created because the portal account limit has been reached.'}
                    </p>
                  </div>
                ) : null}

                {/* Quick Actions */}
                <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
                  {admissionResult.receiptNumber && (
                    <button
                      type="button"
                      onClick={() => setShowPrintModal(true)}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#063b78] px-5 py-2.5 text-[14px] font-bold text-white shadow-xs hover:bg-[#052e5e] transition-colors"
                    >
                      <Icon name="file" size={16} />
                      <span>{dict.admission.printReceipt}</span>
                    </button>
                  )}

                  <Link
                    href={`/students/${admissionResult.student.id}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-[14px] font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Icon name="user" size={16} />
                    <span>{dict.admission.viewStudent}</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      setAdmissionResult(null);
                      setStep(1);
                      setForm((prev) => ({
                        ...prev,
                        name: '',
                        banglaName: '',
                        phone: '',
                        email: '',
                        guardianId: undefined,
                        guardianName: '',
                        guardianPhone: '',
                        courseId: '',
                        batchId: '',
                        feeAmount: undefined,
                        discountAmount: 0,
                        waiverAmount: 0,
                        initialPayment: undefined,
                      }));
                      setRecordInitialPayment(false);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-dashed border-[#063b78] bg-blue-50/50 px-5 py-2.5 text-[14px] font-bold text-[#063b78] hover:bg-blue-100/50 transition-colors"
                  >
                    <Icon name="userplus" size={16} />
                    <span>{dict.admission.admitAnother}</span>
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                {/* STEP 1: Student Information */}
                {step === 1 && (
                  <div className="flex flex-col gap-5">
                    <div className="border-b border-[#edf2f7] pb-3">
                      <h2 className="text-lg font-bold text-[#063b78]">
                        {dict.admission.step1Title}
                      </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* English Full Name */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.fullName} <span className="text-rose-500">*</span>
                        </label>
                        <EnglishInput
                          required
                          value={form.name}
                          onChange={(val) => setForm({ ...form, name: val })}
                          placeholder="e.g. Tanvir Ahmed"
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78]"
                        />
                      </div>

                      {/* Bangla Name */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.banglaName}
                        </label>
                        <BanglaInput
                          value={form.banglaName || ''}
                          onChange={(val) => setForm({ ...form, banglaName: val })}
                          placeholder="যেমন: তানভীর আহমেদ"
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78]"
                        />
                      </div>

                      {/* Gender */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.gender}
                        </label>
                        <select
                          value={form.gender || 'MALE'}
                          onChange={(e) => setForm({ ...form, gender: e.target.value as any })}
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white font-medium"
                        >
                          <option value="MALE">{lang === 'bn' ? 'পুরুষ' : 'Male'}</option>
                          <option value="FEMALE">{lang === 'bn' ? 'নারী' : 'Female'}</option>
                          <option value="OTHER">{lang === 'bn' ? 'অন্যান্য' : 'Other'}</option>
                        </select>
                      </div>

                      {/* Date of Birth */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.dob}
                        </label>
                        <input
                          type="date"
                          value={form.dob || ''}
                          onChange={(e) => setForm({ ...form, dob: e.target.value })}
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white"
                        />
                      </div>

                      {/* Blood Group */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.bloodGroup}
                        </label>
                        <select
                          value={form.bloodGroup || ''}
                          onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white"
                        >
                          <option value="">{lang === 'bn' ? 'নির্বাচন করুন' : 'Select blood group'}</option>
                          {BLOOD_GROUPS.map((bg) => (
                            <option key={bg} value={bg}>{bg}</option>
                          ))}
                        </select>
                      </div>

                      {/* Photo */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {lang === 'bn' ? 'ছবি' : 'Photo'} <span className="font-normal text-[#64748b]">({lang === 'bn' ? 'ঐচ্ছিক' : 'optional'})</span>
                        </label>
                        <div className="flex items-center gap-3">
                          {form.photoUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={form.photoUrl} alt="Student photo preview" className="w-11 h-11 rounded-full object-cover border border-[#dce5f0]" />
                          )}
                          <FileUploadButton scope="photo" lang={lang} onUploaded={(url) => setForm({ ...form, photoUrl: url })} />
                        </div>
                      </div>

                      {/* Student Mobile */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.studentPhone}
                        </label>
                        <input
                          type="tel"
                          value={form.phone || ''}
                          onChange={(e) => setForm({ ...form, phone: e.target.value })}
                          placeholder="01XXXXXXXXX"
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] font-mono text-[#092f63] outline-none focus:border-[#063b78]"
                        />
                      </div>

                      {/* Student Email */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.studentEmail}
                        </label>
                        <input
                          type="email"
                          value={form.email || ''}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          placeholder="student@example.com"
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78]"
                        />
                      </div>

                      {/* Current School / College */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.schoolName}
                        </label>
                        <input
                          type="text"
                          value={form.schoolName || ''}
                          onChange={(e) => setForm({ ...form, schoolName: e.target.value })}
                          placeholder="e.g. Notre Dame College / Viqarunnisa"
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78]"
                        />
                      </div>

                      {/* NID / BRN */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.nidBirthReg}
                        </label>
                        <input
                          type="text"
                          value={form.nidBirthReg || ''}
                          onChange={(e) => setForm({ ...form, nidBirthReg: e.target.value })}
                          placeholder="NID or Birth Registration No."
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78]"
                        />
                      </div>

                      {/* Present Address */}
                      <div className="md:col-span-2">
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.presentAddress}
                        </label>
                        <textarea
                          rows={2}
                          value={form.address || ''}
                          onChange={(e) => setForm({ ...form, address: e.target.value })}
                          placeholder="House, Road, Area, Thana, District"
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: Guardian Information & Existing Guardian Lookup */}
                {step === 2 && (
                  <div className="flex flex-col gap-5">
                    <div className="border-b border-[#edf2f7] pb-3 flex items-center justify-between">
                      <h2 className="text-lg font-bold text-[#063b78]">
                        {dict.admission.step2Title}
                      </h2>
                    </div>

                    {/* Existing Guardian Lookup Box */}
                    <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100 flex flex-col gap-3">
                      <label className="text-[13px] font-bold text-[#063b78]">
                        {dict.admission.searchGuardian}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="tel"
                          value={guardianSearchPhone}
                          onChange={(e) => setGuardianSearchPhone(e.target.value)}
                          placeholder="01XXXXXXXXX"
                          className="flex-1 rounded-xl border border-[#dce5f0] bg-white px-3.5 py-2 text-[13.5px] font-mono text-[#092f63] outline-none focus:border-[#063b78]"
                        />
                        <button
                          type="button"
                          onClick={handleGuardianSearch}
                          disabled={guardianSearching || !guardianSearchPhone.trim()}
                          className="rounded-xl bg-[#063b78] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#052e5e] disabled:opacity-50 transition-colors flex items-center gap-1.5"
                        >
                          {guardianSearching ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                          ) : (
                            <Icon name="search" size={15} />
                          )}
                          <span>{dict.admission.searchGuardianBtn}</span>
                        </button>
                      </div>

                      {guardianSearchError && (
                        <p className="text-xs text-amber-700 font-medium">{guardianSearchError}</p>
                      )}

                      {/* Guardian Found Card */}
                      {foundGuardian && (
                        <div className="mt-2 p-3.5 rounded-xl bg-white border border-emerald-200 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{foundGuardian.name}</span>
                              <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded">
                                {dict.admission.guardianFound}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5">
                              Mobile: {foundGuardian.phone}
                              {foundGuardian.occupation && ` • ${foundGuardian.occupation}`}
                            </div>
                            {foundGuardian.students.length > 0 && (
                              <div className="text-[11.5px] text-slate-600 mt-1">
                                {dict.admission.childrenCount}:{' '}
                                <strong className="text-[#063b78]">
                                  {foundGuardian.students.map((s) => s.name).join(', ')}
                                </strong>
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleUseExistingGuardian(foundGuardian)}
                            className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                          >
                            {dict.admission.useThisGuardian}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Active Selection Indicator */}
                    {form.guardianId ? (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between">
                        <div className="text-xs">
                          <strong>{lang === 'bn' ? 'নির্বাচিত বিদ্যমান অভিভাবক:' : 'Selected Guardian:'}</strong>{' '}
                          {form.guardianName} ({form.guardianPhone})
                        </div>
                        <button
                          type="button"
                          onClick={handleClearGuardianSelection}
                          className="text-xs text-rose-600 font-bold hover:underline"
                        >
                          {dict.admission.addNewGuardian}
                        </button>
                      </div>
                    ) : null}

                    {/* Guardian Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Guardian Name */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.guardianName} <span className="text-rose-500">*</span>
                        </label>
                        <EnglishInput
                          required
                          disabled={!!form.guardianId}
                          value={form.guardianName || ''}
                          onChange={(val) => setForm({ ...form, guardianName: val })}
                          placeholder="e.g. Md. Rafiqul Islam"
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] disabled:bg-slate-50"
                        />
                      </div>

                      {/* Relationship */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.relation} <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={form.guardianRelationship}
                          onChange={(e) => setForm({ ...form, guardianRelationship: e.target.value as any })}
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white font-medium"
                        >
                          {GUARDIAN_RELATIONS.map((rel) => (
                            <option key={rel} value={rel}>
                              {dict.relations[rel]}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Guardian Phone */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.guardianPhone} <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="tel"
                          required
                          disabled={!!form.guardianId}
                          value={form.guardianPhone || ''}
                          onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })}
                          placeholder="01XXXXXXXXX"
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] font-mono text-[#092f63] outline-none focus:border-[#063b78] disabled:bg-slate-50"
                        />
                      </div>

                      {/* WhatsApp */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.guardianWhatsapp}
                        </label>
                        <input
                          type="tel"
                          value={form.guardianWhatsapp || ''}
                          onChange={(e) => setForm({ ...form, guardianWhatsapp: e.target.value })}
                          placeholder="01XXXXXXXXX"
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] font-mono text-[#092f63] outline-none focus:border-[#063b78]"
                        />
                      </div>

                      {/* Preferred Channel */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.preferredChannel}
                        </label>
                        <select
                          value={form.preferredChannel}
                          onChange={(e) => setForm({ ...form, preferredChannel: e.target.value as any })}
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white font-medium"
                        >
                          {COMMUNICATION_CHANNELS.map((ch) => (
                            <option key={ch} value={ch}>
                              {ch === 'SMS' ? 'SMS' : ch === 'WHATSAPP' ? 'WhatsApp' : 'Email'}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Occupation */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.occupation}
                        </label>
                        <input
                          type="text"
                          value={form.guardianOccupation || ''}
                          onChange={(e) => setForm({ ...form, guardianOccupation: e.target.value })}
                          placeholder="e.g. Businessman / Govt. Official"
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 3: Academic Enrollment */}
                {step === 3 && (
                  <div className="flex flex-col gap-5">
                    <div className="border-b border-[#edf2f7] pb-3">
                      <h2 className="text-lg font-bold text-[#063b78]">
                        {dict.admission.step3Title}
                      </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Session */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.session} <span className="text-rose-500">*</span>
                        </label>
                        <select
                          required
                          value={form.academicSessionId}
                          onChange={(e) => setForm({ ...form, academicSessionId: e.target.value, batchId: '', courseId: '', feeStructureId: '' })}
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white font-medium"
                        >
                          {options.sessions.map((s) => (
                            <option key={s.id} value={s.id}>
                              {lang === 'bn' && s.banglaName ? s.banglaName : s.name} {s.isCurrent ? (lang === 'bn' ? '(বর্তমান)' : '(Current)') : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Branch */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.branch} <span className="text-rose-500">*</span>
                        </label>
                        <select
                          required
                          value={form.branchId}
                          onChange={(e) => setForm({ ...form, branchId: e.target.value, batchId: '' })}
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white font-medium"
                        >
                          {options.branches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {lang === 'bn' && b.banglaName ? b.banglaName : b.name} {b.isMain ? (lang === 'bn' ? '(প্রধান শাখা)' : '(Main Branch)') : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Academic Program */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.program} <span className="text-rose-500">*</span>
                        </label>
                        <select
                          required
                          value={form.academicProgramId}
                          onChange={(e) => {
                            const newProgId = e.target.value;
                            const prog = options.programs.find((p) => p.id === newProgId);
                            const firstCls = prog?.classes[0];
                            const firstGrp = firstCls?.groups[0];
                            setForm({
                              ...form,
                              academicProgramId: newProgId,
                              academicClassId: firstCls?.id || '',
                              academicGroupId: firstGrp?.id || '',
                              courseId: '',
                              batchId: '',
                              feeStructureId: '',
                            });
                          }}
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white font-medium"
                        >
                          {options.programs.map((p) => (
                            <option key={p.id} value={p.id}>
                              {lang === 'bn' && p.banglaName ? p.banglaName : p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Academic Class */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.class} <span className="text-rose-500">*</span>
                        </label>
                        <select
                          required
                          value={form.academicClassId}
                          onChange={(e) => {
                            const newClsId = e.target.value;
                            const cls = availableClasses.find((c) => c.id === newClsId);
                            const firstGrp = cls?.groups[0];
                            setForm({
                              ...form,
                              academicClassId: newClsId,
                              academicGroupId: firstGrp?.id || '',
                              courseId: '',
                              batchId: '',
                              feeStructureId: '',
                            });
                          }}
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white font-medium"
                        >
                          {availableClasses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {lang === 'bn' && c.banglaName ? c.banglaName : c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Group */}
                      {availableGroups.length > 0 && (
                        <div>
                          <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                            {dict.admission.group}
                          </label>
                          <select
                            value={form.academicGroupId || ''}
                            onChange={(e) => setForm({ ...form, academicGroupId: e.target.value, courseId: '', batchId: '' })}
                            className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white font-medium"
                          >
                            <option value="">{lang === 'bn' ? 'সাধারণ / বিভাগ নেই' : 'General / None'}</option>
                            {availableGroups.map((g) => (
                              <option key={g.id} value={g.id}>
                                {lang === 'bn' && g.banglaName ? g.banglaName : g.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Board */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.board}
                        </label>
                        <select
                          value={form.educationBoardId || ''}
                          onChange={(e) => setForm({ ...form, educationBoardId: e.target.value })}
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white font-medium"
                        >
                          <option value="">{lang === 'bn' ? 'শিক্ষা বোর্ড নির্বাচন করুন' : 'Select Education Board'}</option>
                          {options.boards.map((b) => (
                            <option key={b.id} value={b.id}>
                              {lang === 'bn' && b.banglaName ? b.banglaName : b.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Roll Number */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.rollNumber}
                        </label>
                        <input
                          type="text"
                          value={form.rollNumber || ''}
                          onChange={(e) => setForm({ ...form, rollNumber: e.target.value })}
                          placeholder="e.g. 101"
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78]"
                        />
                      </div>

                      {/* Admission Date */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.admissionDate}
                        </label>
                        <input
                          type="date"
                          value={form.admissionDate || ''}
                          onChange={(e) => setForm({ ...form, admissionDate: e.target.value })}
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 4: Course Selection */}
                {step === 4 && (
                  <div className="flex flex-col gap-5">
                    <div className="border-b border-[#edf2f7] pb-3">
                      <h2 className="text-lg font-bold text-[#063b78]">
                        {dict.admission.step4Title}
                      </h2>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {/* General / No Course Option */}
                      <label
                        className={`card p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                          !form.courseId
                            ? 'border-[#063b78] bg-blue-50/60 ring-2 ring-[#063b78]'
                            : 'border-[#dce5f0] hover:bg-[#f8fafc]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="courseSelection"
                          value=""
                          checked={!form.courseId}
                          onChange={() => setForm({ ...form, courseId: '', batchId: '' })}
                          className="mt-1 h-4 w-4 accent-[#063b78] cursor-pointer"
                        />
                        <div className="flex-1">
                          <div className="font-bold text-[#092f63]">
                            {dict.admission.noCourse}
                          </div>
                          <div className="text-[12px] text-[#64748b] mt-1">
                            {lang === 'bn' ? 'সাধারণ ভর্তি অথবা নির্দিষ্ট বিষয়ভিত্তিক কোর্স ছাড়া।' : 'General admission without a specific modular course.'}
                          </div>
                        </div>
                      </label>

                      {/* Available Courses */}
                      {availableCourses.map((crs) => {
                        const isSelected = form.courseId === crs.id;
                        return (
                          <label
                            key={crs.id}
                            className={`card p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                              isSelected
                                ? 'border-[#063b78] bg-blue-50/60 ring-2 ring-[#063b78]'
                                : 'border-[#dce5f0] hover:bg-[#f8fafc]'
                            }`}
                          >
                            <input
                              type="radio"
                              name="courseSelection"
                              value={crs.id}
                              checked={isSelected}
                              onChange={() =>
                                setForm({
                                  ...form,
                                  courseId: crs.id,
                                  batchId: '',
                                  optionalFeeIds: [],
                                  // A priced course supplies its own fees server-side; an unpriced one keeps the manual fee entry.
                                  feeStructureId: courseIsPriced({ fee: crs.fee, additionalFees: crs.feeItems ?? [] }) ? '' : form.feeStructureId,
                                  feeAmount: courseIsPriced({ fee: crs.fee, additionalFees: crs.feeItems ?? [] }) ? undefined : form.feeAmount,
                                })
                              }
                              className="mt-1 h-4 w-4 accent-[#063b78] cursor-pointer"
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-[#092f63]">
                                  {lang === 'bn' && crs.banglaName ? crs.banglaName : crs.name}
                                </span>
                                {courseIsPriced({ fee: crs.fee, additionalFees: crs.feeItems ?? [] }) && (
                                  <span className="font-bold text-emerald-700 text-xs bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                    {formatTaka(computePricingTotals({ fee: crs.fee, additionalFees: crs.feeItems ?? [] }).requiredTotal)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    {availableCourses.length === 0 && (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                        {dict.admission.noCourseAvailable}
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 5: Batch Selection with Real Capacities & Schedule */}
                {step === 5 && (
                  <div className="flex flex-col gap-5">
                    <div className="border-b border-[#edf2f7] pb-3">
                      <h2 className="text-lg font-bold text-[#063b78]">
                        {dict.admission.step5Title}
                      </h2>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {/* Assign Later Option */}
                      <label
                        className={`card p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                          !form.batchId
                            ? 'border-[#063b78] bg-blue-50/60 ring-2 ring-[#063b78]'
                            : 'border-[#dce5f0] hover:bg-[#f8fafc]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="batchId"
                          value=""
                          checked={!form.batchId}
                          onChange={() => setForm({ ...form, batchId: '' })}
                          className="mt-1 h-4 w-4 accent-[#063b78] cursor-pointer"
                        />
                        <div className="flex-1">
                          <div className="font-bold text-[#092f63]">
                            {dict.admission.assignLater}
                          </div>
                          <div className="text-[12px] text-[#64748b] mt-1">
                            {lang === 'bn'
                              ? 'ভর্তির পর পরবর্তীতে যেকোনো সময় শিক্ষার্থীকে ব্যাচে অন্তর্ভুক্ত করা যাবে।'
                              : 'Student can be assigned to a batch at a later time.'}
                          </div>
                        </div>
                      </label>

                      {/* Real Batches */}
                      {availableBatches.map((b) => {
                        const isSelected = form.batchId === b.id;
                        const enrolled = b.enrolledCount ?? 0;
                        const seatsLeft = Math.max(0, b.capacity - enrolled);
                        const isFull = seatsLeft === 0;

                        return (
                          <label
                            key={b.id}
                            className={`card p-4 rounded-xl border transition-all flex items-start gap-3 ${
                              isFull
                                ? 'opacity-60 bg-slate-50 border-slate-200 cursor-not-allowed'
                                : isSelected
                                ? 'border-[#063b78] bg-blue-50/60 ring-2 ring-[#063b78] cursor-pointer'
                                : 'border-[#dce5f0] hover:bg-[#f8fafc] cursor-pointer'
                            }`}
                          >
                            <input
                              type="radio"
                              name="batchId"
                              disabled={isFull}
                              value={b.id}
                              checked={isSelected}
                              onChange={() => setForm({ ...form, batchId: b.id })}
                              className="mt-1 h-4 w-4 accent-[#063b78] cursor-pointer"
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-[#092f63]">
                                  {lang === 'bn' && b.banglaName ? b.banglaName : b.name}
                                </span>
                                <span className="font-mono text-[11px] font-bold rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                                  {b.code}
                                </span>
                              </div>

                              {/* Capacity Bar */}
                              <div className="mt-2">
                                <div className="flex items-center justify-between text-[11.5px] font-medium text-slate-600 mb-1">
                                  <span>
                                    {enrolled} / {b.capacity} {dict.admission.enrolled}
                                  </span>
                                  <span
                                    className={`font-bold ${
                                      isFull
                                        ? 'text-rose-600'
                                        : seatsLeft <= 5
                                        ? 'text-amber-600'
                                        : 'text-emerald-600'
                                    }`}
                                  >
                                    {isFull ? (lang === 'bn' ? 'আসন পূর্ণ' : 'Full') : `${seatsLeft} ${dict.admission.seatsAvailable}`}
                                  </span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                                  <div
                                    className={`h-full transition-all ${
                                      isFull ? 'bg-rose-500' : 'bg-[#063b78]'
                                    }`}
                                    style={{ width: `${Math.min(100, (enrolled / b.capacity) * 100)}%` }}
                                  />
                                </div>
                              </div>

                              {/* Schedules & Room */}
                              {b.classSchedules && b.classSchedules.length > 0 && (
                                <div className="mt-2 text-[11px] text-slate-500 flex flex-wrap gap-1">
                                  {b.classSchedules.map((sc, i) => (
                                    <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5">
                                      {sc.dayOfWeek.substring(0, 3)} {sc.startTime}-{sc.endTime}
                                      {sc.room && ` (${sc.room.name})`}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    {availableBatches.length === 0 && (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                        {dict.admission.noBatchAvailable}
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 6: Fee Structure Assignment */}
                {step === 6 && (
                  <div className="flex flex-col gap-5">
                    <div className="border-b border-[#edf2f7] pb-3">
                      <h2 className="text-lg font-bold text-[#063b78]">
                        {dict.admission.step6Title}
                      </h2>
                    </div>

                    {/* Course Fee & Payment Plan (Phase 11.2) — fees come from the selected course */}
                    {selectedCourse && (
                      <div className="rounded-xl border border-[#dce5f0] bg-[#f5f8fc] p-4 flex flex-col gap-3">
                        <div>
                          <div className="text-[11.5px] font-semibold uppercase tracking-wider text-[#64748b]">
                            {dict.coursePricing.selectedCourse}
                          </div>
                          <div className="font-bold text-[#092f63]">
                            {lang === 'bn' && selectedCourse.banglaName ? selectedCourse.banglaName : selectedCourse.name}
                          </div>
                        </div>

                        {usePricing ? (
                          <>
                            <div className="flex flex-col gap-1.5 text-[13.5px] text-[#092f63]">
                              {courseLines.map((l, i) => (
                                <div key={`${l.kind}-${i}`} className="flex justify-between gap-3">
                                  <span>
                                    {lang === 'bn' && l.banglaName ? l.banglaName : l.name}
                                    {l.kind === 'INSTALLMENT' && l.dueAfterDays > 0 && (
                                      <span className="text-[#64748b]">
                                        {' '}
                                        ({lang === 'bn' ? `${l.dueAfterDays} দিন পর` : `after ${l.dueAfterDays} days`})
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-mono font-semibold">{formatTaka(l.amount)}</span>
                                </div>
                              ))}
                              <div className="flex justify-between border-t border-[#dce5f0] pt-1.5 font-bold text-[#063b78]">
                                <span>{dict.coursePricing.total}</span>
                                <span className="font-mono">{formatTaka(originalFee)}</span>
                              </div>
                            </div>

                            {courseConfig?.billingType === 'INSTALLMENT' && (
                              <p className="text-[12px] text-[#64748b]">{dict.coursePricing.firstLineNote}</p>
                            )}

                            {optionalFees.length > 0 && (
                              <div className="border-t border-[#dce5f0] pt-3">
                                <div className="text-[12.5px] font-bold text-[#092f63] mb-1.5">
                                  {dict.coursePricing.chooseOptional}
                                </div>
                                {optionalFees.map((f) => {
                                  const checked = (form.optionalFeeIds ?? []).includes(f.id as string);
                                  return (
                                    <label key={f.id} className="flex items-center justify-between gap-3 py-1 text-[13.5px] cursor-pointer">
                                      <span className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          className="accent-[#063b78]"
                                          checked={checked}
                                          onChange={(e) => {
                                            const cur = form.optionalFeeIds ?? [];
                                            setForm({
                                              ...form,
                                              optionalFeeIds: e.target.checked
                                                ? [...cur, f.id as string]
                                                : cur.filter((id) => id !== f.id),
                                            });
                                          }}
                                        />
                                        {lang === 'bn' && f.banglaName ? f.banglaName : f.name}
                                      </span>
                                      <span className="font-mono font-semibold">{formatTaka(f.amount)}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-[13px] text-amber-800">{dict.coursePricing.courseNotPriced}</p>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Fee Structure Dropdown — only for manual (unpriced-course / general) admissions */}
                      {!usePricing && (
                      <>
                      <div className="md:col-span-2">
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.feeStructure}
                        </label>
                        <select
                          value={form.feeStructureId || ''}
                          onChange={(e) => {
                            const fsId = e.target.value;
                            const fs = options.feeStructures.find((f) => f.id === fsId);
                            setForm({
                              ...form,
                              feeStructureId: fsId,
                              feeAmount: fs ? fs.amount : form.feeAmount,
                            });
                          }}
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white font-medium"
                        >
                          <option value="">{lang === 'bn' ? 'কাস্টম ফি বা সরাসরি পরিমাণ নির্ধারণ' : 'Custom Fee / Direct Amount'}</option>
                          {availableFeeStructures.map((fs) => (
                            <option key={fs.id} value={fs.id}>
                              {lang === 'bn' && fs.banglaName ? fs.banglaName : fs.name} — {formatTaka(fs.amount)} ({fs.feeType})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Fee Amount (Original Fee) */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.feeAmount} (BDT ৳) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={form.feeAmount !== undefined ? form.feeAmount : ''}
                          onChange={(e) => setForm({ ...form, feeAmount: e.target.value ? Number(e.target.value) : undefined })}
                          placeholder="e.g. 10000"
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] font-mono text-[#092f63] outline-none focus:border-[#063b78]"
                        />
                      </div>
                      </>
                      )}

                      {/* Due Date */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.dueDate} <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={form.feeDueDate || ''}
                          onChange={(e) => setForm({ ...form, feeDueDate: e.target.value })}
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 7: Discount & Fee Adjustments (Role-Aware) */}
                {step === 7 && (
                  <div className="flex flex-col gap-5">
                    <div className="border-b border-[#edf2f7] pb-3">
                      <h2 className="text-lg font-bold text-[#063b78]">
                        {dict.admission.step7Title}
                      </h2>
                    </div>

                    {/* Role Approval Banner */}
                    <div
                      className={`p-4 rounded-xl border flex items-start gap-3 ${
                        isOwner
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      <Icon name={isOwner ? 'check' : 'alert'} size={20} className="shrink-0 mt-0.5" />
                      <div className="text-[13px] leading-relaxed">
                        <strong>{isOwner ? 'Owner Access:' : 'Staff / Admin Policy:'}</strong>{' '}
                        {isOwner ? dict.admission.ownerApprovedNotice : dict.admission.pendingApprovalNotice}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Discount Amount */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.discount} (BDT ৳)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={originalFee}
                          value={form.discountAmount || ''}
                          onChange={(e) => setForm({ ...form, discountAmount: Number(e.target.value) || 0 })}
                          placeholder="0"
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] font-mono text-[#092f63] outline-none focus:border-[#063b78]"
                        />
                      </div>

                      {/* Waiver Amount */}
                      <div>
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.waiver} (BDT ৳)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={originalFee}
                          value={form.waiverAmount || ''}
                          onChange={(e) => setForm({ ...form, waiverAmount: Number(e.target.value) || 0 })}
                          placeholder="0"
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] font-mono text-[#092f63] outline-none focus:border-[#063b78]"
                        />
                      </div>

                      {/* Reason */}
                      <div className="md:col-span-2">
                        <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                          {dict.admission.discountReason} {totalAdjustments > 0 && <span className="text-rose-500">*</span>}
                        </label>
                        <input
                          type="text"
                          value={form.discountReason || ''}
                          onChange={(e) => setForm({ ...form, discountReason: e.target.value })}
                          placeholder="e.g. Merit Scholarship / Sibling Discount / Special Consideration"
                          className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 8: Initial Payment & Receipt Recording */}
                {step === 8 && (
                  <div className="flex flex-col gap-5">
                    <div className="border-b border-[#edf2f7] pb-3">
                      <h2 className="text-lg font-bold text-[#063b78]">
                        {dict.admission.step8Title}
                      </h2>
                    </div>

                    {/* Pay Now vs Later Toggle */}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setRecordInitialPayment(true);
                          if (!form.initialPayment) {
                            setForm((prev) => ({
                              ...prev,
                              initialPayment: {
                                amount: isOwner ? effectivePayable : originalFee,
                                paymentMethod: 'CASH',
                              },
                            }));
                          }
                        }}
                        className={`flex-1 p-4 rounded-xl border font-bold text-[13.5px] transition-all flex items-center justify-center gap-2 ${
                          recordInitialPayment
                            ? 'bg-[#063b78] text-white border-[#063b78] shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Icon name="banknote" size={18} />
                        <span>{dict.admission.recordPaymentNow}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRecordInitialPayment(false);
                          setForm((prev) => ({ ...prev, initialPayment: undefined }));
                        }}
                        className={`flex-1 p-4 rounded-xl border font-bold text-[13.5px] transition-all flex items-center justify-center gap-2 ${
                          !recordInitialPayment
                            ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Icon name="clock" size={18} />
                        <span>{dict.admission.skipPayment}</span>
                      </button>
                    </div>

                    {/* Initial Payment Form */}
                    {recordInitialPayment && (
                      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col gap-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Payment Method */}
                          <div>
                            <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                              {dict.admission.paymentMethod} <span className="text-rose-500">*</span>
                            </label>
                            <select
                              value={form.initialPayment?.paymentMethod || 'CASH'}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  initialPayment: {
                                    ...form.initialPayment,
                                    amount: form.initialPayment?.amount || (isOwner ? effectivePayable : originalFee),
                                    paymentMethod: e.target.value as any,
                                  },
                                })
                              }
                              className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white font-medium"
                            >
                              <option value="CASH">Cash (নগদ)</option>
                              <option value="BKASH">bKash (বিকাশ)</option>
                              <option value="NAGAD">Nagad (নগদ MFS)</option>
                              <option value="BANK">Bank Deposit</option>
                              <option value="CARD">Debit / Credit Card</option>
                              <option value="OTHER">Other</option>
                            </select>
                          </div>

                          {/* Payment Amount */}
                          <div>
                            <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                              {dict.admission.paymentAmount} (BDT ৳) <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={originalFee}
                              value={form.initialPayment?.amount || ''}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  initialPayment: {
                                    ...form.initialPayment,
                                    paymentMethod: form.initialPayment?.paymentMethod || 'CASH',
                                    amount: Number(e.target.value) || 0,
                                  },
                                })
                              }
                              placeholder="e.g. 5000"
                              className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] font-mono text-[#092f63] outline-none focus:border-[#063b78] bg-white"
                            />
                          </div>

                          {/* Transaction ID for MFS */}
                          {['BKASH', 'NAGAD'].includes(form.initialPayment?.paymentMethod || '') && (
                            <>
                              <div>
                                <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                                  {dict.admission.transactionId} <span className="text-rose-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={form.initialPayment?.transactionId || ''}
                                  onChange={(e) =>
                                    setForm({
                                      ...form,
                                      initialPayment: {
                                        ...form.initialPayment!,
                                        paymentMethod: form.initialPayment?.paymentMethod || 'BKASH',
                                        amount: form.initialPayment?.amount || 0,
                                        transactionId: e.target.value,
                                      },
                                    })
                                  }
                                  placeholder="e.g. 9J3K8Q2L"
                                  className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] font-mono text-[#092f63] outline-none focus:border-[#063b78] bg-white"
                                />
                              </div>

                              <div>
                                <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                                  {dict.admission.senderMobile}
                                </label>
                                <input
                                  type="tel"
                                  value={form.initialPayment?.senderMobile || ''}
                                  onChange={(e) =>
                                    setForm({
                                      ...form,
                                      initialPayment: {
                                        ...form.initialPayment!,
                                        paymentMethod: form.initialPayment?.paymentMethod || 'BKASH',
                                        amount: form.initialPayment?.amount || 0,
                                        senderMobile: e.target.value,
                                      },
                                    })
                                  }
                                  placeholder="01XXXXXXXXX"
                                  className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] font-mono text-[#092f63] outline-none focus:border-[#063b78] bg-white"
                                />
                              </div>
                            </>
                          )}

                          {/* Reference Number */}
                          <div>
                            <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                              {dict.admission.referenceNumber}
                            </label>
                            <input
                              type="text"
                              value={form.initialPayment?.referenceNumber || ''}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  initialPayment: {
                                    ...form.initialPayment!,
                                    paymentMethod: form.initialPayment?.paymentMethod || 'CASH',
                                    amount: form.initialPayment?.amount || 0,
                                    referenceNumber: e.target.value,
                                  },
                                })
                              }
                              placeholder="Deposit slip / invoice reference"
                              className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white"
                            />
                          </div>

                          {/* Notes */}
                          <div>
                            <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                              {dict.admission.notes}
                            </label>
                            <input
                              type="text"
                              value={form.initialPayment?.notes || ''}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  initialPayment: {
                                    ...form.initialPayment!,
                                    paymentMethod: form.initialPayment?.paymentMethod || 'CASH',
                                    amount: form.initialPayment?.amount || 0,
                                    notes: e.target.value,
                                  },
                                })
                              }
                              placeholder="Payment remarks"
                              className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 9: Review & Confirm */}
                {step === 9 && (
                  <div className="flex flex-col gap-5">
                    <div className="border-b border-[#edf2f7] pb-3">
                      <h2 className="text-lg font-bold text-[#063b78]">
                        {dict.admission.step9Title}
                      </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[13.5px]">
                      {/* Student Card */}
                      <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#dce5f0] flex flex-col gap-2">
                        <div className="font-bold text-[#063b78] border-b border-[#e2e8f0] pb-1.5 flex items-center gap-2">
                          <Icon name="user" size={16} />
                          <span>{dict.admission.summaryStudent}</span>
                        </div>
                        <div>
                          <span className="text-[#64748b]">{dict.admission.fullName}:</span>{' '}
                          <strong className="text-[#092f63]">{form.name}</strong>
                        </div>
                        {form.banglaName && (
                          <div>
                            <span className="text-[#64748b]">{dict.admission.banglaName}:</span>{' '}
                            <strong>{form.banglaName}</strong>
                          </div>
                        )}
                        <div>
                          <span className="text-[#64748b]">{dict.admission.studentPhone}:</span>{' '}
                          <span className="font-mono">{form.phone || 'N/A'}</span>
                        </div>
                      </div>

                      {/* Guardian Card */}
                      <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#dce5f0] flex flex-col gap-2">
                        <div className="font-bold text-[#063b78] border-b border-[#e2e8f0] pb-1.5 flex items-center gap-2">
                          <Icon name="check" size={16} />
                          <span>{dict.admission.summaryGuardian}</span>
                        </div>
                        <div>
                          <span className="text-[#64748b]">{dict.admission.guardianName}:</span>{' '}
                          <strong className="text-[#092f63]">{form.guardianName}</strong>
                        </div>
                        <div>
                          <span className="text-[#64748b]">{dict.admission.guardianPhone}:</span>{' '}
                          <strong className="font-mono text-[#063b78]">{form.guardianPhone}</strong>
                        </div>
                      </div>

                      {/* Academic & Batch Card */}
                      <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#dce5f0] flex flex-col gap-2 md:col-span-2">
                        <div className="font-bold text-[#063b78] border-b border-[#e2e8f0] pb-1.5 flex items-center gap-2">
                          <Icon name="layers" size={16} />
                          <span>{dict.admission.summaryAcademic}</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div>
                            <span className="text-xs text-slate-500 block">{dict.admission.program}</span>
                            <strong>{selectedProgram?.name}</strong>
                          </div>
                          <div>
                            <span className="text-xs text-slate-500 block">{dict.admission.class}</span>
                            <strong>{selectedClass?.name}</strong>
                          </div>
                          <div>
                            <span className="text-xs text-slate-500 block">{dict.admission.course}</span>
                            <strong>{options.courses.find((c) => c.id === form.courseId)?.name || 'General'}</strong>
                          </div>
                          <div>
                            <span className="text-xs text-slate-500 block">{dict.admission.batch}</span>
                            <strong>{options.batches.find((b) => b.id === form.batchId)?.name || 'Unassigned'}</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Navigation Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-[#edf2f7]">
                  {step > 1 ? (
                    <button
                      type="button"
                      onClick={handlePrev}
                      className="rounded-xl border border-[#dce5f0] px-5 py-2.5 text-[14px] font-semibold text-[#092f63] hover:bg-[#f8fafc] transition-colors"
                    >
                      {dict.admission.prev}
                    </button>
                  ) : (
                    <div />
                  )}

                  {step < 9 ? (
                    <button
                      type="button"
                      onClick={handleNext}
                      className="rounded-xl bg-[#063b78] px-6 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#052e5e] transition-colors"
                    >
                      {dict.admission.next}
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={submitting}
                      className="rounded-xl bg-[#063b78] px-8 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#052e5e] disabled:opacity-50 transition-colors flex items-center gap-2"
                    >
                      {submitting && (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                      )}
                      <span>{submitting ? dict.admission.submitting : dict.admission.submit}</span>
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Sticky Summary Sidebar on Desktop (4 Cols) */}
        <div className="lg:col-span-4 sticky top-6 flex flex-col gap-4">
          <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-[#063b78] text-[15px] flex items-center gap-2">
                <Icon name="wallet" size={17} />
                <span>{lang === 'bn' ? 'ভর্তি সারসংক্ষেপ' : 'Admission Summary'}</span>
              </h3>
              <span className="text-xs bg-blue-50 text-[#063b78] font-bold px-2 py-0.5 rounded">
                Step {step} / 9
              </span>
            </div>

            {/* Live Values */}
            <div className="flex flex-col gap-2.5 text-[13px]">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">{dict.admission.summaryStudent}:</span>
                <strong className="text-slate-800 truncate max-w-[150px]">
                  {form.name || (lang === 'bn' ? 'অনির্দিষ্ট' : 'Not set')}
                </strong>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">{dict.admission.class}:</span>
                <span className="font-semibold text-slate-800">
                  {selectedClass?.name || '—'}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">{dict.admission.course}:</span>
                <span className="font-semibold text-slate-800 truncate max-w-[150px]">
                  {options.courses.find((c) => c.id === form.courseId)?.name || 'General'}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">{dict.admission.batch}:</span>
                <span className="font-semibold text-slate-800 truncate max-w-[150px]">
                  {options.batches.find((b) => b.id === form.batchId)?.name || (lang === 'bn' ? 'পরে নির্ধারণ' : 'Assign Later')}
                </span>
              </div>

              <div className="border-t border-dashed border-slate-200 my-1" />

              {/* Financial Summary */}
              <div className="flex justify-between items-center">
                <span className="text-slate-500">{dict.admission.summaryFee}:</span>
                <strong className="text-slate-800 font-mono">{formatTaka(originalFee)}</strong>
              </div>

              {totalAdjustments > 0 && (
                <div className="flex justify-between items-center text-amber-700">
                  <span>{dict.admission.summaryDiscount}:</span>
                  <span className="font-mono font-bold">-{formatTaka(totalAdjustments)}</span>
                </div>
              )}

              <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                <span className="font-bold text-[#063b78]">{dict.admission.summaryPayable}:</span>
                <strong className="text-[#063b78] text-[15px] font-mono">
                  {formatTaka(isOwner ? effectivePayable : requestedPayable)}
                </strong>
              </div>

              {recordInitialPayment && (
                <div className="flex justify-between items-center text-emerald-700">
                  <span>{dict.admission.summaryPaid}:</span>
                  <span className="font-mono font-bold">{formatTaka(initialPaymentAmount)}</span>
                </div>
              )}

              <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                <span className="text-slate-600 font-bold">{dict.admission.summaryDue}:</span>
                <strong className="text-rose-600 text-[14px] font-mono">
                  {formatTaka(remainingDue)}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PRINT RECEIPT MODAL */}
      {showPrintModal && admissionResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:p-0 print:bg-white">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-xl flex flex-col gap-4 print:shadow-none print:p-0">
            <div className="text-center border-b pb-3">
              <h3 className="text-lg font-black text-[#063b78]">
                {currentCenter?.name || 'Coaching Center'}
              </h3>
              <p className="text-xs text-slate-500">
                {currentCenter?.phone || 'Dhaka, Bangladesh'}
              </p>
              <div className="mt-2 inline-block rounded bg-blue-100 px-2 py-0.5 text-xs font-bold text-[#063b78]">
                MONEY RECEIPT (মানি রিসিট)
              </div>
            </div>

            <div className="text-xs flex flex-col gap-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Receipt No:</span>
                <strong className="font-mono text-slate-800">{admissionResult.receiptNumber}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Student ID:</span>
                <strong className="font-mono text-slate-800">{admissionResult.student.studentId}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Student Name:</span>
                <strong className="text-slate-800">{admissionResult.student.name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Batch:</span>
                <span className="text-slate-800">{options.batches.find((b) => b.id === form.batchId)?.name || 'General'}</span>
              </div>
              <div className="border-t pt-2 flex justify-between">
                <span className="text-slate-500">Amount Paid:</span>
                <strong className="text-emerald-700 font-mono text-sm">
                  {admissionResult.payment ? formatTaka(admissionResult.payment.amount) : '৳0'}
                </strong>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl bg-[#063b78] px-4 py-2 text-xs font-bold text-white hover:bg-[#052e5e]"
              >
                {lang === 'bn' ? 'প্রিন্ট করুন' : 'Print'}
              </button>
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                {lang === 'bn' ? 'বন্ধ করুন' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
