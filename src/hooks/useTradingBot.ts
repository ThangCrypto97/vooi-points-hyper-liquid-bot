import { useCallback, useRef, useEffect, useState } from "react";
import {
  TradingBot,
  type TradingBotConfig,
  type TradingBotCallbacks,
} from "~/services/TradingBot";

export interface UseTradingBotProps {
  config: TradingBotConfig | null;
  callbacks: TradingBotCallbacks;
  // Trading class now owns its WebSocket and loop.
}

export function useTradingBot({
  config,
  callbacks,
  // no external state needed here
}: UseTradingBotProps) {
  const tradingBotRef = useRef<TradingBot | null>(null);
  const [isTradingConnected, setIsTradingConnected] = useState(false);
  const [tradingError, setTradingError] = useState<string | null>(null);

  // Create or update trading bot when config changes
  useEffect(() => {
    if (!config) {
      tradingBotRef.current = null;
      return;
    }

    if (tradingBotRef.current) {
      // Update existing bot configuration
      tradingBotRef.current.updateConfig(config);
    } else {
      // Create new trading bot instance
      tradingBotRef.current = new TradingBot(config, {
        ...callbacks,
        onError: (err) => {
          setTradingError(err);
          callbacks.onError(err);
        },
        onTradingConnectionChange: (connected) => {
          setIsTradingConnected(connected);
        },
      });
    }
  }, [config, callbacks]);

  const start = useCallback(async () => {
    if (tradingBotRef.current) {
      await tradingBotRef.current.start();
    }
  }, []);

  const stop = useCallback(() => {
    if (tradingBotRef.current) {
      tradingBotRef.current.stop();
    }
  }, []);

  const isRunning = tradingBotRef.current?.isRunning ?? false;
  const isProcessing = tradingBotRef.current?.isProcessing ?? false;

  return {
    start,
    stop,
    isRunning,
    isProcessing,
    isTradingConnected,
    tradingError,
  };
}
