"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, ClipboardCheck, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: Home, label: "\u7e3d\u89bd" },
  { href: "/workspace", icon: CalendarDays, label: "\u914d\u8ab2\u8868" },
  { href: "/speaking", icon: BookOpen, label: "\u53e3\u8aaa\u7df4\u7fd2" },
  { href: "/exam-grading", icon: ClipboardCheck, label: "\u8a66\u5377\u6279\u6539" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-white md:flex">
      <div className="border-b border-border px-6 py-5">
        <span className="text-lg font-bold text-foreground">{"\u7c21\u6613 OS"}</span>
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
