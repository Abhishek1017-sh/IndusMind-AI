"use client";

import { useState } from "react";
import { Settings, Shield, Server, FileText, Cpu, Key, HelpCircle, Save, Database, History } from "lucide-react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"model" | "sources" | "roles" | "audit">("model");
  const [temperature, setTemperature] = useState(0.2);
  const [chunkSize, setChunkSize] = useState(1024);
  const [modelType, setModelType] = useState("gemini-pro-1.5");

  const [sources, setSources] = useState([
    { name: "Refinery SOP Database", type: "PostgreSQL", status: "Connected", sync: "2m ago" },
    { name: "Vibration Sensor Telemetry", type: "MQTT Broker", status: "Connected", sync: "Just now" },
    { name: "Standard CAD Schematics Archive", type: "AWS S3 Bucket", status: "Standby", sync: "1d ago" }
  ]);

  const [auditLogs] = useState([
    { event: "Document uploaded: SOP-Jamnagar-V2.pdf", user: "Elena Rostova", time: "10m ago", ip: "192.168.4.12" },
    { event: "Compliance Report generated: Q2 Audit", user: "Dave Miller", time: "2h ago", ip: "192.168.4.88" },
    { event: "Knowledge Graph rebuilt: Jamnagar Refinery", user: "System Scheduler", time: "5h ago", ip: "127.0.0.1" }
  ]);

  return (
    <div className="p-6 md:p-8 space-y-6 bg-[#F8FAFC]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-500">
              <Settings className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">System Settings</h1>
          </div>
          <p className="text-xs text-[#64748B] font-semibold mt-1 ml-11">
            Configure prompt parameters, register database connectors, manage API access, and view secure audit trails.
          </p>
        </div>
      </div>

      {/* Main settings layout */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Left Side: Sub Tabs */}
        <div className="md:col-span-1 flex flex-col gap-2">
          {[
            { id: "model", label: "AI Model Config", icon: Cpu },
            { id: "sources", label: "Knowledge Sources", icon: Database },
            { id: "roles", label: "Roles & Permissions", icon: Shield },
            { id: "audit", label: "Security Audit Logs", icon: History }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer border"
              style={activeTab === t.id
                ? { background: "#FFFFFF", borderColor: "#E2E8F0", color: "#2563EB", boxShadow: "0 2px 4px rgba(15,23,42,0.05)" }
                : { background: "transparent", borderColor: "transparent", color: "#64748B" }
              }
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Right Side: Tab Contents */}
        <div className="md:col-span-3">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-sm space-y-6">
            
            {/* Tab: Model Config */}
            {activeTab === "model" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">AI LLM Parameter Tuning</h3>
                  <p className="text-[11px] text-[#64748B] font-semibold mt-0.5">Control grounding strictness and response length.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="flex justify-between text-xs font-bold text-[#64748B]">
                      <span>Primary AI LLM Model</span>
                      <span className="text-blue-600 font-extrabold">{modelType}</span>
                    </label>
                    <select
                      value={modelType}
                      onChange={e => setModelType(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs text-[#0F172A] border border-[#E2E8F0] bg-white rounded-xl outline-none focus:border-blue-500"
                    >
                      <option value="gemini-pro-1.5">Gemini 2.5 Flash (Default)</option>
                      <option value="gemini-ultra-1.0">Gemini 2.5 Pro (Deep Reasoning)</option>
                      <option value="gpt-4o-enterprise">GPT-4o Enterprise</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="flex justify-between text-xs font-bold text-[#64748B]">
                      <span>Temperature (Creativity vs. Precision)</span>
                      <span className="text-blue-600 font-extrabold">{temperature}</span>
                    </label>
                    <input
                      type="range"
                      min="0.0"
                      max="1.0"
                      step="0.1"
                      value={temperature}
                      onChange={e => setTemperature(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-[#F1F5F9] rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between text-[9px] text-[#94A3B8] font-bold uppercase">
                      <span>Strict Grounded Facts (0.0)</span>
                      <span>High Creativity (1.0)</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="flex justify-between text-xs font-bold text-[#64748B]">
                      <span>RAG Token Chunk Size</span>
                      <span className="text-blue-600 font-extrabold">{chunkSize} tokens</span>
                    </label>
                    <select
                      value={chunkSize}
                      onChange={e => setChunkSize(parseInt(e.target.value))}
                      className="w-full px-3.5 py-2 text-xs text-[#0F172A] border border-[#E2E8F0] bg-white rounded-xl outline-none"
                    >
                      <option value="512">512 Tokens (Precise lookup)</option>
                      <option value="1024">1,024 Tokens (Standard paragraph context)</option>
                      <option value="2048">2,048 Tokens (High document coverage)</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-[#E2E8F0] pt-4 flex justify-end">
                  <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-750 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm">
                    <Save className="w-4 h-4" /> Save Configuration
                  </button>
                </div>
              </div>
            )}

            {/* Tab: Knowledge Sources */}
            {activeTab === "sources" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">Knowledge Source Connectors</h3>
                  <p className="text-[11px] text-[#64748B] font-semibold mt-0.5">Manage indexes linked to telemetry channels and document servers.</p>
                </div>

                <div className="space-y-3">
                  {sources.map(src => (
                    <div key={src.name} className="flex items-center justify-between p-3.5 border border-[#E2E8F0] rounded-xl hover:bg-[#F8FAFC] transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#F1F5F9]">
                          <Database className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-[#0F172A]">{src.name}</p>
                          <p className="text-[10px] text-[#64748B] font-semibold mt-0.5">{src.type} • Synced {src.sync}</p>
                        </div>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {src.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab: Roles & Permissions */}
            {activeTab === "roles" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">Roles &amp; Permission Schemes</h3>
                  <p className="text-[11px] text-[#64748B] font-semibold mt-0.5">Control pipeline editing access and RAG query visibility.</p>
                </div>

                <div className="space-y-3">
                  {[
                    { role: "Field Technician", scope: "View SOP files, write chat messages, scan QR codes." },
                    { role: "Safety Auditor", scope: "Execute compliance checklists, generate safety report cards." },
                    { role: "Plant Administrator", scope: "Upload documents, manage API keys, configure connections." }
                  ].map(r => (
                    <div key={r.role} className="p-4 border border-[#E2E8F0] rounded-xl space-y-1 hover:bg-[#F8FAFC] transition-colors cursor-pointer">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#0F172A]">{r.role}</span>
                        <input type="checkbox" defaultChecked className="w-4 h-4 border-[#E2E8F0] text-blue-600 rounded" />
                      </div>
                      <p className="text-[11px] text-[#64748B] font-semibold leading-relaxed">{r.scope}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab: Audit Logs */}
            {activeTab === "audit" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">Security Audit trails</h3>
                  <p className="text-[11px] text-[#64748B] font-semibold mt-0.5">Crypto-signed operations logs of refinery personnel actions.</p>
                </div>

                <div className="space-y-2">
                  {auditLogs.map((log, i) => (
                    <div key={i} className="flex justify-between items-center p-3 border border-[#E2E8F0] rounded-xl text-xs bg-[#F8FAFC]">
                      <div>
                        <p className="font-bold text-[#0F172A]">{log.event}</p>
                        <p className="text-[10px] text-[#94A3B8] font-bold mt-0.5">{log.user} • IP: {log.ip}</p>
                      </div>
                      <span className="text-[10px] font-bold text-[#64748B] font-mono">{log.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
