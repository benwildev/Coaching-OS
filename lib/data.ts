// Central mock data module — ported from Main.dc.html §§ 2, 2b, 2c, 2d.
// DEMO DATA ONLY: Alokito Coaching Centre, Dhanmondi, Class 9–12 (SSC & HSC).
/* eslint-disable @typescript-eslint/no-explicit-any */

import { sum, seeded, round1 } from './format';

export const MONTHS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
export const MONTH_FULL = ['Oct 2025', 'Nov 2025', 'Dec 2025', 'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026 (to date)'];

export const DATA: any = {
  org: { name: 'Alokito Coaching Centre', short: 'Alokito', campus: 'Dhanmondi, Dhaka', kind: 'Class 9–12 academic coaching (SSC & HSC)', today: 'Monday, 21 September 2026', asOf: '4:15 PM', teachers: 24 },
  user: { name: 'Farhana Rahman', role: 'Owner', initials: 'FR' },
  roles: ['Owner', 'Centre manager', 'Administrator', 'Accountant', 'Teacher'],
  classes: [
    { id: 'c9', name: 'Class 9', city: 'SSC foundation', manager: 'Md. Kamrul Hassan', students: 142, admissions: 12, batches: 6, batchDelta: 1, teachers: 9, classesToday: 8, exams14: 3, examsWeek: 1, collected: 2.67, billed: 3.45, outstanding: 0.78, overdue: 14, att: { exp: 132, p: 118, l: 5, a: 9 }, att30: 91.2 },
    { id: 'c10', name: 'Class 10', city: 'SSC candidates 2024', manager: 'Nasrin Akter', students: 182, admissions: 14, batches: 7, batchDelta: 0, teachers: 11, classesToday: 10, exams14: 4, examsWeek: 2, collected: 4.89, billed: 5.80, outstanding: 0.91, overdue: 21, att: { exp: 164, p: 146, l: 6, a: 12 }, att30: 93.1 },
    { id: 'c11', name: 'Class 11', city: 'HSC 1st year', manager: 'Tariqul Islam', students: 154, admissions: 11, batches: 6, batchDelta: 1, teachers: 10, classesToday: 8, exams14: 2, examsWeek: 1, collected: 3.81, billed: 5.18, outstanding: 1.37, overdue: 19, att: { exp: 124, p: 101, l: 6, a: 17 }, att30: 88.4 },
    { id: 'c12', name: 'Class 12', city: 'HSC candidates 2024', manager: 'Shihabuddin Al Mamun', students: 162, admissions: 13, batches: 7, batchDelta: 0, teachers: 11, classesToday: 10, exams14: 5, examsWeek: 2, collected: 5.23, billed: 6.99, outstanding: 1.76, overdue: 25, att: { exp: 156, p: 134, l: 7, a: 15 }, att30: 90.6 },
  ],
  series: {
    students: [548, 556, 560, 566, 582, 594, 602, 610, 614, 622, 630, 640],
    admissions: [22, 16, 10, 19, 48, 34, 20, 22, 14, 23, 31, 40],
    billed: [16.4, 16.6, 16.8, 17.0, 17.6, 17.9, 18.1, 18.4, 18.5, 18.8, 19.0, 19.4],
    collected: [15.3, 15.6, 14.8, 15.9, 16.7, 16.5, 17.2, 17.5, 17.1, 17.9, 18.3, 16.6],
    attendance: [89.4, 90.2, 86.8, 89.0, 91.1, 90.3, 88.1, 89.7, 86.2, 89.1, 90.6, 90.8],
    prevYear: { admissions: 245, collected: 180 },
    collectedSameDayLastMonth: 15.6,
  },
  targets: { admissionsMonth: 45, collectionRate: 95, attendance: 90 },
  aging: [
    { id: 'a0', label: '0–30 days', amount: 1.78, color: '#00296b' },
    { id: 'a1', label: '31–60 days', amount: 1.45, color: '#ffd500' },
    { id: 'a2', label: '61–90 days', amount: 0.89, color: '#f59e0b' },
    { id: 'a3', label: '90+ days', amount: 0.70, color: '#ea580c' },
  ],
  programs: [
    { id: 'all', label: 'All groups' },
    { id: 'sci', label: 'Science' },
    { id: 'bus', label: 'Business Studies' },
    { id: 'hum', label: 'Humanities' },
  ],
  batches: [
    { id: '9a', name: 'Class 9 Science · A', program: 'sci', cls: 'c9', enrolled: 36, capacity: 40, score: 76.1, att: 92, teacher: 'Md. Kamrul Hasan', time: 'Sat–Thu · 4:00 pm' },
    { id: '9b', name: 'Class 9 Science · B', program: 'sci', cls: 'c9', enrolled: 30, capacity: 40, score: 71.4, att: 90, teacher: 'Mizanur Rahman', time: 'Sat–Thu · 5:30 pm' },
    { id: '9d', name: 'Class 9 Science · C', program: 'sci', cls: 'c9', enrolled: 24, capacity: 40, score: 69.8, att: 89, teacher: 'Jannatul Ferdous', time: 'Sat–Wed · 3:00 pm' },
    { id: '9e', name: 'Class 9 Science · Evening', program: 'sci', cls: 'c9', enrolled: 24, capacity: 35, score: 68.2, att: 87, teacher: 'Nasrin Sultana', time: 'Sat–Wed · 7:00 pm' },
    { id: '9c', name: 'Class 9 Business Studies', program: 'bus', cls: 'c9', enrolled: 22, capacity: 30, score: 66.8, att: 89, teacher: 'Sumaiya Begum', time: 'Sun–Thu · 4:00 pm' },
    { id: '9h', name: 'Class 9 Humanities', program: 'hum', cls: 'c9', enrolled: 14, capacity: 30, score: 67.9, att: 88, teacher: 'Sharmin Sultana', time: 'Sun–Thu · 5:00 pm' },
    { id: '10a', name: 'Class 10 Science · A', program: 'sci', cls: 'c10', enrolled: 40, capacity: 40, score: 80.2, att: 95, teacher: 'Md. Kamrul Hasan', time: 'Sat–Thu · 8:00 am' },
    { id: '10b', name: 'Class 10 Science · B', program: 'sci', cls: 'c10', enrolled: 38, capacity: 40, score: 74.6, att: 91, teacher: 'Abdullah Al Mamun', time: 'Sat–Thu · 3:00 pm' },
    { id: '10d', name: 'Class 10 Science · C', program: 'sci', cls: 'c10', enrolled: 30, capacity: 40, score: 72.1, att: 90, teacher: 'Shirin Akter', time: 'Sat–Wed · 5:00 pm' },
    { id: '10e', name: 'Class 10 Science · Evening', program: 'sci', cls: 'c10', enrolled: 20, capacity: 35, score: 69.5, att: 88, teacher: 'Habibur Rahman', time: 'Sat–Wed · 7:00 pm' },
    { id: '10c', name: 'Class 10 Business Studies · A', program: 'bus', cls: 'c10', enrolled: 26, capacity: 35, score: 68.9, att: 88, teacher: 'Sumaiya Begum', time: 'Sun–Thu · 4:00 pm' },
    { id: '10f', name: 'Class 10 Business Studies · B', program: 'bus', cls: 'c10', enrolled: 14, capacity: 30, score: 66.1, att: 86, teacher: 'Sumaiya Begum', time: 'Sun–Thu · 6:00 pm' },
    { id: '10h', name: 'Class 10 Humanities', program: 'hum', cls: 'c10', enrolled: 12, capacity: 30, score: 67.3, att: 87, teacher: 'Sharmin Sultana', time: 'Sun–Thu · 5:00 pm' },
    { id: '11a', name: 'Class 11 Science · A', program: 'sci', cls: 'c11', enrolled: 42, capacity: 45, score: 72.5, att: 88, teacher: 'Tariqul Islam', time: 'Sat–Thu · 3:00 pm' },
    { id: '11b', name: 'Class 11 Science · B', program: 'sci', cls: 'c11', enrolled: 44, capacity: 45, score: 61.2, att: 79, teacher: 'Tariqul Islam', time: 'Sat–Thu · 5:00 pm' },
    { id: '11e', name: 'Class 11 Science · Evening', program: 'sci', cls: 'c11', enrolled: 16, capacity: 35, score: 65.4, att: 83, teacher: 'Rumana Afroz', time: 'Sat–Wed · 7:00 pm' },
    { id: '11d', name: 'Class 11 Business Studies', program: 'bus', cls: 'c11', enrolled: 20, capacity: 35, score: 66.9, att: 85, teacher: 'Sumaiya Begum', time: 'Sun–Thu · 4:30 pm' },
    { id: '11c', name: 'Class 11 Humanities', program: 'hum', cls: 'c11', enrolled: 18, capacity: 30, score: 64.0, att: 84, teacher: 'Imran Hossain', time: 'Sun–Thu · 5:30 pm' },
    { id: '12a', name: 'Class 12 Science · A', program: 'sci', cls: 'c12', enrolled: 42, capacity: 45, score: 78.4, att: 93, teacher: 'Abdullah Al Mamun', time: 'Sat–Thu · 8:00 am' },
    { id: '12b', name: 'Class 12 Science · B', program: 'sci', cls: 'c12', enrolled: 39, capacity: 45, score: 70.3, att: 88, teacher: 'Shirin Akter', time: 'Sat–Thu · 3:00 pm' },
    { id: '12d', name: 'Class 12 Science · C', program: 'sci', cls: 'c12', enrolled: 30, capacity: 45, score: 69.1, att: 87, teacher: 'Tariqul Islam', time: 'Sat–Wed · 5:00 pm' },
    { id: '12e', name: 'Class 12 Science · Evening', program: 'sci', cls: 'c12', enrolled: 15, capacity: 35, score: 66.7, att: 85, teacher: 'Imran Hossain', time: 'Sat–Wed · 7:00 pm' },
    { id: '12c', name: 'Class 12 Business Studies', program: 'bus', cls: 'c12', enrolled: 28, capacity: 35, score: 67.5, att: 87, teacher: 'Sumaiya Begum', time: 'Sun–Thu · 4:00 pm' },
    { id: '12h', name: 'Class 12 Humanities', program: 'hum', cls: 'c12', enrolled: 16, capacity: 30, score: 65.8, att: 86, teacher: 'Imran Hossain', time: 'Sun–Thu · 5:30 pm' },
  ],
  subjects: [
    { id: 'ict', name: 'ICT', avg: 81.4, pass: 95, prev: 80.0, delta: '+1.4', up: true },
    { id: 'ban', name: 'Bangla', avg: 77.9, pass: 94, prev: 76.9, delta: '+1.0', up: true },
    { id: 'bio', name: 'Biology', avg: 74.8, pass: 90, prev: 72.7, delta: '+2.1', up: true },
    { id: 'acc', name: 'Accounting', avg: 73.6, pass: 89, prev: 72.4, delta: '+1.2', up: true },
    { id: 'phy', name: 'Physics', avg: 71.2, pass: 86, prev: 70.4, delta: '+0.8', up: true },
    { id: 'eng', name: 'English', avg: 70.8, pass: 88, prev: 69.7, delta: '+1.1', up: true },
    { id: 'gm', name: 'General Math', avg: 69.7, pass: 84, prev: 70.9, delta: '-1.2', up: false, warn: true },
    { id: 'che', name: 'Chemistry', avg: 68.8, pass: 82, prev: 70.2, delta: '-1.4', up: false, warn: true },
    { id: 'hm', name: 'Higher Math', avg: 62.8, pass: 77, prev: 65.9, delta: '-3.1', up: false, warn: true },
  ],
  topStudents: [
    { name: 'Nusrat Jahan Ritu', batch: 'Class 10 Science · A', cls: 'c10', score: 96.5, delta: '+1.1' },
    { name: 'Ishrat Jahan Dishan', batch: 'Class 12 Science · A', cls: 'c12', score: 95.2, delta: '+0.9' },
    { name: 'Tanvir Ahmed Rafi', batch: 'Class 12 Science · A', cls: 'c12', score: 94.8, delta: '+1.3' },
    { name: 'Sadia Islam Prero', batch: 'Class 11 Science · A', cls: 'c11', score: 94.1, delta: '+0.8' },
    { name: 'Arif Hossain Shanto', batch: 'Class 10 Science · A', cls: 'c10', score: 93.7, delta: '+0.7' },
    { name: 'Zarif Ahnaf', batch: 'Class 9 Science · A', cls: 'c9', score: 92.7, delta: '+1.4' },
    { name: 'Farzana Akter Mou', batch: 'Class 12 Business Studies', cls: 'c12', score: 92.6, delta: '+0.8' },
    { name: 'Tahsin Rahman', batch: 'Class 10 Science · B', cls: 'c10', score: 91.9, delta: '+1.2' },
  ],
  riskStudents: [
    { name: 'Rakibul Hasan', batch: 'Class 9 Science · B', cls: 'c9', att: 69, score: 61, reason: 'Missed 4 of the last 10 classes', due: 0 },
    { name: 'Sabbir Rahman Joy', batch: 'Class 11 Science · A', cls: 'c11', att: 67, score: 57, reason: 'Two months of fees overdue', due: 3200 },
    { name: 'Mahjabin Chowdhury', batch: 'Class 12 Science · A', cls: 'c12', att: 82, score: 58, reason: 'Higher Math score down 14 points', due: 0 },
    { name: 'Ihsan Dea', batch: 'Class 10 Business Studies', cls: 'c10', att: 65, score: 61, reason: 'Absent from 2 model tests', due: 0 },
    { name: 'Tawsif Alam', batch: 'Class 11 Science · B', cls: 'c11', att: 71, score: 56, reason: 'Failed last physics weekly test', due: 3200 },
  ],
  teachers: [
    { name: 'Tariqul Islam', initials: 'TI', subject: 'Higher Math · Class 11, 12', classes: 24, target: 20, over: true },
    { name: 'Alok Deb Ali Mamun', initials: 'AM', subject: 'Biology · Class 9, 10, 11', classes: 22, target: 20, over: true },
    { name: 'Md. Kamrul Hasan', initials: 'KH', subject: 'Physics · Class 10, 11, 12', classes: 22, target: 20, over: true },
    { name: 'Shirin Akhter', initials: 'SA', subject: 'Chemistry · Class 10, 11, 12', classes: 21, target: 20, over: true },
    { name: 'Habibur Rahman', initials: 'HR', subject: 'ICT · Class 9, 10, 11, 12', classes: 20, target: 20, over: false },
    { name: 'Mizanur Rahman', initials: 'MR', subject: 'General Math · Class 9, 10', classes: 19, target: 20, over: false },
    { name: 'Imran Hossain', initials: 'IH', subject: 'English · Class 11, 12', classes: 18, target: 20, over: false },
    { name: 'Jannatul Ferdous', initials: 'JF', subject: 'Chemistry · Class 9, 11', classes: 18, target: 20, over: false },
  ],
  schedule: [
    { time: '09:00', title: 'Class 12 Science - A · Physics', meta: 'Md. Kamrul Hasan · Room 2 · Class 12', status: 'done' },
    { time: '10:30', title: 'Weekly Test 03 · Chemistry', meta: 'Class 12 Science - B · 32 students · Class 12', status: 'done' },
    { time: '14:00', title: 'HSC Model Test 02 · General Math', meta: 'Class 12 · 128 students · Class 12', status: 'live' },
    { time: '16:00', title: 'Class 9 Science - A · Higher Math', meta: 'Shamim Akhter · Room 1 · Class 9', status: 'next' },
    { time: '17:30', title: 'Class 11 Science - A · Higher Math', meta: 'Tariqul Islam · Room 3 · Class 11', status: 'next' },
    { time: '18:30', title: 'Class 12 Business Studies · Accounting', meta: 'Sumaiya Begum · Room 2 · Class 12', status: 'next' },
    { time: '19:30', title: 'Class 9 Business Studies · English', meta: 'Imran Hossain · Room 1 · Class 9', status: 'next' },
  ],
  exams: [
    { day: '23', month: 'SEP', title: 'Class 11 Monthly Test - Chemistry', meta: 'Science A & B · 68 students' },
    { day: '24', month: 'SEP', title: 'Class 9 Weekly Test - General Math', meta: 'All batches · 64 students' },
    { day: '26', month: 'SEP', title: 'HSC Model Test 03 - Physics 1st paper', meta: 'Class 12 Science · 72 students' },
    { day: '27', month: 'SEP', title: 'SSC Model Test 02 - English', meta: 'Class 10 · 128 students' },
  ],
  academicBatches: [
    { id: '10a', name: 'Class 10 Science - A', group: 'Science', students: 32, score: 82.2, att: 91 },
    { id: '12a', name: 'Class 12 Science - A', group: 'Science', students: 32, score: 79.4, att: 89 },
    { id: '9a', name: 'Class 9 Science - A', group: 'Science', students: 31, score: 76.1, att: 88 },
    { id: '10b', name: 'Class 10 Science - B', group: 'Science', students: 32, score: 75.8, att: 87 },
    { id: '11a', name: 'Class 11 Science - A', group: 'Science', students: 31, score: 73.9, att: 86 },
    { id: '12c', name: 'Class 12 Business - C', group: 'Business Studies', students: 29, score: 72.1, att: 82 },
    { id: '9b', name: 'Class 9 Science - B', group: 'Science', students: 32, score: 71.4, att: 82 },
  ],
  activity: [
    { id: 'ac1', time: '2 min ago', type: 'payment', title: '৳3,500 received via bKash', detail: 'Naeem Akhter · Class 12 Science · A', cls: 'c12' },
    { id: 'ac2', time: '7 min ago', type: 'admission', title: 'New admission', detail: 'Ayesha Siddika · Class 9 Science · B', cls: 'c9' },
    { id: 'ac3', time: '18 min ago', type: 'attendance', title: 'Attendance marked: 28 of 32 present', detail: 'Class 11 Science · B · Ishtiaq Ahmed', cls: 'c11' },
    { id: 'ac4', time: '31 min ago', type: 'payment', title: '৳8,000 received via bank transfer', detail: 'Mrs. Jahan (father: Tahir) · Class 10 Science · A (3 months)', cls: 'c10' },
    { id: 'ac5', time: '52 min ago', type: 'result', title: 'Results published: Weekly Test 11', detail: 'Class 9 Science · B · average 71%', cls: 'c9' },
    { id: 'ac6', time: '1h ago', type: 'sms', title: 'Fee reminder SMS sent to 28 guardians', detail: 'September dues · run 2 reminder', cls: 'c12' },
  ],
  livePool: [
    { type: 'payment', title: '৳3,200 received via bKash', detail: 'Mahir Faisal · Class 11 Science · A', cls: 'c11' },
    { type: 'attendance', title: 'Late check-in', detail: 'Omar Faruk · Class 12 Science · B', cls: 'c12' },
    { type: 'payment', title: '৳2,500 received via Nagad', detail: 'Labiba Anjum · Class 10 Business Studies', cls: 'c10' },
    { type: 'admission', title: 'Trial class booked', detail: 'Guardian of Raihan Kabir · Class 9 Science', cls: 'c9' },
  ],
  alerts: [
    { id: 'al1', tone: 'danger', tag: 'OVERDUE', title: '51 students are 30+ days overdue', body: '৳2.06 L unpaid from August or earlier. Class 11 (14) and Class 12 (14) hold the most.', action: 'Send reminders', cls: 'all', audience: 'fees' },
    { id: 'al2', tone: 'warn', tag: 'NEEDS ATTENTION', title: 'Class 11 Science - B attendance fell to 78%', body: 'Down 8 points in two weeks. 6 students missed 3+ classes.', action: 'Review batch', cls: 'c11', audience: 'academic' },
    { id: 'al3', tone: 'warn', tag: 'NEEDS ATTENTION', title: '6 test results not yet published', body: 'Papers held 12–17 Sep are waiting for mark entry.', action: 'Remind teachers', cls: 'all', audience: 'academic' },
    { id: 'al4', tone: 'info', tag: 'OPPORTUNITY', title: 'Class 10 Science - A is full', body: '32 of 32 seats. Open batch Class 10C for waitlist.', action: 'Plan new batch', cls: 'c10', audience: 'ops' },
  ],
  payments: [
    { id: 'bkash', label: 'bKash', amount: 7.0, txns: 272, color: '#fdc500' },
    { id: 'cash', label: 'Cash', amount: 3.7, txns: 142, color: '#00296b' },
    { id: 'nagad', label: 'Nagad', amount: 2.7, txns: 108, color: '#8fb3de' },
    { id: 'bank', label: 'Bank transfer', amount: 1.8, txns: 19, color: '#00509d' },
  ],
  funnel: [
    { id: 'inq', label: 'Inquiries', value: 96 },
    { id: 'cou', label: 'Counselling done', value: 66 },
    { id: 'tri', label: 'Trial class attended', value: 51 },
    { id: 'adm', label: 'Admitted', value: 40 },
  ],
  hourly: [180, 420, 310, 150, 90, 260, 380, 560, 610, 420, 210, 95, 40],
  hours: ['8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p'],
  today: { collections: 0.72, admissions: 2, nowHourIndex: 8 },
  notifications: [
    { id: 'n1', title: 'bKash settlement received', body: '৳70,000 settled to the centre account', time: '12 min', unread: true, tone: 'ok' },
    { id: 'n2', title: 'Low attendance warning', body: 'Class 11 Science · B is below 80%', time: '40 min', unread: true, tone: 'warn' },
    { id: 'n3', title: 'Question paper uploaded', body: 'SSC Model Test 04 · English by Nasrin Sultana', time: '2 hr', unread: true, tone: 'info' },
    { id: 'n4', title: 'Monthly report ready', body: 'August 2026 centre summary is ready to review', time: 'Yesterday', unread: false, tone: 'info' },
  ],
};

