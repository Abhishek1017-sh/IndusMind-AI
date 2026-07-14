"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Eye, EyeOff, Zap, Shield, Brain, Activity, HelpCircle, Mail, Lock, User } from "lucide-react";
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

  const [activeFeature, setActiveFeature] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [leftHovered, setLeftHovered] = useState(false);
  const [cardHeight, setCardHeight] = useState<number | undefined>(undefined);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  const loginRef = useRef<HTMLDivElement>(null);
  const registerRef = useRef<HTMLDivElement>(null);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent, submitMode: "login" | "register") => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (submitMode === "login") {
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

  // Rotate features every 4 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveFeature(prev => (prev + 1) % features.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [features.length]);

  // Adjust container height dynamically on mode/form updates
  useEffect(() => {
    const activeEl = mode === "login" ? loginRef.current : registerRef.current;
    if (activeEl) {
      setCardHeight(activeEl.offsetHeight);
    }
  }, [mode, form]);

  // Generate lightweight random points for a denser pseudo-3D Knowledge Graph
  const { networkNodes, networkLines } = useMemo(() => {
    const nodes = [];
    const seedRandom = (i: number) => Math.sin(i * 9876.5432) * 0.5 + 0.5;
    // Denser network with 26 nodes
    for (let i = 0; i < 26; i++) {
      nodes.push({
        id: i,
        x: seedRandom(i * 3) * 90 + 5,       // Spread from 5% to 95%
        y: seedRandom(i * 3 + 1) * 90 + 5,
        size: seedRandom(i * 3 + 2) * 5 + 3,  // sizes 3px to 8px
        color: i % 3 === 0 ? "#3B82F6" : i % 3 === 1 ? "#6366F1" : "#06B6D4",
        depth: seedRandom(i * 3 + 3) * 80 - 40, // depth from -40px to +40px for 3D parallax parallax
      });
    }

    const lines = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 28) { // connect nodes close to each other
          lines.push({ id: `${i}-${j}`, from: nodes[i], to: nodes[j] });
        }
      }
    }
    return { networkNodes: nodes, networkLines: lines };
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    setLeftHovered(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) - 0.5; // -0.5 to 0.5
    const y = ((e.clientY - rect.top) / rect.height) - 0.5; // -0.5 to 0.5
    setTilt({ x, y });
  };

  const handleMouseLeave = () => {
    setLeftHovered(false);
    setTilt({ x: 0, y: 0 }); // reset tilt
  };

  const handleButtonMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    button.style.setProperty("--x", `${x}px`);
    button.style.setProperty("--y", `${y}px`);
  };

  const rotateY = leftHovered ? (4 - (tilt.x + 0.5) * 6) : 4;
  const rotateX = leftHovered ? (tilt.y * 8) : 0;

  return (
    <>
      {/* Premium login authentication overlay */}
      {loading && <LoginLoader />}

      <div className="min-h-screen flex bg-[#FAFAF8]">

        {/* Left panel - branding */}
        <div
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="hidden lg:flex flex-1 flex-col justify-center px-16 py-12 relative overflow-hidden bg-[#FAFAF8] border-r  border-none"
        >
          {/* Dense Cybernetic background network grid */}
          <div className="absolute inset-0 z-0 pointer-events-none">
            {/* Grid Pattern */}
            <svg className="absolute inset-0 w-full h-full opacity-40 pointer-events-none z-0" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(15,23,42,0.03)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>

            {/* Radar Sweep Grid Overlay */}
            <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.25] flex items-center justify-center scale-150">
              <div className="w-[850px] h-[850px] rounded-full radar-grid" />
            </div>

            {/* 3D tilt background network */}
            <div
              className="absolute inset-0 transition-transform duration-350 ease-out pointer-events-none"
              style={{
                transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
                willChange: "transform",
                transformStyle: "preserve-3d",
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
                outline: "1px solid transparent"
              }}
            >
              <svg className="w-full h-full absolute inset-0 opacity-[0.22]">
                {networkLines.map(line => (
                  <line
                    key={line.id}
                    x1={`${line.from.x}%`}
                    y1={`${line.from.y}%`}
                    x2={`${line.to.x}%`}
                    y2={`${line.to.y}%`}
                    stroke="rgba(99, 102, 241, 0.25)"
                    strokeWidth="0.75"
                  />
                ))}
              </svg>
              {networkNodes.map(node => (
                <div
                  key={node.id}
                  className="absolute rounded-full animate-pulse"
                  style={{
                    left: `${node.x}%`,
                    top: `${node.y}%`,
                    width: `${node.size}px`,
                    height: `${node.size}px`,
                    backgroundColor: node.color,
                    boxShadow: `0 0 12px ${node.color}`,
                    transform: `translate3d(-50%, -50%, ${node.depth}px)`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Interactive 3D Perspective Shift Parent Wrapper */}
          <div
            className="relative z-10 transition-transform duration-500 ease-out"
            style={{
              transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
              transformStyle: "preserve-3d",
              willChange: "transform",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              outline: "1px solid transparent"
            }}
          >
            {/* Logo */}
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#2563EB] to-[#3B82F6]">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-[#0F172A] leading-tight">IndusMind AI</p>
                <p className="text-[10px] text-blue-600 font-extrabold uppercase tracking-wider">Industrial Knowledge Platform</p>
              </div>
            </div>

            {/* Header copy */}
            <h1 className="text-4xl font-extrabold text-[#0F172A] leading-tight mb-4">
              Unified Plant<br />
              <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                Knowledge Intelligence
              </span>
            </h1>
            <p className="text-xs font-semibold text-[#64748B] mb-8 max-w-md leading-relaxed">
              Harness institutional knowledge, SOP requirements, and regulatory audit history through a secure, enterprise-grade industrial AI assistant.
            </p>

            {/* Connected Node Feature List (All 4 stacked) */}
            <div className="relative flex flex-col gap-4 max-w-lg z-10 pl-6">
              
              {/* Connection Trace Line */}
              <div className="absolute left-[39px] top-6 bottom-6 w-[2px] bg-slate-200/50 z-0">
                {/* Glowing Pulse Dot */}
                <div
                  className="absolute w-[6px] h-12 -left-[2px] bg-gradient-to-b from-transparent via-blue-600 to-transparent shadow-[0_0_10px_#2563EB] rounded-full transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
                  style={{
                    top: `${activeFeature * 25 + 12}%`,
                    transform: "translateY(-50%)"
                  }}
                />
              </div>

              {features.map((feat, idx) => {
                const active = idx === activeFeature;
                const Icon = feat.icon;
                return (
                  <div
                    key={feat.label}
                    onClick={() => setActiveFeature(idx)}
                    className={`relative flex items-start gap-4 p-5 rounded-2xl cursor-pointer transition-all duration-500 transform overflow-hidden z-10 ${
                      active
                        ? "bg-white/95 border border-slate-200 shadow-[0_10px_30px_-10px_rgba(37,99,235,0.08)] scale-[1.03] border-l-4 border-l-blue-600 pointer-events-auto"
                        : "bg-white/40 border border-slate-100/40 opacity-45 scale-[0.97] blur-[0.5px] shadow-none pointer-events-auto hover:opacity-75 hover:scale-[0.99] hover:blur-0 transition-all duration-300"
                    }`}
                  >
                    {/* Icon container */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border transition-all duration-300 ${
                      active
                        ? "bg-blue-50 border-blue-100 shadow-sm"
                        : "bg-slate-50/50 border-slate-100"
                    }`}>
                      <Icon className={`w-5 h-5 transition-colors duration-300 ${active ? "text-blue-600" : "text-slate-400"}`} />
                    </div>

                    <div>
                      <p className={`text-sm font-bold transition-colors duration-300 ${active ? "text-[#0F172A]" : "text-[#64748B]"}`}>{feat.label}</p>
                      <p className="text-xs text-[#64748B] font-semibold mt-1 leading-relaxed">{feat.desc}</p>
                    </div>

                    {/* Active card progress bar */}
                    {active && (
                      <div className="absolute bottom-0 inset-x-0 h-[3px] bg-slate-100 rounded-b-2xl overflow-hidden">
                        <div
                          key={idx} // Reset animation key
                          className="h-full bg-gradient-to-r from-blue-600 to-cyan-500 rounded-full"
                          style={{
                            animation: "progress-sweep 4s linear forwards",
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Micro-telemetry widget at the bottom left */}
          <div className="absolute bottom-6 left-16 z-20 flex items-center gap-4 bg-white/70 backdrop-blur-md border border-slate-200/80 rounded-xl px-4 py-2 text-[10px] text-[#64748B] font-bold shadow-sm select-none">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span>Cluster Status: <span className="text-[#0F172A]">Active</span></span>
            <span className="text-slate-300">|</span>
            <span>Uptime: <span className="text-blue-600">99.98%</span></span>
            <span className="text-slate-300">|</span>
            <span>Latency: <span className="text-emerald-600">12ms</span></span>
          </div>
        </div>

        {/* Right panel - Auth form */}
        <div className="flex flex-1 items-center justify-center px-6 py-12 lg:px-12 bg-[#FAFAF8] z-10">
          <div className="w-full max-w-md">

            {/* Logo on mobile */}
            <div className="lg:hidden flex items-center gap-3 mb-8">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#2563EB] to-[#3B82F6]">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-[#0F172A]">IndusMind AI</span>
            </div>

            <div className="group bg-white border rounded-2xl p-8 relative overflow-hidden transition-all duration-500 hover:border-blue-500/50 hover:shadow-[0_30px_60px_-15px_rgba(15,23,42,0.08),_0_0_50px_-10px_rgba(37,99,235,0.03)]"
              style={{ border: "1px solid rgba(226, 232, 240, 0.8)", boxShadow: "0 20px 40px rgba(15, 23, 42, 0.04)" }}>
              {/* Subtle hover grid */}
              <div className="absolute inset-0 cyber-card-grid opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl" />

              <h2 className="relative z-10 text-2xl font-bold text-[#0F172A] mb-1">
                {mode === "login" ? "Enterprise Login" : "Create Account"}
              </h2>
              <p className="relative z-10 text-xs text-[#64748B] mb-6">
                {mode === "login" ? "Sign in to access the plant intelligence platform" : "Register to access the industrial platform"}
              </p>

              {/* Mode tabs */}
              <div className="relative flex rounded-lg p-1 mb-6 bg-[#F1F5F9] z-10">
                {/* Sliding tab background pill */}
                <div
                  className="absolute top-1 bottom-1 left-1 rounded-md bg-white border border-slate-100 shadow-sm transition-all duration-400 ease-[cubic-bezier(0.25,1,0.5,1)]"
                  style={{
                    width: "calc(50% - 4px)",
                    transform: mode === "login" ? "translateX(0%)" : "translateX(100%)",
                  }}
                />
                {(["login", "register"] as const).map(m => (
                  <button key={m} type="button" onClick={() => { setMode(m); setError(""); }}
                    className="relative z-10 flex-1 py-1.5 rounded-md text-xs transition-all duration-300 cursor-pointer bg-transparent border-0 text-center"
                    style={{
                      color: mode === m ? "#0F172A" : "#94A3B8",
                      fontWeight: mode === m ? "800" : "600"
                    }}>
                    {m === "login" ? "Sign In" : "Register"}
                  </button>
                ))}
              </div>

              {/* Dynamic height sliding forms container wrapper */}
              <div
                className="relative transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden"
                style={{ height: cardHeight ? `${cardHeight}px` : "auto" }}
              >
                <div
                  className="w-[200%] flex transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
                  style={{ transform: mode === "login" ? "translateX(0%)" : "translateX(-50%)" }}
                >
                  {/* SIGN IN FORM PANEL */}
                  <div ref={loginRef} className="w-1/2 pr-4 pl-1 flex-shrink-0">
                    <form onSubmit={(e) => handleSubmit(e, "login")} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-[#64748B] mb-1">Email Address</label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-all duration-300">
                            <Mail className={`w-4 h-4 transition-all duration-300 ${
                              focusedInput === "login-email" ? "text-blue-600 scale-110" : "text-slate-400"
                            }`} />
                          </div>
                          <input
                            type="email"
                            value={form.email}
                            onChange={e => set("email", e.target.value)}
                            onFocus={() => setFocusedInput("login-email")}
                            onBlur={() => setFocusedInput(null)}
                            required
                            placeholder="you@company.com"
                            className="w-full pl-9 pr-3.5 py-2 text-xs text-[#0F172A] border border-[#E2E8F0] rounded-xl outline-none focus:border-blue-500 focus:shadow-[0_0_12px_rgba(37,99,235,0.12)] bg-white transition-all duration-300"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-xs font-bold text-[#64748B]">Password</label>
                          <button type="button" className="text-[10px] text-blue-600 font-semibold hover:underline cursor-pointer bg-transparent border-0">
                            Forgot Password?
                          </button>
                        </div>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-all duration-300">
                            <Lock className={`w-4 h-4 transition-all duration-300 ${
                              focusedInput === "login-pwd" ? "text-blue-600 scale-110" : "text-slate-400"
                            }`} />
                          </div>
                          <input
                            type={showPwd ? "text" : "password"}
                            value={form.password}
                            onChange={e => set("password", e.target.value)}
                            onFocus={() => setFocusedInput("login-pwd")}
                            onBlur={() => setFocusedInput(null)}
                            required
                            placeholder="••••••••"
                            className="w-full pl-9 pr-10 py-2 text-xs text-[#0F172A] border border-[#E2E8F0] rounded-xl outline-none focus:border-blue-500 focus:shadow-[0_0_12px_rgba(37,99,235,0.12)] bg-white transition-all duration-300"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPwd(s => !s)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B] hover:scale-110 hover:opacity-100 transition-all cursor-pointer bg-transparent border-0"
                          >
                            {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="remember"
                          checked={rememberMe}
                          onChange={e => setRememberMe(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-[#E2E8F0] text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <label htmlFor="remember" className="text-[11px] text-[#64748B] font-semibold cursor-pointer select-none">
                          Remember Me
                        </label>
                      </div>

                      {error && (
                        <div className="px-3.5 py-2.5 rounded-xl text-xs text-red-700 font-semibold border border-red-200" style={{ background: "rgba(220,38,38,0.05)" }}>
                          {error}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={loading}
                        onMouseMove={handleButtonMouseMove}
                        className="shimmer-btn w-full py-2.5 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-60 cursor-pointer mt-2 relative overflow-hidden active:scale-[0.98] border-0"
                        style={{
                          background: "radial-gradient(circle 80px at var(--x, 50%) var(--y, 50%), rgba(255,255,255,0.18), transparent), linear-gradient(135deg, #2563EB, #3B82F6)",
                          boxShadow: "0 4px 12px rgba(37,99,235,0.2)"
                        }}
                      >
                        {loading ? "Authenticating…" : "Sign In →"}
                      </button>
                    </form>

                    {/* Telemetry secure authorization chip */}
                    <div className="mt-6 p-4 px-1 bg-white border-0 rounded-xl relative overflow-hidden shadow-none">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                          <Shield className="w-3.5 h-3.5 text-blue-600" />
                          <span>Secure Authorization Key</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[9px] text-emerald-600 font-bold uppercase">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>MOCK_CLUSTER: READY</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                        Demo Credentials:<br />
                        <span className="inline-block mt-2.5">Email: <span className="bg-[#F8FAFC] text-blue-600 border border-slate-200 font-mono px-2 py-0.5 rounded text-[10px] select-all">admin@industrial.ai</span></span><br />
                        <span className="inline-block mt-2">Password: <span className="bg-[#F8FAFC] text-blue-600 border border-slate-200 font-mono px-2 py-0.5 rounded text-[10px] select-all">adminpassword123</span></span>
                      </p>
                    </div>
                  </div>

                  {/* REGISTER FORM PANEL */}
                  <div ref={registerRef} className="w-1/2 pl-4 pr-1 flex-shrink-0">
                    <form onSubmit={(e) => handleSubmit(e, "register")} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-[#64748B] mb-1">Full Name</label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-all duration-300">
                            <User className={`w-4 h-4 transition-all duration-300 ${
                              focusedInput === "register-name" ? "text-blue-600 scale-110" : "text-slate-400"
                            }`} />
                          </div>
                          <input
                            value={form.full_name}
                            onChange={e => set("full_name", e.target.value)}
                            onFocus={() => setFocusedInput("register-name")}
                            onBlur={() => setFocusedInput(null)}
                            required={mode === "register"}
                            placeholder="Elena Rostova"
                            className="w-full pl-9 pr-3.5 py-2 text-xs text-[#0F172A] border border-[#E2E8F0] rounded-xl outline-none focus:border-blue-500 focus:shadow-[0_0_12px_rgba(37,99,235,0.12)] bg-white transition-all duration-300"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#64748B] mb-1">Email Address</label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-all duration-300">
                            <Mail className={`w-4 h-4 transition-all duration-300 ${
                              focusedInput === "register-email" ? "text-blue-600 scale-110" : "text-slate-400"
                            }`} />
                          </div>
                          <input
                            type="email"
                            value={form.email}
                            onChange={e => set("email", e.target.value)}
                            onFocus={() => setFocusedInput("register-email")}
                            onBlur={() => setFocusedInput(null)}
                            required
                            placeholder="you@company.com"
                            className="w-full pl-9 pr-3.5 py-2 text-xs text-[#0F172A] border border-[#E2E8F0] rounded-xl outline-none focus:border-blue-500 focus:shadow-[0_0_12px_rgba(37,99,235,0.12)] bg-white transition-all duration-300"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#64748B] mb-1">Password</label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-all duration-300">
                            <Lock className={`w-4 h-4 transition-all duration-300 ${
                              focusedInput === "register-pwd" ? "text-blue-600 scale-110" : "text-slate-400"
                            }`} />
                          </div>
                          <input
                            type={showPwd ? "text" : "password"}
                            value={form.password}
                            onChange={e => set("password", e.target.value)}
                            onFocus={() => setFocusedInput("register-pwd")}
                            onBlur={() => setFocusedInput(null)}
                            required
                            placeholder="••••••••"
                            className="w-full pl-9 pr-10 py-2 text-xs text-[#0F172A] border border-[#E2E8F0] rounded-xl outline-none focus:border-blue-500 focus:shadow-[0_0_12px_rgba(37,99,235,0.12)] bg-white transition-all duration-300"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPwd(s => !s)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B] hover:scale-110 hover:opacity-100 transition-all cursor-pointer bg-transparent border-0"
                          >
                            {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#64748B] mb-1">Role</label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-all duration-300">
                            <Shield className={`w-4 h-4 transition-all duration-300 ${
                              focusedInput === "register-role" ? "text-blue-600 scale-110" : "text-slate-400"
                            }`} />
                          </div>
                          <select
                            value={form.role}
                            onChange={e => set("role", e.target.value)}
                            onFocus={() => setFocusedInput("register-role")}
                            onBlur={() => setFocusedInput(null)}
                            className="w-full pl-9 pr-3 py-2 text-xs text-[#0F172A] border border-[#E2E8F0] rounded-xl outline-none bg-white focus:border-blue-500 focus:shadow-[0_0_12px_rgba(37,99,235,0.12)] transition-all duration-300"
                          >
                            <option value="ENGINEER">Engineer</option>
                            <option value="INSPECTOR">Inspector</option>
                            <option value="ADMIN">Administrator</option>
                          </select>
                        </div>
                      </div>

                      {error && (
                        <div className="px-3.5 py-2.5 rounded-xl text-xs text-red-700 font-semibold border border-red-200" style={{ background: "rgba(220,38,38,0.05)" }}>
                          {error}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={loading}
                        onMouseMove={handleButtonMouseMove}
                        className="shimmer-btn w-full py-2.5 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-60 cursor-pointer mt-2 relative overflow-hidden active:scale-[0.98] border-0"
                        style={{
                          background: "radial-gradient(circle 80px at var(--x, 50%) var(--y, 50%), rgba(255,255,255,0.18), transparent), linear-gradient(135deg, #2563EB, #3B82F6)",
                          boxShadow: "0 4px 12px rgba(37,99,235,0.2)"
                        }}
                      >
                        {loading ? "Registering…" : "Create Account →"}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </>
  );
}
