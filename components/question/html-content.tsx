"use client";

import { useEffect, useRef } from "react";
import DOMPurify from "isomorphic-dompurify";
import katex from "katex";

interface HtmlContentProps {
  html: string;
  className?: string;
}

function mathMLToLatex(ml: Element): string {
  const tag = ml.tagName.toLowerCase();
  
  switch (tag) {
    case "math":
      return Array.from(ml.children).map(mathMLToLatex).join(" ");
    case "mrow":
      return Array.from(ml.children).map(mathMLToLatex).join(" ");
    case "msub": {
      const base = mathMLToLatex(ml.children[0]);
      const sub = ml.children[1] ? mathMLToLatex(ml.children[1]) : "";
      return `${base}_{${sub}}`;
    }
    case "msup": {
      const base = mathMLToLatex(ml.children[0]);
      const sup = ml.children[1] ? mathMLToLatex(ml.children[1]) : "";
      return `${base}^{${sup}}`;
    }
    case "mfrac": {
      const num = mathMLToLatex(ml.children[0]);
      const den = ml.children[1] ? mathMLToLatex(ml.children[1]) : "";
      return `\\frac{${num}}{${den}}`;
    }
    case "msqrt":
      return `\\sqrt{${Array.from(ml.children).map(mathMLToLatex).join(" ")}}`;
    case "mi":
      return ml.textContent || "";
    case "mn":
      return ml.textContent || "";
    case "mo": {
      const text = ml.textContent || "";
      const opMap: Record<string, string> = {
        "+": "+", "-": "-", "×": "\\times", "÷": "\\div",
        "=": "=", "(": "(", ")": ")", "[": "[", "]": "]",
        "<": "<", ">": ">", "≤": "\\leq", "≥": "\\geq",
        "≠": "\\neq", "±": "\\pm", "⋅": "\\cdot",
        "%": "\\%",
      };
      return opMap[text] || text;
    }
    case "mtext":
      return ml.textContent || "";
    case "mfenced": {
      const open = ml.getAttribute("open") || "(";
      const close = ml.getAttribute("close") || ")";
      const sep = ml.getAttribute("sep") || ",";
      const inner = Array.from(ml.children).map(mathMLToLatex).join(sep + " ");
      return `${open}${inner}${close}`;
    }
    default:
      return ml.textContent || "";
  }
}

export function HtmlContent({ html, className = "" }: HtmlContentProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const mathElements = doc.querySelectorAll("math");
    mathElements.forEach((math) => {
      try {
        let latex = mathMLToLatex(math);
        
        if (!latex.trim()) {
          const alttext = math.getAttribute("alttext");
          if (alttext) {
            latex = alttext
              .replace(/left parenthesis/g, "(")
              .replace(/right parenthesis/g, ")")
              .replace(/left bracket/g, "[")
              .replace(/right bracket/g, "]")
              .replace(/%/g, "\\%");
          }
        }

        const rendered = katex.renderToString(latex, {
          throwOnError: false,
          displayMode: false,
        });

        const container = document.createElement("span");
        container.innerHTML = rendered;
        math.replaceWith(container);
      } catch (e) {
        const span = document.createElement("span");
        span.textContent = math.getAttribute("alttext") || math.textContent;
        math.replaceWith(span);
      }
    });

    const sanitized = DOMPurify.sanitize(doc.body.innerHTML, {
      ADD_TAGS: ["math", "mi", "mo", "mn", "ms", "mrow", "msup", "msub", "mfrac", "mover", "munder", "mtext", "msqrt", "mroot", "mpadded", "mspace", "mfenced", "mtd", "mtr", "mlabeledtr", "svg", "figure", "g", "path", "defs", "clipPath", "use", "rect", "text", "span", "p", "ul", "li", "br", "img"],
      ADD_ATTR: ["xmlns", "alttext", "accent", "accentunder", "fence", "separator", "stretchy", "lspace", "rspace", "columnalign", "rowalign", "colspan", "rowspan", "open", "close", "sep", "viewBox", "width", "height", "role", "aria-label", "id", "class", "d", "fill", "stroke", "stroke-width", "clip-path", "transform", "x", "y", "xlink:href", "href", "style", "align"],
    });

    ref.current.innerHTML = sanitized;

    // Add dark mode fix for SVGs
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      const svgs = ref.current.querySelectorAll('svg');
      svgs.forEach(svg => {
        svg.style.filter = 'invert(1) hue-rotate(180deg)';
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
