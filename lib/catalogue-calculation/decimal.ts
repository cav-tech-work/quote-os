const DECIMAL_PATTERN = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/;

function gcd(a: bigint, b: bigint): bigint { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; }

export class ExactDecimal {
  readonly numerator: bigint;
  readonly denominator: bigint;
  constructor(numerator: bigint, denominator = 1n) {
    if (denominator === 0n) throw new Error("Zero denominator");
    const sign = denominator < 0n ? -1n : 1n; const divisor = gcd(numerator, denominator);
    this.numerator = numerator / divisor * sign; this.denominator = denominator / divisor * sign;
  }
  static parse(value: string) {
    const match = DECIMAL_PATTERN.exec(value.trim()); if (!match) return null;
    const fraction = match[3] ?? ""; return new ExactDecimal(BigInt(`${match[1]}${match[2]}${fraction}`), 10n ** BigInt(fraction.length));
  }
  multiply(other: ExactDecimal) { return new ExactDecimal(this.numerator * other.numerator, this.denominator * other.denominator); }
  divide(other: ExactDecimal) { return new ExactDecimal(this.numerator * other.denominator, this.denominator * other.numerator); }
  isNegative() { return this.numerator < 0n; }
  isInteger() { return this.numerator % this.denominator === 0n; }
  toFixed(scale = 12) {
    const factor = 10n ** BigInt(scale); const raw = this.numerator * factor; const quotient = raw / this.denominator; const remainder = raw % this.denominator;
    const scaled = quotient + (remainder * 2n >= this.denominator ? 1n : 0n);
    const whole = scaled / factor; const fraction = String(scaled % factor).padStart(scale, "0").replace(/0+$/, "");
    return fraction ? `${whole}.${fraction}` : String(whole);
  }
  roundHalfUp() {
    const whole = this.numerator / this.denominator; const remainder = this.numerator % this.denominator;
    return whole + (remainder * 2n >= this.denominator ? 1n : 0n);
  }
}

export const exact = (numerator: bigint, denominator = 1n) => new ExactDecimal(numerator, denominator);
