"use client";

import { useEffect, useState, useRef } from "react";
import DOMPurify from "isomorphic-dompurify";
import katex from "katex";

interface HtmlContentProps {
  html: string;
  className?: string;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

interface HslColor {
  h: number;
  s: number;
  l: number;
}

const SVG_COLOR_ATTRIBUTES = ["fill", "stroke", "stop-color", "color"] as const;
const SVG_STYLE_PROPERTIES = new Set(["fill", "stroke", "stop-color", "color"]);
const SVG_NON_SCALING_VALUES = new Set(["none", "transparent", "currentcolor", "inherit", "unset"]);
const resolvedColorCache = new Map<string, RgbColor | null>();
let colorProbe: HTMLSpanElement | null = null;

function getColorProbe(): HTMLSpanElement {
  if (colorProbe?.isConnected) {
    return colorProbe;
  }

  colorProbe = document.createElement("span");
  colorProbe.setAttribute("aria-hidden", "true");
  colorProbe.style.position = "fixed";
  colorProbe.style.width = "0";
  colorProbe.style.height = "0";
  colorProbe.style.overflow = "hidden";
  colorProbe.style.opacity = "0";
  colorProbe.style.pointerEvents = "none";
  colorProbe.style.inset = "0";
  document.body.appendChild(colorProbe);
  return colorProbe;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parseSvgLength(value: string | null): number | null {
  if (!value) return null;
  const match = value.trim().match(/^([+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+))(px)?$/i);
  if (!match) {
    return null;
  }

  return Number(match[1]);
}

function rgbToHsl({ r, g, b }: RgbColor): HslColor {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l };
  }

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = 0;

  switch (max) {
    case red:
      h = ((green - blue) / delta) % 6;
      break;
    case green:
      h = (blue - red) / delta + 2;
      break;
    default:
      h = (red - green) / delta + 4;
      break;
  }

  return { h: h * 60 < 0 ? h * 60 + 360 : h * 60, s, l };
}

function hueToRgb(p: number, q: number, t: number): number {
  let next = t;
  if (next < 0) next += 1;
  if (next > 1) next -= 1;
  if (next < 1 / 6) return p + (q - p) * 6 * next;
  if (next < 1 / 2) return q;
  if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6;
  return p;
}

function hslToRgb({ h, s, l }: HslColor): RgbColor {
  if (s === 0) {
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray };
  }

  const hue = h / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hueToRgb(p, q, hue + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, hue) * 255),
    b: Math.round(hueToRgb(p, q, hue - 1 / 3) * 255),
  };
}

function rgbToCss({ r, g, b, a = 1 }: RgbColor): string {
  return a < 1
    ? `rgba(${r}, ${g}, ${b}, ${a})`
    : `rgb(${r}, ${g}, ${b})`;
}

function resolveCssColor(color: string): RgbColor | null {
  const cached = resolvedColorCache.get(color);
  if (cached !== undefined) {
    return cached;
  }

  const probe = getColorProbe();
  probe.style.color = "";
  probe.style.color = color;
  if (!probe.style.color) {
    resolvedColorCache.set(color, null);
    return null;
  }

  const resolved = window.getComputedStyle(probe).color;

  const match = resolved.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
  if (!match) {
    resolvedColorCache.set(color, null);
    return null;
  }

  const parsed = {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
  };
  resolvedColorCache.set(color, parsed);
  return parsed;
}

function mapColorForDarkTheme(rgb: RgbColor): string {
  const hsl = rgbToHsl(rgb);

  if (hsl.s < 0.12) {
    const nextLightness = clamp(0.18 + (1 - hsl.l) * 0.7, 0.18, 0.9);
    return rgbToCss({ ...hslToRgb({ h: hsl.h, s: 0.06, l: nextLightness }), a: rgb.a });
  }

  const nextLightness = clamp(0.28 + (1 - hsl.l) * 0.46, 0.28, 0.82);
  const nextSaturation = clamp(hsl.s * 0.88 + 0.12, 0.24, 0.88);
  return rgbToCss({ ...hslToRgb({ h: hsl.h, s: nextSaturation, l: nextLightness }), a: rgb.a });
}

function transformColorValue(value: string, isDarkTheme: boolean): string {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  if (!trimmed || SVG_NON_SCALING_VALUES.has(normalized) || normalized.startsWith("url(")) {
    return value;
  }

  if (!isDarkTheme) {
    return value;
  }

  const resolved = resolveCssColor(trimmed);
  return resolved ? mapColorForDarkTheme(resolved) : value;
}

function rewriteStyleColors(styleValue: string, isDarkTheme: boolean): string {
  return styleValue
    .split(";")
    .map((declaration) => {
      const separatorIndex = declaration.indexOf(":");
      if (separatorIndex === -1) {
        return declaration;
      }

      const property = declaration.slice(0, separatorIndex).trim();
      const rawValue = declaration.slice(separatorIndex + 1);
      if (!SVG_STYLE_PROPERTIES.has(property)) {
        return declaration;
      }

      return `${property}: ${transformColorValue(rawValue, isDarkTheme)}`;
    })
    .join(";");
}

