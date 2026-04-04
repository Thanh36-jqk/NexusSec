"use client";

import { useMemo } from "react";
import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    Node,
    Edge,
    MarkerType,
    NodeProps,
    Handle,
    Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Vulnerability } from "@/types";
import { Globe, Server, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Custom Nodes ─────────────────────────────────────────────────────────────

const TargetNode = ({ data }: NodeProps) => (
    <div className="flex flex-col items-center justify-center p-3 px-6 rounded-2xl bg-slate-900 border-2 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.3)] min-w-[200px]">
        <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-emerald-500" />
        <Globe className="h-6 w-6 text-emerald-400 mb-2" />
        <div className="text-sm font-bold text-white text-center">{data.label as string}</div>
        <div className="text-[10px] text-emerald-400 font-mono mt-1 uppercase tracking-wider">Root Target</div>
    </div>
);

const PortNode = ({ data }: NodeProps) => (
    <div className="flex flex-col items-center justify-center p-2 px-4 rounded-xl bg-slate-900 border border-blue-500/30 shadow-lg min-w-[120px]">
        <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-blue-500" />
        <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-blue-500" />
        <Server className="h-5 w-5 text-blue-400 mb-1.5" />
        <div className="text-sm font-semibold text-white">{data.label as string}</div>
        <div className="text-[10px] text-muted-foreground font-mono">{data.details as string}</div>
    </div>
);

const VulnNode = ({ data }: NodeProps) => {
    const severity = data.severity as string;
    const colors: Record<string, string> = {
        critical: "border-red-500/50 bg-red-500/10 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.2)]",
        high: "border-orange-500/50 bg-orange-500/10 text-orange-400",
        medium: "border-amber-500/50 bg-amber-500/10 text-amber-400",
        low: "border-blue-500/50 bg-blue-500/10 text-blue-400",
        info: "border-gray-500/50 bg-gray-500/10 text-gray-400",
    };

    return (
        <div className={cn("flex items-start gap-3 p-3 rounded-xl border max-w-[220px] backdrop-blur-sm", colors[severity] || colors.info)}>
            <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-transparent !border-none" />
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex flex-col min-w-0">
                <div className="text-xs font-semibold leading-tight break-words">{data.label as string}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{severity}</div>
            </div>
        </div>
    );
};

const nodeTypes = {
    target: TargetNode,
    port: PortNode,
    vuln: VulnNode,
};

// ── Generator Logic ──────────────────────────────────────────────────────────

interface TopologyProps {
    targetUrl: string;
    vulnerabilities: Vulnerability[];
}

export function AttackSurfaceGraph({ targetUrl, vulnerabilities }: TopologyProps) {
    const { initialNodes, initialEdges } = useMemo(() => {
        const nodes: Node[] = [];
        const edges: Edge[] = [];
        const V_SPACING = 200; // Vertical spacing between layers
        const H_SPACING = 240; // Horizontal spacing between leaf nodes

        // 1. Group vulnerabilities by Port
        // If a vuln has no port, group it under "Unknown Port" or "Web" (e.g. port 80/443 implied)
        const portGroups: Record<string, Vulnerability[]> = {};

        vulnerabilities.forEach((v) => {
            let pKey = "Unknown";
            if (v.port) {
                pKey = `${v.port}/${v.protocol || "tcp"}`;
            } else {
                pKey = "Web App (HTTP)";
            }
            if (!portGroups[pKey]) portGroups[pKey] = [];
            portGroups[pKey].push(v);
        });

        const portKeys = Object.keys(portGroups).sort();

        // Count total leaf nodes to calculate overall width
        let totalLeaves = 0;
        const portLeafCounts = portKeys.map((k) => Object.keys(portGroups[k]).length || 1);
        totalLeaves = portLeafCounts.reduce((a, b) => a + b, 0);

        const totalWidth = totalLeaves * H_SPACING;
        let currentXOffset = -(totalWidth / 2) + H_SPACING / 2;

        // TARGET NODE
        nodes.push({
            id: "target",
            type: "target",
            position: { x: 0, y: 0 },
            data: { label: targetUrl },
        });

        // 2. Iterate and layout ports and vulnerabilities
        portKeys.forEach((portKey) => {
            const vulns = portGroups[portKey];
            const numVulns = vulns.length || 1;

            // X coord for the port is the average of its children's X coords
            const portStartX = currentXOffset;
            const portEndX = currentXOffset + (numVulns - 1) * H_SPACING;
            const portCenterX = (portStartX + portEndX) / 2;

            const portId = `port-${portKey}`;

            // PORT NODE
            nodes.push({
                id: portId,
                type: "port",
                position: { x: portCenterX, y: V_SPACING },
                data: { label: portKey, details: vulns.length + " Findings" },
            });

            // Edge from Target -> Port
            edges.push({
                id: `e-target-${portId}`,
                source: "target",
                target: portId,
                animated: true,
                style: { stroke: "#3b82f6", strokeWidth: 2, opacity: 0.5 },
                markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" },
            });

            // VULN NODES
            vulns.forEach((v) => {
                const vulnId = `vuln-${v.vuln_id}`;
                nodes.push({
                    id: vulnId,
                    type: "vuln",
                    position: { x: currentXOffset, y: V_SPACING * 2.2 },
                    data: { label: v.name, severity: v.severity },
                });

                // Edge from Port -> Vuln
                edges.push({
                    id: `e-${portId}-${vulnId}`,
                    source: portId,
                    target: vulnId,
                    style: { stroke: "#64748b", strokeWidth: 1.5, opacity: 0.3 },
                });

                currentXOffset += H_SPACING;
            });

            // In case port had 0 vulns, still advance the offset
            if (vulns.length === 0) currentXOffset += H_SPACING;
        });

        return { initialNodes: nodes, initialEdges: edges };
    }, [vulnerabilities, targetUrl]);

    return (
        <div className="w-full h-[650px] bg-card rounded-xl border border-border overflow-hidden">
            <ReactFlow
                nodes={initialNodes}
                edges={initialEdges}
                nodeTypes={nodeTypes}
                proOptions={{ hideAttribution: true }}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.2}
                maxZoom={2}
            >
                <Background color="#334155" gap={20} size={1} />
                <Controls className="bg-slate-900 border-slate-700 fill-slate-300" />
                <MiniMap 
                    className="bg-slate-900 border-slate-800" 
                    maskColor="rgba(15, 23, 42, 0.7)"
                    nodeColor={(n) => {
                        if (n.type === 'target') return '#10b981';
                        if (n.type === 'port') return '#3b82f6';
                        return '#64748b';
                    }}
                />
            </ReactFlow>
        </div>
    );
}
