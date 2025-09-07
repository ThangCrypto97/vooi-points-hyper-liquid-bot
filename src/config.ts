import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arbitrum } from "wagmi/chains";
import Decimal from "decimal.js-light";

// Same as vooi
export const HYPERLIQUID_CONFIG = {
  apiUrl: "https://api.hyperliquid.xyz",
  source: "a",
  chainId: arbitrum.id,
  hyperliquidChain: "Mainnet",
  builderId: "0xBe622F92438AE55B12908B01eEACe15d98eD1EEC",
  builderMaxFee: 2.5, // in BPS
  builderFee: 1.5, // in BPS
};

export const DEFAULT_FEE = new Decimal(HYPERLIQUID_CONFIG.builderFee)
  .div(10000)
  .add(0.00035)
  .toNumber();

export const wagmiConfig = getDefaultConfig({
  appName: "VOOI",
  projectId: "d8405e8397be028e611b917423fbd35f", // Same as vooi ?? It is safe???
  chains: [arbitrum],
  ssr: false,
});
