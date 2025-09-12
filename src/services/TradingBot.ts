import { SubscriptionClient, WebSocketTransport } from "@nktkas/hyperliquid";
import type { ActiveAgent, PlacedHyperliquidOrder } from "~/types";
import type { PerpsAssetWithMeta } from "~/VooiBot";
import Decimal from "decimal.js-light";
import { hyperliquidFormatQuantity } from "~/helpers/utils";
import { getHyperliquidMarkPriceWithSlippage } from "~/helpers/getHyperliquidMarkPriceWithSlippage";
import { createOrder } from "~/helpers/createOrder";

export interface TradingBotConfig {
  agent: ActiveAgent;
  selectedAsset?: PerpsAssetWithMeta;
  margin: number;
  leverage: number;
  isBuy: boolean;
  balance: number;
  address: string;
}

export interface TradingBotCallbacks {
  onLog: (message: string) => void;
  onError: (error: string) => void;
  onPositionOpened: () => void;
  onPositionClosed: () => void;
  onAssetsLoaded: (assets: PerpsAssetWithMeta[]) => void;
  onTradingConnectionChange?: (connected: boolean) => void;
}

export class TradingBot {
  private config: TradingBotConfig;
  private callbacks: TradingBotCallbacks;
  // keep a handle to avoid GC; assign via field to prevent GC
  private subsRef: { client: SubscriptionClient | null } = { client: null };
  private isLooping = false;
  private isIterationStarted = false;
  private assetsWithMeta: PerpsAssetWithMeta[] = [];
  private orderUnsub: (() => Promise<void>) | null = null;
  private userEventsUnsub: (() => Promise<void>) | null = null;
  private webDataUnsub: (() => Promise<void>) | null = null;
  private tradingWsConnected = false;
  private latestState: { assetPositions?: Array<{ position?: any }>; withdrawable?: string } | null = null;
  private phase:
    | "idle"
    | "opening"
    | "waiting_for_open_fill"
    | "closing"
    | "waiting_for_close" = "idle";

  constructor(config: TradingBotConfig, callbacks: TradingBotCallbacks) {
    this.config = config;
    this.callbacks = callbacks;

    // Establish trading WS immediately so UI can reflect status before start
    void this.connectTradingWs();
  }

  public updateConfig(config: Partial<TradingBotConfig>) {
    this.config = { ...this.config, ...config };
  }

  public async start(): Promise<void> {
    if (this.isLooping) {
      this.callbacks.onLog("Trading is already running");
      return;
    }

    this.isLooping = true;
    this.phase = "idle";
    this.callbacks.onLog(
      "Trading started! Market open -> close -> open cycle...",
    );

    // Kick FSM with latest state
    try {
      await this.evaluateAndAct("start");
    } catch (e) {
      this.callbacks.onError(
        e instanceof Error ? e.message : "Error starting evaluate cycle",
      );
    }
  }

  public stop(): void {
    if (!this.isLooping) {
      this.callbacks.onLog("No active trading to stop.");
      return;
    }

    this.isLooping = false;
    this.isIterationStarted = false;
    this.phase = "idle";
    this.callbacks.onLog(
      "Trading stopped by user. Any open position will be closed.",
    );

    // Cleanup WS
    void this.disconnectTradingWs();
  }

