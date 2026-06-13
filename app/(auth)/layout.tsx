export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex items-center justify-center bg-[#F8F8F8]">
      {children}
    </div>
  );
}
