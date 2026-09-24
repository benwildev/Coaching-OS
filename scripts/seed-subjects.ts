import prisma from '../lib/db';

export async function seedStandardSubjectsForCenter(
  prismaClient: any,
  coachingCenterId: string,
  targetClassId?: string
) {
  const whereCls: any = { coachingCenterId };
  if (targetClassId) {
    whereCls.id = targetClassId;
  }

  const classes = await prismaClient.academicClass.findMany({
    where: whereCls,
    include: {
      program: true,
      groups: true,
      subjects: true,
    },
  });

  const created: any[] = [];

  for (const cls of classes) {
    const groupMap = new Map<string, string>(); // code -> id
    cls.groups.forEach((g: any) => groupMap.set(g.code, g.id));
    const existingCodes = new Set(cls.subjects.map((s: any) => s.code));

    const subjectsToCreate: Array<{
      name: string;
      banglaName: string;
      code: string;
      groupCode?: string;
    }> = [];

    // SSC Classes (Class 9 & 10)
    if (cls.code === 'CLASS_9' || cls.code === 'CLASS_10' || cls.name.includes('9') || cls.name.includes('10')) {
      // Compulsory / General
      subjectsToCreate.push(
        { name: 'Bangla 1st Paper', banglaName: 'বাংলা ১ম পত্র', code: 'BAN1' },
        { name: 'Bangla 2nd Paper', banglaName: 'বাংলা ২য় পত্র', code: 'BAN2' },
        { name: 'English 1st Paper', banglaName: 'ইংরেজি ১ম পত্র', code: 'ENG1' },
        { name: 'English 2nd Paper', banglaName: 'ইংরেজি ২য় পত্র', code: 'ENG2' },
        { name: 'General Mathematics', banglaName: 'সাধারণ গণিত', code: 'GMATH' },
        { name: 'Information & Communication Technology', banglaName: 'তথ্য ও যোগাযোগ প্রযুক্তি', code: 'ICT' },
        { name: 'Bangladesh & Global Studies', banglaName: 'বাংলাদেশ ও বিশ্বপরিচয়', code: 'BGS' },
        { name: 'Islam & Moral Education', banglaName: 'ইসলাম ও নৈতিক শিক্ষা', code: 'ISLAM' },
      );
      // Science Group
      subjectsToCreate.push(
        { name: 'Physics', banglaName: 'পদার্থবিজ্ঞান', code: 'PHY', groupCode: 'SCIENCE' },
        { name: 'Chemistry', banglaName: 'রসায়ন', code: 'CHEM', groupCode: 'SCIENCE' },
        { name: 'Biology', banglaName: 'জীববিজ্ঞান', code: 'BIO', groupCode: 'SCIENCE' },
        { name: 'Higher Mathematics', banglaName: 'উচ্চতর গণিত', code: 'HMATH', groupCode: 'SCIENCE' },
      );
      // Business Studies Group
      subjectsToCreate.push(
        { name: 'Accounting', banglaName: 'হিসাববিজ্ঞান', code: 'ACC', groupCode: 'BUSINESS_STUDIES' },
        { name: 'Finance & Banking', banglaName: 'ফিন্যান্স ও ব্যাংকিং', code: 'FIN', groupCode: 'BUSINESS_STUDIES' },
        { name: 'Business Entrepreneurship', banglaName: 'ব্যবসায় উদ্যোগ', code: 'BENT', groupCode: 'BUSINESS_STUDIES' },
        { name: 'General Science', banglaName: 'সাধারণ বিজ্ঞান', code: 'GSCI_BUS', groupCode: 'BUSINESS_STUDIES' },
      );
      // Humanities Group
      subjectsToCreate.push(
        { name: 'History of Bangladesh & World Civilization', banglaName: 'বাংলাদেশের ইতিহাস ও বিশ্বসভ্যতা', code: 'HIST', groupCode: 'HUMANITIES' },
        { name: 'Geography & Environment', banglaName: 'ভূগোল ও পরিবেশ', code: 'GEO', groupCode: 'HUMANITIES' },
        { name: 'Civics & Citizenship', banglaName: 'পৌরনীতি ও নাগরিকতা', code: 'CIV', groupCode: 'HUMANITIES' },
        { name: 'Economics', banglaName: 'অর্থনীতি', code: 'ECON', groupCode: 'HUMANITIES' },
        { name: 'General Science', banglaName: 'সাধারণ বিজ্ঞান', code: 'GSCI_HUM', groupCode: 'HUMANITIES' },
      );
    }

    // HSC Classes (Class 11 & 12)
    else if (cls.code === 'CLASS_11' || cls.code === 'CLASS_12' || cls.name.includes('11') || cls.name.includes('12')) {
      // Compulsory
      subjectsToCreate.push(
        { name: 'Bangla 1st Paper', banglaName: 'বাংলা ১ম পত্র', code: 'BAN1' },
        { name: 'Bangla 2nd Paper', banglaName: 'বাংলা ২য় পত্র', code: 'BAN2' },
        { name: 'English 1st Paper', banglaName: 'ইংরেজি ১ম পত্র', code: 'ENG1' },
        { name: 'English 2nd Paper', banglaName: 'ইংরেজি ২য় পত্র', code: 'ENG2' },
        { name: 'Information & Communication Technology', banglaName: 'তথ্য ও যোগাযোগ প্রযুক্তি', code: 'ICT' },
      );
      // Science Group
      subjectsToCreate.push(
        { name: 'Physics 1st Paper', banglaName: 'পদার্থবিজ্ঞান ১ম পত্র', code: 'PHY1', groupCode: 'SCIENCE' },
        { name: 'Physics 2nd Paper', banglaName: 'পদার্থবিজ্ঞান ২য় পত্র', code: 'PHY2', groupCode: 'SCIENCE' },
        { name: 'Chemistry 1st Paper', banglaName: 'রসায়ন ১ম পত্র', code: 'CHEM1', groupCode: 'SCIENCE' },
        { name: 'Chemistry 2nd Paper', banglaName: 'রসায়ন ২য় পত্র', code: 'CHEM2', groupCode: 'SCIENCE' },
        { name: 'Biology 1st Paper', banglaName: 'জীববিজ্ঞান ১ম পত্র', code: 'BIO1', groupCode: 'SCIENCE' },
        { name: 'Biology 2nd Paper', banglaName: 'জীববিজ্ঞান ২য় পত্র', code: 'BIO2', groupCode: 'SCIENCE' },
        { name: 'Higher Mathematics 1st Paper', banglaName: 'উচ্চতর গণিত ১ম পত্র', code: 'HMATH1', groupCode: 'SCIENCE' },
        { name: 'Higher Mathematics 2nd Paper', banglaName: 'উচ্চতর গণিত ২য় পত্র', code: 'HMATH2', groupCode: 'SCIENCE' },
      );
      // Business Studies Group
      subjectsToCreate.push(
        { name: 'Accounting 1st Paper', banglaName: 'হিসাববিজ্ঞান ১ম পত্র', code: 'ACC1', groupCode: 'BUSINESS_STUDIES' },
        { name: 'Accounting 2nd Paper', banglaName: 'হিসাববিজ্ঞান ২য় পত্র', code: 'ACC2', groupCode: 'BUSINESS_STUDIES' },
        { name: 'Business Organization 1st Paper', banglaName: 'ব্যবসায় সংগঠন ১ম পত্র', code: 'BOM1', groupCode: 'BUSINESS_STUDIES' },
        { name: 'Business Organization 2nd Paper', banglaName: 'ব্যবসায় সংগঠন ২য় পত্র', code: 'BOM2', groupCode: 'BUSINESS_STUDIES' },
        { name: 'Finance & Banking 1st Paper', banglaName: 'ফিন্যান্স ও ব্যাংকিং ১ম পত্র', code: 'FIN1', groupCode: 'BUSINESS_STUDIES' },
        { name: 'Finance & Banking 2nd Paper', banglaName: 'ফিন্যান্স ও ব্যাংকিং ২য় পত্র', code: 'FIN2', groupCode: 'BUSINESS_STUDIES' },
        { name: 'Economics 1st Paper', banglaName: 'অর্থনীতি ১ম পত্র', code: 'ECON1', groupCode: 'BUSINESS_STUDIES' },
        { name: 'Economics 2nd Paper', banglaName: 'অর্থনীতি ২য় পত্র', code: 'ECON2', groupCode: 'BUSINESS_STUDIES' },
      );
      // Humanities Group
      subjectsToCreate.push(
        { name: 'Civics & Good Governance 1st Paper', banglaName: 'পৌরনীতি ও সুশাসন ১ম পত্র', code: 'CIV1', groupCode: 'HUMANITIES' },
        { name: 'Civics & Good Governance 2nd Paper', banglaName: 'পৌরনীতি ও সুশাসন ২য় পত্র', code: 'CIV2', groupCode: 'HUMANITIES' },
        { name: 'Economics 1st Paper', banglaName: 'অর্থনীতি ১ম পত্র', code: 'ECON1_HUM', groupCode: 'HUMANITIES' },
        { name: 'Economics 2nd Paper', banglaName: 'অর্থনীতি ২য় পত্র', code: 'ECON2_HUM', groupCode: 'HUMANITIES' },
        { name: 'History 1st Paper', banglaName: 'ইতিহাস ১ম পত্র', code: 'HIST1', groupCode: 'HUMANITIES' },
        { name: 'History 2nd Paper', banglaName: 'ইতিহাস ২য় পত্র', code: 'HIST2', groupCode: 'HUMANITIES' },
        { name: 'Islamic History 1st Paper', banglaName: 'ইসলামের ইতিহাস ১ম পত্র', code: 'ISHIST1', groupCode: 'HUMANITIES' },
        { name: 'Islamic History 2nd Paper', banglaName: 'ইসলামের ইতিহাস ২য় পত্র', code: 'ISHIST2', groupCode: 'HUMANITIES' },
        { name: 'Logic 1st Paper', banglaName: 'যুক্তিবিদ্যা ১ম পত্র', code: 'LOG1', groupCode: 'HUMANITIES' },
        { name: 'Logic 2nd Paper', banglaName: 'যুক্তিবিদ্যা ২য় পত্র', code: 'LOG2', groupCode: 'HUMANITIES' },
      );
    }

    // Admission Classes
    else if (cls.code === 'MED_ADM' || cls.name.toLowerCase().includes('medical')) {
      subjectsToCreate.push(
        { name: 'Biology (Medical)', banglaName: 'জীববিজ্ঞান (মেডিকেল)', code: 'MED_BIO' },
        { name: 'Chemistry (Medical)', banglaName: 'রসায়ন (মেডিকেল)', code: 'MED_CHEM' },
        { name: 'Physics (Medical)', banglaName: 'পদার্থবিজ্ঞান (মেডিকেল)', code: 'MED_PHY' },
        { name: 'English (Medical)', banglaName: 'ইংরেজি (মেডিকেল)', code: 'MED_ENG' },
        { name: 'General Knowledge (Medical)', banglaName: 'সাধারণ জ্ঞান (মেডিকেল)', code: 'MED_GK' },
      );
    }
    else if (cls.code === 'ENG_ADM' || cls.name.toLowerCase().includes('engineering')) {
      subjectsToCreate.push(
        { name: 'Mathematics (Engineering)', banglaName: 'উচ্চতর গণিত (প্রকৌশল)', code: 'ENG_MATH' },
        { name: 'Physics (Engineering)', banglaName: 'পদার্থবিজ্ঞান (প্রকৌশল)', code: 'ENG_PHY' },
        { name: 'Chemistry (Engineering)', banglaName: 'রসায়ন (প্রকৌশল)', code: 'ENG_CHEM' },
        { name: 'English (Engineering)', banglaName: 'ইংরেজি (প্রকৌশল)', code: 'ENG_ENG' },
      );
    }
    else if (cls.code === 'UNI_ADM' || cls.name.toLowerCase().includes('university')) {
      subjectsToCreate.push(
        { name: 'Physics', banglaName: 'পদার্থবিজ্ঞান', code: 'UNI_PHY' },
        { name: 'Chemistry', banglaName: 'রসায়ন', code: 'UNI_CHEM' },
        { name: 'Mathematics', banglaName: 'গণিত', code: 'UNI_MATH' },
        { name: 'Biology', banglaName: 'জীববিজ্ঞান', code: 'UNI_BIO' },
        { name: 'Bangla', banglaName: 'বাংলা', code: 'UNI_BAN' },
        { name: 'English', banglaName: 'ইংরেজি', code: 'UNI_ENG' },
        { name: 'General Knowledge', banglaName: 'সাধারণ জ্ঞান', code: 'UNI_GK' },
        { name: 'Accounting', banglaName: 'হিসাববিজ্ঞান', code: 'UNI_ACC' },
        { name: 'Business Organization', banglaName: 'ব্যবসায় সংগঠন', code: 'UNI_BOM' },
      );
    }

    for (const sub of subjectsToCreate) {
      if (existingCodes.has(sub.code)) continue;
      const groupId = sub.groupCode ? groupMap.get(sub.groupCode) : undefined;
      const createdSub = await prismaClient.subject.create({
        data: {
          coachingCenterId,
          academicClassId: cls.id,
          academicGroupId: groupId || null,
          name: sub.name,
          banglaName: sub.banglaName,
          code: sub.code,
        },
      });
      created.push(createdSub);
      existingCodes.add(sub.code);
    }
  }

  return created;
}

async function run() {
  const centers = await prisma.coachingCenter.findMany();
  for (const c of centers) {
    console.log(`Seeding subjects for center: ${c.name} (${c.id})...`);
    const created = await seedStandardSubjectsForCenter(prisma, c.id);
    console.log(`Created ${created.length} subjects for ${c.name}`);
  }
}

if (require.main === module) {
  run()
    .catch(console.error)
    .finally(() => process.exit(0));
}
