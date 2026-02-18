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
