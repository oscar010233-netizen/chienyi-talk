"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDark(document.documentElement.classList.contains("dark"));
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      title={dark ? "切換淺色模式" : "切換深色模式"}
      aria-label={dark ? "切換淺色模式" : "切換深色模式"}
      className={cn(
        "flex items-center rounded-[8px] text-[13px] font-medium text-foreground/70 transition-all hover:bg-black/[0.05] hover:text-foreground active:scale-[0.98] dark:hover:bg-white/[0.06]",
        collapsed ? "justify-center py-2.5" : "gap-2.5 px-2.5 py-2"
      )}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
      {!collapsed && (dark ? "淺色模式" : "深色模式")}
    </button>
  );
}
