import { Prisma } from '@prisma/client';

export interface TaxBreakdownResult {
  subtotal: Prisma.Decimal;
  vatRate: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  nhilRate: Prisma.Decimal;
  nhilAmount: Prisma.Decimal;
  getFundRate: Prisma.Decimal;
  getFundAmount: Prisma.Decimal;
  totalTax: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

/**
 * Central Tax Calculation Utility for ZemiFix CMMS
 * Supports company tax settings with Ghana Statutory defaults (15% VAT, 2.5% NHIL, 2.5% GETFund = 20% Total Tax).
 */
export function calculateTaxBreakdown(
  subtotalInput: Prisma.Decimal | number | string,
  taxScheme: string = 'GHANA_STATUTORY_2026'
): TaxBreakdownResult {
  const subtotal = new Prisma.Decimal(subtotalInput.toString());

  if (taxScheme === 'ZERO_RATED' || taxScheme === 'EXEMPT') {
    const zero = new Prisma.Decimal(0);
    return {
      subtotal,
      vatRate: zero,
      vatAmount: zero,
      nhilRate: zero,
      nhilAmount: zero,
      getFundRate: zero,
      getFundAmount: zero,
      totalTax: zero,
      totalAmount: subtotal,
    };
  }

  // Ghana Statutory Rates
  const vatRate = new Prisma.Decimal(0.15);
  const nhilRate = new Prisma.Decimal(0.025);
  const getFundRate = new Prisma.Decimal(0.025);

  const vatAmount = subtotal.mul(vatRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const nhilAmount = subtotal.mul(nhilRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const getFundAmount = subtotal.mul(getFundRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  const totalTax = vatAmount.add(nhilAmount).add(getFundAmount);
  const totalAmount = subtotal.add(totalTax);

  return {
    subtotal,
    vatRate,
    vatAmount,
    nhilRate,
    nhilAmount,
    getFundRate,
    getFundAmount,
    totalTax,
    totalAmount,
  };
}
