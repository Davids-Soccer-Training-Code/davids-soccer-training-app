"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart2,
  Trophy,
  Target,
  FileText,
  Upload,
  Settings,
  Menu,
  X,
} from "lucide-react";

const ITEMS: {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { label: "Dashboard", path: "", icon: LayoutDashboard },
  { label: "Rank Up", path: "/rank", icon: Trophy },
  { label: "My Progress", path: "/progress", icon: BarChart2 },
  { label: "Goals", path: "/goals", icon: Target },
  { label: "Feedback & Reports", path: "/reports", icon: FileText },
  { label: "Extra Help", path: "/uploads", icon: Upload },
  { label: "Settings", path: "/settings", icon: Settings },
];

interface PlayerSidebarProps {
  playerId: string;
  mobile?: boolean;
}

export function PlayerSidebar({ playerId, mobile }: PlayerSidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const base = `/player/${playerId}`;

  // Close drawer on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (mobile) {
    return (
      <>
        {/* Hamburger trigger */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-50"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4 text-emerald-600" />
          Menu
        </button>

        {/* Backdrop */}
        <div
          className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
            open ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />

        {/* Slide-out drawer */}
        <div
          className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white shadow-2xl transition-transform duration-300 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Drawer header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
            <span className="text-sm font-bold text-gray-900">Navigation</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Nav items */}
          <nav className="flex flex-col gap-1 p-3">
            {ITEMS.map(({ label, path, icon: Icon }) => {
              const href = `${base}${path}`;
              const isActive =
                path === "" ? pathname === base : pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    isActive
                      ? "bg-emerald-600 text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-emerald-500"}`}
                  />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </>
    );
  }

  // Desktop: sticky left column
  return (
    <nav className="flex flex-col gap-1.5">
      {ITEMS.map(({ label, path, icon: Icon }) => {
        const href = `${base}${path}`;
        const isActive =
          path === "" ? pathname === base : pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${
              isActive
                ? "bg-emerald-600 text-white"
                : "border border-emerald-100 bg-white text-emerald-800 hover:border-emerald-200 hover:bg-emerald-50"
            }`}
          >
            <Icon
              className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-emerald-500"}`}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
