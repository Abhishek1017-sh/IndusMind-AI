"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import { motion } from "framer-motion";
import {
  Boxes, Building2, Calendar, Cpu, FileText, MapPin, Network, Package,
  RefreshCw, Search, Shield, User, Wrench, X, Zap,
} from "lucide-react";

import {
  fetchGraph, fetchRecurringPatterns,
  type GraphData, type GraphNode, type RecurringPattern,
} from "@/lib/api";
import { computeGraphLayout } from "@/lib/graphLayout";
import { Badge, Button, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";

/* Every node and edge here is a real entity/relationship the backend extracted
   from the user's uploaded documents. Nothing is synthesised — an empty graph
   is shown as an honest empty state, never padded with placeholder assets. */

// Entity type → colour + icon. Colour identifies type only; it never implies a
// fabricated status (the previous version invented "Operational"/"On Duty").
type TypeMeta = { color: string; icon: React.ElementType };
const TYPE_META: Record<string, TypeMeta> = {
  Document: { color: "#4f46e5", icon: FileText },
  SOP: { color: "#4f46e5", icon: FileText },
  Machine: { color: "#0d9488", icon: Cpu },
  Equipment: { color: "#0d9488", icon: Cpu },
  Organization: { color: "#b45309", icon: Building2 },
  Person: { color: "#7c3aed", icon: User },
  Engineer: { color: "#7c3aed", icon: User },
  Location: { color: "#0891b2", icon: MapPin },
  SparePart: { color: "#64748b", icon: Package },
  Skill: { color: "#0891b2", icon: Zap },
  Date: { color: "#64748b", icon: Calendar },
  Regulation: { color: "#b42318", icon: Shield },
  Incident: { color: "#b42318", icon: Wrench },
};
const metaFor = (t: string): TypeMeta => TYPE_META[t] ?? { color: "#64748b", icon: Boxes };

// ── Custom node ─────────────────────────────────────────────────────────────
type NodeData = {
  label: string;
  type: string;
  state: "normal" | "selected" | "neighbor" | "dim";
};

function EntityNode({ data }: NodeProps<NodeData>) {
  const meta = metaFor(data.type);
  const Icon = meta.icon;
  const { state } = data;
  return (
    <div
      className={cn(
        "flex w-44 items-center gap-2 rounded-ui-lg border bg-surface px-2.5 py-2 shadow-e1 transition-all duration-200",
        state === "selected" && "border-transparent ring-2 shadow-e3",
        state === "neighbor" && "border-line-strong",
        state === "normal" && "border-line",
        state === "dim" && "border-line opacity-35"
      )}
      style={state === "selected" ? ({ "--tw-ring-color": meta.color } as React.CSSProperties) : undefined}
    >
      <Handle type="target" position={Position.Left} className="!h-1 !w-1 !border-0 !bg-transparent" />
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-ui-sm"
        style={{ background: `${meta.color}14`, color: meta.color }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-bold leading-tight text-ink" title={data.label}>
          {data.label}
        </p>
        <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-ink-tertiary">
          {data.type}
        </p>
      </div>
      <Handle type="source" position={Position.Right} className="!h-1 !w-1 !border-0 !bg-transparent" />
    </div>
  );
}
const nodeTypes = { entity: EntityNode };

// ── Graph canvas ────────────────────────────────────────────────────────────
function GraphCanvas({
  graph, selectedId, onSelect,
}: {
  graph: GraphData;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { fitView } = useReactFlow();

  const positions = useMemo(
    () => computeGraphLayout(graph.nodes.map((n) => n.id), graph.relationships),
    [graph]
  );

  // Neighbour set of the selected node → drives highlight/fade.
  const neighbors = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const s = new Set<string>();
    for (const e of graph.relationships) {
      if (e.source === selectedId) s.add(e.target);
      if (e.target === selectedId) s.add(e.source);
    }
    return s;
  }, [selectedId, graph.relationships]);

  const nodes: Node<NodeData>[] = useMemo(
    () =>
      graph.nodes.map((n) => {
        const state: NodeData["state"] = !selectedId
          ? "normal"
          : n.id === selectedId
          ? "selected"
          : neighbors.has(n.id)
          ? "neighbor"
          : "dim";
        return {
          id: n.id,
          type: "entity",
          position: positions.get(n.id) ?? { x: 0, y: 0 },
          data: { label: n.data?.label ?? n.id, type: n.type, state },
        };
      }),
    [graph.nodes, positions, selectedId, neighbors]
  );

  const edges: Edge[] = useMemo(
    () =>
      graph.relationships.map((e) => {
        const active = !!selectedId && (e.source === selectedId || e.target === selectedId);
        const dim = !!selectedId && !active;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: active ? e.label : undefined,
          type: "smoothstep",
          animated: active,
          labelBgStyle: { fill: "var(--color-surface)" },
          labelStyle: { fontSize: 10, fontWeight: 600, fill: "var(--color-ink-secondary)" },
          style: {
            stroke: active ? "var(--color-brand)" : "var(--color-line-strong)",
            strokeWidth: active ? 2 : 1,
            opacity: dim ? 0.25 : 1,
          },
        };
      }),
    [graph.relationships, selectedId]
  );

  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 60);
    return () => clearTimeout(t);
  }, [graph, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, n) => onSelect(n.id)}
      onPaneClick={() => onSelect(null)}
      fitView
      minZoom={0.15}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      className="bg-canvas"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--color-line)" />
      <Controls
        showInteractive={false}
        className="!rounded-ui-md !border !border-line !bg-surface !shadow-e2 [&>button]:!border-line [&>button]:!text-ink-secondary"
      />
      <MiniMap
        pannable
        zoomable
        className="!rounded-ui-md !border !border-line !bg-surface"
        maskColor="rgba(11,18,32,0.06)"
        nodeColor={(n) => metaFor((n.data as NodeData)?.type ?? "")?.color}
        nodeStrokeWidth={0}
      />
    </ReactFlow>
  );
}

