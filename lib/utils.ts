import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function cleanHtml(html: string): string {
  let cleaned = html.trim();
  
  // Remove leading empty paragraphs (including &nbsp;)
  cleaned = cleaned.replace(/^(\s|<p>(&nbsp;|\s|<br\s*\/?>)*<\/p>)+/gi, "");
  
  // Remove trailing empty paragraphs
  cleaned = cleaned.replace(/(\s|<p>(&nbsp;|\s|<br\s*\/?>)*<\/p>)+$/gi, "");
  
  return cleaned.trim();
}

type ParsedMathAnswer = {
  numerator: bigint;
  denominator: bigint;
  canonical: string;
  kind: "integer" | "decimal" | "fraction" | "scientific";
  decimalPlaces: number;
};

function gcd(a: bigint, b: bigint): bigint {
  let left = a < BigInt(0) ? -a : a;
  let right = b < BigInt(0) ? -b : b;

  while (right !== BigInt(0)) {
    const next = left % right;
    left = right;
    right = next;
  }

  return left;
}

function normalizeFraction(numerator: bigint, denominator: bigint): ParsedMathAnswer | null {
  if (denominator === BigInt(0)) return null;

  let nextNumerator = numerator;
  let nextDenominator = denominator;

  if (nextDenominator < BigInt(0)) {
    nextNumerator = -nextNumerator;
    nextDenominator = -nextDenominator;
  }

  if (nextNumerator === BigInt(0)) {
    return {
      numerator: BigInt(0),
      denominator: BigInt(1),
      canonical: "0",
      kind: "integer",
      decimalPlaces: 0,
    };
  }

  const divisor = gcd(nextNumerator, nextDenominator);
  const reducedNumerator = nextNumerator / divisor;
  const reducedDenominator = nextDenominator / divisor;

  return {
    numerator: reducedNumerator,
    denominator: reducedDenominator,
    canonical: reducedDenominator === BigInt(1)
      ? reducedNumerator.toString()
      : `${reducedNumerator.toString()}/${reducedDenominator.toString()}`,
    kind: reducedDenominator === BigInt(1) ? "integer" : "fraction",
    decimalPlaces: 0,
  };
}

function stripOuterParens(value: string): string {
  let result = value.trim();
  while (result.startsWith("(") && result.endsWith(")")) {
    result = result.slice(1, -1).trim();
  }
  return result;
}

function parseDecimalOrScientific(value: string): ParsedMathAnswer | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/);
  if (!match) return null;

  const sign = match[1] === "-" ? BigInt(-1) : BigInt(1);
  const integerPart = match[2] ?? "0";
  const fractionalPart = match[3] ?? match[4] ?? "";
  const exponent = match[5] ? Number.parseInt(match[5], 10) : 0;
  if (!Number.isFinite(exponent)) return null;

  const digits = `${integerPart}${fractionalPart}`.replace(/^0+(?=\d)/, "") || "0";
  const scale = fractionalPart.length - exponent;

  let numerator: bigint;
  let denominator: bigint;

  try {
    numerator = BigInt(digits);
  } catch {
    return null;
  }

  if (scale >= 0) {
    denominator = BigInt(10) ** BigInt(scale);
  } else {
    numerator *= BigInt(10) ** BigInt(-scale);
    denominator = BigInt(1);
  }

  const normalized = normalizeFraction(sign * numerator, denominator);
  if (!normalized) return null;

  return {
    ...normalized,
    kind: match[5] ? "scientific" : (fractionalPart.length > 0 ? "decimal" : "integer"),
    decimalPlaces: Math.max(0, scale),
  };
}

function parseFraction(value: string): ParsedMathAnswer | null {
  const parts = value.split("/");
  if (parts.length !== 2) return null;

  const numeratorPart = stripOuterParens(parts[0]);
  const denominatorPart = stripOuterParens(parts[1]);
  const numerator = parseDecimalOrScientific(numeratorPart);
  const denominator = parseDecimalOrScientific(denominatorPart);
  if (!numerator || !denominator || denominator.numerator === BigInt(0)) return null;

  const normalized = normalizeFraction(
    numerator.numerator * denominator.denominator,
    numerator.denominator * denominator.numerator,
  );
  if (!normalized) return null;

  return {
    ...normalized,
    kind: "fraction",
    decimalPlaces: 0,
  };
}

function parseMathAnswer(answer: string): ParsedMathAnswer | null {
  const trimmed = answer.trim();
  if (!trimmed) return null;

  const compact = trimmed.replace(/\s*\/\s*/g, "/");
  return compact.includes("/") ? parseFraction(compact) : parseDecimalOrScientific(compact);
}

function hasFiniteDecimal(value: ParsedMathAnswer): boolean {
  let denominator = value.denominator;
  while (denominator % BigInt(2) === BigInt(0)) denominator /= BigInt(2);
  while (denominator % BigInt(5) === BigInt(0)) denominator /= BigInt(5);
  return denominator === BigInt(1);
}

