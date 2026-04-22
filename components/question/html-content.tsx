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
const SVG_NON_SCALING_VALUES = new Set(["none", "transparent"]);
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
    if (hsl.l < 0.16) {
      return rgb.a !== undefined && rgb.a < 1
        ? `color-mix(in srgb, var(--question-svg-tone-strong) ${rgb.a * 100}%, transparent)`
        : "var(--question-svg-tone-strong)";
    }

    if (hsl.l < 0.45) {
      return rgb.a !== undefined && rgb.a < 1
        ? `color-mix(in srgb, var(--question-svg-tone-mid) ${rgb.a * 100}%, transparent)`
        : "var(--question-svg-tone-mid)";
    }

    return rgb.a !== undefined && rgb.a < 1
      ? `color-mix(in srgb, var(--question-svg-tone-soft) ${rgb.a * 100}%, transparent)`
      : "var(--question-svg-tone-soft)";
  }

  if (hsl.l < 0.2) {
    return rgb.a !== undefined && rgb.a < 1
      ? `color-mix(in srgb, var(--question-svg-tone-strong) ${rgb.a * 100}%, transparent)`
      : "var(--question-svg-tone-strong)";
  }

  if (hsl.l < 0.55) {
    return rgb.a !== undefined && rgb.a < 1
      ? `color-mix(in srgb, var(--question-svg-tone-mid) ${rgb.a * 100}%, transparent)`
      : "var(--question-svg-tone-mid)";
  }

  return rgb.a !== undefined && rgb.a < 1
    ? `color-mix(in srgb, var(--question-svg-tone-soft) ${rgb.a * 100}%, transparent)`
    : "var(--question-svg-tone-soft)";
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

  if (normalized === "currentcolor" || normalized === "inherit" || normalized === "unset") {
    return "var(--question-svg-foreground)";
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

function restyleMatplotlibSvg(svg: SVGSVGElement) {
  for (const label of svg.querySelectorAll<SVGElement>('g[id^="text_"] use')) {
    label.setAttribute("fill", "var(--question-svg-foreground)");
    label.setAttribute("stroke", "none");
    label.style.fill = "var(--question-svg-foreground)";
    label.style.stroke = "none";
  }

  for (const labelGroup of svg.querySelectorAll<SVGGElement>('g[id^="text_"]')) {
    labelGroup.setAttribute("fill", "var(--question-svg-foreground)");
    labelGroup.style.fill = "var(--question-svg-foreground)";
    labelGroup.style.color = "var(--question-svg-foreground)";
  }
}

function restyleBarePathGlyphs(svg: SVGSVGElement) {
  for (const path of svg.querySelectorAll<SVGPathElement>('g[data-name] path')) {
    if (path.hasAttribute("fill") || path.hasAttribute("stroke") || path.hasAttribute("style") || path.hasAttribute("class") || path.hasAttribute("transform")) {
      continue;
    }

    path.setAttribute("fill", "var(--question-svg-foreground)");
    path.setAttribute("stroke", "none");
    path.style.fill = "var(--question-svg-foreground)";
    path.style.stroke = "none";
  }
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
  if (isDarkTheme) {
    svg.classList.add("question-svg-invert");
    svg.style.filter = "invert(1) hue-rotate(180deg)";
    return;
  }

  svg.classList.remove("question-svg-invert");
  svg.style.filter = "";

  const nodes = [svg, ...Array.from(svg.querySelectorAll<SVGElement>("*"))];
  for (const node of nodes) {
    const tagName = node.tagName.toLowerCase();
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

    if (isDarkTheme && (tagName === "text" || tagName === "tspan")) {
      node.setAttribute("fill", "var(--question-svg-foreground)");
      node.setAttribute("stroke", "none");
      node.style.fill = "var(--question-svg-foreground)";
      node.style.stroke = "none";
      node.style.paintOrder = "normal";
    }

    const styleValue = node.getAttribute("style");
    if (styleValue) {
      node.setAttribute("style", rewriteStyleColors(styleValue, isDarkTheme));
    }

    if (isDarkTheme && (tagName === "text" || tagName === "tspan")) {
      node.style.fill = "var(--question-svg-foreground)";
      node.style.stroke = "none";
    }
  }
}

function wrapTable(table: HTMLTableElement, doc: Document) {
  const parent = table.parentElement;
  if (parent?.classList.contains("question-table-wrapper")) {
    return;
  }

  const caption = table.querySelector(":scope > caption");
  const wrapper = doc.createElement("div");
  wrapper.className = "question-table-wrapper";

  if (caption) {
    const captionBlock = doc.createElement("div");
    captionBlock.className = "question-table-caption";
    captionBlock.innerHTML = caption.innerHTML;
    caption.remove();
    table.replaceWith(captionBlock);
    captionBlock.insertAdjacentElement("afterend", wrapper);
  } else {
    table.replaceWith(wrapper);
  }

  wrapper.appendChild(table);
}

function wrapTables(container: HTMLElement) {
  for (const table of container.querySelectorAll<HTMLTableElement>("table")) {
    wrapTable(table, document);
  }
}

function wrapTablesInDocument(doc: Document) {
  for (const table of doc.querySelectorAll<HTMLTableElement>("table")) {
    wrapTable(table, doc);
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