function isLikelyBackgroundRect(element: SVGElement, svg: SVGSVGElement): boolean {
  if (element.tagName.toLowerCase() !== "rect") {
    return false;
  }

  const viewBox = svg.viewBox.baseVal;
  if (!viewBox || !viewBox.width || !viewBox.height) {
    return false;
  }

  const x = parseSvgLength(element.getAttribute("x")) ?? 0;
  const y = parseSvgLength(element.getAttribute("y")) ?? 0;
  const width = parseSvgLength(element.getAttribute("width"));
  const height = parseSvgLength(element.getAttribute("height"));
  if (width === null || height === null) {
    return false;
  }

  const coversWidth = width >= viewBox.width * 0.9;
  const coversHeight = height >= viewBox.height * 0.9;
  const nearOrigin = x <= viewBox.width * 0.05 && y <= viewBox.height * 0.05;
  return coversWidth && coversHeight && nearOrigin;
}

function setSvgBackgroundFill(node: SVGElement) {
  node.removeAttribute("fill");
  node.style.fill = "var(--question-svg-dark-background)";
}

function restyleSvg(svg: SVGSVGElement, isDarkTheme: boolean) {
  const width = parseSvgLength(svg.getAttribute("width"));
  const height = parseSvgLength(svg.getAttribute("height"));
  if (!svg.getAttribute("viewBox") && width !== null && height !== null) {
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  svg.style.display = "block";
  svg.style.maxWidth = "100%";
  svg.style.height = "auto";

  const nodes = [svg, ...Array.from(svg.querySelectorAll<SVGElement>("*"))];
  for (const node of nodes) {
    for (const attribute of SVG_COLOR_ATTRIBUTES) {
      const currentValue = node.getAttribute(attribute);
      if (!currentValue) {
        continue;
      }

      if (isDarkTheme && attribute === "fill" && isLikelyBackgroundRect(node, svg)) {
        setSvgBackgroundFill(node);
        continue;
      }

      node.setAttribute(attribute, transformColorValue(currentValue, isDarkTheme));
    }

    const styleValue = node.getAttribute("style");
    if (styleValue) {
      node.setAttribute("style", rewriteStyleColors(styleValue, isDarkTheme));
    }
  }
}

function wrapTables(container: HTMLElement) {
  for (const table of container.querySelectorAll<HTMLTableElement>("table")) {
    const parent = table.parentElement;
    if (parent?.classList.contains("question-table-wrapper")) {
      continue;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "question-table-wrapper";
    table.replaceWith(wrapper);
    wrapper.appendChild(table);
  }
}

function wrapTablesInDocument(doc: Document) {
  for (const table of doc.querySelectorAll<HTMLTableElement>("table")) {
    const parent = table.parentElement;
    if (parent?.classList.contains("question-table-wrapper")) {
      continue;
    }

    const wrapper = doc.createElement("div");
    wrapper.className = "question-table-wrapper";
    table.replaceWith(wrapper);
    wrapper.appendChild(table);
  }
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
  const [isDarkTheme, setIsDarkTheme] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => setIsDarkTheme(mediaQuery.matches);
    updateTheme();

    mediaQuery.addEventListener("change", updateTheme);
    return () => mediaQuery.removeEventListener("change", updateTheme);
  }, []);

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
      } catch {
        const span = document.createElement("span");
        span.textContent = math.getAttribute("alttext") || math.textContent;
        math.replaceWith(span);
      }
    });

    wrapTablesInDocument(doc);
    for (const svg of doc.querySelectorAll<SVGSVGElement>("svg")) {
      restyleSvg(svg, isDarkTheme);
    }

    const sanitized = DOMPurify.sanitize(doc.body.innerHTML, {
      ADD_TAGS: ["math", "mi", "mo", "mn", "ms", "mrow", "msup", "msub", "mfrac", "mover", "munder", "mtext", "msqrt", "mroot", "mpadded", "mspace", "mfenced", "mtd", "mtr", "mlabeledtr", "svg", "figure", "g", "path", "defs", "clipPath", "use", "rect", "text", "span", "p", "ul", "li", "br", "img", "line", "circle", "ellipse", "polyline", "polygon", "tspan"],
      ADD_ATTR: ["xmlns", "alttext", "accent", "accentunder", "fence", "separator", "stretchy", "lspace", "rspace", "columnalign", "rowalign", "colspan", "rowspan", "open", "close", "sep", "viewBox", "width", "height", "role", "aria-label", "id", "class", "d", "fill", "stroke", "stroke-width", "clip-path", "transform", "x", "y", "xlink:href", "href", "style", "align", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "points", "opacity", "fill-opacity", "stroke-opacity", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-miterlimit", "stroke-dashoffset", "font-size", "font-family", "font-style", "font-weight", "text-anchor", "dominant-baseline", "preserveAspectRatio", "stop-color", "stop-opacity"],
    });

    ref.current.innerHTML = sanitized;
    wrapTables(ref.current);
  }, [html, isDarkTheme]);

  return (
    <div
      ref={ref}
      className={`html-content question-content prose prose-sm dark:prose-invert max-w-none ${className}`}
    />
  );
}
