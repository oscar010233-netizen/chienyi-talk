"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, ClipboardCheck, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: Home, label: "\u7e3d\u89bd" },
  { href: "/workspace", icon: CalendarDays, label: "\u914d\u8ab2" },
  { href: "/speaking", icon: BookOpen, label: "\u53e3\u8aaa" },
  { href: "/exam-grading", icon: ClipboardCheck, label: "\u6279\u6539" },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed right-0 bottom-0 left-0 z-50 grid grid-cols-4 border-t border-border bg-white md:hidden">
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
