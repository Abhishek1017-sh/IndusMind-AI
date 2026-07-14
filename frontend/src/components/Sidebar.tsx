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
  collapsed?: boolean;
  onToggle?: () => void;
}

export default function Sidebar({ mobileOpen, onClose, collapsed = false, onToggle }: SidebarProps) {
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
        className={`fixed left-0 top-0 h-screen flex flex-col z-30 transition-all duration-300 md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"} ${collapsed ? "w-16" : "w-60"}`}
        style={{ background: "#FFFFFF", borderRight: "1px solid #E2E8F0" }}>

        {/* The Physical Toggle Button */}
        {onToggle && (
          <button
            onClick={onToggle}
            className="absolute right-0 top-10 translate-x-1/2 z-40 bg-white border border-[#E2E8F0] hover:border-slate-300 rounded-full p-1 cursor-pointer shadow-md text-slate-500 hover:text-slate-700 transition-all duration-300 hidden md:flex items-center justify-center w-6 h-6"
            style={{ transform: `translate(50%, 0) rotate(${collapsed ? 0 : 180}deg)` }}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Logo */}
        <div className={`py-6 flex items-center transition-all duration-300 ${collapsed ? "px-0 justify-center" : "px-5"} gap-3`}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 cursor-pointer"
            style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)", boxShadow: "0 4px 12px rgba(37,99,235,0.15)" }}>
            <Brain className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="transition-opacity duration-200 animate-fade-in whitespace-nowrap">
              <p className="text-sm font-extrabold text-[#0F172A] leading-tight">Industrial AI</p>
              <p className="text-[10px] text-blue-600 font-extrabold tracking-wider uppercase leading-tight">Brain</p>
            </div>
          )}
        </div>

        <div className={`mb-4 h-px bg-[#E2E8F0] transition-all duration-300 ${collapsed ? "mx-3" : "mx-4"}`} />

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link key={href} href={href} onClick={onClose}
                className={`relative flex items-center ${collapsed ? "justify-center px-0 py-3" : "px-3 py-2.5"} rounded-lg text-sm font-bold transition-all duration-200 group cursor-pointer hover:bg-[#F1F5F9]`}
                style={active
                  ? { background: "rgba(37,99,235,0.08)", color: "#2563EB", borderLeft: collapsed ? "none" : "3px solid #2563EB" }
                  : { color: "#64748B", borderLeft: collapsed ? "none" : "3px solid transparent" }}>
                <Icon className={`w-4 h-4 flex-shrink-0 ${collapsed ? "mx-auto" : ""}`} />
                {!collapsed && (
                  <span className="flex-1 transition-opacity duration-200 animate-fade-in whitespace-nowrap">{label}</span>
                )}
                {!collapsed && active && <ChevronRight className="w-3.5 h-3.5 opacity-80 text-blue-600" />}
                
                {/* Floating Glassmorphic Tooltip */}
                {collapsed && (
                  <div className="absolute left-16 top-1/2 -translate-y-1/2 ml-3 px-3 py-1.5 bg-white/85 backdrop-blur-md border border-slate-200 rounded-lg shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200 text-xs font-bold text-[#0F172A] whitespace-nowrap z-50">
                    {label}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className={`transition-all duration-300 ${collapsed ? "p-2" : "p-4"}`}>
          {collapsed ? (
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="relative group/avatar cursor-pointer">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}>
                  {user?.name?.charAt(0) ?? "B"}
                </div>
                {/* Pulsing green status dot */}
                <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-white bg-[#16A34A] animate-pulse" />
                {/* Tooltip for user info */}
                <div className="absolute left-14 top-1/2 -translate-y-1/2 ml-2 px-3 py-1.5 bg-white/85 backdrop-blur-md border border-slate-200 rounded-lg shadow-lg opacity-0 pointer-events-none group-hover/avatar:opacity-100 group-hover/avatar:pointer-events-auto transition-opacity duration-200 text-xs text-[#0F172A] whitespace-nowrap z-50">
                  <p className="font-extrabold">{user?.name ?? "Bharat Dixit"}</p>
                  <p className="text-[10px] text-[#64748B] font-semibold">{user?.role ?? "Engineer"}</p>
                </div>
              </div>
              
              {/* Collapsed logout button */}
              <button onClick={logout} title="Sign out"
                className="group/logout relative text-[#94A3B8] hover:text-red-600 transition-colors p-2 cursor-pointer rounded-lg hover:bg-red-50 border-0 bg-transparent">
                <LogOut className="w-4 h-4" />
                {/* Tooltip for logout */}
                <div className="absolute left-14 top-1/2 -translate-y-1/2 ml-2 px-3 py-1.5 bg-white/85 backdrop-blur-md border border-slate-200 rounded-lg shadow-lg opacity-0 pointer-events-none group-hover/logout:opacity-100 group-hover/logout:pointer-events-auto transition-opacity duration-200 text-xs font-bold text-red-600 whitespace-nowrap z-50">
                  Sign out
                </div>
              </button>
            </div>
          ) : (
            <div className="border border-[#E2E8F0] rounded-xl p-3 flex items-center gap-3 bg-[#F1F5F9] transition-all duration-300">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}>
                {user?.name?.charAt(0) ?? "B"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-extrabold text-[#0F172A] truncate">{user?.name ?? "Bharat Dixit"}</p>
                <p className="text-[10px] text-[#64748B] font-semibold truncate">{user?.role ?? "Engineer"}</p>
              </div>
              <button onClick={logout} title="Sign out"
                className="text-[#94A3B8] hover:text-red-600 transition-colors p-1 cursor-pointer border-0 bg-transparent">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
