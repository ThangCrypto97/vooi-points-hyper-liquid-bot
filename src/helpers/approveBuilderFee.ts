import Decimal from "decimal.js-light";
import { HYPERLIQUID_CONFIG } from "../config";
import { hyperliquidApi } from "./hyperliquidApi";
import { signTransaction } from "./signTransaction";
import type { Address } from "viem";

export async function approveBuilderFee() {
  const timestamp = Date.now();

  const maxFeeRate = new Decimal(HYPERLIQUID_CONFIG.builderMaxFee)
    .div(100)
    .toString();

  const signedTransaction = await signTransaction(
    "HyperliquidTransaction:ApproveBuilderFee",
    {
      maxFeeRate: `${maxFeeRate}%`,
      builder: HYPERLIQUID_CONFIG.builderId as Address,
      nonce: BigInt(timestamp),
    },
  );

  const { action, signature } = signedTransaction;

  const apiAction: Record<string, unknown> = {
    ...action,
    type: "approveBuilderFee",
    nonce: timestamp,
  };

  const result = await hyperliquidApi({
    action: apiAction,
    nonce: timestamp,
    signature,
  });

  if (result.status !== "ok") {
    throw new Error(`Approving builder fee failed: ${result.response}`);
  }

  return result.response;
}