export const NAV = [
  { id: 'dashboard', label: 'Dashboard', bn: 'ড্যাশবোর্ড', icon: 'dashboard' },
  { id: 'students', label: 'Students', bn: 'শিক্ষার্থী', icon: 'users' },
  { id: 'batches', label: 'Batches', bn: 'ব্যাচ', icon: 'layers' },
  { id: 'attendance', label: 'Attendance', bn: 'উপস্থিতি', icon: 'calcheck' },
  { id: 'fees', label: 'Fees & Payments', bn: 'ফি ও পেমেন্ট', icon: 'wallet' },
  { id: 'exams', label: 'Exams & Results', bn: 'পরীক্ষা ও ফলাফল', icon: 'grad' },
  { id: 'teachers', label: 'Teachers', bn: 'শিক্ষক', icon: 'teacher' },
  { id: 'communication', label: 'Communication', bn: 'যোগাযোগ', icon: 'message' },
  { id: 'reports', label: 'Reports', bn: 'রিপোর্ট', icon: 'chart' },
  { id: 'settings', label: 'Settings', bn: 'সেটিংস', icon: 'sliders' },
];

export const CONCEPTS = [
  { id: 'executive', n: '01', name: 'Executive Command Center', desc: 'Calm, structured overview for owners and directors', who: 'Owner · Director' },
  { id: 'academic', n: '02', name: 'Academic Performance Hub', desc: 'Students, attendance, exams and teachers', who: 'Admin · Centre manager · Teacher' },
  { id: 'pulse', n: '03', name: 'Visual Operations Pulse', desc: 'Today at a glance: live, visual, actionable', who: 'Manager · Accountant · Front desk' },
];

