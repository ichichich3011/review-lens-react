import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewLensOverlay } from "./review-lens-overlay";
import { ReviewLensProvider } from "./review-lens-provider";
import type { ReviewLensAdapter, ReviewLensFeedback, ReviewLensPermission } from "./types";

describe("ReviewLensOverlay", () => {
  it("positions the panel from the placement prop", async () => {
    const adapter = createAdapter();

    render(
      <ReviewLensProvider
        config={{
          adapter,
          projectKey: "demo",
          contentId: "article-1",
          currentUrl: "http://localhost:5173/article/1"
        }}
      >
        <ReviewLensOverlay open placement="bottom-left" />
      </ReviewLensProvider>
    );

    const panel = await screen.findByRole("complementary");
    expect(panel.className).toContain("review-lens-panel--bottom-left");
  });

  it("creates feedback for a locked element", async () => {
    const createFeedback = vi.fn(async (input) => ({
      ...input,
      id: "feedback-1",
      status: "open",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    })) as ReviewLensAdapter["createFeedback"];
    const adapter = createAdapter({ createFeedback });

    render(
      <ReviewLensProvider
        config={{
          adapter,
          projectKey: "demo",
          contentId: "article-1",
          currentUrl: "http://localhost:5173/article/1"
        }}
      >
        <button data-review-id="cta">CTA</button>
        <ReviewLensOverlay open />
      </ReviewLensProvider>
    );

    await screen.findByText("Inspecting");

    document.elementFromPoint = vi.fn(() => screen.getByText("CTA"));
    fireEvent.click(window, { clientX: 10, clientY: 10 });

    await screen.findByText("Element locked");
    fireEvent.change(screen.getByLabelText("Feedback"), {
      target: { value: "Increase tap target size" }
    });
    fireEvent.click(screen.getByText("Save feedback"));

    await waitFor(() => expect(createFeedback).toHaveBeenCalledOnce());
    expect(createFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        selector: '[data-review-id="cta"]',
        comment: "Increase tap target size",
        normalizedPath: "/article/1"
      })
    );
  });
});

function createAdapter(overrides: Partial<ReviewLensAdapter> = {}): ReviewLensAdapter {
  const feedback: ReviewLensFeedback[] = [];

  return {
    getCurrentUser: vi.fn(async () => ({ email: "designer@example.com" })),
    getPermissions: vi.fn(async () => ["create", "read", "resolve"] satisfies ReviewLensPermission[]),
    listFeedback: vi.fn(async () => feedback),
    createFeedback: vi.fn(async (input) => ({
      ...input,
      id: "feedback-1",
      status: "open",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    })),
    resolveFeedback: vi.fn(async (id, resolvedBy) => ({
      id,
      projectKey: "demo",
      contentId: "article-1",
      normalizedPath: "/article/1",
      originalUrl: "http://localhost:5173/article/1",
      selector: "[data-review-id=\"cta\"]",
      selectorStrategy: "stable-attribute" as const,
      elementFingerprint: { tagName: "button", width: 0, height: 0 },
      cssSnapshot: {
        margin: "",
        padding: "",
        border: "",
        fontFamily: "",
        fontSize: "",
        lineHeight: "",
        color: "",
        backgroundColor: "",
        width: 0,
        height: 0
      },
      comment: "Done",
      status: "resolved" as const,
      authorEmail: "designer@example.com",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      resolvedAt: "2026-05-25T00:00:00.000Z",
      resolvedBy
    })),
    ...overrides
  };
}
