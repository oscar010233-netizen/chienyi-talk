"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function LogoutButton({ collapsed }: { collapsed?: boolean }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      title="登出"
      aria-label="登出"
      className={cn(
        "flex items-center rounded-[8px] text-[13px] font-medium text-foreground/70 transition-all hover:bg-black/[0.05] hover:text-foreground active:scale-[0.98] dark:hover:bg-white/[0.06]",
        collapsed ? "justify-center py-2.5" : "gap-2.5 px-2.5 py-2"
      )}
    >
      <LogOut size={17} />
      {!collapsed && "登出"}
    </button>
  );
}