// ── Detail panel (grounded node info) ───────────────────────────────────────
function DetailPanel({
  node, graph, onClose, onSelect,
}: {
  node: GraphNode;
  graph: GraphData;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const meta = metaFor(node.type);
  const Icon = meta.icon;
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  const connections = useMemo(() => {
    const out: { id: string; label: string; rel: string }[] = [];
    for (const e of graph.relationships) {
      if (e.source === node.id && byId.has(e.target))
        out.push({ id: e.target, label: byId.get(e.target)!.data?.label ?? e.target, rel: e.label });
      else if (e.target === node.id && byId.has(e.source))
        out.push({ id: e.source, label: byId.get(e.source)!.data?.label ?? e.source, rel: e.label });
    }
    return out;
  }, [node, graph.relationships, byId]);

  // Surface any extra grounded properties the backend attached (excluding internals).
  const props = Object.entries(node.data ?? {}).filter(
    ([k, v]) =>
      !["label", "id", "document_ids"].includes(k) &&
      (typeof v === "string" || typeof v === "number") &&
      String(v).length > 0
  );

  return (
    <motion.aside
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="flex w-72 shrink-0 flex-col overflow-hidden rounded-ui-xl border border-line bg-surface shadow-e1"
    >
      <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ui-md"
            style={{ background: `${meta.color}14`, color: meta.color }}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink" title={node.data?.label}>
              {node.data?.label ?? node.id}
            </p>
            <Badge tone="brand">{node.type}</Badge>
          </div>
        </div>
        <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded-ui-sm text-ink-tertiary hover:bg-subtle">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {props.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">Attributes</p>
            <dl className="space-y-1">
              {props.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 text-xs">
                  <dt className="capitalize text-ink-tertiary">{k.replace(/_/g, " ")}</dt>
                  <dd className="truncate font-semibold text-ink" title={String(v)}>{String(v)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">
            Relationships · {connections.length}
          </p>
          {connections.length === 0 ? (
            <p className="text-xs text-ink-tertiary">No relationships extracted for this entity.</p>
          ) : (
            <ul className="space-y-1">
              {connections.map((c, i) => {
                const cm = metaFor(byId.get(c.id)?.type ?? "");
                const CIcon = cm.icon;
                return (
                  <li key={`${c.id}-${i}`}>
                    <button
                      onClick={() => onSelect(c.id)}
                      className="flex w-full items-center gap-2 rounded-ui-md border border-line px-2 py-1.5 text-left transition-colors hover:bg-subtle"
                    >
                      <CIcon className="h-3 w-3 shrink-0" style={{ color: cm.color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-ink">{c.label}</span>
                        <span className="block truncate text-[10px] text-ink-tertiary">{c.rel}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </motion.aside>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function GraphPage() {
  const [graph, setGraph] = useState<GraphData>({ nodes: [], relationships: [] });
  const [patterns, setPatterns] = useState<RecurringPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [g, p] = await Promise.allSettled([fetchGraph(), fetchRecurringPatterns()]);
      if (!alive) return;
      if (g.status === "fulfilled") {
        setGraph(g.value ?? { nodes: [], relationships: [] });
        setError(null);
      } else {
        setError("Couldn't reach the graph service.");
      }
      if (p.status === "fulfilled") setPatterns(p.value ?? []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [reloadKey]);

  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selectedId) ?? null,
    [graph.nodes, selectedId]
  );

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return graph.nodes
      .filter((n) => (n.data?.label ?? "").toLowerCase().includes(q) || n.type.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, graph.nodes]);

  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of graph.nodes) m.set(n.type, (m.get(n.type) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [graph.nodes]);

  const hasGraph = graph.nodes.length > 0;

  return (
    <div className="flex h-[calc(100vh-53px)] flex-col bg-canvas">
      {/* Toolbar */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-ui-md bg-brand">
            <Network className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-[13px] font-bold leading-tight text-ink">Knowledge Graph</h1>
            <p className="text-[11px] text-ink-tertiary">
              {hasGraph
                ? `${graph.nodes.length} entities · ${graph.relationships.length} relationships`
                : "Entities & relationships from your documents"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-60">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search entities…"
              disabled={!hasGraph}
              className="w-full rounded-ui-md border border-line bg-canvas py-1.5 pl-8 pr-3 text-xs text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:opacity-50"
            />
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-ui-md border border-line bg-surface p-1 shadow-e3">
                {searchResults.map((n) => {
                  const m = metaFor(n.type);
                  const I = m.icon;
                  return (
                    <button
                      key={n.id}
                      onClick={() => { setSelectedId(n.id); setQuery(""); }}
                      className="flex w-full items-center gap-2 rounded-ui-sm px-2 py-1.5 text-left hover:bg-subtle"
                    >
                      <I className="h-3.5 w-3.5 shrink-0" style={{ color: m.color }} />
                      <span className="truncate text-xs font-semibold text-ink">{n.data?.label ?? n.id}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <Button size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            Refresh
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {/* Canvas */}
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-ui-xl border border-line bg-canvas shadow-e1">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            </div>
          ) : error ? (
            <EmptyState
              className="h-full"
              icon={Network}
              title="Graph unavailable"
              reason="The graph service couldn't be reached, so entities can't be shown. This does not mean the graph is empty."
              action={<Button size="sm" onClick={refresh}>Retry</Button>}
            />
          ) : !hasGraph ? (
            <EmptyState
              className="h-full"
              icon={Network}
              title="No knowledge graph yet"
              reason="The graph is built by extracting entities and relationships from your uploaded documents — with none uploaded, there is nothing to map."
              hint="Upload a document to populate the graph."
            />
          ) : (
            <ReactFlowProvider>
              <GraphCanvas graph={graph} selectedId={selectedId} onSelect={setSelectedId} />
              {/* Type legend */}
              <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1.5">
                {typeCounts.slice(0, 6).map(([type, count]) => {
                  const m = metaFor(type);
                  return (
                    <span
                      key={type}
                      className="flex items-center gap-1.5 rounded-ui-sm border border-line bg-surface/90 px-1.5 py-0.5 text-[10px] font-semibold text-ink-secondary backdrop-blur"
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
                      {type} · {count}
                    </span>
                  );
                })}
              </div>
            </ReactFlowProvider>
          )}
        </div>

        {/* Right rail */}
        {hasGraph && !loading && (
          <div className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto">
            {selectedNode ? (
              <DetailPanel
                node={selectedNode}
                graph={graph}
                onClose={() => setSelectedId(null)}
                onSelect={setSelectedId}
              />
            ) : (
              <div className="rounded-ui-xl border border-line bg-surface p-4 shadow-e1">
                <p className="text-xs font-semibold text-ink">Select an entity</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-tertiary">
                  Click any node to highlight its relationships and inspect its extracted attributes.
                </p>
              </div>
            )}

            {patterns.length > 0 && (
              <div className="rounded-ui-xl border border-line bg-surface shadow-e1">
                <div className="border-b border-line px-4 py-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
                    Recurring across documents
                  </p>
                </div>
                <ul className="divide-y divide-line">
                  {patterns.slice(0, 6).map((p, i) => {
                    const m = metaFor(p.type);
                    const I = m.icon;
                    return (
                      <li key={`${p.name}-${i}`} className="flex items-center gap-2 px-4 py-2">
                        <I className="h-3.5 w-3.5 shrink-0" style={{ color: m.color }} />
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink" title={p.name}>
                          {p.name}
                        </span>
                        <Badge tone="neutral">{p.doc_count} docs</Badge>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
