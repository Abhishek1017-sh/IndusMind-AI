"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Menu, Brain, Search, X, Command, MessageSquare, Send, Sparkles, FileText, Settings, Wrench, ShieldCheck, BarChart3 } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useAuth } from "@/context/AuthContext";
import { ChatProvider } from "@/context/ChatContext";
import PageTransitionBar from "@/components/loaders/PageTransitionBar";
import { AuthGuardLoader } from "@/components/loaders/SkeletonLoader";
import SearchLoader from "@/components/loaders/SearchLoader";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<Array<{ sender: "user" | "bot"; text: string }>>([
    { sender: "bot", text: "Hello! I am IndusMind AI, your factory operations copilot. Ask me anything about plant SOPs, failure analytics, or compliance status." }
  ]);
  const [assistantInput, setAssistantInput] = useState("");
  const assistantEndRef = useRef<HTMLDivElement>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Trigger search sequence loader on input change
  useEffect(() => {
    if (searchQuery.trim()) {
      setIsSearching(true);
    } else {
      setIsSearching(false);
    }
  }, [searchQuery]);

  // Ctrl + K Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isLoading && !token) router.replace("/");
  }, [isLoading, token, router]);

  useEffect(() => {
    if (assistantOpen) {
      assistantEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [assistantOpen, assistantMessages]);

  // Only block render during initial hydration. After that, the redirect effect handles auth.
  if (isLoading) {
    return <AuthGuardLoader />;
  }

  const handleAssistantSend = () => {
    if (!assistantInput.trim()) return;
    const userMsg = assistantInput;
    setAssistantMessages(prev => [...prev, { sender: "user", text: userMsg }]);
    setAssistantInput("");

    setTimeout(() => {
      let reply = "I'm analyzing the requested document logs...";
      if (userMsg.toLowerCase().includes("pump")) {
        reply = "Analyzing Pump P-101 logs: vibration exceeded limits (6.2 mm/s) on July 10. Refer to SOP-Maintenance-Sec4.";
      } else if (userMsg.toLowerCase().includes("compliance")) {
        reply = "Factory compliance is currently at 94%. Warning: OISD standard review is overdue for the crude storage area.";
      } else {
        reply = "Understood. Searching universal documents and plant asset graphs for relevant references...";
      }
      setAssistantMessages(prev => [...prev, { sender: "bot", text: reply }]);
    }, 800);
  };

  const navTo = (path: string) => {
    router.push(path);
    setPaletteOpen(false);
  };

  // Only index the 7 original pages
  const commands = [
    { name: "Go to Operations Dashboard", path: "/dashboard", icon: Brain },
    { name: "Manage Indexed Documents", path: "/documents", icon: FileText },
    { name: "Open AI Copilot Chat", path: "/chat", icon: MessageSquare },
    { name: "View Asset Knowledge Graph", path: "/graph", icon: Settings },
    { name: "Check Compliance Audit", path: "/compliance", icon: ShieldCheck },
    { name: "Check Maintenance Planner", path: "/maintenance", icon: Wrench },
    { name: "Check System Reports", path: "/reports", icon: BarChart3 },
  ].filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <ChatProvider>
      <PageTransitionBar />
      <div className="flex min-h-screen bg-[#FAFAF8] relative overflow-hidden">
        {/* Animated backdrop mesh circles */}
        <div className="absolute top-[-150px] left-[-150px] bg-mesh-circle-1 z-0" />
        <div className="absolute bottom-[-150px] right-[-150px] bg-mesh-circle-2 z-0" />

        <Sidebar
          mobileOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        
        <div className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? "md:ml-16" : "md:ml-60"} flex flex-col min-h-screen overflow-x-hidden z-10`}>
          {/* White top navigation bar */}
          <header className="sticky top-0 z-20 flex items-center justify-between px-6 py-3.5 bg-white border-b border-[#E2E8F0] shadow-sm">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileMenuOpen(true)} className="md:hidden text-[#64748B] hover:text-[#0F172A] p-1.5 cursor-pointer rounded-lg hover:bg-[#F1F5F9]" aria-label="Open menu">
                <Menu className="w-5 h-5" />
              </button>
            </div>

            {/* Large centered AI Search bar */}
            <div className="relative w-full max-w-md mx-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
              <input
                onClick={() => setPaletteOpen(true)}
                readOnly
                placeholder="Ask anything about your plant... (Ctrl + K)"
                className="w-full pl-9 pr-20 py-1.5 text-xs text-[#0F172A] placeholder:text-[#94A3B8] bg-[#F1F5F9] border border-[#E2E8F0] rounded-lg outline-none cursor-pointer hover:border-[#3B82F6] transition-all focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold text-[#64748B] bg-white border border-[#E2E8F0] rounded">
                <Command className="w-2 h-2" />K
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-[#16A34A] animate-pulse" title="System Online" />
              <span className="hidden sm:inline text-xs font-semibold text-[#64748B]">Node Cluster: Active</span>
            </div>
          </header>

          <main className="flex-1 pb-16">{children}</main>
        </div>

        {/* Global Command Palette */}
        {paletteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/40 backdrop-blur-sm animate-fade-in" onClick={() => setPaletteOpen(false)}>
            <div className="w-full max-w-lg bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#E2E8F0]">
                <Search className="w-4 h-4 text-[#64748B]" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search pages or ask plant queries..."
                  className="flex-1 text-sm text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
                />
                <button onClick={() => setPaletteOpen(false)} className="text-[#64748B] hover:text-[#0F172A] cursor-pointer bg-transparent border-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto p-2">
                {isSearching ? (
                  <SearchLoader onComplete={() => setIsSearching(false)} />
                ) : (
                  <>
                    <p className="px-3 py-1.5 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Navigation Commands</p>
                    {commands.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-[#64748B]">No matching routes found</p>
                    ) : (
                      commands.map(cmd => (
                        <button
                          key={cmd.path}
                          onClick={() => navTo(cmd.path)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-xs text-[#0F172A] font-semibold rounded-lg hover:bg-[#F1F5F9] cursor-pointer transition-colors text-left bg-transparent border-0"
                        >
                          <cmd.icon className="w-4 h-4 text-blue-600" />
                          <span>{cmd.name}</span>
                        </button>
                      ))
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Global Floating AI Assistant Drawer Backdrop */}
        {assistantOpen && (
          <div
            className="fixed inset-0 z-40 bg-[#0F172A]/20 backdrop-blur-[2px] transition-opacity duration-300"
            onClick={() => setAssistantOpen(false)}
          />
        )}

        {/* Global Floating AI Assistant Drawer Panel */}
        <div
          className={`fixed right-0 top-0 bottom-0 h-screen w-[380px] max-w-full bg-white shadow-2xl z-50 flex flex-col border-l border-[#E2E8F0] transition-transform duration-300 ease-in-out ${
            assistantOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-[#E2E8F0]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-500">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className="text-xs font-bold text-[#0F172A] block leading-tight">Plant AI Assistant</span>
                <span className="text-[9px] text-green-600 font-extrabold tracking-wider uppercase flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Active RAG Connection
                </span>
              </div>
            </div>
            <button onClick={() => setAssistantOpen(false)} className="text-[#64748B] hover:text-[#0F172A] cursor-pointer bg-transparent border-0 p-1 rounded-lg hover:bg-slate-100 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-[#F8FAFC]">
            {assistantMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-sm ${
                  msg.sender === "user"
                    ? "bg-blue-600 text-white font-semibold rounded-tr-none"
                    : "bg-white border border-[#E2E8F0] text-[#0F172A] font-medium rounded-tl-none"
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={assistantEndRef} />
          </div>

          {/* Prompt chips and Input area */}
          <div className="p-4 bg-white border-t border-[#E2E8F0]">
            {/* Quick Prompt Chips */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {[
                { label: "Run RCA", text: "Run a Root Cause Analysis on pump failure P-101." },
                { label: "Check Compliance", text: "What is our current compliance status regarding OISD standards?" },
                { label: "Maintenance SOP", text: "What is the maintenance SOP for compressor C-12?" },
              ].map(chip => (
                <button
                  key={chip.label}
                  onClick={() => setAssistantInput(chip.text)}
                  className="px-2.5 py-1 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-full text-[10px] font-bold text-slate-600 hover:text-blue-600 transition-all cursor-pointer"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Input bar */}
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                {/* RAG Pulser inside the input bar */}
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" title="RAG Connection Active" />
                </div>
                <input
                  value={assistantInput}
                  onChange={e => setAssistantInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAssistantSend()}
                  placeholder="Ask a quick plant question..."
                  className="w-full pl-7 pr-3 py-2 text-xs text-[#0F172A] border border-[#E2E8F0] rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-white transition-all"
                />
              </div>
              <button onClick={handleAssistantSend} className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-750 transition-colors cursor-pointer border-0 shadow-sm">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Floating trigger button when drawer is closed */}
        {!assistantOpen && (
          <button
            onClick={() => setAssistantOpen(true)}
            className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-gradient-to-tr from-blue-600 to-blue-500 text-white flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 transition-all cursor-pointer border-0 z-40 group"
          >
            <MessageSquare className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
          </button>
        )}

      </div>
    </ChatProvider>
  );
}
