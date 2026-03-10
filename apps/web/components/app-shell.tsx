"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, Container, Activity, Network, Database, Settings, LayoutDashboard, Package } from "lucide-react";
import { cn } from "../lib/utils";

const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/containers", label: "Containers", icon: Container },
  { href: "/groups", label: "Groups", icon: Boxes },
  { href: "/volumes", label: "Volumes", icon: Database },
  { href: "/networks", label: "Networks", icon: Network },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const isInstallPage = pathname === "/install";

  if (isInstallPage) {
    return <main className="min-h-screen bg-slate-100">{children}</main>;
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto grid min-h-screen max-w-[1600px] gap-6 px-4 py-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-panel">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-orange-500 p-3">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-semibold">DockForge</p>
              <p className="text-sm text-slate-400">Docker empire control</p>
            </div>
          </div>

          <nav className="mt-8 space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition",
                    active ? "bg-white text-slate-950" : "text-slate-300 hover:bg-slate-900 hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="space-y-6">{children}</main>
      </div>
    </div>
  );
};
