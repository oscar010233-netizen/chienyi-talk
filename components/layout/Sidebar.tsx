"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Database,
  GraduationCap,
  Home,
  ReceiptText,
  Table2,
  Users,
  Zap,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";
import { LogoutButton } from "./LogoutButton";

const navItems = [
  { href: "/", icon: Home, label: "總覽" },
  { href: "/workspace", icon: CalendarDays, label: "配課表" },
  { href: "/reinforcement", icon: Zap, label: "強化" },
  { href: "/buffer", icon: Database, label: "Buffer" },
  { href: "/classes", icon: GraduationCap, label: "班級" },
  { href: "/billing", icon: ReceiptText, label: "開袋" },
  { href: "/students", icon: Users, label: "學生" },
  { href: "/speaking", icon: BookOpen, label: "口說練習" },
  { href: "/exam-grading", icon: ClipboardCheck, label: "試卷批改" },
  { href: "/db", icon: Table2, label: "DB 監看" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (localStorage.getItem("sidebar-collapsed") === "1") setCollapsed(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "mac-glass mac-hairline sticky top-0 hidden h-screen shrink-0 flex-col border-r transition-[width] duration-200 ease-out md:flex",
        collapsed ? "w-16" : "w-56"
      )}
    >
      <div
        className={cn(
          "flex items-center py-4",
          collapsed ? "justify-center px-2" : "justify-between px-5"
        )}
      >
        {!collapsed && (
          <span className="text-[17px] font-semibold tracking-tight text-foreground">
            {"簡易 OS"}
          </span>
        )}
        <button
          onClick={toggle}
          aria-label={collapsed ? "展開側邊欄" : "收合側邊欄"}
          title={collapsed ? "展開側邊欄" : "收合側邊欄"}
          className="rounded-[7px] p-1.5 text-foreground/55 transition-colors hover:bg-black/[0.05] hover:text-foreground"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2.5">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive =
            pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center rounded-[8px] text-[13px] font-medium transition-all active:scale-[0.98]",
                collapsed ? "justify-center py-2.5" : "gap-2.5 px-2.5 py-2",
                isActive
                  ? "bg-gold text-white shadow-sm dark:bg-[#ff4d4f]"
                  : "text-foreground/70 hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.06]"
              )}
            >
              <Icon size={17} strokeWidth={isActive ? 2.4 : 2} />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      <div className="mac-hairline flex flex-col gap-0.5 border-t p-2.5">
        <ThemeToggle collapsed={collapsed} />
        <LogoutButton collapsed={collapsed} />
      </div>
    </aside>
  );
}
