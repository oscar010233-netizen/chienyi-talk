"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, ClipboardCheck, GraduationCap, Home, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: Home, label: "總覽" },
  { href: "/workspace", icon: CalendarDays, label: "配課表" },
  { href: "/classes", icon: GraduationCap, label: "班級" },
  { href: "/students", icon: Users, label: "學生" },
  { href: "/speaking", icon: BookOpen, label: "口說練習" },
  { href: "/exam-grading", icon: ClipboardCheck, label: "試卷批改" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-black/[0.06] bg-white/70 backdrop-blur-2xl supports-[backdrop-filter]:bg-white/55 md:flex">
      <div className="px-5 py-5">
        <span className="text-[17px] font-semibold tracking-tight text-foreground">{"簡易 OS"}</span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-2.5">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive =
            pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[13px] font-medium transition-all active:scale-[0.98]",
                isActive
                  ? "bg-gold text-white shadow-sm"
                  : "text-foreground/70 hover:bg-black/[0.05] hover:text-foreground"
              )}
            >
              <Icon size={17} strokeWidth={isActive ? 2.4 : 2} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
