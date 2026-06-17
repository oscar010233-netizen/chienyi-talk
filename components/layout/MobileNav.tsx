"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, CalendarDays, ClipboardCheck, GraduationCap, Home, LogOut, ReceiptText, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/", icon: Home, label: "總覽" },
  { href: "/workspace", icon: CalendarDays, label: "配課" },
  { href: "/classes", icon: GraduationCap, label: "班級" },
  { href: "/billing", icon: ReceiptText, label: "開袋" },
  { href: "/students", icon: Users, label: "學生" },
  { href: "/speaking", icon: BookOpen, label: "口說" },
  { href: "/exam-grading", icon: ClipboardCheck, label: "批改" },
];

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="mac-glass mac-hairline fixed right-0 bottom-0 left-0 z-50 grid grid-cols-8 border-t pb-safe-bottom md:hidden">
      {navItems.map(({ href, icon: Icon, label }) => {
        const isActive =
          pathname === href || (href !== "/" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors",
              isActive ? "text-gold" : "text-muted-foreground"
            )}
          >
            <Icon size={19} />
            {label}
          </Link>
        );
      })}
      <button
        onClick={handleLogout}
        className="flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-xs font-medium text-muted-foreground transition-colors"
      >
        <LogOut size={19} />
        登出
      </button>
    </nav>
  );
}
