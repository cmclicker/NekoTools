import type { CharClasses, CrackTime, PasswordReport } from './kinds.js';

/**
 * Self-contained password strength estimator (a pragmatic zxcvbn-lite):
 * character-pool brute-force entropy with penalties for common passwords,
 * sequences, keyboard walks, repeats, and dates. No dependencies, no
 * network, and the password is never returned — only metrics.
 */

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'passw0rd', '123456', '12345678', '123456789', '1234567890',
  'qwerty', 'qwertyuiop', 'abc123', 'letmein', 'admin', 'welcome', 'monkey', 'dragon',
  'iloveyou', '111111', '000000', 'sunshine', 'princess', 'football', 'baseball',
  'login', 'master', 'hello', 'access', 'shadow', 'superman', 'trustno1', 'whatever',
]);

const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890'];

const LABELS = ['very weak', 'weak', 'fair', 'strong', 'very strong'] as const;

const CRACK_SCENARIOS: readonly { scenario: string; rate: number }[] = [
  { scenario: 'Online, throttled (100/hour)', rate: 100 / 3600 },
  { scenario: 'Online, no throttle (10/sec)', rate: 10 },
  { scenario: 'Offline, slow hash (1e4/sec)', rate: 1e4 },
  { scenario: 'Offline, fast hash (1e10/sec)', rate: 1e10 },
];

export function assessPassword(password: string): PasswordReport {
  const length = [...password].length;
  const charClasses = classify(password);
  const poolSize = poolOf(charClasses);
  const bruteforceBits = length === 0 ? 0 : round2(length * Math.log2(Math.max(poolSize, 1)));
  const shannonBits = round2(shannonPerChar(password) * length);

  const warnings: string[] = [];
  let penalty = 0;
  const lower = password.toLowerCase();

  let common = false;
  if (COMMON_PASSWORDS.has(lower)) {
    warnings.push('This is one of the most commonly used passwords.');
    common = true;
  }
  if (length > 0 && /(.)\1{2,}/.test(password)) {
    warnings.push('Contains a run of repeated characters.');
    penalty += 10;
  }
  if (/(.{2,})\1+/.test(password)) {
    warnings.push('Contains a repeated sequence.');
    penalty += 8;
  }
  if (hasSequence(lower)) {
    warnings.push('Contains an alphabetic or numeric sequence (e.g. "abcd", "1234").');
    penalty += 12;
  }
  if (hasKeyboardWalk(lower)) {
    warnings.push('Contains a keyboard walk (e.g. "qwerty").');
    penalty += 12;
  }
  if (/(?:19|20)\d{2}/.test(password)) {
    warnings.push('Contains a year — dates are easy to guess.');
    penalty += 6;
  }
  if (length > 0 && length < 8) {
    warnings.push('Too short — under 8 characters.');
  }

  let entropyBits = Math.max(0, round2(bruteforceBits - penalty));
  if (common) entropyBits = Math.min(entropyBits, 8);

  const score = scoreOf(entropyBits, length);
  const crackTimes = CRACK_SCENARIOS.map((s) => crackTime(entropyBits, s.scenario, s.rate));

  return {
    length,
    charClasses,
    poolSize,
    entropyBits,
    bruteforceBits,
    shannonBits,
    score,
    label: LABELS[score],
    crackTimes,
    warnings,
    suggestions: suggest(score, length, charClasses, warnings.length > 0),
  };
}

function classify(s: string): CharClasses {
  return {
    lower: /[a-z]/.test(s),
    upper: /[A-Z]/.test(s),
    digit: /[0-9]/.test(s),
    symbol: /[^a-zA-Z0-9\s]/.test(s) || /\s/.test(s),
    other: [...s].some((c) => c.codePointAt(0)! > 127),
  };
}

function poolOf(c: CharClasses): number {
  let pool = 0;
  if (c.lower) pool += 26;
  if (c.upper) pool += 26;
  if (c.digit) pool += 10;
  if (c.symbol) pool += 33;
  if (c.other) pool += 100;
  return pool;
}

function shannonPerChar(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let e = 0;
  const n = [...s].length;
  for (const count of freq.values()) {
    const p = count / n;
    e -= p * Math.log2(p);
  }
  return e;
}

function hasSequence(s: string): boolean {
  let asc = 1;
  let desc = 1;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    asc = d === 1 ? asc + 1 : 1;
    desc = d === -1 ? desc + 1 : 1;
    if (asc >= 4 || desc >= 4) return true;
  }
  return false;
}

function hasKeyboardWalk(s: string): boolean {
  for (const row of KEYBOARD_ROWS) {
    for (let i = 0; i + 4 <= row.length; i++) {
      const seg = row.slice(i, i + 4);
      if (s.includes(seg) || s.includes(reverse(seg))) return true;
    }
  }
  return false;
}

function reverse(s: string): string {
  return [...s].reverse().join('');
}

function scoreOf(bits: number, length: number): 0 | 1 | 2 | 3 | 4 {
  if (length === 0) return 0;
  if (bits < 28) return 0;
  if (bits < 36) return 1;
  if (bits < 60) return 2;
  if (bits < 128) return 3;
  return 4;
}

function crackTime(bits: number, scenario: string, rate: number): CrackTime {
  const guesses = Math.pow(2, bits) / 2; // expected guesses ≈ half the space
  const seconds = guesses / rate;
  return { scenario, seconds, display: humanize(seconds) };
}

function humanize(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'centuries';
  if (seconds < 1) return 'instant';
  const minute = 60;
  const hour = 3600;
  const day = 86400;
  const month = 2.628e6;
  const year = 3.1536e7;
  if (seconds < minute) return `${Math.round(seconds)} seconds`;
  if (seconds < hour) return `${Math.round(seconds / minute)} minutes`;
  if (seconds < day) return `${Math.round(seconds / hour)} hours`;
  if (seconds < month) return `${Math.round(seconds / day)} days`;
  if (seconds < year) return `${Math.round(seconds / month)} months`;
  const years = seconds / year;
  if (years > 1e9) return 'centuries';
  if (years > 100) return `${Math.round(years).toLocaleString('en-US')} years`;
  return `${Math.round(years)} years`;
}

function suggest(score: number, length: number, c: CharClasses, hasPatterns: boolean): string[] {
  const out: string[] = [];
  if (length < 12) out.push('Use at least 12–16 characters (length matters most).');
  if (!c.symbol) out.push('Mix in symbols and spaces.');
  if (!c.upper || !c.digit) out.push('Combine upper/lowercase letters and digits.');
  if (hasPatterns) out.push('Avoid common words, sequences, keyboard walks, and dates.');
  if (score >= 4) out.push('Strong — store it in a password manager and enable 2FA.');
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
