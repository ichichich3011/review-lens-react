import { describe, expect, it } from "vitest";
import { normalizeReviewUrl } from "./normalize-review-url";

describe("normalizeReviewUrl", () => {
  it("keeps only the path so localhost and production can share comments", () => {
    expect(normalizeReviewUrl("https://example.com/articles/123?preview=true#intro")).toBe(
      "/articles/123"
    );
    expect(normalizeReviewUrl("http://localhost:5173/articles/123")).toBe("/articles/123");
  });

  it("normalizes an empty path to root", () => {
    expect(normalizeReviewUrl("https://example.com")).toBe("/");
  });
});