export const RANGES = [
  { id: 'month', label: 'This month', sub: '1–21 Sep 2026', n: 1 },
  { id: 'q', label: 'Last 3 months', sub: 'Jul–Sep 2026', n: 3 },
  { id: 'h', label: 'Last 6 months', sub: 'Apr–Sep 2026', n: 6 },
  { id: 'y', label: 'Last 12 months', sub: 'Oct 2025–Sep 2026', n: 12 },
];

export const QUICK = [
  { id: 'admit', label: 'Admit a student', icon: 'userplus' }, { id: 'fee', label: 'Collect a fee', icon: 'banknote' },
  { id: 'att', label: 'Mark attendance', icon: 'calcheck' }, { id: 'exam', label: 'Schedule an exam', icon: 'grad' },
  { id: 'sms', label: 'Send SMS to guardians', icon: 'send' }, { id: 'batch', label: 'Create a batch', icon: 'layers' },
];

export const ACT_ICON: Record<string, string> = { payment: 'banknote', admission: 'userplus', attendance: 'calcheck', result: 'award', sms: 'send' };
export const ACT_TONE: Record<string, string> = { payment: 'cyan', admission: 'gold', attendance: 'teal', result: 'teal', sms: 'pink' };

export const clsName = (id: string) => {
  const b = DATA.classes.find((x: any) => x.id === id);
  return b ? b.name : 'All classes';
};

