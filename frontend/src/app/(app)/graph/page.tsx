"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import ReactFlow, {
  Background, Controls, MiniMap, BackgroundVariant,
  type Node, type Edge, MarkerType, ReactFlowProvider, useReactFlow
} from "reactflow";
import "reactflow/dist/style.css";
import { fetchGraph, fetchRecurringPatterns, type RecurringPattern } from "@/lib/api";
import GraphLoader from "@/components/loaders/GraphLoader";
import {
  Network, RefreshCw, Info, Sparkles, ZoomIn, ZoomOut, Maximize2,
  Minimize2, Compass, CheckCircle2, AlertTriangle, FileText,
  User, ShieldAlert, Cpu, Eye, ArrowUpRight, Search, Gauge, Layout, Settings, FileSearch, HelpCircle, EyeOff, Clock, Brain, Landmark, HardHat, PackageOpen, Layers
} from "lucide-react";
import { useRouter } from "next/navigation";

// Color mapping specifications
const TYPE_META: Record<string, { label: string; color: string; bg: string; icon: React.ElementType; status: string }> = {
  Facility:          { label: "Document Registry",    color: "#2563EB", bg: "#EFF6FF", icon: Landmark,     status: "Operational" },
  Unit:              { label: "Processing Unit",      color: "#7C3AED", bg: "#F5F3FF", icon: Layers,       status: "Active" },
  System:            { label: "System Loop",          color: "#0D9488", bg: "#F0FDFA", icon: Network,      status: "Online" },
  Document:          { label: "SOP Document",         color: "#F97316", bg: "#FFF7ED", icon: FileText,     status: "Active" },
  SOP:               { label: "SOP Document",         color: "#F97316", bg: "#FFF7ED", icon: FileText,     status: "Active" },
  Equipment:          { label: "Equipment",            color: "#4F46E5", bg: "#EEF2FF", icon: Cpu,          status: "Healthy" },
  Machine:           { label: "Equipment",            color: "#4F46E5", bg: "#EEF2FF", icon: Cpu,          status: "Healthy" },
  MaintenanceRecord: { label: "Maintenance",          color: "#16A34A", bg: "#ECFDF5", icon: CheckCircle2, status: "Completed" },
  InspectionReport:  { label: "Inspection",           color: "#F59E0B", bg: "#FEFCE8", icon: FileSearch,   status: "Reviewed" },
  Failure:           { label: "Failures",             color: "#DC2626", bg: "#FEE2E2", icon: AlertTriangle,status: "Investigating" },
  Sensor:            { label: "Sensors",              color: "#06B6D4", bg: "#ECFEFF", icon: Gauge,        status: "Online" },
  Engineer:          { label: "Engineer",             color: "#8B5CF6", bg: "#F5F3FF", icon: HardHat,      status: "On Duty" },
  Person:            { label: "Personnel",            color: "#8B5CF6", bg: "#F5F3FF", icon: HardHat,      status: "On Duty" },
  SpareParts:        { label: "Spare Parts",          color: "#64748B", bg: "#F1F5F9", icon: PackageOpen,  status: "In Stock" }
};

const getMeta = (t: string) => TYPE_META[t] ?? { label: "Plant Asset", color: "#64748B", bg: "#F8FAFC", icon: Info, status: "Active" };

