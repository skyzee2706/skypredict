const DECIMAL_NUMBER_RE = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i;

function stripLeadingZeros(value: string) {
  const stripped = value.replace(/^0+/, '');
  return stripped || '0';
}

export function toBigIntString(value: unknown) {
  if (typeof value === 'bigint') return value.toString();
  if (value === null || value === undefined) return '0';

  const raw = String(value).trim();
  if (!raw) return '0';

  if (/^[+-]?\d+$/.test(raw)) {
    const sign = raw.startsWith('-') ? '-' : '';
    const digits = raw.replace(/^[+-]/, '');
    const normalized = stripLeadingZeros(digits);
    return normalized === '0' ? '0' : `${sign}${normalized}`;
  }

  const match = raw.match(DECIMAL_NUMBER_RE);
  if (!match) return '0';

  const [, signRaw, wholeRaw, fractionRaw = '', exponentRaw = '0'] = match;
  const sign = signRaw === '-' ? '-' : '';
  const exponent = Number(exponentRaw);
  if (!Number.isFinite(exponent)) return '0';

  let digits = `${wholeRaw}${fractionRaw}`;
  const decimalPlaces = fractionRaw.length;
  const shift = exponent - decimalPlaces;

  if (shift >= 0) {
    digits = `${digits}${'0'.repeat(shift)}`;
  } else {
    const integerLength = digits.length + shift;
    if (integerLength <= 0) {
      digits = '0';
    } else {
      digits = digits.slice(0, integerLength);
    }
  }

  const normalized = stripLeadingZeros(digits);
  if (normalized === '0') return '0';
  return `${sign}${normalized}`;
}

export function toBigIntSafe(value: unknown) {
  return BigInt(toBigIntString(value));
}