/* ---------- 2b. ROSTER + FEE LEDGER (deterministic demo data) ---------- */
export const FEE_MONTHS = ['Jun', 'Jul', 'Aug', 'Sep'];
export const MONTH_LONG: Record<string, string> = { Jun: 'June', Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October' };
export const FEES: Record<string, number> = { c9: 2800, c10: 3000, c11: 3200, c12: 3500 };
export const ADMISSION_FEE = 5000;
export const feeFor = (cls: string, program: string) => FEES[cls] - (program === 'sci' ? 0 : 400);
export const PROGRAM_LABEL: Record<string, string> = { sci: 'Science', bus: 'Business Studies', hum: 'Humanities' };

const CASHIER = 'Rehana Parvin · front desk';
const NAME_BANK = {
  boys: ['Tanvir', 'Arif', 'Rakib', 'Sabbir', 'Mahir', 'Zarif', 'Rifat', 'Omar', 'Tahsin', 'Raihan', 'Nafis', 'Ayaan', 'Farhan', 'Sakib', 'Imtiaz', 'Nayeem', 'Rafsan', 'Tamim', 'Sadman', 'Fahim', 'Ashik', 'Mehedi', 'Jubayer', 'Sifat', 'Tawsif', 'Shafin', 'Rakibul', 'Mahfuz', 'Nabil', 'Adnan'],
  girls: ['Nusrat', 'Ishrat', 'Sadia', 'Farzana', 'Samiha', 'Labiba', 'Nabila', 'Mehjabin', 'Tasnim', 'Ayesha', 'Raisa', 'Tahmina', 'Sumaiya', 'Anika', 'Fariha', 'Nowshin', 'Maliha', 'Jannat', 'Sanjida', 'Tanha', 'Lamia', 'Afsana', 'Tasfia', 'Nishat', 'Zerin', 'Maisha', 'Sabrina', 'Tabassum', 'Rafia', 'Ishita'],
  hinduBoys: ['Pritom', 'Arnob', 'Anik', 'Shuvo', 'Joy', 'Sourav', 'Dipto'], hinduGirls: ['Priyanka', 'Riya', 'Sraboni', 'Orpa', 'Mithila', 'Puja', 'Tithi'],
  surnames: ['Hossain', 'Rahman', 'Islam', 'Ahmed', 'Chowdhury', 'Khan', 'Haque', 'Siddique', 'Karim', 'Uddin', 'Sarker', 'Talukder', 'Bhuiyan', 'Alam', 'Kabir', 'Hasan', 'Mahmud', 'Mollah'],
  girlSurnames: ['Akter', 'Sultana', 'Jahan', 'Islam', 'Rahman', 'Chowdhury', 'Haque', 'Khan', 'Tasnim', 'Ahmed'],
  hinduSurnames: ['Das', 'Saha', 'Roy', 'Paul', 'Dey', 'Sarkar'],
  fathers: ['Abdul Karim', 'Rafiqul', 'Shahidul', 'Nurul', 'Anwar', 'Jahangir', 'Mizanur', 'Habibur', 'Kamal', 'Delwar', 'Alamgir', 'Monirul', 'Selim', 'Faruk', 'Aminul', 'Mostafa'],
  hinduFathers: ['Sujit', 'Pradip', 'Tapan', 'Gopal', 'Ashok', 'Bimal'],
  mothers: ['Rehana', 'Shahana', 'Nasima', 'Rokeya', 'Salma', 'Farida', 'Parvin', 'Nazma'],
};

function buildRoster() {
  const r = seeded(20260921);
  const pick = (a: string[]) => a[Math.floor(r() * a.length)];
  const dig = (n: number) => Array.from({ length: n }, () => Math.floor(r() * 10)).join('');
  const special: Record<string, any[]> = {};
  DATA.topStudents.forEach((s: any) => { (special[s.batch] = special[s.batch] || []).push({ name: s.name, score: s.score, att: 93 + Math.round(r() * 5), months: 0 }); });
  DATA.riskStudents.forEach((s: any) => { (special[s.batch] = special[s.batch] || []).push({ name: s.name, score: s.score, att: s.att, dueAmt: s.due }); });
  const girlSet = new Set(NAME_BANK.girls.concat(NAME_BANK.hinduGirls, ['Mehjabin', 'Priyanka']));
  const seq: Record<string, number> = { c9: 0, c10: 0, c11: 0, c12: 0 };
  const students: any[] = [];
  DATA.batches.forEach((b: any) => {
    const sp = special[b.name] || [];
    const fee = feeFor(b.cls, b.program);
    for (let i = 0; i < b.enrolled; i++) {
      const s0 = sp[i];
      const hindu = s0 ? /\b(Das|Saha|Roy|Paul)\b/.test(s0.name) : r() < 0.1;
      let girl: boolean, name: string;
      if (s0) { name = s0.name; girl = girlSet.has(name.split(' ')[0]); }
      else {
        girl = r() < 0.48;
        const first = hindu ? pick(girl ? NAME_BANK.hinduGirls : NAME_BANK.hinduBoys) : pick(girl ? NAME_BANK.girls : NAME_BANK.boys);
        name = first + ' ' + (hindu ? pick(NAME_BANK.hinduSurnames) : pick(girl ? NAME_BANK.girlSurnames : NAME_BANK.surnames));
      }
      const last = name.split(' ').slice(-1)[0];
      const famName = hindu ? last : (['Akter', 'Sultana', 'Jahan', 'Tasnim', 'Mim', 'Mou', 'Prova', 'Oishee'].includes(last) ? pick(NAME_BANK.surnames) : last);
      const mother = r() < 0.22;
      const guardian = mother ? pick(NAME_BANK.mothers) + ' Begum' : (hindu ? pick(NAME_BANK.hinduFathers) : 'Md. ' + pick(NAME_BANK.fathers)) + ' ' + famName;
      const att = s0 ? s0.att : Math.round(Math.max(52, Math.min(100, b.att + (r() - 0.5) * 16 - (r() < 0.04 ? 18 : 0))));
      const score = s0 ? s0.score : Math.round(Math.max(34, Math.min(98, b.score + (r() - 0.5) * 28)) * 10) / 10;
      let months = 0;
      if (s0 && s0.dueAmt != null) months = s0.dueAmt ? Math.min(4, Math.max(1, Math.round(s0.dueAmt / fee))) : 0;
      else if (!s0) { const q = r(); months = q < 0.009 ? 4 : q < 0.028 ? 3 : q < 0.081 ? 2 : q < 0.14 ? 1 : 0; }
      if (b.cls === 'c11') months = Math.min(months, 3);
      seq[b.cls] += 1;
      students.push({
        id: 'AL-' + b.cls.slice(1).padStart(2, '0') + '-' + String(seq[b.cls]).padStart(3, '0'), name, gender: girl ? 'F' : 'M', cls: b.cls, batch: b.id, batchName: b.name, program: b.program,
        guardian, relation: mother ? 'Mother' : 'Father', phone: '01' + pick(['3', '4', '5', '6', '7', '8', '9']) + dig(2) + '-' + dig(6),
        att, score, fee, dueMonths: FEE_MONTHS.slice(4 - months), admitted: null as string | null, isNew: false, seed: Math.floor(r() * 1e9),
      });
    }
  });
  DATA.classes.forEach((c: any) => {
    const list = students.filter((s) => s.cls === c.id && !s.dueMonths.length && !DATA.topStudents.some((t: any) => t.name === s.name));
    for (let k = 0; k < c.admissions && k < list.length; k++) { const s = list[list.length - 1 - k]; s.isNew = true; s.admitted = (1 + Math.floor(r() * 21)) + ' Sep 2026'; }
    students.filter((s) => s.cls === c.id && !s.admitted).forEach((s) => { s.admitted = (c.id === 'c9' || c.id === 'c11' ? (1 + Math.floor(r() * 28)) + ' Jan 2026' : (1 + Math.floor(r() * 28)) + ' Jan 2025'); });
    if (c.id === 'c11') students.filter((s) => s.cls === 'c11' && !s.isNew).forEach((s) => { s.admitted = (1 + Math.floor(r() * 28)) + ' Jul 2026'; });
  });
  const pays: any[] = [];
  const method = () => { const q = r(); return q < 0.46 ? 'bkash' : q < 0.70 ? 'cash' : q < 0.88 ? 'nagad' : 'bank'; };
  const txnFor = (m: string) => (m === 'bkash' ? 'BK' : m === 'nagad' ? 'NG' : m === 'bank' ? 'DBBL' : '') + (m === 'cash' ? '' : Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(r() * 32)]).join(''));
  students.forEach((s) => {
    ['Jul', 'Aug', 'Sep'].forEach((mo) => {
      if (s.dueMonths.includes(mo)) return;
      if (s.isNew && mo !== 'Sep') return;
      if (s.cls === 'c11' && mo === 'Jun') return;
      const m = method();
      const day = mo === 'Sep' ? (s.isNew ? parseInt(s.admitted, 10) : (r() < 0.035 ? 21 : 1 + Math.floor(Math.pow(r(), 1.9) * 20))) : 1 + Math.floor(Math.pow(r(), 1.7) * 27);
      pays.push({ studentId: s.id, name: s.name, cls: s.cls, batchName: s.batchName, month: mo, day, purpose: 'Monthly fee · ' + mo, amount: s.fee, method: m, txn: txnFor(m), by: m === 'cash' ? CASHIER : 'Auto-verified' });
    });
    if (s.isNew) pays.push({ studentId: s.id, name: s.name, cls: s.cls, batchName: s.batchName, month: 'Sep', day: parseInt(s.admitted, 10), purpose: 'Admission fee', amount: ADMISSION_FEE, method: 'cash', txn: '', by: CASHIER });
  });
  const mIdx: Record<string, number> = { Jul: 7, Aug: 8, Sep: 9 };
  pays.sort((a, z) => mIdx[a.month] - mIdx[z.month] || a.day - z.day);
  const counter: Record<string, number> = {};
  pays.forEach((p) => { counter[p.month] = (counter[p.month] || 0) + 1; p.receipt = 'RC-26' + String(mIdx[p.month]).padStart(2, '0') + '-' + String(counter[p.month]).padStart(4, '0'); p.date = String(p.day).padStart(2, '0') + ' ' + p.month + ' 2026'; p.id = p.receipt; });
  return { students, payments: pays.reverse() };
}
export const ROSTER = buildRoster();

