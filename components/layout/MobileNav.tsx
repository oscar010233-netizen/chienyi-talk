"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, ClipboardCheck, GraduationCap, Home, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: Home, label: "總覽" },
  { href: "/workspace", icon: CalendarDays, label: "配課" },
  { href: "/classes", icon: GraduationCap, label: "班級" },
  { href: "/students", icon: Users, label: "學生" },
  { href: "/speaking", icon: BookOpen, label: "口說" },
  { href: "/exam-grading", icon: ClipboardCheck, label: "批改" },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed right-0 bottom-0 left-0 z-50 grid grid-cols-6 border-t border-black/[0.08] bg-white/75 backdrop-blur-xl supports-[backdrop-filter]:bg-white/65 md:hidden">
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
            <Icon size={20} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
