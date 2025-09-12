import { useCallback, useEffect, useRef, useState } from "react";
import { SubscriptionClient, WebSocketTransport } from "@nktkas/hyperliquid";
import type { PerpsClearinghouseState } from "@nktkas/hyperliquid";

export interface WebSocketDataHook {
  clearinghouseState: PerpsClearinghouseState | undefined;
  isConnected: boolean;
  error: string | null;
  reconnect: () => void;
}

export function useWebSocketData(
  address: string | undefined,
): WebSocketDataHook {
  const [clearinghouseState, setClearinghouseState] =
    useState<PerpsClearinghouseState>();
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subscriptionClientRef = useRef<SubscriptionClient | null>(null);
  const webDataSubscriptionRef = useRef<{
    unsubscribe: () => Promise<void>;
  } | null>(null);

  const cleanup = useCallback(async () => {
    try {
      if (webDataSubscriptionRef.current) {
        await webDataSubscriptionRef.current.unsubscribe();
        webDataSubscriptionRef.current = null;
      }
      if (subscriptionClientRef.current) {
        // Note: SubscriptionClient doesn't have a close method, it auto-closes when all subscriptions end
        subscriptionClientRef.current = null;
      }
    } catch (e) {
      console.error("Error during cleanup:", e);
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(async () => {
    if (!address) {
      await cleanup();
      return;
    }

    try {
      await cleanup(); // Clean up any existing connections

      const transport = new WebSocketTransport();
      const subscriptionClient = new SubscriptionClient({ transport });

      subscriptionClientRef.current = subscriptionClient;

      // Subscribe to user data updates
      const webDataSub = await subscriptionClient.webData2(
        { user: address as `0x${string}` },
        (data) => {
          if (data?.clearinghouseState) {
            setClearinghouseState(data.clearinghouseState);
          }
        },
      );

      webDataSubscriptionRef.current = webDataSub;
      setIsConnected(true);
      setError(null);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Unknown WebSocket error";
      setError(errorMessage);
      setIsConnected(false);
      console.error("WebSocket connection error:", e);
    }
  }, [address, cleanup]);

  const reconnect = useCallback(() => {
    setError(null);
    connect();
  }, [connect]);

  // Connect when address changes
  useEffect(() => {
    connect();
    return () => {
      cleanup().catch(console.error);
    };
  }, [address, connect, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup().catch(console.error);
    };
  }, [cleanup]);

  return {
    clearinghouseState,
    isConnected,
    error,
    reconnect,
  };
}