(function deriveFromRoster() {
  const S = ROSTER.students;
  const sep = ROSTER.payments.filter((p: any) => p.month === 'Sep' && p.purpose.indexOf('Monthly') === 0);
  DATA.classes.forEach((c: any) => {
    const st = S.filter((s: any) => s.cls === c.id);
    c.students = st.length;
    c.batches = DATA.batches.filter((b: any) => b.cls === c.id).length;
    c.billed = Math.round(sum(st.map((s: any) => s.fee)) / 1000) / 100;
    c.collected = Math.round(sum(sep.filter((p: any) => p.cls === c.id).map((p: any) => p.amount)) / 1000) / 100;
    c.outstanding = Math.round(sum(st.map((s: any) => s.fee * s.dueMonths.length)) / 1000) / 100;
    c.overdue = st.filter((s: any) => s.dueMonths.length >= 2).length;
  });
  const bucket: Record<string, number> = { Sep: 0, Aug: 1, Jul: 2, Jun: 3 };
  DATA.aging.forEach((a: any) => { a.amount = 0; });
  S.forEach((s: any) => s.dueMonths.forEach((m: string) => { DATA.aging[bucket[m]].amount += s.fee / 100000; }));
  DATA.aging.forEach((a: any) => { a.amount = Math.round(a.amount * 100) / 100; });
  DATA.payments.forEach((p: any) => { const ps = sep.filter((x: any) => x.method === p.id); p.amount = Math.round(sum(ps.map((x: any) => x.amount)) / 1000) / 100; p.txns = ps.length; });
  const today = sep.filter((p: any) => p.day === 21);
  DATA.today.collections = Math.round(sum(today.map((p: any) => p.amount)) / 1000) / 100;
  DATA.today.admissions = S.filter((s: any) => s.admitted === '21 Sep 2026').length || 1;
  const coll = sum(DATA.classes.map((c: any) => c.collected));
  DATA.series.collected[11] = coll;
  DATA.series.billed[11] = sum(DATA.classes.map((c: any) => c.billed));
  DATA.series.collectedSameDayLastMonth = Math.round(coll * 0.94 * 10) / 10;
  const od = S.filter((s: any) => s.dueMonths.length >= 2);
  const odAmt = sum(DATA.aging.slice(1).map((a: any) => a.amount));
  const byCls = DATA.classes.map((c: any) => ({ n: c.name, v: od.filter((s: any) => s.cls === c.id).length })).sort((a: any, z: any) => z.v - a.v);
  const al = DATA.alerts.find((a: any) => a.id === 'al1');
  al.title = od.length + ' students are 30+ days overdue';
  al.body = '৳' + odAmt.toFixed(2) + ' L unpaid from August or earlier. ' + byCls[0].n + ' (' + byCls[0].v + ') and ' + byCls[1].n + ' (' + byCls[1].v + ') hold the most.';
  DATA.riskStudents.forEach((rs: any) => { const s = S.find((x: any) => x.name === rs.name); if (s) rs.due = s.fee * s.dueMonths.length; });
})();

