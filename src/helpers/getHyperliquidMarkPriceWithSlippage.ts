import Decimal from "decimal.js-light";
import {
  HYPERLIQUID_DEFAULT_SLIPPAGE,
  HYPERLIQUID_MAX_SIGNIFICANT_FIGURES,
} from "~/const/const";
import { getHyperliquidPriceDecimals } from "~/helpers/getHyperliquidPriceDecimals";
import type { PerpsAssetWithMeta } from "~/VooiBot";

const MAX_SLIPPAGE = 0.7; // 70%

export function getHyperliquidMarkPriceWithSlippage(
  isBuy: boolean,
  asset: PerpsAssetWithMeta,
  slippage = HYPERLIQUID_DEFAULT_SLIPPAGE,
) {
  const marketPriceDecimal = new Decimal(asset.markPx ?? 0);

  if (marketPriceDecimal.eq(0)) {
    return 0;
  }

  const slippageDecimal = new Decimal(slippage ?? 0);
  const availableSlippage = slippageDecimal.gt(MAX_SLIPPAGE)
    ? MAX_SLIPPAGE
    : slippageDecimal;
  const slippagePrice = marketPriceDecimal.mul(availableSlippage);

  let price = marketPriceDecimal;
  if (isBuy) {
    price = price.add(slippagePrice);
  } else {
    price = price.sub(slippagePrice);
  }

  const markPriceDecimals = getHyperliquidPriceDecimals(
    price.toNumber(),
    asset.szDecimals,
  );

  return new Decimal(price)
    .toSignificantDigits(HYPERLIQUID_MAX_SIGNIFICANT_FIGURES)
    .toDecimalPlaces(markPriceDecimals, Decimal.ROUND_DOWN)
    .toNumber();
}
