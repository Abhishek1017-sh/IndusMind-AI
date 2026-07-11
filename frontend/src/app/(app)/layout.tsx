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
      <div className="flex min-h-screen bg-[#FAFAF8]">
        <Sidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
        
        <div className="flex-1 md:ml-64 flex flex-col min-h-screen overflow-x-hidden">
          {/* White top navigation bar */}
          <header className="sticky top-0 z-20 flex items-center justify-between px-6 py-3.5 bg-white border-b border-[#E2E8F0] shadow-sm">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileMenuOpen(true)} className="md:hidden text-[#64748B] hover:text-[#0F172A] p-1.5 cursor-pointer rounded-lg hover:bg-[#F1F5F9]" aria-label="Open menu">
                <Menu className="w-5 h-5" />
              </button>
              {/* Facility label removed */}
            </div>

            {/* Large centered AI Search bar */}
            <div className="relative w-full max-w-md mx-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
              <input
                onClick={() => setPaletteOpen(true)}
                readOnly
                placeholder="Ask anything about your plant... (Ctrl + K)"
                className="w-full pl-9 pr-20 py-1.5 text-xs text-[#0F172A] placeholder:text-[#94A3B8] bg-[#F1F5F9] border border-[#E2E8F0] rounded-lg outline-none cursor-pointer hover:border-[#3B82F6] transition-all"
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

        {/* Global Floating AI Assistant Drawer */}
        <div className="fixed bottom-4 right-4 z-40">
          {assistantOpen ? (
            <div className="w-80 h-96 bg-white border border-[#E2E8F0] rounded-2xl shadow-xl flex flex-col overflow-hidden animate-slide-up">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#E2E8F0]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-500">
                    <Brain className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-xs font-bold text-[#0F172A]">Plant AI Assistant</span>
                </div>
                <button onClick={() => setAssistantOpen(false)} className="text-[#64748B] hover:text-[#0F172A] cursor-pointer bg-transparent border-0">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#F8FAFC]">
                {assistantMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
                      msg.sender === "user" ? "bg-blue-600 text-white font-semibold" : "bg-white border border-[#E2E8F0] text-[#0F172A] font-medium"
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={assistantEndRef} />
              </div>

              {/* Input */}
              <div className="p-3 bg-white border-t border-[#E2E8F0] flex gap-2">
                <input
                  value={assistantInput}
                  onChange={e => setAssistantInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAssistantSend()}
                  placeholder="Ask a quick plant question..."
                  className="flex-1 px-3 py-1.5 text-xs text-[#0F172A] border border-[#E2E8F0] rounded-lg outline-none focus:border-blue-500 bg-white"
                />
                <button onClick={handleAssistantSend} className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-750 transition-colors cursor-pointer border-0">
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAssistantOpen(true)}
              className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg hover:bg-blue-750 transition-all hover:scale-105 cursor-pointer border-0">
              <MessageSquare className="w-5 h-5" />
            </button>
          )}
        </div>

      </div>
    </ChatProvider>
  );
}
