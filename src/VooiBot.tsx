import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PerpsAssetCtx,
  PerpsClearinghouseState,
  PerpsMeta,
} from "@nktkas/hyperliquid";
import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import type { ActiveAgent, PlacedHyperliquidOrder } from "~/types";
import { useWalletClient } from "wagmi";
import Decimal from "decimal.js-light";
import { hyperliquidFormatQuantity } from "~/helpers/utils";
import { getHyperliquidMarkPriceWithSlippage } from "~/helpers/getHyperliquidMarkPriceWithSlippage";
import { createOrder } from "~/helpers/createOrder";
import { ConnectWalletButton } from "~/components/ConnectWalletButton";
import { LoginButton } from "~/components/LoginButton";
import { DEFAULT_FEE, HYPERLIQUID_CONFIG } from "~/config";
import { MIN_HYPERLIQUID_LEVERAGE } from "~/const/const";
import { updateLeverage } from "~/helpers/updateLeverage";
import styles from "./App.module.css";
import LogPanel from "~/components/LogPanel/LogPanel";
import { formatAmount } from "~/helpers/formatAmount";

const REPEAT_INTERVAL = 2; // Seconds
const LEVERAGE_DEBOUNCE_MS = 1500; // debounce delay for leverage input

type PerpsUniverseItem = PerpsMeta["universe"][number];

export interface PerpsAssetWithMeta extends PerpsAssetCtx, PerpsUniverseItem {
  assetIndex: number;
}

