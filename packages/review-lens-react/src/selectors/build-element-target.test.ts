import { describe, expect, it } from "vitest";
import { buildElementTarget } from "./build-element-target";

describe("buildElementTarget", () => {
  it("prefers stable review attributes", () => {
    document.body.innerHTML = '<button data-review-id="hero-cta">Buy</button>';

    const target = buildElementTarget(document.querySelector("button")!);

    expect(target.selector).toBe('[data-review-id="hero-cta"]');
    expect(target.selectorStrategy).toBe("stable-attribute");
  });

  it("falls back to a css path", () => {
    document.body.innerHTML = "<main><section><button>Buy</button></section></main>";

    const target = buildElementTarget(document.querySelector("button")!);

    expect(target.selector).toBe("main > section > button");
    expect(target.selectorStrategy).toBe("css-path");
  });
});

