import Decimal from "decimal.js-light";

const PRICE_MAX_DECIMALS = 5;

export const PRICE_MAX_DECIMAL_PLACES = 6;

export function getHyperliquidPriceDecimals(
  price: number,
  symbolBaseDecimals: number,
): number {
  const priceDecimal = new Decimal(price);

  if (priceDecimal.toDecimalPlaces(0, Decimal.ROUND_DOWN).eq(0)) {
    const maxDecimalPlaces = Math.max(
      PRICE_MAX_DECIMALS - symbolBaseDecimals,
      0,
    );

    const decimalPart = price.toString().split(".")[1] ?? "";
    const decimalLength = decimalPart.length;
    const numberLength = decimalPart.replace(/^0+/, "").length;

    return Math.max(
      0,
      Math.min(
        decimalLength - numberLength + maxDecimalPlaces,
        PRICE_MAX_DECIMAL_PLACES,
      ),
    );
  }

  const significantPlaces = priceDecimal.toDecimalPlaces(0).precision(true);

  return Math.max(0, PRICE_MAX_DECIMALS - significantPlaces);
}
