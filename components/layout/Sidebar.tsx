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
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-white md:flex">
      <div className="border-b border-border px-6 py-5">
        <span className="text-lg font-bold text-foreground">{"簡易 OS"}</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive =
            pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-gold/10 text-gold"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
