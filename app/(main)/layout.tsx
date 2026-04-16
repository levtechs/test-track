"use client";

import { TabBar } from "@/components/layout/tab-bar";
import { usePathname } from "next/navigation";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const allowScroll = pathname === "/profile";

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <main className={`relative flex-1 min-h-0 pb-16 ${allowScroll ? "overflow-y-auto" : "overflow-hidden"}`}>
        {children}
      </main>
      <TabBar />
    </div>
  );
}
