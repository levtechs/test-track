"use client";

import { TabBar } from "@/components/layout/tab-bar";
import { usePathname } from "next/navigation";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const allowScroll = pathname === "/profile" || pathname === "/practice";

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <main className={`flex-1 pb-16 relative ${allowScroll ? "overflow-y-auto" : "overflow-hidden"}`}>
        {children}
      </main>
      <TabBar />
    </div>
  );
}