/* ---------- 2c. TEACHERS, TIMETABLES, EXAMS, ATTENDANCE REGISTER ---------- */
DATA.teachers = DATA.teachers.concat([
  { name: 'Probir Kumar Saha', subject: 'General Math', classes: 20, teaches: ['c9', 'c10'] }, { name: 'Kazi Nazmul Haque', subject: 'Physics', classes: 19, teaches: ['c12'] },
  { name: 'Rashedul Karim', subject: 'Higher Math', classes: 18, teaches: ['c9', 'c10'] }, { name: 'Farhana Yasmin', subject: 'Biology', classes: 16, teaches: ['c9', 'c10'] },
  { name: 'Sadia Afrin', subject: 'English', classes: 16, teaches: ['c11', 'c12'] }, { name: 'Moushumi Akter', subject: 'Bangla', classes: 15, teaches: ['c11', 'c12'] },
  { name: 'Sajjad Hossain', subject: 'ICT', classes: 12, teaches: ['c11', 'c12'] }, { name: 'Nazmun Nahar', subject: 'History', classes: 11, teaches: ['c9', 'c10', 'c11', 'c12'] },
  { name: 'Tahmina Rahman', subject: 'Finance & Banking', classes: 10, teaches: ['c11', 'c12'] }, { name: 'Mahbub Alam', subject: 'Business Entrepreneurship', classes: 10, teaches: ['c9', 'c10'] },
  { name: 'Lutfor Rahman', subject: 'Civics', classes: 9, teaches: ['c11', 'c12'] }, { name: 'Ruksana Parvin', subject: 'Geography', classes: 8, teaches: ['c9', 'c10', 'c11', 'c12'] },
]);
(function enrichTeachers() {
  const r = seeded(424242);
  const dig = (n: number) => Array.from({ length: n }, () => Math.floor(r() * 10)).join('');
  DATA.teachers.forEach((t: any, i: number) => {
    t.id = 'T-' + String(i + 1).padStart(2, '0');
    t.type = t.classes >= 16 ? 'Full-time' : 'Part-time';
    t.phone = '01' + ['7', '8', '9', '5', '6', '3'][Math.floor(r() * 6)] + dig(2) + '-' + dig(6);
    t.joined = String(2016 + Math.floor(r() * 9));
    t.onTime = Math.round(86 + r() * 14);
    t.batches = DATA.batches.filter((b: any) => b.teacher === t.name).map((b: any) => b.id);
    const lead = DATA.batches.filter((b: any) => b.teacher === t.name);
    const subj = DATA.subjects.find((s: any) => s.name === t.subject);
    t.avgScore = lead.length ? Math.round((sum(lead.map((b: any) => b.score * b.enrolled)) / sum(lead.map((b: any) => b.enrolled))) * 10) / 10 : subj ? subj.avg : Math.round((64 + r() * 12) * 10) / 10;
    t.students = lead.length ? sum(lead.map((b: any) => b.enrolled)) : Math.round(40 + r() * 80);
  });
})();

export const DAY_NAMES = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'];
const SUBJECTS_BY_PROGRAM: Record<string, string[]> = { sci: ['Physics', 'Chemistry', 'Higher Math', 'Biology', 'English', 'ICT'], bus: ['Accounting', 'Finance & Banking', 'General Math', 'English', 'Business Entrepreneurship', 'Bangla'], hum: ['History', 'Geography', 'Civics', 'English', 'Bangla', 'General Math'] };
(function enrichBatches() {
  const rooms = ['Room 1', 'Room 2', 'Room 3', 'Room 4', 'Room 5', 'Lab 1'];
  DATA.batches.forEach((b: any, i: number) => {
    const [days, time] = b.time.split(' · ');
    b.days = days; b.clock = time; b.room = rooms[i % rooms.length];
    b.dayList = days === 'Sat–Thu' ? DAY_NAMES.slice() : days === 'Sat–Wed' ? DAY_NAMES.slice(0, 5) : DAY_NAMES.slice(1);
    const subs = SUBJECTS_BY_PROGRAM[b.program];
    b.timetable = b.dayList.map((d: string, k: number) => ({ day: d, subject: subs[(k + i) % subs.length] }));
    b.fee = feeFor(b.cls, b.program);
    const [hh, rest] = time.split(':');
    const pm = /pm/.test(rest);
    b.minutes = ((parseInt(hh, 10) % 12) + (pm ? 12 : 0)) * 60 + parseInt(rest, 10);
  });
})();

export const GRADES: [number, string, number][] = [[80, 'A+', 5.0], [70, 'A', 4.0], [60, 'A-', 3.5], [50, 'B', 3.0], [40, 'C', 2.0], [33, 'D', 1.0], [0, 'F', 0.0]];
export const gradeOf = (pct: number) => GRADES.find((g) => pct >= g[0])!;

