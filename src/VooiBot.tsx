import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PerpsAssetCtx, PerpsMeta } from "@nktkas/hyperliquid";
import { useWalletClient } from "wagmi";
import { ConnectWalletButton } from "~/components/ConnectWalletButton";
import { LoginButton } from "~/components/LoginButton";
import { HYPERLIQUID_CONFIG } from "~/config";
import { MIN_HYPERLIQUID_LEVERAGE } from "~/const/const";
import { updateLeverage } from "~/helpers/updateLeverage";
import styles from "./App.module.css";
import LogPanel from "~/components/LogPanel/LogPanel";
import { formatAmount } from "~/helpers/formatAmount";
import { useWebSocketData } from "~/hooks/useWebSocketData";
import { useTradingBot } from "~/hooks/useTradingBot";
import { LOCAL_STORAGE_HYPERLIQUID_KEY } from "~/const/localStorageKeys";
import type { ActiveAgent } from "~/types";

const LEVERAGE_DEBOUNCE_MS = 1500; // debounce delay for leverage input

type PerpsUniverseItem = PerpsMeta["universe"][number];

export interface PerpsAssetWithMeta extends PerpsAssetCtx, PerpsUniverseItem {
  assetIndex: number;
}

export function VooiBot() {
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedAsset, setSelectedAsset] = useState<PerpsAssetWithMeta>();
  const [assetsWithMeta, setAssetsWithMeta] = useState<PerpsAssetWithMeta[]>();
  const [logs, setLogs] = useState<string[]>([]);
  const [agent, setAgent] = useState<ActiveAgent | null>(null);
  const [isBuy, setIsBuy] = useState<boolean>(true);
  const [margin, setMargin] = useState<number>(10);
  const [leverage, setLeverage] = useState<number>(10);
  const [leverageInput, setLeverageInput] = useState<string>("10");
  const leverageDebounceTimer = useRef<number | null>(null);

  const walletClient = useWalletClient().data;
  const address = walletClient?.account.address;

  // Use WebSocket hooks for real-time data
  const {
    clearinghouseState,
    isConnected: isUserDataConnected,
    error: userDataError,
  } = useWebSocketData(address);

  const balance = parseFloat(clearinghouseState?.withdrawable ?? "0");

  const pushLog = useCallback(
    (log: string) =>
      setLogs((prev) => [
        ...prev,
        `${new Date().toLocaleTimeString()}  ${log}`,
      ]),
    [],
  );

  // Trading bot configuration
  const tradingBotConfig = useMemo(() => {
    if (!agent || !address) {
      return null;
    }

    return {
      agent,
      selectedAsset, // optional; TradingBot loads assets and we set default
      margin,
      leverage,
      isBuy,
      balance,
      address,
    };
  }, [agent, selectedAsset, margin, leverage, isBuy, balance, address]);

  // Trading bot callbacks
  const tradingBotCallbacks = useMemo(
    () => ({
      onLog: (message: string) => pushLog(message),
      onError: (error: string) => pushLog(error),
      onPositionOpened: () => {
        // Additional logic when position is opened if needed
      },
      onPositionClosed: () => {
        // Additional logic when position is closed if needed
      },
      onAssetsLoaded: (assets: PerpsAssetWithMeta[]) => {
        setAssetsWithMeta(assets);
        if (!selectedAsset && assets.length > 0) {
          setSelectedAsset(assets[0]);
        }
      },
    }),
    [pushLog, selectedAsset],
  );

  const {
    start: startTrading,
    stop: stopTrading,
    isRunning,
    isProcessing,
    isTradingConnected,
    tradingError,
  } = useTradingBot({
    config: tradingBotConfig,
    callbacks: tradingBotCallbacks,
    // trading class owns its WS and loop
  });

  // Allow stopping even while processing; only disable starting when processing
  const isStartDisabled = isProcessing;
  const isStopDisabled = false;

  useEffect(() => {
    if (!address) {
      setAgent(null);
    }
  }, [address]);

  // Restore Vooi token (agent) from localStorage when wallet is connected
  useEffect(() => {
    if (!address || agent) return;
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_HYPERLIQUID_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ActiveAgent;
        if (
          parsed?.address &&
          parsed?.privateKey &&
          parsed.address.toLowerCase() === address.toLowerCase()
        ) {
          setAgent(parsed);
        }
      }
    } catch {
      // ignore malformed storage
    }
  }, [address, agent]);

  // Log WebSocket connection errors
  useEffect(() => {
    if (userDataError) {
      pushLog(`User data connection error: ${userDataError}`);
    }
  }, [userDataError, pushLog]);

  useEffect(() => {
    if (tradingError) {
      pushLog(`Trading error: ${tradingError}`);
    }
  }, [tradingError, pushLog]);

  useEffect(() => {
    if (!selectedAsset && assetsWithMeta) {
      setSelectedAsset(assetsWithMeta[0]);
    }
  }, [assetsWithMeta, selectedAsset]);

  // Keep the controlled input in sync when leverage changes externally
  useEffect(() => {
    setLeverageInput(String(leverage));
  }, [leverage]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (leverageDebounceTimer.current !== null) {
        clearTimeout(leverageDebounceTimer.current);
        leverageDebounceTimer.current = null;
      }
    };
  }, []);

  const onSelectedAssetChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    if (!assetsWithMeta) {
      return;
    }

    const asset = assetsWithMeta.find(
      ({ assetIndex }) => assetIndex === Number(event.target.value),
    );

    if (asset) {
      setSelectedAsset(asset);
    }
  };

  const onSideChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setIsBuy(event.target.value === "long");
  };

  const onLeverageChange = useCallback(
    async (value: string | number) => {
      if (!selectedAsset || !agent) {
        return;
      }

      try {
        let newLeverage = parseInt(String(value) || "1");

        if (newLeverage < MIN_HYPERLIQUID_LEVERAGE) {
          newLeverage = MIN_HYPERLIQUID_LEVERAGE;
        }

        if (newLeverage > selectedAsset.maxLeverage) {
          newLeverage = selectedAsset.maxLeverage;
        }

        if (newLeverage !== leverage) {
          setLeverage(newLeverage);

          pushLog(
            `Updating ${selectedAsset.name} leverage to ${newLeverage}...`,
          );
          await updateLeverage(selectedAsset.assetIndex, newLeverage, agent);

          pushLog("Update leverage successful");
        }
      } catch (e) {
        if (e instanceof Error) {
          pushLog(`Error updating leverage: ${e.message}`);
        } else {
          pushLog(`Unknown error updating leverage.`);
        }

        throw e;
      }
    },
    [selectedAsset, agent, leverage, pushLog],
  );

  useEffect(() => {
    if (selectedAsset && agent) {
      onLeverageChange(selectedAsset.maxLeverage).catch(console.error);
    }
  }, [selectedAsset, agent, onLeverageChange]);

  const onLeverageInputChange = (value: string) => {
    setLeverageInput(value);

    // Clear previous debounce
    if (leverageDebounceTimer.current !== null) {
      clearTimeout(leverageDebounceTimer.current);
      leverageDebounceTimer.current = null;
    }

    // Schedule debounced update
    leverageDebounceTimer.current = window.setTimeout(() => {
      void onLeverageChange(value);
      leverageDebounceTimer.current = null;
    }, LEVERAGE_DEBOUNCE_MS);
  };

  const onBlur = () => {
    let newLeverage = leverageInput;
    if (leverageInput.trim() === "") {
      newLeverage = String(MIN_HYPERLIQUID_LEVERAGE);
      setLeverageInput(newLeverage);
    }
    onLeverageChange(newLeverage).catch(console.error);

    if (leverageDebounceTimer.current !== null) {
      clearTimeout(leverageDebounceTimer.current);
      leverageDebounceTimer.current = null;
    }
  };

  const onMarginChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newMargin = parseFloat(event.target.value);
    setMargin(newMargin > balance ? balance : newMargin);
  };

  return (
    <div className={styles.appRoot}>
      <div className={styles.leftColumn}>
        <div className={styles.authButtons}>
          <ConnectWalletButton />
          {!agent && (
            <LoginButton setAgent={setAgent} setLoading={setLoading} />
          )}
        </div>

        {clearinghouseState && (
          <div className={styles.accountCard}>
            <div className={styles.accountRow}>
              Balance:{" "}
              <span className={styles.muted}>{formatAmount(balance)} USD</span>
            </div>
            <div className={styles.accountRow}>
              Vooi Fee:{" "}
              <span className={styles.muted}>
                {HYPERLIQUID_CONFIG.builderFee} BPS
              </span>
            </div>

            <div className={styles.accountRow}>
              User Data:{" "}
              <span
                className={
                  isUserDataConnected ? styles.connected : styles.disconnected
                }
              >
                {isUserDataConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
            <div className={styles.accountRow}>
              Trading Events:{" "}
              <span
                className={
                  isTradingConnected ? styles.connected : styles.disconnected
                }
              >
                {isTradingConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>
        )}

        {loading && <div className={styles.placeholder}>Loading...</div>}

        {!!agent && !!selectedAsset && (
          <div className={styles.controlsCard}>
            <label className={styles.fieldLabel}>Token</label>
            <select className={styles.select} onChange={onSelectedAssetChange}>
              {assetsWithMeta?.slice(0, 15).map((asset) => (
                <option key={asset.assetIndex} value={asset.assetIndex}>
                  {asset.name} - {asset.maxLeverage}x - ${asset.markPx}
                </option>
              ))}
            </select>

            <select className={styles.select} onChange={onSideChange}>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>

            <label className={styles.fieldLabel}>Leverage</label>
            <input
              className={styles.input}
              value={leverageInput}
              onBlur={onBlur}
              onChange={({ target }) => onLeverageInputChange(target.value)}
            />

            <label className={styles.fieldLabel}>Margin to use, USD</label>
            <input
              className={styles.input}
              min={1}
              max={balance}
              type="number"
              value={margin}
              onChange={onMarginChange}
            />

            <div style={{ marginTop: 12 }}>
              <button
                onClick={isRunning ? stopTrading : startTrading}
                disabled={isRunning ? isStopDisabled : isStartDisabled}
              >
                {isStartDisabled
                  ? "Processing..."
                  : isRunning
                    ? "Stop"
                    : "Start"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={styles.rightColumn}>
        <LogPanel logs={logs} />
      </div>
    </div>
  );
}
