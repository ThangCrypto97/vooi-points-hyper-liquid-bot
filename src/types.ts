import { type Hex } from "viem";
import { signTransaction } from "./helpers/signTransaction";

export interface HyperliquidPosition {
  coin: string;
  cumFunding: {
    allTime: string;
    sinceOpen: string;
    sinceChange: string;
  };
  entryPx: string;
  leverage: {
    type: "cross" | "isolated";
    value: number;
  };
  liquidationPx: string;
  marginUsed: string;
  maxLeverage: number;
  positionValue: string;
  returnOnEquity: string;
  szi: string;
  unrealizedPnl: string;
}

export interface HyperliquidPositionEntry {
  position: HyperliquidPosition;
  type: "oneWay";
}

export interface HyperliquidAssetInfo {
  maxLeverage: number;
  name: string;
  onlyIsolated: boolean;
  szDecimals: number;
}

export interface HyperliquidAssetMeta {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string;
  oraclePx: string;
  markPx: string;
  midPx: string;
  impactPxs: string[];
}

export interface HyperliquidClearinghouseState {
  marginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
  };
  crossMarginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
  };
  crossMaintenanceMarginUsed: string;
  withdrawable: string;
  assetPositions: HyperliquidPositionEntry[];
  time: number;
}

export type PendingAgentData = {
  signedTransaction: Awaited<ReturnType<typeof signTransaction>>;
  timestamp: number;
  privateKey: Hex;
};

export type HyperliquidAsset = HyperliquidAssetInfo &
  HyperliquidAssetMeta & { assetIndex: number };

export type HyperliquidOrder = {
  coin: string;
  limitPx: string;
  oid: number;
  side: string;
  sz: string;
  origSz?: string;
  orderType: string;
  reduceOnly: boolean;
  timestamp: number;
} & (
  | {
      isPositionTpsl: false;
    }
  | {
      isPositionTpsl: true;
      triggerCondition: string;
      triggerPx: string;
    }
) &
  (
    | {
        isTrigger: false;
      }
    | {
        isTrigger: true;
        triggerPx: string;
        triggerCondition: string;
      }
  );

export interface PlacedHyperliquidOrder {
  asset: number;
  isBuy: boolean;
  price: string;
  size: string;
  isReduceOnly: boolean;
  clientOrderId?: string;
  type:
    | { limit: { tif: "Alo" | "Ioc" | "Gtc" | "FrontendMarket" } }
    | { trigger: { isMarket: boolean; triggerPx: string; tpsl: "tp" | "sl" } };
}

export interface PlaceHyperliquidOrdersParams {
  orders: PlacedHyperliquidOrder[];
  grouping: "na" | "normalTpsl" | "positionTpsl";
}

export interface UserNonFundingLedgerUpdate {
  hash: string;
  time: number;
  delta:
    | {
        fee: string;
        nonce: string;
        type: "withdraw";
        usdc: string;
      }
    | {
        type: "deposit";
        usdc: string;
      };
}

export interface ActiveAgent {
  address: Hex;
  privateKey: Hex;
}

export interface WebData2 {
  clearinghouseState: HyperliquidClearinghouseState;
  openOrders: HyperliquidOrder[];
  agentValidUntil: number | null;
  assetCtxs: HyperliquidAssetMeta[];
  meta: {
    universe: HyperliquidAssetInfo[];
  };
}

export interface ReferralInfo {
  referredBy: {
    referrer: string;
    code: string;
  } | null;
  cumVlm: string;
  unclaimedRewards: string;
  claimedRewards: string;
  builderRewards: string;
  referrerState: {
    stage: string;
    data: {
      required: string;
    };
  };
  rewardHistory: unknown[];
}
