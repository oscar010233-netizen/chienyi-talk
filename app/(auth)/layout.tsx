export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex items-center justify-center bg-[#f2f3f5]">
      {children}
    </div>
  );
}
