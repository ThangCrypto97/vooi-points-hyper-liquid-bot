import { signAgent } from "~/helpers/signAgent";
import { hyperliquidApi } from "~/helpers/hyperliquidApi";
import type { ActiveAgent } from "~/types";

export async function updateLeverage(
  asset: number,
  leverage: number,
  agent: ActiveAgent,
): Promise<void> {
  const timestamp = Date.now();

  const action = {
    type: "updateLeverage",
    asset,
    isCross: true,
    leverage,
  };

  if (!agent) {
    throw new Error("No agent");
  }

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

  if (result.status === "ok") {
    return;
  }

  throw new Error((result.response as string) ?? "Update leverage failed");
}