  private async evaluateAndAct(_trigger: "start" | "fill" | "order" | "webdata") {
    if (!this.isLooping) return;

    // Always use latest WS state
    const state = this.latestState;
    if (!state) return;
    const positions = state.assetPositions;
    const hasOpenPosition = Boolean(positions && positions[0]?.position);

    // FSM enforcing: See position -> Close -> Wait close -> Open -> Wait open -> repeat
    if (this.phase === "idle") {
      if (hasOpenPosition) {
        if (!this.isIterationStarted) {
          this.isIterationStarted = true;
          this.phase = "closing";
          this.callbacks.onLog("Position detected - closing (market)...");
          try {
            await this.closePositionMarketLike();
            this.phase = "waiting_for_close";
          } finally {
            this.isIterationStarted = false;
          }
        }
      } else {
        if (!this.isIterationStarted) {
          this.isIterationStarted = true;
          this.phase = "opening";
          try {
            await this.openPositionMarket();
            this.phase = "waiting_for_open_fill";
          } catch (e) {
            this.phase = "idle";
            throw e;
          } finally {
            this.isIterationStarted = false;
          }
        }
      }
      return;
    }

    if (this.phase === "waiting_for_close") {
      if (!hasOpenPosition) {
        this.callbacks.onLog("Close confirmed - opening new market position...");
        if (!this.isIterationStarted) {
          this.isIterationStarted = true;
          this.phase = "opening";
          try {
            await this.openPositionMarket();
            this.phase = "waiting_for_open_fill";
          } catch (e) {
            this.phase = "idle";
            throw e;
          } finally {
            this.isIterationStarted = false;
          }
        }
      }
      return;
    }

    if (this.phase === "waiting_for_open_fill") {
      if (hasOpenPosition) {
        this.callbacks.onLog("Position opened - initiating market close...");
        if (!this.isIterationStarted) {
          this.isIterationStarted = true;
          this.phase = "closing";
          try {
            await this.closePositionMarketLike();
            this.phase = "waiting_for_close";
          } finally {
            this.isIterationStarted = false;
          }
        }
      }
      return;
    }
  }

  private getSelectedAssetOrThrow(): PerpsAssetWithMeta {
    const { selectedAsset } = this.config;
    if (!selectedAsset) {
      throw new Error("No asset selected");
    }
    return selectedAsset;
  }

  private async openPositionMarket(): Promise<void> {
    const asset = this.getSelectedAssetOrThrow();
    const { agent, margin, isBuy, leverage } = this.config;
    if (!agent || !margin) {
      throw new Error("Missing required trading parameters");
    }
    // Use latest WS state for withdrawable balance
    const liveBalance = new Decimal(this.latestState?.withdrawable || 0);
    const requested = new Decimal(margin);
    const effectiveMargin = requested.lt(liveBalance)
      ? requested
      : liveBalance;
    if (effectiveMargin.lte(0)) {
      throw new Error("Insufficient balance");
    }
    if (requested.gt(liveBalance)) {
      this.callbacks.onLog(
        `Requested margin $${requested.toString()} exceeds available $${liveBalance.toString()}. Using $${effectiveMargin.toString()}.`,
      );
    }

    const amountDecimal = effectiveMargin.mul(leverage);
    const markPx = new Decimal(asset.markPx || 0);
    if (markPx.lte(0)) {
      throw new Error("Invalid mark price");
    }
    const quantityDecimal = amountDecimal.div(markPx);
    const qty = hyperliquidFormatQuantity(
      quantityDecimal.toNumber(),
      asset.szDecimals,
    );
    const size = new Decimal(qty).toString();

    const order: PlacedHyperliquidOrder = {
      asset: asset.assetIndex,
      isBuy,
      price: getHyperliquidMarkPriceWithSlippage(isBuy, asset).toString(),
      size,
      isReduceOnly: false,
      type: { limit: { tif: "Ioc" } },
    };

    this.callbacks.onLog(
      `Open market: ${isBuy ? "Long" : "Short"} ${asset.name} x${leverage} size $${amountDecimal}`,
    );
    await createOrder(agent, { orders: [order], grouping: "na" });
    this.callbacks.onPositionOpened();
  }

  // no-op: no resting orders in market flow

