"use client";

import { useEffect, useRef } from "react";
import DOMPurify from "isomorphic-dompurify";

interface HtmlContentProps {
  html: string;
  className?: string;
}

export function HtmlContent({ html, className = "" }: HtmlContentProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = DOMPurify.sanitize(html, {
        ADD_TAGS: ["math", "mi", "mo", "mn", "ms", "mrow", "msup", "msub", "mfrac", "mover", "munder"],
        ADD_ATTR: ["xmlns"],
      });
    }
  }, [html]);

  return (
    <div
      ref={ref}
      className={`html-content question-content prose prose-sm dark:prose-invert max-w-none ${className}`}
    />
  );
}
