import { useCallback, useEffect, useRef, useState } from "react";
import { SubscriptionClient, WebSocketTransport } from "@nktkas/hyperliquid";

export interface TradingState {
  hasOpenPosition: boolean;
  hasOpenOrders: boolean;
  lastUpdate: number;
  eventKind: "order" | "position" | null;
}

export interface WebSocketTradingHook {
  tradingState: TradingState;
  isConnected: boolean;
  error: string | null;
  onTradingStateChange: (callback: (state: TradingState) => void) => void;
}

export function useWebSocketTrading(
  address: string | undefined,
): WebSocketTradingHook {
  const [tradingState, setTradingState] = useState<TradingState>({
    hasOpenPosition: false,
    hasOpenOrders: false,
    lastUpdate: 0,
    eventKind: null,
  });
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subscriptionClientRef = useRef<SubscriptionClient | null>(null);
  const orderUpdatesSubscriptionRef = useRef<{
    unsubscribe: () => Promise<void>;
  } | null>(null);
  const userEventsSubscriptionRef = useRef<{
    unsubscribe: () => Promise<void>;
  } | null>(null);
  const callbackRef = useRef<((state: TradingState) => void) | null>(null);

  const onTradingStateChange = useCallback(
    (callback: (state: TradingState) => void) => {
      callbackRef.current = callback;
    },
    [],
  );

  const updateTradingState = useCallback((updates: Partial<TradingState>) => {
    setTradingState((prevState) => {
      const newState = {
        ...prevState,
        ...updates,
        lastUpdate: Date.now(),
      };

      // Trigger callback on any update (we rely on WS events)
      if (callbackRef.current) {
        callbackRef.current(newState);
      }

      return newState;
    });
  }, []);

  const cleanup = useCallback(async () => {
    try {
      if (orderUpdatesSubscriptionRef.current) {
        await orderUpdatesSubscriptionRef.current.unsubscribe();
        orderUpdatesSubscriptionRef.current = null;
      }
      if (userEventsSubscriptionRef.current) {
        await userEventsSubscriptionRef.current.unsubscribe();
        userEventsSubscriptionRef.current = null;
      }
      if (subscriptionClientRef.current) {
        subscriptionClientRef.current = null;
      }
    } catch (e) {
      console.error("Error during trading WebSocket cleanup:", e);
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(async () => {
    if (!address) {
      await cleanup();
      return;
    }

    try {
      await cleanup();

      const transport = new WebSocketTransport();
      const subscriptionClient = new SubscriptionClient({ transport });

      subscriptionClientRef.current = subscriptionClient;

      // Subscribe to order updates to detect when orders are filled/cancelled
      const orderUpdatesSub = await subscriptionClient.orderUpdates(
        { user: address as `0x${string}` },
        (orders) => {
          const hasOpenOrders = orders.some((order: unknown) => {
            const typedOrder = order as { order?: { orderStatus?: string } };
            return typedOrder?.order?.orderStatus === "open";
          });
          updateTradingState({ hasOpenOrders, eventKind: "order" });
        },
      );

      // Subscribe to user events to detect position changes (fills, liquidations, etc.)
      const userEventsSub = await subscriptionClient.userEvents(
        { user: address as `0x${string}` },
        (events: unknown) => {
          // Check if any events indicate position changes
          const eventsArray = Array.isArray(events) ? events : [events];
          const hasPositionChanges = eventsArray.some((event: unknown) => {
            const typedEvent = event as {
              fill?: unknown;
              liquidation?: unknown;
            };
            return typedEvent?.fill || typedEvent?.liquidation;
          });

          if (hasPositionChanges) {
            // We'll need to check actual positions via the clearinghouse state
            // This will be handled by the main component
            updateTradingState({ eventKind: "position" });
          }
        },
      );

      orderUpdatesSubscriptionRef.current = orderUpdatesSub;
      userEventsSubscriptionRef.current = userEventsSub;

      setIsConnected(true);
      setError(null);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Unknown WebSocket trading error";
      setError(errorMessage);
      setIsConnected(false);
      console.error("WebSocket trading connection error:", e);
    }
  }, [address, cleanup, updateTradingState]);

  // Reconnect function for potential future use
  // const reconnect = useCallback(() => {
  //   setError(null);
  //   connect();
  // }, [connect]);

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
    tradingState,
    isConnected,
    error,
    onTradingStateChange,
  };
}
