import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gradient-to-b from-[#f5f5f7] to-[#e9e9ec] dark:from-[#1c1c1e] dark:to-[#161617]">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden pb-20 md:pb-0">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
