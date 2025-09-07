export function formatAmount(
  value: number,
  options?: Intl.NumberFormatOptions,
) {
  if (Number.isNaN(value)) {
    return "0";
  }

  return value.toLocaleString("en-US", {
    ...options,
    minimumFractionDigits: options?.minimumFractionDigits ?? 2,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  });
}
