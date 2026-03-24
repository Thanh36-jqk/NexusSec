"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { WSMessage } from "@/types";

// ── Connection States ────────────────────────────────────────

export type WSConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

// ── Configuration ────────────────────────────────────────────

interface UseWebSocketOptions {
    /** WebSocket server URL (e.g., ws://localhost:8080/ws) */
    url: string;

    /** Called on every parsed message */
    onMessage?: (message: WSMessage) => void;

    /** Auto-reconnect on disconnection (default: true) */
    autoReconnect?: boolean;

    /** Maximum reconnection attempts before giving up (default: 10) */
    maxRetries?: number;

    /** Base delay for exponential backoff in ms (default: 1000) */
    baseDelay?: number;

    /** Maximum backoff delay in ms (default: 30000) */
    maxDelay?: number;
}

// ── Return Type ──────────────────────────────────────────────

interface UseWebSocketReturn {
    /** Current connection state */
    connectionState: WSConnectionState;

    /** Last received message */
    lastMessage: WSMessage | null;

    /** Send a message to the server */
    sendMessage: (data: unknown) => void;

    /** Manually reconnect */
    reconnect: () => void;

    /** Manually disconnect */
    disconnect: () => void;
}

// ── Exponential Backoff Calculator ───────────────────────────

function calculateBackoff(attempt: number, baseDelay: number, maxDelay: number): number {
    // Exponential: baseDelay * 2^attempt + random jitter (±25%)
    const exponential = baseDelay * Math.pow(2, attempt);
    const jitter = exponential * (0.75 + Math.random() * 0.5);
    return Math.min(jitter, maxDelay);
}

// ── Hook Implementation ──────────────────────────────────────

/**
 * Resilient WebSocket hook with:
 * - Exponential backoff reconnection (with jitter to avoid thundering herd)
 * - Global toast notifications on disconnect/reconnect
 * - Heartbeat handling
 * - Clean teardown on unmount
 *
 * @example
 * ```tsx
 * const { connectionState, lastMessage } = useWebSocket({
 *   url: "ws://localhost:8080/ws",
 *   onMessage: (msg) => {
 *     if (msg.type === "scan_update") updateProgress(msg.progress);
 *   },
 * });
 * ```
 */
export function useWebSocket({
    url,
    onMessage,
    autoReconnect = true,
    maxRetries = 10,
    baseDelay = 1000,
    maxDelay = 30000,
}: UseWebSocketOptions): UseWebSocketReturn {
    const [connectionState, setConnectionState] = useState<WSConnectionState>("disconnected");
    const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);

    // Refs to persist across renders without triggering re-renders
    const wsRef = useRef<WebSocket | null>(null);
    const retryCountRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const intentionalCloseRef = useRef(false);
    const onMessageRef = useRef(onMessage);

    // Keep callback ref current without re-creating the effect
    useEffect(() => {
        onMessageRef.current = onMessage;
    }, [onMessage]);

    // ── Connect ────────────────────────────────────────────────

    const connect = useCallback(() => {
        // Clean up any existing connection
        if (wsRef.current) {
            wsRef.current.close();
        }

        setConnectionState(retryCountRef.current > 0 ? "reconnecting" : "connecting");

        try {
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                setConnectionState("connected");

                // If this was a reconnection, show success toast
                if (retryCountRef.current > 0) {
                    toast.success("Connection restored", {
                        description: "Real-time updates are active again.",
                        duration: 3000,
                    });
                }

                retryCountRef.current = 0;
            };

            ws.onmessage = (event: MessageEvent) => {
                try {
                    const message: WSMessage = JSON.parse(event.data);

                    // Silently handle heartbeats (no state update needed)
                    if (message.type === "heartbeat") return;

                    setLastMessage(message);
                    onMessageRef.current?.(message);
                } catch {
                    console.warn("[WS] Failed to parse message:", event.data);
                }
            };

            ws.onclose = (event: CloseEvent) => {
                wsRef.current = null;
                setConnectionState("disconnected");

                // Don't reconnect if close was intentional (user action or unmount)
                if (intentionalCloseRef.current) {
                    intentionalCloseRef.current = false;
                    return;
                }

                // Don't reconnect on specific close codes
                // 1000 = Normal, 1008 = Policy Violation (e.g., auth failure)
                if (event.code === 1000 || event.code === 1008) return;

                // Attempt reconnection with exponential backoff
                if (autoReconnect && retryCountRef.current < maxRetries) {
                    const delay = calculateBackoff(retryCountRef.current, baseDelay, maxDelay);
                    retryCountRef.current++;

                    // Show toast only on first disconnect
                    if (retryCountRef.current === 1) {
                        toast.error("Connection lost", {
                            description: "Attempting to reconnect...",
                            duration: 5000,
                        });
                    }

                    console.log(
                        `[WS] Reconnecting in ${Math.round(delay)}ms (attempt ${retryCountRef.current}/${maxRetries})`
                    );

                    setConnectionState("reconnecting");
                    reconnectTimerRef.current = setTimeout(connect, delay);
                } else if (retryCountRef.current >= maxRetries) {
                    toast.error("Connection failed", {
                        description: `Unable to reconnect after ${maxRetries} attempts. Refresh the page.`,
                        duration: Infinity,
                        action: {
                            label: "Retry",
                            onClick: () => {
                                retryCountRef.current = 0;
                                connect();
                            },
                        },
                    });
                }
            };

            ws.onerror = () => {
                // onerror fires before onclose — just log, onclose handles reconnection
                console.warn("[WS] Connection error");
            };
        } catch (err) {
            console.error("[WS] Failed to create WebSocket:", err);
            setConnectionState("disconnected");
        }
    }, [url, autoReconnect, maxRetries, baseDelay, maxDelay]);

    // ── Send Message ───────────────────────────────────────────

    const sendMessage = useCallback((data: unknown) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data));
        } else {
            console.warn("[WS] Cannot send: connection not open");
        }
    }, []);

    // ── Manual Reconnect ──────────────────────────────────────

    const reconnect = useCallback(() => {
        retryCountRef.current = 0;
        connect();
    }, [connect]);

    // ── Manual Disconnect ─────────────────────────────────────

    const disconnect = useCallback(() => {
        intentionalCloseRef.current = true;
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
        wsRef.current?.close(1000, "Client disconnect");
        setConnectionState("disconnected");
    }, []);

    // ── Lifecycle ──────────────────────────────────────────────

    useEffect(() => {
        connect();

        return () => {
            intentionalCloseRef.current = true;
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
            }
            wsRef.current?.close(1000, "Component unmount");
        };
    }, [connect]);

    return {
        connectionState,
        lastMessage,
        sendMessage,
        reconnect,
        disconnect,
    };
}
