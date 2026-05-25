import type { CssSnapshot, ElementFingerprint, ReviewLensTarget } from "../types";

const stableAttributes = [
  "data-review-id",
  "data-testid",
  "data-test-id",
  "aria-label",
  "name"
];

export function buildElementTarget(element: Element): ReviewLensTarget {
  const rect = element.getBoundingClientRect();
  const selectorResult = buildSelector(element);

  return {
    selector: selectorResult.selector,
    selectorStrategy: selectorResult.strategy,
    fingerprint: buildFingerprint(element, rect),
    cssSnapshot: readCssSnapshot(element, rect),
    rect
  };
}

function buildSelector(element: Element): {
  selector: string;
  strategy: ReviewLensTarget["selectorStrategy"];
} {
  for (const attribute of stableAttributes) {
    const value = element.getAttribute(attribute);
    if (value) {
      return {
        selector: `[${attribute}="${cssEscape(value)}"]`,
        strategy: "stable-attribute"
      };
    }
  }

  if (element.id) {
    return { selector: `#${cssEscape(element.id)}`, strategy: "stable-attribute" };
  }

  return { selector: buildCssPath(element), strategy: "css-path" };
}

function buildCssPath(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
    const parent: Element | null = current.parentElement;
    const tag = current.tagName.toLowerCase();

    if (!parent) {
      segments.unshift(tag);
      break;
    }

    const currentTag = current.tagName;
    const siblings = Array.from(parent.children).filter(
      (sibling: Element) => sibling.tagName === currentTag
    );
    const index = siblings.indexOf(current) + 1;
    segments.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
    current = parent;
  }

  return segments.join(" > ");
}

function buildFingerprint(element: Element, rect: DOMRect): ElementFingerprint {
  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id || undefined,
    className: element.getAttribute("class") || undefined,
    textSnippet: element.textContent?.trim().slice(0, 80) || undefined,
    ariaLabel: element.getAttribute("aria-label") || undefined,
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

function readCssSnapshot(element: Element, rect: DOMRect): CssSnapshot {
  const styles = window.getComputedStyle(element);

  return {
    margin: compactBox(styles.marginTop, styles.marginRight, styles.marginBottom, styles.marginLeft),
    padding: compactBox(
      styles.paddingTop,
      styles.paddingRight,
      styles.paddingBottom,
      styles.paddingLeft
    ),
    border: compactBox(
      styles.borderTopWidth,
      styles.borderRightWidth,
      styles.borderBottomWidth,
      styles.borderLeftWidth
    ),
    fontFamily: styles.fontFamily,
    fontSize: styles.fontSize,
    lineHeight: styles.lineHeight,
    color: styles.color,
    backgroundColor: styles.backgroundColor,
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

function compactBox(top: string, right: string, bottom: string, left: string): string {
  if (top === right && right === bottom && bottom === left) {
    return top;
  }

  return `${top} ${right} ${bottom} ${left}`;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/["\\]/g, "\\$&");
}
