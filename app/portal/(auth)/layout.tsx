export default function PortalAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f8fc] flex flex-col justify-center items-center py-12 px-4 sm:px-6">
      {children}
    </div>
  );
}