export const EXAMS: any[] = (function buildExams() {
  const list: any[] = [];
  const add = (o: any) => list.push(Object.assign({ id: 'EX-' + String(list.length + 1).padStart(3, '0'), fullMarks: 50, type: 'Weekly test' }, o));
  const bIds = (cls: string, prog?: string) => DATA.batches.filter((b: any) => b.cls === cls && (!prog || b.program === prog)).map((b: any) => b.id);
  add({ title: 'Weekly Test 11 · Physics', subject: 'Physics', cls: 'c10', batches: bIds('c10', 'sci'), date: '3 Sep', ord: 3, status: 'published' });
  add({ title: 'Monthly Test · Higher Math', subject: 'Higher Math', cls: 'c11', batches: bIds('c11', 'sci'), date: '5 Sep', ord: 5, status: 'published', fullMarks: 100, type: 'Monthly test' });
  add({ title: 'Weekly Test 10 · Accounting', subject: 'Accounting', cls: 'c12', batches: bIds('c12', 'bus'), date: '6 Sep', ord: 6, status: 'published' });
  add({ title: 'SSC Model Test 02 · English', subject: 'English', cls: 'c10', batches: bIds('c10'), date: '7 Sep', ord: 7, status: 'published', fullMarks: 100, type: 'Model test' });
  add({ title: 'Weekly Test 11 · Science', subject: 'Physics', cls: 'c9', batches: bIds('c9', 'sci'), date: '9 Sep', ord: 9, status: 'published' });
  add({ title: 'HSC Model Test 01 · Chemistry 1st paper', subject: 'Chemistry', cls: 'c12', batches: bIds('c12', 'sci'), date: '10 Sep', ord: 10, status: 'published', fullMarks: 100, type: 'Model test' });
  add({ title: 'Weekly Test 11 · Bangla', subject: 'Bangla', cls: 'c9', batches: bIds('c9', 'hum').concat(bIds('c9', 'bus')), date: '12 Sep', ord: 12, status: 'published' });
  add({ title: 'Weekly Test 12 · Biology', subject: 'Biology', cls: 'c11', batches: bIds('c11', 'sci'), date: '13 Sep', ord: 13, status: 'published' });
  add({ title: 'Weekly Test 12 · Higher Math', subject: 'Higher Math', cls: 'c10', batches: ['10a', '10b'], date: '14 Sep', ord: 14, status: 'awaiting' });
  add({ title: 'Weekly Test 12 · Physics', subject: 'Physics', cls: 'c11', batches: ['11b'], date: '16 Sep', ord: 16, status: 'awaiting' });
  add({ title: 'Weekly Test 12 · General Math', subject: 'General Math', cls: 'c9', batches: ['9c', '9h'], date: '17 Sep', ord: 17, status: 'awaiting' });
  add({ title: 'Weekly Test 12 · Chemistry', subject: 'Chemistry', cls: 'c12', batches: ['12a'], date: '21 Sep', ord: 21, status: 'awaiting', time: '10:30 am', note: 'Held this morning · scripts with Shirin Akter' });
  add({ title: 'SSC Model Test 03 · General Math', subject: 'General Math', cls: 'c10', batches: bIds('c10', 'sci'), date: '21 Sep', ord: 21.5, status: 'today', time: '3:00 pm', fullMarks: 100, type: 'Model test', note: 'In progress · Hall A and B' });
  add({ title: 'Class 11 Monthly Test · Chemistry', subject: 'Chemistry', cls: 'c11', batches: ['11a', '11b'], date: '22 Sep', ord: 22, status: 'upcoming', fullMarks: 100, type: 'Monthly test', time: '3:00 pm' });
  add({ title: 'Class 9 Weekly Test · General Math', subject: 'General Math', cls: 'c9', batches: bIds('c9'), date: '24 Sep', ord: 24, status: 'upcoming', time: '4:00 pm' });
  add({ title: 'HSC Model Test 02 · Physics 1st paper', subject: 'Physics', cls: 'c12', batches: bIds('c12', 'sci'), date: '26 Sep', ord: 26, status: 'upcoming', fullMarks: 100, type: 'Model test', time: '9:00 am' });
  add({ title: 'SSC Model Test 04 · English', subject: 'English', cls: 'c10', batches: bIds('c10'), date: '27 Sep', ord: 27, status: 'upcoming', fullMarks: 100, type: 'Model test', time: '9:00 am' });
  add({ title: 'HSC Model Test 02 · Accounting', subject: 'Accounting', cls: 'c12', batches: bIds('c12', 'bus'), date: '29 Sep', ord: 29, status: 'upcoming', fullMarks: 100, type: 'Model test', time: '3:00 pm' });
  add({ title: 'Class 9 Quiz 05 · Science', subject: 'Biology', cls: 'c9', batches: bIds('c9', 'sci'), date: '30 Sep', ord: 30, status: 'upcoming', fullMarks: 25, type: 'Quiz', time: '4:00 pm' });
  list.forEach((e, k) => {
    const r = seeded(9000 + k);
    e.students = ROSTER.students.filter((s: any) => e.batches.includes(s.batch)).map((s: any) => s.id);
    if (e.status !== 'published') return;
    e.marks = {};
    ROSTER.students.filter((s: any) => e.batches.includes(s.batch)).forEach((s: any) => {
      if (r() < 0.03) { e.marks[s.id] = 'AB'; return; }
      const pct = Math.max(12, Math.min(100, s.score + (r() - 0.5) * 36 - 3));
      e.marks[s.id] = Math.round((pct * e.fullMarks) / 100);
    });
  });
  return list;
})();

const NOW_MIN = 16 * 60 + 15;
export const ATT_TODAY: Record<string, any> = (function () {
  const reg: Record<string, any> = {};
  DATA.batches.forEach((b: any, k: number) => {
    if (b.minutes > NOW_MIN || b.id === '10c' || b.id === '12c') return;
    const r = seeded(7000 + k);
    const marks: Record<string, string> = {};
    ROSTER.students.filter((s: any) => s.batch === b.id).forEach((s: any) => { const q = r() * 100; marks[s.id] = q < s.att ? (r() < 0.05 ? 'L' : 'P') : 'A'; });
    reg[b.id] = { marks, by: b.teacher, at: (Math.floor((b.minutes + 12) / 60) % 12 || 12) + ':' + String((b.minutes + 12) % 60).padStart(2, '0') + (b.minutes + 12 >= 720 ? ' pm' : ' am') };
  });
  return reg;
})();
(function syncAlerts() {
  const aw = EXAMS.filter((e) => e.status === 'awaiting');
  const al = DATA.alerts.find((a: any) => a.id === 'al3');
  al.title = aw.length + ' test results not yet published';
  al.body = 'Papers held ' + aw[0].date.split(' ')[0] + '–' + aw[aw.length - 1].date + ' are waiting for marks entry.';
})();

/* ---------- 2d. COMMUNICATION (demo) ---------- */
(function enrichContacts() {
  const r = seeded(5150);
  ROSTER.students.forEach((s: any) => {
    s.whatsapp = r() < 0.82;
    const first = s.guardian.replace(/^Md\.\s*/, '').split(' ')[0].toLowerCase();
    s.email = r() < 0.58 ? first + '.' + s.name.split(' ').slice(-1)[0].toLowerCase() + (Math.floor(r() * 90) + 10) + '@gmail.com' : '';
  });
})();

