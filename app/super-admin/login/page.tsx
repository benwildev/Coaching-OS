import { redirect } from 'next/navigation';

// Single sign-in: all account types (Super Admin, Owner, Admin, Staff, Teacher, Student, Guardian) sign in on /login.
export default function SuperAdminLoginPage() {
  redirect('/login');
}

