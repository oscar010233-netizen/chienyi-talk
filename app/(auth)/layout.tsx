export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-muted pt-safe-top pb-safe-bottom">
      {children}
    </div>
  );
}