  private async connectTradingWs() {
    try {
      await this.disconnectTradingWs();
      const transport = new WebSocketTransport();
      const client = new SubscriptionClient({ transport });
      this.subsRef.client = client;

      const webDataSub = await client.webData2(
        { user: this.config.address as `0x${string}` },
        (data: any) => {
          if (data?.clearinghouseState) {
            this.latestState = data.clearinghouseState;
            // React to state changes (e.g., position opened/closed)
            void this.evaluateAndAct("webdata").catch((e) =>
              this.callbacks.onError(
                e instanceof Error ? e.message : "webdata event error",
              ),
            );
          }
          if (data?.assetCtxs && data?.meta?.universe) {
            const assets = data.assetCtxs;
            const meta = data.meta;
            this.assetsWithMeta = assets.map((asset: any, assetIndex: number) => ({
              ...asset,
              ...meta.universe[assetIndex],
              assetIndex,
            }));
            this.callbacks.onAssetsLoaded(this.assetsWithMeta);
          }
        },
      );
      // Store implicit client via unsub references; no direct field needed

      const orderSub = await client.orderUpdates(
        { user: this.config.address as `0x${string}` },
        () => {
          void this.evaluateAndAct("order").catch((e) =>
            this.callbacks.onError(
              e instanceof Error ? e.message : "order event error",
            ),
          );
        },
      );
      const eventsSub = await client.userEvents(
        { user: this.config.address as `0x${string}` },
        (events: unknown) => {
          const arr = Array.isArray(events) ? events : [events];
          const hasFill = arr.some((e) =>
            Boolean((e as any)?.fill || (e as any)?.liquidation),
          );
          if (hasFill) {
            void this.evaluateAndAct("fill").catch((e) =>
              this.callbacks.onError(
                e instanceof Error ? e.message : "fill event error",
              ),
            );
          }
        },
      );

      this.orderUnsub = orderSub.unsubscribe.bind(orderSub);
      this.userEventsUnsub = eventsSub.unsubscribe.bind(eventsSub);
      this.webDataUnsub = webDataSub.unsubscribe.bind(webDataSub);
      this.tradingWsConnected = true;
      this.callbacks.onTradingConnectionChange?.(true);
    } catch (e) {
      this.tradingWsConnected = false;
      this.callbacks.onTradingConnectionChange?.(false);
      this.callbacks.onError(
        e instanceof Error
          ? `Trading WS connect error: ${e.message}`
          : "Trading WS connect error",
      );
    }
  }

  private async disconnectTradingWs() {
    try {
      if (this.orderUnsub) {
        await this.orderUnsub();
        this.orderUnsub = null;
      }
      if (this.userEventsUnsub) {
        await this.userEventsUnsub();
        this.userEventsUnsub = null;
      }
      if (this.webDataUnsub) {
        await this.webDataUnsub();
        this.webDataUnsub = null;
      }
      // noop
    } catch (e) {
      // ignore
    } finally {
      this.tradingWsConnected = false;
      this.callbacks.onTradingConnectionChange?.(false);
    }
  }

  // openPosition removed in favor of dual-maker strategy

  private async closePositionMarketLike(): Promise<void> {
    const { agent, address } = this.config;

    if (!this.assetsWithMeta.length || !agent || !address) {
      throw new Error("Missing required parameters for closing position");
    }

    try {
      this.callbacks.onLog("Refreshing positions data...");

      const positions = this.latestState?.assetPositions || [];
      const position = positions[0]?.position;

      if (!position) {
        throw new Error("Position not found");
      }

      this.callbacks.onLog("Positions data updated.");

      const asset = this.assetsWithMeta.find((a) => a.name === position.coin);

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
          limit: { tif: "Ioc" }, // immediate or cancel, market-like
        },
      };

      this.callbacks.onLog(
        `Close order for position: ${!isBuy ? "Long" : "Short"} ${position.coin}x${position.leverage.value} with $${usdSize} size`,
      );

      await createOrder(agent, {
        orders: [closeOrder],
        grouping: "na",
      });

      this.callbacks.onLog("Position successfully closed!");
      this.callbacks.onPositionClosed();
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Unknown error closing position.";
      this.callbacks.onError(`Error closing position: ${errorMessage}`);
      throw e;
    }

    this.callbacks.onLog(
      "Market data and balance will update automatically via WebSocket.",
    );
  }

  public get isRunning(): boolean {
    return this.isLooping;
  }

  public get isProcessing(): boolean {
    return this.isIterationStarted;
  }

  public get isTradingConnected(): boolean {
    return this.tradingWsConnected;
  }
}