function decimalFromRational(value: ParsedMathAnswer, decimalPlaces: number, mode: "round" | "truncate"): string {
  const negative = value.numerator < BigInt(0);
  const numerator = negative ? -value.numerator : value.numerator;
  const denominator = value.denominator;
  const scale = BigInt(10) ** BigInt(decimalPlaces);

  let scaled = numerator * scale;
  if (mode === "round") {
    scaled = (scaled + denominator / BigInt(2)) / denominator;
  } else {
    scaled = scaled / denominator;
  }

  const whole = scaled / scale;
  const fractional = decimalPlaces === 0
    ? ""
    : (scaled % scale).toString().padStart(decimalPlaces, "0");
  const prefix = negative && scaled !== BigInt(0) ? "-" : "";

  return decimalPlaces === 0 ? `${prefix}${whole.toString()}` : `${prefix}${whole.toString()}.${fractional}`;
}

function normalizedDecimalText(raw: string): string | null {
  const parsed = parseDecimalOrScientific(raw);
  if (!parsed) return null;

  const trimmed = raw.trim();
  const match = trimmed.match(/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/);
  if (!match) return null;

  if (match[5]) {
    if (!hasFiniteDecimal(parsed)) return null;
    return decimalFromRational(parsed, parsed.decimalPlaces, "truncate");
  }

  const sign = match[1] === "-" && parsed.numerator !== BigInt(0) ? "-" : "";
  const integerPart = (match[2] ?? "0").replace(/^0+(?=\d)/, "") || "0";
  const fractionPart = match[3] ?? match[4] ?? "";
  return fractionPart.length > 0 ? `${sign}${integerPart}.${fractionPart}` : `${sign}${integerPart}`;
}

function countVisibleDecimalPlaces(value: string): number | null {
  const normalized = normalizedDecimalText(value);
  if (normalized === null) return null;

  const parts = normalized.split(".");
  return parts[1]?.length ?? 0;
}

function decimalEquivalentMatches(exactValue: ParsedMathAnswer, decimalInput: string): boolean {
  const normalizedDecimal = normalizedDecimalText(decimalInput);
  const decimalPlaces = countVisibleDecimalPlaces(decimalInput);
  if (normalizedDecimal === null || decimalPlaces === null) return false;

  return normalizedDecimal === decimalFromRational(exactValue, decimalPlaces, "round")
    || normalizedDecimal === decimalFromRational(exactValue, decimalPlaces, "truncate");
}

/**
 * Validates whether a string is a valid numeric input for FIB questions.
 * Accepts lenient formatting such as spaces around fractions, leading +, and signed denominators.
 */
export function isValidNumericInput(value: string): boolean {
  return parseMathAnswer(value) !== null;
}

export function normalizeMathAnswer(answer: string): string {
  const parsed = parseMathAnswer(answer);
  return parsed ? parsed.canonical : answer.trim().toLowerCase();
}

export function checkAnswerCorrect(userAnswer: string, correctAnswer: string): boolean {
  const user = parseMathAnswer(userAnswer);
  const correct = parseMathAnswer(correctAnswer);

  if (user && correct) {
    return user.numerator === correct.numerator && user.denominator === correct.denominator;
  }

  return normalizeMathAnswer(userAnswer) === normalizeMathAnswer(correctAnswer);
}

export function checkFibAnswerCorrect(userAnswer: string, correctAnswers: string[]): boolean {
  const trimmedUserAnswer = userAnswer.trim();
  if (!trimmedUserAnswer) return false;

  const user = parseMathAnswer(trimmedUserAnswer);
  if (!user) return false;

  return correctAnswers.some((correctAnswer) => {
    const trimmedCorrectAnswer = correctAnswer.trim();
    if (!trimmedCorrectAnswer) return false;

    const correct = parseMathAnswer(trimmedCorrectAnswer);
    if (!correct) {
      return normalizeMathAnswer(trimmedUserAnswer) === normalizeMathAnswer(trimmedCorrectAnswer);
    }

    if (user.numerator === correct.numerator && user.denominator === correct.denominator) {
      return true;
    }

    const userLooksDecimal = !trimmedUserAnswer.includes("/");
    const correctLooksDecimal = !trimmedCorrectAnswer.includes("/");
    const userLooksExact = trimmedUserAnswer.includes("/");
    const correctLooksExact = trimmedCorrectAnswer.includes("/");

    if (userLooksExact && correctLooksDecimal && decimalEquivalentMatches(user, trimmedCorrectAnswer)) {
      return true;
    }

    if (correctLooksExact && userLooksDecimal && decimalEquivalentMatches(correct, trimmedUserAnswer)) {
      return true;
    }

    return false;
  });
}
