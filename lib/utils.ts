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

/**
 * Validates whether a string is a valid numeric input for FIB questions.
 * Accepts: integers, decimals, fractions (a/b), negative numbers, negative fractions.
 * Rejects: letters, symbols, empty strings, multiple slashes, etc.
 */
export function isValidNumericInput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Allow: optional negative sign, digits, optional decimal, optional fraction
  // Valid examples: "27", "-3", "3.5", "1/2", "-1/2", "0.75", ".5"
  return /^-?(\d+\.?\d*|\.\d+)(\/\d+\.?\d*)?$/.test(trimmed);
}

export function normalizeMathAnswer(answer: string): string {
  const trimmed = answer.trim();
  
  // Handle fractions: optional negative, digits (with optional decimal) / digits (with optional decimal)
  const fractionMatch = trimmed.match(/^(-?\d*\.?\d+)\/(\d*\.?\d+)$/);
  if (fractionMatch) {
    const numerator = parseFloat(fractionMatch[1]);
    const denominator = parseFloat(fractionMatch[2]);
    if (denominator !== 0) {
      return String(numerator / denominator);
    }
  }
  
  // Try to parse as a number to normalize (removes leading zeros, trailing decimal zeros)
  const num = parseFloat(trimmed);
  if (!isNaN(num) && isFinite(num)) {
    return String(num);
  }
  
  return trimmed.toLowerCase();
}

export function checkAnswerCorrect(userAnswer: string, correctAnswer: string): boolean {
  const normalizedUser = normalizeMathAnswer(userAnswer);
  const normalizedCorrect = normalizeMathAnswer(correctAnswer);
  
  // Exact string match after normalization
  if (normalizedUser === normalizedCorrect) return true;
  
  // Numeric comparison with tolerance for floating-point imprecision
  const numUser = parseFloat(normalizedUser);
  const numCorrect = parseFloat(normalizedCorrect);
  if (!isNaN(numUser) && !isNaN(numCorrect)) {
    return Math.abs(numUser - numCorrect) < 1e-9;
  }
  
  return false;
}