// Dynamic tree parser placing Document as parent/root
function buildTreeFromApi(apiNodes: any[], apiEdges: any[]) {
  const assignedIds = new Set<string>();

  // Find Document / SOP nodes
  const documents = apiNodes.filter(n => n.type === "Document" || n.type === "SOP");
  
  documents.forEach(d => assignedIds.add(d.id));

  // Map connected entities as children of documents
  const documentTreeNodes = documents.map(d => {
    const connectedEdges = apiEdges.filter(e => e.source === d.id || e.target === d.id);
    const connectedIds = Array.from(new Set(connectedEdges.map(e => e.source === d.id ? e.target : e.source)));
    
    const children = apiNodes
      .filter(n => connectedIds.includes(n.id) && n.type !== "Document" && n.type !== "SOP")
      .map(c => {
        assignedIds.add(c.id);
        const edge = connectedEdges.find(e => e.source === c.id || e.target === c.id || (e.source === d.id && e.target === c.id));
        return {
          id: `${d.id}-${c.id}`,
          realId: c.id,
          label: c.data?.label || c.label || `${c.type}: ${c.id}`,
          type: c.type,
          subtitle: edge ? edge.label : "",
          status: "Active",
          children: []
        };
      });

    return {
      id: d.id,
      realId: d.id,
      label: d.data?.label || d.label || d.id,
      type: "Document",
      status: "Active",
      children
    };
  });

  const unassignedNodes = apiNodes.filter(n => !assignedIds.has(n.id));

  const generalNodes = unassignedNodes.map(n => ({
    id: n.id,
    realId: n.id,
    label: n.data?.label || n.label || n.id,
    type: n.type,
    subtitle: "Standalone",
    status: "Active",
    children: []
  }));

  const treeRoot = {
    id: "root-archive",
    realId: "root-archive",
    label: "SOP Document Archive",
    type: "Facility",
    status: "Operational",
    children: [
      ...documentTreeNodes,
      ...(generalNodes.length > 0 ? [{
        id: "sys-standalone",
        realId: "sys-standalone",
        label: "Standalone Elements",
        type: "System",
        status: "Active",
        children: generalNodes
      }] : [])
    ]
  };

  return treeRoot;
}

function CustomNode({ data }: { data: { label: string; type?: string; subtitle?: string; status?: string; hasChildren?: boolean; isExpanded?: boolean; isSelected?: boolean; isFaded?: boolean } }) {
  const type = data.type ?? "Equipment";
  const meta = getMeta(type);
  const Icon = meta.icon;
  const [hovered, setHovered] = useState(false);

  const isInteractiveType = ["Document", "SOP", "Equipment", "Machine", "Facility", "Unit", "System"].includes(type);
  const isPulsing = data.isSelected || isInteractiveType;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`w-[170px] h-[65px] px-3.5 py-2.5 bg-white border rounded-[14px] shadow-sm flex flex-col justify-between text-left select-none relative transition-all duration-300 hover:scale-105 hover:shadow-lg cursor-pointer ${
        data.isSelected ? "border-blue-500 bg-blue-50/40 ring-1 ring-blue-500" : "border-[#E5E7EB]"
      } ${data.isFaded ? "opacity-35" : "opacity-100"} ${isPulsing ? "node-pulse-active" : ""}`}
    >
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${meta.color}12`, border: `1px solid ${meta.color}25` }}>
          <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold text-[#0F172A] truncate leading-tight">{data.label}</p>
          <p className="text-[8px] text-[#64748B] font-bold uppercase tracking-wider mt-0.5">{meta.label}</p>
        </div>
      </div>
      
      <div className="flex items-center justify-between mt-1 pt-1 border-t border-[#F1F5F9] text-[8px] text-[#94A3B8] font-bold">
        <span>{data.subtitle || meta.status}</span>
        {data.hasChildren && (
          <span className="text-blue-600 font-extrabold text-[9px]">
            {data.isExpanded ? "−" : "+"}
          </span>
        )}
      </div>

      {/* Sleek micro-tooltip containing quick mock metadata */}
      {hovered && (
        <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 px-3 py-2 bg-slate-900/90 backdrop-blur-md text-white text-[9px] font-bold rounded-lg shadow-xl border border-slate-700 pointer-events-none whitespace-nowrap z-50 animate-fade-in flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${data.isSelected ? "bg-blue-400" : "bg-green-400"} animate-pulse`} />
            <span className="text-slate-100">Status: {data.status || meta.status}</span>
          </div>
          <div className="text-[8.5px] text-slate-350 font-semibold">Category: {meta.label}</div>
          {data.subtitle && (
            <div className="text-[8.5px] text-slate-350 font-semibold">Relation: {data.subtitle}</div>
          )}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { default: CustomNode };

