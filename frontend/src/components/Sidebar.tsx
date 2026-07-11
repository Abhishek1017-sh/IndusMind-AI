"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, FileText, MessageSquare, Network,
  Wrench, ShieldCheck, BarChart3, LogOut, Brain, ChevronRight
} from "lucide-react";

const NAV = [
  { href: "/dashboard",   icon: LayoutDashboard, label: "Dashboard"    },
  { href: "/documents",   icon: FileText,         label: "Documents"    },
  { href: "/chat",        icon: MessageSquare,    label: "AI Chat"      },
  { href: "/graph",       icon: Network,          label: "Knowledge Graph" },
  { href: "/maintenance", icon: Wrench,           label: "Maintenance"  },
  { href: "/compliance",  icon: ShieldCheck,      label: "Compliance"   },
  { href: "/reports",     icon: BarChart3,        label: "Reports"      },
];

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <>
      {/* Mobile backdrop — clicking it closes the drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 md:hidden cursor-pointer"
          style={{ background: "rgba(15,23,42,0.15)" }}
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-screen w-64 flex flex-col z-30 transition-transform duration-300 md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ background: "#FFFFFF", borderRight: "1px solid #E2E8F0" }}>

        {/* Logo */}
        <div className="px-5 py-6 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 cursor-pointer"
            style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)", boxShadow: "0 4px 12px rgba(37,99,235,0.15)" }}>
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-[#0F172A] leading-tight">Industrial AI</p>
            <p className="text-[10px] text-blue-600 font-extrabold tracking-wider uppercase leading-tight">Brain</p>
          </div>
        </div>

        <div className="mx-4 mb-4 h-px bg-[#E2E8F0]" />

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link key={href} href={href} onClick={onClose}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 group cursor-pointer hover:bg-[#F1F5F9]"
                style={active
                  ? { background: "rgba(37,99,235,0.08)", color: "#2563EB", borderLeft: "3px solid #2563EB" }
                  : { color: "#64748B", borderLeft: "3px solid transparent" }}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{label}</span>
                {active && <ChevronRight className="w-3.5 h-3.5 opacity-80 text-blue-600" />}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-4">
          <div className="border border-[#E2E8F0] rounded-xl p-3 flex items-center gap-3 bg-[#F1F5F9]">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}>
              {user?.name?.charAt(0) ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-extrabold text-[#0F172A] truncate">{user?.name ?? "User"}</p>
              <p className="text-[10px] text-[#64748B] font-semibold truncate">{user?.role}</p>
            </div>
            <button onClick={logout} title="Sign out"
              className="text-[#94A3B8] hover:text-red-600 transition-colors p-1 cursor-pointer">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
