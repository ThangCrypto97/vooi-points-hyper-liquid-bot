import type { ActiveAgent, PlaceHyperliquidOrdersParams } from "~/types";
import Decimal from "decimal.js-light";
import { HYPERLIQUID_CONFIG } from "~/config";
import { signAgent } from "~/helpers/signAgent";
import { hyperliquidApi } from "~/helpers/hyperliquidApi";
import { isHyperliquidPlaceOrderErrorResponse } from "~/helpers/isHyperliquidPlaceOrderErrorResponse";

export async function createOrder(
  agent: ActiveAgent,
  params: PlaceHyperliquidOrdersParams,
) {
  if (!agent) {
    throw new Error("No agent");
  }

  const timestamp = Date.now();

  const fee = new Decimal(HYPERLIQUID_CONFIG.builderFee).mul(10).toNumber();

  const action = {
    type: "order",
    orders: params.orders.map((order) => ({
      a: order.asset,
      b: order.isBuy,
      p: order.price,
      s: order.size,
      r: order.isReduceOnly,
      t: order.type,
    })),
    grouping: params.grouping,
    builder: {
      b: HYPERLIQUID_CONFIG.builderId.toLowerCase(),
      f: fee,
    },
  };

  const signature = await signAgent({
    privateKey: agent.privateKey,
    action,
    nonce: timestamp,
    vaultAddress: null,
  });

  const result = await hyperliquidApi({
    action,
    nonce: timestamp,
    signature,
  });

  if (result.status !== "ok") {
    throw new Error(`${result.response}`);
  }

  if (isHyperliquidPlaceOrderErrorResponse(result)) {
    throw new Error(`${result.response.data.statuses[0].error}`);
  }

  return result;
}
