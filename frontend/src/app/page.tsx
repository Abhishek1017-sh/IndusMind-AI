"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Eye, EyeOff, Zap, Shield, Brain, Activity, HelpCircle } from "lucide-react";
import LoginLoader from "@/components/loaders/LoginLoader";

export default function HomePage() {
  const { login, register, token, isLoading } = useAuth();
  const router = useRouter();
  
  // If user is already authenticated, redirect straight to dashboard
  useEffect(() => {
    if (!isLoading && token) {
      router.replace("/dashboard");
    }
  }, [token, isLoading, router]);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "ENGINEER" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login({ email: form.email, password: form.password });
      } else {
        await register({ email: form.email, password: form.password, full_name: form.full_name, role: form.role });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: Brain, label: "AI Knowledge RAG", desc: "Query safety logs, audit history, and checklists with clear citations" },
    { icon: Activity, label: "Predictive Maintenance", desc: "Machine logs parsed automatically into MTTR/MTBF analytics dashboards" },
    { icon: Shield, label: "Regulatory Compliance", desc: "Scan and compare plant records against PESO, OISD, and Factory Acts" },
    { icon: Zap, label: "Live Knowledge Graph", desc: "Visualize connections between SOPs, failures, parts, and assets" },
  ];

  return (
    <>
      {/* Premium login authentication overlay */}
      {loading && <LoginLoader />}

      <div className="min-h-screen flex bg-[#FAFAF8]">

        {/* Left panel - branding */}
        <div className="hidden lg:flex flex-1 flex-col justify-center px-16 py-12 relative overflow-hidden bg-[#FAFAF8] border-r border-[#E2E8F0]">
          {/* Animated AI network background */}
          <div className="absolute inset-0 opacity-40">
            <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(15,23,42,0.03)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
              <circle cx="20%" cy="20%" r="4" fill="#06B6D4" className="animate-pulse" />
              <circle cx="80%" cy="30%" r="5" fill="#3B82F6" className="animate-pulse" />
              <circle cx="50%" cy="60%" r="3" fill="#10B981" className="animate-pulse" />
              <circle cx="30%" cy="80%" r="4.5" fill="#F59E0B" className="animate-pulse" />
              <line x1="20%" y1="20%" x2="50%" y2="60%" stroke="rgba(15,23,42,0.04)" strokeWidth="1.5" />
              <line x1="50%" y1="60%" x2="80%" y2="30%" stroke="rgba(15,23,42,0.04)" strokeWidth="1.5" />
              <line x1="30%" y1="80%" x2="50%" y2="60%" stroke="rgba(15,23,42,0.04)" strokeWidth="1.5" />
              <line x1="20%" y1="20%" x2="30%" y2="80%" stroke="rgba(15,23,42,0.04)" strokeWidth="1.5" />
            </svg>
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#2563EB] to-[#3B82F6]">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-[#0F172A] leading-tight">IndusMind AI</p>
                <p className="text-[10px] text-blue-600 font-extrabold uppercase tracking-wider">Industrial Knowledge Platform</p>
              </div>
            </div>

            <h1 className="text-4xl font-extrabold text-[#0F172A] leading-tight mb-4">
              Unified Plant<br />
              <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                Knowledge Intelligence
              </span>
            </h1>
            <p className="text-xs font-semibold text-[#64748B] mb-10 max-w-md leading-relaxed">
              Harness institutional knowledge, SOP requirements, and regulatory audit history through a secure, enterprise-grade industrial AI assistant.
            </p>

            <div className="space-y-3.5 max-w-lg">
              {features.map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-start gap-4 p-4 bg-white border border-[#E2E8F0] rounded-xl cursor-default hover:bg-[#F8FAFC] hover:shadow-sm transition-all duration-200">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-50 border border-blue-100">
                    <Icon className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#0F172A]">{label}</p>
                    <p className="text-[11px] text-[#64748B] font-semibold mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel - Auth form */}
        <div className="flex flex-1 items-center justify-center px-6 py-12 lg:px-12 bg-[#FAFAF8]">
          <div className="w-full max-w-md">

            {/* Logo on mobile */}
            <div className="lg:hidden flex items-center gap-3 mb-8">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#2563EB] to-[#3B82F6]">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-[#0F172A]">IndusMind AI</span>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 shadow-sm">
              <h2 className="text-2xl font-bold text-[#0F172A] mb-1">
                {mode === "login" ? "Enterprise Login" : "Create Account"}
              </h2>
              <p className="text-xs text-[#64748B] mb-6">
                {mode === "login" ? "Sign in to access the plant intelligence platform" : "Register to access the industrial platform"}
              </p>

              {/* Mode tabs */}
              <div className="flex rounded-lg p-1 mb-5 bg-[#F1F5F9]">
                {(["login", "register"] as const).map(m => (
                  <button key={m} onClick={() => { setMode(m); setError(""); }}
                    className="flex-1 py-1.5 rounded-md text-xs font-bold transition-all duration-200 cursor-pointer"
                    style={mode === m ? { background: "#FFFFFF", color: "#2563EB", boxShadow: "0 2px 4px rgba(15,23,42,0.05)" } : { color: "#64748B" }}>
                    {m === "login" ? "Sign In" : "Register"}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "register" && (
                  <div>
                    <label className="block text-xs font-bold text-[#64748B] mb-1">Full Name</label>
                    <input value={form.full_name} onChange={e => set("full_name", e.target.value)} required
                      placeholder="Elena Rostova"
                      className="w-full px-3.5 py-2 text-xs text-[#0F172A] border border-[#E2E8F0] rounded-xl outline-none focus:border-blue-500 bg-white" />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-[#64748B] mb-1">Email Address</label>
                  <input type="email" value={form.email} onChange={e => set("email", e.target.value)} required
                    placeholder="you@company.com"
                    className="w-full px-3.5 py-2 text-xs text-[#0F172A] border border-[#E2E8F0] rounded-xl outline-none focus:border-blue-500 bg-white" />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-[#64748B]">Password</label>
                    {mode === "login" && (
                      <button type="button" className="text-[10px] text-blue-600 font-semibold hover:underline cursor-pointer">
                        Forgot Password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input type={showPwd ? "text" : "password"} value={form.password} onChange={e => set("password", e.target.value)} required
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2 pr-10 text-xs text-[#0F172A] border border-[#E2E8F0] rounded-xl outline-none focus:border-blue-500 bg-white" />
                    <button type="button" onClick={() => setShowPwd(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B] cursor-pointer">
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {mode === "register" && (
                  <div>
                    <label className="block text-xs font-bold text-[#64748B] mb-1">Role</label>
                    <select value={form.role} onChange={e => set("role", e.target.value)}
                      className="w-full px-3 py-2 text-xs text-[#0F172A] border border-[#E2E8F0] rounded-xl outline-none bg-white">
                      <option value="ENGINEER">Engineer</option>
                      <option value="INSPECTOR">Inspector</option>
                      <option value="ADMIN">Administrator</option>
                    </select>
                  </div>
                )}

                {mode === "login" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="remember"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-[#E2E8F0] text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <label htmlFor="remember" className="text-[11px] text-[#64748B] font-semibold cursor-pointer">
                      Remember Me
                    </label>
                  </div>
                )}

                {error && (
                  <div className="px-3.5 py-2.5 rounded-xl text-xs text-red-700 font-semibold border border-red-200" style={{ background: "rgba(220,38,38,0.05)" }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full py-2.5 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-60 cursor-pointer mt-2"
                  style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)", boxShadow: "0 4px 12px rgba(37,99,235,0.2)" }}>
                  {loading ? "Authenticating…" : mode === "login" ? "Sign In →" : "Create Account →"}
                </button>
              </form>

              {mode === "login" && (
                <div className="mt-6 flex items-start gap-2 p-3 bg-[#F1F5F9] border border-[#E2E8F0] rounded-xl">
                  <HelpCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-[#64748B] leading-relaxed">
                    Demo Credentials:<br />
                    Email: <span className="font-bold text-[#0F172A]">admin@industrial.ai</span><br />
                    Password: <span className="font-bold text-[#0F172A]">adminpassword123</span>
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>

      </div>
    </>
  );
}
