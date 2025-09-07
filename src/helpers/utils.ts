import Decimal from "decimal.js-light";
import { type Hex } from "viem";

import { HYPERLIQUID_CONFIG } from "../config";
import { hyperliquidApi } from "./hyperliquidApi";
import { type PendingAgentData } from "../types";

export async function hyperliquidFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${HYPERLIQUID_CONFIG.apiUrl}${path}`, options);

  if (!response.ok) {
    const text = await response.text();

    if (!text) {
      throw new Error("Unknown error");
    }

    try {
      const error = JSON.parse(text);

      throw new Error(error.message ?? "Unknown error");
    } catch {
      throw new Error("Unknown error");
    }
  }

  return response.json() as T;
}

export async function addAgent({
  signedTransaction,
  privateKey,
  timestamp,
}: PendingAgentData): Promise<Hex> {
  const { action, signature } = signedTransaction;

  const apiAction: Record<string, unknown> = {
    ...action,
    type: "approveAgent",
    nonce: timestamp, // overwrite bigint
  };

  if ("agentName" in apiAction && !apiAction.agentName) {
    delete apiAction["agentName"];
  }

  const result = await hyperliquidApi({
    action: apiAction,
    nonce: timestamp,
    signature,
  });

  if (result.status !== "ok") {
    throw new Error(`Add agent failed: ${result.response}`);
  }

  return privateKey;
}

export function hyperliquidFormatQuantity(
  quantity: number,
  szDecimals: number,
) {
  return new Decimal(quantity)
    .toDecimalPlaces(szDecimals, Decimal.ROUND_DOWN)
    .toNumber();
}
