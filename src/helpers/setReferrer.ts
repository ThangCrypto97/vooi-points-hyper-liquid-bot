import { type Hex } from "viem";
import { HYPERLIQUID_REFERRAL_CODE } from "../const/const";
import { hyperliquidApi } from "./hyperliquidApi";
import { signAgent } from "./signAgent";

export async function setReferrer(privateKey: Hex) {
  const timestamp = Date.now();

  const action = {
    type: "setReferrer",
    code: HYPERLIQUID_REFERRAL_CODE,
  };

  const signature = await signAgent({
    privateKey,
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
    throw new Error(`Set referrer failed: ${result.response}`);
  }
}
