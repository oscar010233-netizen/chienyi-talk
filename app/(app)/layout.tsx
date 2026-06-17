import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gradient-to-b from-[#eeeef1] to-[#e3e3e8] dark:from-[#1c1c1e] dark:to-[#161617]">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden pb-nav-safe md:pb-0">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
