export type CalculationLine = {
  quantity: number;
  days: number;
  ratePaise: number;
  discountPercent: number;
};

export function calculateQuote(lines: CalculationLine[], taxPercentage: number) {
  const subtotalPaise = lines.reduce((total, line) => total + Math.round(line.quantity * line.days * line.ratePaise), 0);
  const discountTotalPaise = lines.reduce((total, line) => total + Math.round(line.quantity * line.days * line.ratePaise * line.discountPercent / 100), 0);
  const taxTotalPaise = Math.round((subtotalPaise - discountTotalPaise) * taxPercentage / 100);
  return { subtotalPaise, discountTotalPaise, taxTotalPaise, grandTotalPaise: subtotalPaise - discountTotalPaise + taxTotalPaise };
}