export function VooiBot() {
  const [loading, setLoading] = useState<boolean>(false);
  const [assetsWithMeta, setAssetsWithMeta] = useState<PerpsAssetWithMeta[]>();
  const [clearinghouseState, setClearinghouseState] =
    useState<PerpsClearinghouseState>();
  const [selectedAsset, setSelectedAsset] = useState<PerpsAssetWithMeta>();
  const [logs, setLogs] = useState<string[]>([]);
  const timeoutId = useRef<number | null>(null);
  const isLooping = useRef(false);
  const isIterationStarted = useRef(false);
  const [agent, setAgent] = useState<ActiveAgent | null>(null);
  const [isBuy, setIsBuy] = useState<boolean>(true);
  const [margin, setMargin] = useState<number>(10);
  const [leverage, setLeverage] = useState<number>(10);
  const [leverageInput, setLeverageInput] = useState<string>('10');
  const leverageDebounceTimer = useRef<number | null>(null);

  const walletClient = useWalletClient().data;
  const address = walletClient?.account.address;
  const balance = parseFloat(clearinghouseState?.withdrawable ?? "0");
  const isStartDisabled = isIterationStarted.current && !isLooping.current;

  const pushLog = useCallback(
    (log: string) =>
      setLogs((prev) => [
        ...prev,
        `${new Date().toLocaleTimeString()}  ${log}`,
      ]),
    [],
  );

  const infoClient = useMemo(() => {
    const transport = new HttpTransport();
    return new InfoClient({ transport });
  }, []);

  const refetechData = useCallback(async () => {
    if (!address) {
      return;
    }
    try {
      const clearinghouseState = await infoClient.clearinghouseState({
        user: address,
      });
      const metaAndAssetCtxs = await infoClient.metaAndAssetCtxs();

      const meta = metaAndAssetCtxs[0];
      const assets = metaAndAssetCtxs[1];
      const assetsWithMeta = assets.map((asset, assetIndex) => ({
        ...asset,
        ...meta.universe[assetIndex],
        assetIndex,
      }));

      setClearinghouseState(clearinghouseState);
      setAssetsWithMeta(assetsWithMeta);
    } catch (e) {
      if (e instanceof Error) {
        pushLog(`Error refetching data ${e.message}`);
      } else {
        pushLog(`Unknown error refetching data.`);
      }
    }
  }, [address, infoClient, pushLog]);

  useEffect(() => {
    if (address) {
      setLoading(true);
      refetechData().then(() => setLoading(false));
    } else {
      setAgent(null);
      setClearinghouseState(undefined);
    }
  }, [address, refetechData]);

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
    }
  }, []);

  const openPosition = async () => {
    if (!agent || !selectedAsset || !margin) return;

    try {
      if (margin > balance) {
        throw new Error("Margin exceeds available balance");
      }

      const amountDecimal = new Decimal(margin).mul(leverage);

      const fee = new Decimal(amountDecimal).mul(DEFAULT_FEE);
      const quantityDecimal = amountDecimal.div(selectedAsset.markPx || 1);

      const quantity = hyperliquidFormatQuantity(
        quantityDecimal.toNumber(),
        selectedAsset.szDecimals,
      );

      const baseOrder = {
        asset: selectedAsset.assetIndex,
        isBuy,
        price: getHyperliquidMarkPriceWithSlippage(
          isBuy,
          selectedAsset,
        ).toString(),
        size: quantity.toString(),
        isReduceOnly: false,
      };

      pushLog(
        `Open order: ${isBuy ? "Long" : "Short"} ${selectedAsset.name}x${leverage} with $${amountDecimal} size and $${fee} fee`,
      );

      await createOrder(agent, {
        orders: [
          {
            ...baseOrder,
            type: {
              limit: {
                tif: "Gtc",
              },
            },
          },
        ],
        grouping: "na",
      });

      pushLog("Position successfully opened!");
    } catch (e) {
      if (e instanceof Error) {
        pushLog(`Error opening position: ${e.message}`);
      } else {
        pushLog(`Unknown error opening position.`);
      }

      throw e;
    }
  };

  const closePosition = async () => {
    if (!assetsWithMeta || !agent || !address) {
      return;
    }

    try {
      pushLog("Refreshing positions data...");

      const positions = (await infoClient.clearinghouseState({ user: address }))
        .assetPositions;
      const position = positions[0].position;

      if (!position) {
        throw new Error("Position not found");
      }

      pushLog("Positions data updated.");

      const asset = assetsWithMeta.find((a) => a.name === position.coin);

      if (!asset) {
        throw new Error("Incorrect symbol");
      }

      const positionSize = new Decimal(position.szi);
      const usdSize = positionSize.mul(asset.markPx);
      const isBuy = positionSize.lte(0);

      const closeOrder: PlacedHyperliquidOrder = {
        asset: asset.assetIndex,
        isBuy,
        price: getHyperliquidMarkPriceWithSlippage(isBuy, asset).toString(),
        size: positionSize.abs().toString(),
        isReduceOnly: true,
        type: {
          limit: {
            tif: "Gtc",
          },
        },
      };

      pushLog(
        `Close order for position: ${!isBuy ? "Long" : "Short"} ${position.coin}x${position.leverage.value} with $${usdSize} size`,
      );

      await createOrder(agent, {
        orders: [closeOrder],
        grouping: "na",
      });

      pushLog("Position successfully closed!");
    } catch (e) {
      if (e instanceof Error) {
        pushLog(`Error closing position: ${e.message}`);
      } else {
        pushLog(`Unknown error closing position.`);
      }

      throw e;
    }

    pushLog("Refreshing market data and balance...");

    await refetechData();

    pushLog("Market and balance data updated.");
  };

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
    if (leverageInput.trim() === '') {
      newLeverage = String(MIN_HYPERLIQUID_LEVERAGE);
      setLeverageInput(newLeverage);
    }
    onLeverageChange(newLeverage).catch(console.error);

    if (leverageDebounceTimer.current !== null) {
      clearTimeout(leverageDebounceTimer.current);
      leverageDebounceTimer.current = null;
    }
  }

  const onMarginChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newMargin = parseFloat(event.target.value);
    setMargin(newMargin > balance ? balance : newMargin);
  };

  const start = () => {
    // Check if already running
    if (isLooping.current) return;

    isLooping.current = true;

    pushLog("Trading started!");

    async function loop() {
      // If canceled, exit early
      if (!isLooping.current) return;

      isIterationStarted.current = true;
      try {
        await openPosition();
        await closePosition();
        isIterationStarted.current = false;
        // If canceled, exit early
        if (!isLooping.current) return;

        pushLog(`Repeating in ${REPEAT_INTERVAL} sec...`);
        timeoutId.current = window.setTimeout(loop, REPEAT_INTERVAL * 1000);
      } catch (err) {
        console.error("Error in loop — stopping:", err);
        pushLog("Trading stopped due to an error.");

        isLooping.current = false;
        isIterationStarted.current = false;
        if (timeoutId.current !== null) {
          clearTimeout(timeoutId.current);
          timeoutId.current = null;
        }
      }
    }

    void loop();
  };

  const stop = () => {
    if (!isLooping.current && timeoutId.current === null) {
      pushLog("No active trading loop to stop.");
      return;
    }

    isLooping.current = false;

    if (timeoutId.current !== null) {
      clearTimeout(timeoutId.current);
      timeoutId.current = null;
    }

    pushLog("Trading stopped by user. Any open position will be closed.");
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

        {!!balance && (
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
          </div>
        )}

        {loading && (
          <div className={styles.placeholder}>
            Loading...
          </div>
        )}

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
                onClick={isLooping.current ? stop : start}
                disabled={isStartDisabled}
              >
                {isStartDisabled
                  ? "Loading..."
                  : isLooping.current
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
