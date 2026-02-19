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

export function normalizeMathAnswer(answer: string): string {
  const trimmed = answer.toLowerCase().trim();
  
  const fractionMatch = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fractionMatch) {
    const numerator = parseFloat(fractionMatch[1]);
    const denominator = parseFloat(fractionMatch[2]);
    if (denominator !== 0) {
      return (numerator / denominator).toString();
    }
  }
  
  return trimmed;
}

export function checkAnswerCorrect(userAnswer: string, correctAnswer: string): boolean {
  const normalizedUser = normalizeMathAnswer(userAnswer);
  const normalizedCorrect = normalizeMathAnswer(correctAnswer);
  
  return normalizedUser === normalizedCorrect;
}