function GraphInner() {
  const router = useRouter();
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  
  // Track dynamic API database tree
  const [treeData, setTreeData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Track expanded tree nodes
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set(["root-archive", "sys-standalone"])
  );
  
  // Track clicked / selected node
  const [selectedNodeId, setSelectedNodeId] = useState<string>("root-archive");
  const [patterns, setPatterns] = useState<RecurringPattern[]>([]);
  const [searchVal, setSearchVal] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [miniMapVisible, setMiniMapVisible] = useState(true);

  // Flattened active nodes & edges based on expansion
  const [visibleNodes, setVisibleNodes] = useState<Node[]>([]);
  const [visibleEdges, setVisibleEdges] = useState<Edge[]>([]);

  const loadGraph = useCallback(() => {
    setLoading(true);
    fetchGraph()
      .then(data => {
        const root = buildTreeFromApi(data.nodes ?? [], data.relationships ?? []);
        setTreeData(root);
        
        // Find default document node to select and auto-expand
        const defaultDoc = (data.nodes ?? []).find(n => n.type === "Document" || n.type === "SOP");
        if (defaultDoc) {
          setSelectedNodeId(defaultDoc.id);
          setExpandedNodes(new Set(["root-archive", "sys-standalone", defaultDoc.id]));
        } else {
          setSelectedNodeId("root-archive");
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
    fetchRecurringPatterns().then(setPatterns).catch(console.error);
  }, []);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // Compute Left-to-Right Hierarchy Layout
  useEffect(() => {
    if (!treeData) return;

    const nodesList: Node[] = [];
    const edgesList: Edge[] = [];
    let yPos = 50;

    function traverse(node: any, level: number, parentId: string | null): number {
      const isExpanded = expandedNodes.has(node.id);
      const isSelected = selectedNodeId === node.id;
      
      // Determine if this node lies on the selected pathway (ancestor/descendant)
      const isAncestor = isNodeAncestorOf(treeData, node.id, selectedNodeId);
      const isDescendant = isNodeDescendantOf(findSubtree(treeData, selectedNodeId), node.id);
      const isActivePath = isSelected || isAncestor || isDescendant;
      
      const isFaded = selectedNodeId ? !isActivePath : false;

      const nodeEntry: Node = {
        id: node.id,
        type: "default",
        position: { x: level * 230 + 50, y: 0 },
        data: {
          label: node.label,
          type: node.type,
          subtitle: node.subtitle,
          status: node.status,
          hasChildren: node.children && node.children.length > 0,
          isExpanded,
          isSelected,
          isFaded
        }
      };

      if (parentId) {
        edgesList.push({
          id: `edge-${parentId}-${node.id}`,
          source: parentId,
          target: node.id,
          type: "smoothstep",
          animated: isActivePath,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: isActivePath ? "#2563EB" : "#CBD5E1"
          },
          style: {
            stroke: isActivePath ? "#2563EB" : "#CBD5E1",
            strokeWidth: isActivePath ? 2.5 : 1.5,
            transition: "stroke 0.2s"
          }
        });
      }

      nodesList.push(nodeEntry);

      let computedY = 0;
      if (isExpanded && node.children && node.children.length > 0) {
        const childYList: number[] = [];
        node.children.forEach((child: any) => {
          const cy = traverse(child, level + 1, node.id);
          childYList.push(cy);
        });
        const minY = Math.min(...childYList);
        const maxY = Math.max(...childYList);
        computedY = minY + (maxY - minY) / 2;
      } else {
        computedY = yPos;
        yPos += 95;
      }

      nodeEntry.position.y = computedY;
      return computedY;
    }

    traverse(treeData, 0, null);
    setVisibleNodes(nodesList);
    setVisibleEdges(edgesList);
  }, [expandedNodes, selectedNodeId, treeData]);

  const handleNodeClick = (_: any, node: Node) => {
    setSelectedNodeId(node.id);
    
    const rawRef = findSubtree(treeData, node.id);
    if (rawRef && rawRef.children && rawRef.children.length > 0) {
      setExpandedNodes(prev => {
        const next = new Set(prev);
        if (next.has(node.id)) {
          next.delete(node.id);
        } else {
          next.add(node.id);
        }
        return next;
      });
    }
  };

  const selectedNodeDetails = useMemo(() => {
    if (!treeData) return null;
    const raw = findSubtree(treeData, selectedNodeId);
    if (!raw) return null;
    return {
      name: raw.label,
      type: raw.type,
      status: raw.status,
      subtitle: raw.subtitle
    };
  }, [selectedNodeId, treeData]);

  function findSubtree(root: any, id: string): any {
    if (!root) return null;
    if (root.id === id) return root;
    if (root.children) {
      for (const child of root.children) {
        const found = findSubtree(child, id);
        if (found) return found;
      }
    }
    return null;
  }

  function isNodeAncestorOf(root: any, possibleAncestorId: string, nodeId: string): boolean {
    const ancestorSubtree = findSubtree(root, possibleAncestorId);
    if (!ancestorSubtree) return false;
    return !!findSubtree(ancestorSubtree, nodeId) && possibleAncestorId !== nodeId;
  }

  function isNodeDescendantOf(subtreeRoot: any, possibleDescendantId: string): boolean {
    if (!subtreeRoot) return false;
    return !!findSubtree(subtreeRoot, possibleDescendantId);
  }

  const expandAll = () => {
    if (!treeData) return;
    const allIds = new Set<string>();
    function collect(node: any) {
      if (node.children && node.children.length > 0) {
        allIds.add(node.id);
        node.children.forEach(collect);
      }
    }
    collect(treeData);
    setExpandedNodes(allIds);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set(["root-archive"]));
  };

  const resetView = () => {
    const firstDocId = treeData?.children?.[0]?.id || "root-archive";
    setExpandedNodes(new Set(["root-archive", "sys-standalone", firstDocId]));
    setSelectedNodeId(firstDocId);
    setTimeout(() => fitView({ duration: 500 }), 50);
  };

  const suggestions = useMemo(() => {
    if (!searchVal.trim() || !treeData) return [];
    const collected: any[] = [];
    function collect(node: any) {
      if (node.label.toLowerCase().includes(searchVal.toLowerCase())) {
        collected.push(node);
      }
      if (node.children) node.children.forEach(collect);
    }
    collect(treeData);
    return collected.slice(0, 5);
  }, [searchVal, treeData]);

  const selectSuggested = (item: any) => {
    setSearchVal("");
    setSearchFocused(false);
    setSelectedNodeId(item.id);
    
    const ancestors: string[] = [];
    function traceAncestors(node: any, targetId: string): boolean {
      if (node.id === targetId) return true;
      if (node.children) {
        for (const child of node.children) {
          if (traceAncestors(child, targetId)) {
            ancestors.push(node.id);
            return true;
          }
        }
      }
      return false;
    }
    traceAncestors(treeData, item.id);
    setExpandedNodes(prev => {
      const next = new Set(prev);
      ancestors.forEach(id => next.add(id));
      return next;
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] p-6 bg-[#FAFAF8]">
      {/* Header toolbar */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-500 shadow-sm">
            <Network className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-[#0F172A] tracking-tight">Enterprise Asset Dependency Explorer</h1>
            <p className="text-[10px] text-[#64748B] font-semibold">Left-to-right topological tree mapping SOP Document dependencies.</p>
          </div>
        </div>

        {/* Dynamic Search Autocomplete */}
        <div className="relative w-72">
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={searchVal}
            onChange={e => setSearchVal(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            placeholder="Search equipment, procedures, personnel..."
            className="w-full pl-9 pr-4 py-1.5 text-xs border border-[#E2E8F0] rounded-xl outline-none focus:border-blue-500 bg-white"
          />
          {searchFocused && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 mt-1.5 bg-white border border-[#E2E8F0] rounded-xl shadow-lg z-55 max-h-48 overflow-y-auto p-1.5">
              {suggestions.map(s => {
                const meta = getMeta(s.type);
                return (
                  <button
                    key={s.id}
                    onClick={() => selectSuggested(s)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-[#F1F5F9] rounded-lg text-left border-0 bg-transparent cursor-pointer"
                  >
                    <meta.icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
                    <span className="text-xs text-[#0F172A] font-semibold truncate">
                      {s.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-5 flex-1 min-h-0">
        {/* Main Workspace Graph Container */}
        <div className="flex-1 min-h-[360px] md:min-h-0 bg-[#FAFAF8] border border-[#E5E7EB] rounded-[18px] overflow-hidden shadow-sm flex flex-col relative">
          
          {/* Top Toolbar Action Buttons */}
          <div className="absolute top-4 left-4 z-10 flex gap-1.5">
            <button onClick={expandAll} className="px-3 py-1.5 bg-white border border-[#E2E8F0] hover:bg-[#F1F5F9] text-[#64748B] hover:text-[#0F172A] rounded-xl text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-1">
              Expand All
            </button>
            <button onClick={collapseAll} className="px-3 py-1.5 bg-white border border-[#E2E8F0] hover:bg-[#F1F5F9] text-[#64748B] hover:text-[#0F172A] rounded-xl text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-1">
              Collapse All
            </button>
            <button onClick={resetView} className="px-3 py-1.5 bg-white border border-[#E2E8F0] hover:bg-[#F1F5F9] text-[#64748B] hover:text-[#0F172A] rounded-xl text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-1">
              Reset Tree
            </button>
          </div>

          {/* Canvas Wrapper */}
          <div className="flex-1 min-h-0 relative">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <GraphLoader />
              </div>
            ) : (
              <ReactFlow
                nodes={visibleNodes}
                edges={visibleEdges}
                nodeTypes={nodeTypes}
                onNodeClick={handleNodeClick}
                fitView
                fitViewOptions={{ padding: 0.15 }}
                minZoom={0.1}
                maxZoom={2.0}
              >
                <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#E2E8F0" />
                
                {/* Standard React Flow Zoom & Fit Controls overlay */}
                <Controls className="bg-white border border-[#E2E8F0] shadow-sm rounded-xl p-1 flex flex-col gap-0.5" />

                {/* Minimap override (glassmorphic styling) */}
                {miniMapVisible && (
                  <MiniMap
                    nodeColor={n => getMeta((n.data as any).type ?? "Equipment").color}
                    className="rounded-xl border border-[#E2E8F0] shadow-sm bg-white/70 backdrop-blur-md"
                  />
                )}
              </ReactFlow>
            )}
          </div>

          {/* Bottom Toolbar Control Buttons */}
          <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 p-1.5 bg-white border border-[#E2E8F0] rounded-xl shadow-sm">
            <button onClick={() => setMiniMapVisible(v => !v)} title="Toggle Minimap" className="p-2 hover:bg-[#F1F5F9] rounded-lg cursor-pointer text-[#64748B] hover:text-[#0F172A] border-0 bg-transparent">
              <Eye className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-[#E2E8F0]" />
            <button onClick={() => zoomIn()} title="Zoom In" className="p-2 hover:bg-[#F1F5F9] rounded-lg cursor-pointer text-[#64748B] hover:text-[#0F172A] border-0 bg-transparent">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={() => zoomOut()} title="Zoom Out" className="p-2 hover:bg-[#F1F5F9] rounded-lg cursor-pointer text-[#64748B] hover:text-[#0F172A] border-0 bg-transparent">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button onClick={() => fitView({ duration: 600 })} title="Fit Screen" className="p-2 hover:bg-[#F1F5F9] rounded-lg cursor-pointer text-[#64748B] hover:text-[#0F172A] border-0 bg-transparent">
              <Maximize2 className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-[#E2E8F0]" />
            <button onClick={loadGraph} title="Refresh Network" className="p-2 hover:bg-[#F1F5F9] rounded-lg cursor-pointer text-[#64748B] hover:text-[#0F172A] border-0 bg-transparent">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Info Drawer Panel */}
        <div className="w-full md:w-80 flex flex-col gap-4 flex-shrink-0">
          
          {/* Selected Node Details Card */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-4 flex-1 overflow-y-auto">
            {selectedNodeDetails ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2.5 border-b border-[#E2E8F0] pb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{
                      background: `${getMeta(selectedNodeDetails.type).color}10`,
                      border: `1.5px solid ${getMeta(selectedNodeDetails.type).color}20`
                    }}>
                    <Sparkles className="w-4 h-4" style={{ color: getMeta(selectedNodeDetails.type).color }} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-[#0F172A] truncate w-52">
                      {selectedNodeDetails.name}
                    </h3>
                    <p className="text-[10px] text-[#64748B] font-semibold mt-0.5">Category: {getMeta(selectedNodeDetails.type).label}</p>
                  </div>
                </div>

                <div className="space-y-3.5">
                  {(selectedNodeDetails.type === "Machine" || selectedNodeDetails.type === "Equipment") && (
                    <>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="p-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
                          <p className="text-sm font-extrabold text-[#16A34A]">98.2%</p>
                          <p className="text-[9px] text-[#94A3B8] font-bold uppercase mt-0.5">Health Index</p>
                        </div>
                        <div className="p-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
                          <p className="text-sm font-extrabold text-[#DC2626]">Low</p>
                          <p className="text-[9px] text-[#94A3B8] font-bold uppercase mt-0.5">Criticality</p>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-[#94A3B8] uppercase">Recommended AI Action</p>
                        <p className="text-xs text-slate-700 leading-relaxed font-semibold">
                          Evaluate bearing alignment during weekly inspection rounds. Standard: SOP-Sec4-V2.
                        </p>
                      </div>

                      {/* Mock history events */}
                      <div className="space-y-2 border-t border-[#E2E8F0] pt-3">
                        <p className="text-[10px] font-bold text-[#94A3B8] uppercase flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Maintenance History</p>
                        <div className="space-y-1.5 pl-3 border-l-2 border-slate-100">
                          <div className="text-xs">
                            <span className="font-bold text-[#0F172A]">Lubricant Flush</span>
                            <span className="text-[10px] text-[#64748B] font-mono ml-2">12 June</span>
                          </div>
                          <div className="text-xs">
                            <span className="font-bold text-[#0F172A]">Sensor Calibration</span>
                            <span className="text-[10px] text-[#64748B] font-mono ml-2">08 May</span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {selectedNodeDetails.type !== "Machine" && selectedNodeDetails.type !== "Equipment" && (
                    <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-2">
                      <p className="text-[10px] font-bold text-[#94A3B8] uppercase">AI Entity Overview</p>
                      <p className="text-xs text-[#64748B] leading-relaxed font-semibold">
                        {selectedNodeDetails.subtitle
                          ? `Associated relation label: "${selectedNodeDetails.subtitle}". `
                          : ""}
                        This topological entry is indexed inside the plant knowledge base to ground AI Copilot responses.
                      </p>
                    </div>
                  )}

                  {/* Operational redirection links */}
                  <div className="space-y-2 border-t border-[#E2E8F0] pt-4">
                    <button
                      onClick={() => router.push("/chat")}
                      className="w-full flex items-center justify-between p-2.5 bg-[#F1F5F9] hover:bg-[#E2E8F0] rounded-xl text-xs font-bold text-[#0F172A] cursor-pointer transition-colors border-0 text-left"
                    >
                      <span className="flex items-center gap-1.5"><Brain className="w-3.5 h-3.5 text-blue-600" /> Open AI Copilot</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-[#64748B]" />
                    </button>
                    <button
                      onClick={() => router.push("/documents")}
                      className="w-full flex items-center justify-between p-2.5 bg-[#F1F5F9] hover:bg-[#E2E8F0] rounded-xl text-xs font-bold text-[#0F172A] cursor-pointer transition-colors border-0 text-left"
                    >
                      <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-amber-600" /> Reference SOP Documents</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-[#64748B]" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-20 text-center space-y-2">
                <Compass className="w-10 h-10 mx-auto text-[#CBD5E1]" />
                <p className="text-xs font-bold text-[#64748B]">No Node Selected</p>
                <p className="text-[10px] text-[#94A3B8] max-w-xs mx-auto">
                  Click on any refinery node in the topology layout to reveal connections, incident timeline details, and AI maintenance guidelines.
                </p>
              </div>
            )}
          </div>
          
          {/* Static Legend Types */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm">
            <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider mb-2">Topology Categories</p>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-[#64748B]">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#EFF6FF] border border-[#2563EB]" /> Facility</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#FFF7ED] border border-[#F97316]" /> Documents</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#EEF2FF] border border-[#4F46E5]" /> Equipment</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ReactFlowProvider wrapper export
export default function GraphPage() {
  return (
    <ReactFlowProvider>
      <GraphInner />
    </ReactFlowProvider>
  );
}