export const CHANNELS = [
  { id: 'sms', label: 'SMS', icon: 'message', note: 'Every guardian · ৳0.35 per segment (demo rate)', rate: 0.35 },
  { id: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp', note: 'Guardians who opted in · ৳0.80 per message (demo rate)', rate: 0.8 },
  { id: 'email', label: 'Email', icon: 'mail', note: 'Guardians with an email address · free', rate: 0 },
  { id: 'phone', label: 'Phone call', icon: 'phone', note: 'Adds guardians to today’s call list', rate: 0 },
];

export const TEMPLATES = [
  { id: 'fee', label: 'Fee reminder', subject: 'Tuition fee reminder · {months}', en: "Dear {guardian}, {student}'s tuition fee of {amount} for {months} is due. Please pay by bKash, Nagad or at the front desk. – Alokito Coaching, Dhanmondi", bn: 'সম্মানিত অভিভাবক, {student}-এর {months} মাসের বেতন {amount} বকেয়া আছে। অনুগ্রহ করে বিকাশ, নগদ বা অফিসে পরিশোধ করুন। – আলোকিত কোচিং' },
  { id: 'absent', label: 'Absence alert', subject: '{student} was absent today', en: 'Dear {guardian}, {student} was absent from {batch} today ({date}). Please contact us if this is unexpected. – Alokito Coaching', bn: 'সম্মানিত অভিভাবক, আজ ({date}) {student} {batch} ক্লাসে অনুপস্থিত ছিল। প্রয়োজনে আমাদের সাথে যোগাযোগ করুন। – আলোকিত কোচিং' },
  { id: 'result', label: 'Result published', subject: '{exam} results', en: 'Dear {guardian}, {student} scored {marks} in {exam} (grade {grade}). Ask us for the full answer script review. – Alokito Coaching', bn: '' },
  { id: 'exam', label: 'Exam reminder', subject: 'Reminder: {exam} on {examDate}', en: 'Reminder: {exam} is on {examDate}. Please make sure {student} arrives 15 minutes early with a calculator and admit card. – Alokito Coaching', bn: '' },
  { id: 'notice', label: 'General notice', subject: 'Notice from Alokito Coaching', en: 'Dear {guardian}, [write your notice here]. – Alokito Coaching, Dhanmondi', bn: '' },
];

export const MSG_LOG = [
  { id: 'm1', when: '21 Sep · 2:05 PM', channel: 'sms', template: 'Fee reminder', audience: 'Guardians with dues · Class 9–12', sent: 91, delivered: 88, read: null, by: 'Rehana Parvin', cost: 63.7 },
  { id: 'm2', when: '21 Sep · 12:40 PM', channel: 'whatsapp', template: 'Result published', audience: 'Class 9 Science · Weekly Test 11', sent: 94, delivered: 92, read: 81, by: 'Md. Kamrul Hasan', cost: 75.2 },
  { id: 'm3', when: '21 Sep · 10:20 AM', channel: 'sms', template: 'Absence alert (automatic)', audience: 'Absent in morning batches', sent: 9, delivered: 9, read: null, by: 'System', cost: 6.3 },
  { id: 'm4', when: '20 Sep · 6:30 PM', channel: 'email', template: 'August progress report', audience: 'All guardians with email', sent: 371, delivered: 362, read: 204, by: 'Farhana Rahman', cost: 0 },
  { id: 'm5', when: '19 Sep · 5:10 PM', channel: 'whatsapp', template: 'Exam reminder', audience: 'Class 10 · SSC Model Test 03', sent: 148, delivered: 146, read: 139, by: 'Shirin Akter', cost: 118.4 },
  { id: 'm6', when: '18 Sep · 11:00 AM', channel: 'sms', template: 'General notice', audience: 'All guardians · schedule change', sent: 640, delivered: 628, read: null, by: 'Farhana Rahman', cost: 448 },
  { id: 'm7', when: '15 Sep · 4:45 PM', channel: 'sms', template: 'Fee reminder', audience: 'Guardians with dues · Class 9–12', sent: 142, delivered: 139, read: null, by: 'Rehana Parvin', cost: 99.4 },
];

export const CALL_LOG = [
  { id: 'c1', when: '21 Sep · 1:15 PM', guardian: 'Rokeya Begum', student: 'Ayaan Kabir', reason: 'Fees 3 months overdue', outcome: 'Promised to pay', note: 'Will pay by bKash on 25 Sep', by: 'Rehana Parvin' },
  { id: 'c2', when: '21 Sep · 12:50 PM', guardian: 'Md. Faruk Hasan', student: 'Anika Tasnim', reason: 'Fees 3 months overdue', outcome: 'No answer', note: '', by: 'Rehana Parvin' },
  { id: 'c3', when: '20 Sep · 5:30 PM', guardian: 'Sujit Roy', student: 'Joy Roy', reason: 'Fees 4 months overdue', outcome: 'Reached', note: 'Father travelling; mother will visit on Monday', by: 'Farhana Rahman' },
  { id: 'c4', when: '20 Sep · 4:10 PM', guardian: 'Md. Habibur Hasan', student: 'Rakibul Hasan', reason: 'Attendance 58%', outcome: 'Reached', note: 'Student unwell last week; returning Sunday', by: 'Tariqul Islam' },
];
export const OUTCOMES = ['Reached', 'Promised to pay', 'No answer', 'Call back later', 'Wrong number'];

export const STAFF = [
  { id: 'u1', name: 'Farhana Rahman', role: 'Owner', phone: '01700-000101', status: 'Active', last: 'Online now' },
  { id: 'u2', name: 'Mahmudul Karim', role: 'Centre manager', phone: '01700-000102', status: 'Active', last: 'Today, 3:52 PM' },
  { id: 'u3', name: 'Rehana Parvin', role: 'Accountant', phone: '01700-000103', status: 'Active', last: 'Online now' },
  { id: 'u4', name: 'Sohel Rana', role: 'Administrator', phone: '01700-000104', status: 'Active', last: 'Today, 11:20 AM' },
  { id: 'u5', name: 'Shirin Akter', role: 'Teacher', phone: '01700-000105', status: 'Active', last: 'Today, 3:12 PM' },
  { id: 'u6', name: 'Tariqul Islam', role: 'Teacher', phone: '01700-000106', status: 'Active', last: 'Yesterday' },
];

export function defaultSettings() {
  const monthly: Record<string, string> = {};
  DATA.classes.forEach((c: any) => { monthly[c.id + 'sci'] = String(FEES[c.id]); monthly[c.id + 'other'] = String(FEES[c.id] - 400); });
  const perms: Record<string, boolean> = {};
  const mods = ['Dashboard', 'Students', 'Batches', 'Attendance', 'Fees & Payments', 'Exams & Results', 'Teachers', 'Communication', 'Reports', 'Settings'];
  const allow: Record<string, string[]> = { Owner: mods, 'Centre manager': mods.filter((m) => m !== 'Settings'), Administrator: ['Dashboard', 'Students', 'Batches', 'Attendance', 'Exams & Results', 'Teachers', 'Communication'], Accountant: ['Dashboard', 'Students', 'Fees & Payments', 'Communication', 'Reports'], Teacher: ['Batches', 'Attendance', 'Exams & Results'] };
  Object.keys(allow).forEach((role) => mods.forEach((m) => { perms[m + '|' + role] = allow[role].includes(m); }));
  return {
    profile: { name: DATA.org.name, campus: DATA.org.campus, address: 'House 27, Road 7, Dhanmondi, Dhaka 1205', phone: '01700-000100', email: 'office@alokito.example', year: '2026' },
    fees: { monthly, dueDay: '10', lateFee: '100', sibling: '10', merit: '50', lateAuto: true, partial: false },
    comms: { senderId: 'ALOKITO', whatsapp: '01700-000199', waConnected: true, emailFrom: 'office@alokito.example', autoAbsence: true, autoResult: true, quiet: true, bnDefault: false, reminders: { r3: true, r0: true, r5: true, r15: false } },
    region: { lang: 'en', date: '21 Sep 2026', nums: 'lakh', week: 'Saturday' },
    security: { twoStep: true, otpOnly: true, timeout: '30 minutes' },
    perms,
  };
}

export const PAGES = ['dashboard', 'students', 'batches', 'attendance', 'fees', 'exams', 'teachers', 'communication', 'reports', 'settings'];

export { round1 };
