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

  it("keeps the panel height stable and scrolls inside the panel body", async () => {
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
        <ReviewLensOverlay open />
      </ReviewLensProvider>
    );

    const panel = await screen.findByRole("complementary");
    const body = panel.querySelector<HTMLElement>(".review-lens-panel__body");

    expect(body).not.toBeNull();
    expect(panel.className).toContain("review-lens-panel");
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
    await waitFor(() => expect(screen.queryByText("Authenticate with Google to inspect this page.")).toBeNull());

    document.elementFromPoint = vi.fn(() => screen.getByText("CTA"));
    fireEvent.click(window, { clientX: 10, clientY: 10 });

    await screen.findByText("Element locked");
    fireEvent.change(screen.getByLabelText("New feedback"), {
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

  it("submits locked element feedback with Command+Enter", async () => {
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
    await waitFor(() => expect(screen.queryByText("Authenticate with Google to inspect this page.")).toBeNull());

    document.elementFromPoint = vi.fn(() => screen.getByText("CTA"));
    fireEvent.click(window, { clientX: 10, clientY: 10 });

    const textarea = await screen.findByLabelText("New feedback");
    expect(screen.getByText("Command")).toBeTruthy();
    expect(screen.getByText("Enter")).toBeTruthy();
    fireEvent.change(textarea, {
      target: { value: "Increase tap target size" }
    });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(createFeedback).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    await waitFor(() => expect(createFeedback).toHaveBeenCalledOnce());
    expect(createFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        selector: '[data-review-id="cta"]',
        comment: "Increase tap target size"
      })
    );
  });

  it("requests closing the overlay with Escape", async () => {
    const adapter = createAdapter();
    const onOpenChange = vi.fn();

    render(
      <ReviewLensProvider
        config={{
          adapter,
          projectKey: "demo",
          contentId: "article-1",
          currentUrl: "http://localhost:5173/article/1"
        }}
      >
        <ReviewLensOverlay open onOpenChange={onOpenChange} />
      </ReviewLensProvider>
    );

    await screen.findByText("Inspecting");
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("draws the hovered element box model using viewport coordinates", async () => {
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
        <button
          style={{
            margin: "4px 6px 8px 10px",
            border: "2px solid currentColor",
            padding: "12px 14px 16px 18px"
          }}
        >
          CTA
        </button>
        <ReviewLensOverlay open />
      </ReviewLensProvider>
    );

    await waitFor(() => expect(screen.queryByText("Authenticate with Google to inspect this page.")).toBeNull());

    const button = screen.getByText("CTA");
    button.getBoundingClientRect = vi.fn(() => ({
      x: 40,
      y: 80,
      top: 80,
      right: 160,
      bottom: 140,
      left: 40,
      width: 120,
      height: 60,
      toJSON: () => ({})
    })) as Element["getBoundingClientRect"];

    document.elementFromPoint = vi.fn(() => button);
    fireEvent.mouseMove(window, { clientX: 50, clientY: 90 });

    const highlight = document.querySelector<HTMLElement>(".review-lens-highlight");
    const border = document.querySelector<HTMLElement>(".review-lens-highlight__border");
    const padding = document.querySelector<HTMLElement>(".review-lens-highlight__padding");
    const content = document.querySelector<HTMLElement>(".review-lens-highlight__content");

    expect(highlight?.style.top).toBe("76px");
    expect(highlight?.style.left).toBe("30px");
    expect(highlight?.style.width).toBe("136px");
    expect(highlight?.style.height).toBe("72px");
    expect(border?.style.top).toBe("4px");
    expect(border?.style.left).toBe("10px");
    expect(border?.style.width).toBe("120px");
    expect(border?.style.height).toBe("60px");
    expect(padding?.style.top).toBe("6px");
    expect(padding?.style.left).toBe("12px");
    expect(padding?.style.width).toBe("116px");
    expect(padding?.style.height).toBe("56px");
    expect(content?.style.top).toBe("18px");
    expect(content?.style.left).toBe("30px");
    expect(content?.style.width).toBe("84px");
    expect(content?.style.height).toBe("28px");
  });

  it("scrolls a feedback target into view when its comment is selected", async () => {
    const scrollIntoView = vi.fn();
    const adapter = createAdapter({
      listFeedback: vi.fn(async () => [createFeedbackItem()])
    });
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });

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

    const button = screen.getByText("CTA");
    button.scrollIntoView = scrollIntoView;
    button.getBoundingClientRect = vi.fn(() => ({
      x: 40,
      y: 80,
      top: 80,
      right: 160,
      bottom: 140,
      left: 40,
      width: 120,
      height: 60,
      toJSON: () => ({})
    })) as Element["getBoundingClientRect"];

    fireEvent.click(await screen.findByRole("tab", { name: /Feedback 1/ }));
    fireEvent.click(await screen.findByText("Move the CTA higher"));

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
      inline: "center"
    });
    expect(screen.getByRole("heading", { name: "Feedback" })).toBeTruthy();
    expect(document.querySelector(".review-lens-highlight")).toBeTruthy();
    expect(document.querySelector(".review-lens-comment--selected")).toBeTruthy();

    requestAnimationFrame.mockRestore();
  });

  it("replaces the locked target when another page element is clicked", async () => {
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
        <button data-review-id="first">First CTA</button>
        <button data-review-id="second">Second CTA</button>
        <ReviewLensOverlay open />
      </ReviewLensProvider>
    );

    await screen.findByText("Inspecting");
    await waitFor(() => expect(screen.queryByText("Authenticate with Google to inspect this page.")).toBeNull());

    document.elementFromPoint = vi.fn(() => screen.getByText("First CTA"));
    fireEvent.click(window, { clientX: 10, clientY: 10 });
    await screen.findByText("[data-review-id=\"first\"]");

    document.elementFromPoint = vi.fn(() => screen.getByText("Second CTA"));
    fireEvent.click(window, { clientX: 20, clientY: 20 });

    await screen.findByText("[data-review-id=\"second\"]");
    expect(screen.queryByText("[data-review-id=\"first\"]")).toBeNull();
  });

  it("continues hover inspection while an element is locked", async () => {
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
        <button data-review-id="first">First CTA</button>
        <button data-review-id="second">Second CTA</button>
        <ReviewLensOverlay open />
      </ReviewLensProvider>
    );

    await screen.findByText("Inspecting");
    await waitFor(() => expect(screen.queryByText("Authenticate with Google to inspect this page.")).toBeNull());

    document.elementFromPoint = vi.fn(() => screen.getByText("First CTA"));
    fireEvent.click(window, { clientX: 10, clientY: 10 });
    await screen.findByText("[data-review-id=\"first\"]");

    document.elementFromPoint = vi.fn(() => screen.getByText("Second CTA"));
    fireEvent.mouseMove(window, { clientX: 20, clientY: 20 });

    await screen.findByText("[data-review-id=\"second\"]");
  });

  it("falls back to the locked element when hovering the Review Lens panel", async () => {
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
        <button data-review-id="first">First CTA</button>
        <button data-review-id="second">Second CTA</button>
        <ReviewLensOverlay open />
      </ReviewLensProvider>
    );

    await screen.findByText("Inspecting");
    await waitFor(() => expect(screen.queryByText("Authenticate with Google to inspect this page.")).toBeNull());

    document.elementFromPoint = vi.fn(() => screen.getByText("First CTA"));
    fireEvent.click(window, { clientX: 10, clientY: 10 });
    await screen.findByText("[data-review-id=\"first\"]");

    document.elementFromPoint = vi.fn(() => screen.getByText("Second CTA"));
    fireEvent.mouseMove(window, { clientX: 20, clientY: 20 });
    await screen.findByText("[data-review-id=\"second\"]");

    document.elementFromPoint = vi.fn(() => screen.getByRole("complementary"));
    fireEvent.mouseMove(window, { clientX: 30, clientY: 30 });

    await screen.findByText("[data-review-id=\"first\"]");
    expect(screen.queryByText("[data-review-id=\"second\"]")).toBeNull();
  });

  it("does not inspect or keep hover highlights when moving over the Review Lens panel", async () => {
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
        <button data-review-id="cta">CTA</button>
        <ReviewLensOverlay open />
      </ReviewLensProvider>
    );

    await screen.findByText("Inspecting");
    await waitFor(() => expect(screen.queryByText("Authenticate with Google to inspect this page.")).toBeNull());

    document.elementFromPoint = vi.fn(() => screen.getByText("CTA"));
    fireEvent.mouseMove(window, { clientX: 10, clientY: 10 });
    await waitFor(() => expect(document.querySelector(".review-lens-highlight")).toBeTruthy());

    document.elementFromPoint = vi.fn(() => screen.getByRole("complementary"));
    fireEvent.mouseMove(window, { clientX: 20, clientY: 20 });

    expect(document.querySelector(".review-lens-highlight")).toBeNull();
    expect(screen.getByText("Move over the app to inspect.")).toBeTruthy();
  });

  it("positions feedback markers in viewport coordinates next to their target", async () => {
    const adapter = createAdapter({
      listFeedback: vi.fn(async () => [createFeedbackItem()])
    });

    Object.defineProperty(window, "scrollY", { configurable: true, value: 300 });
    Object.defineProperty(window, "scrollX", { configurable: true, value: 20 });
    const getBoundingClientRect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getRect(this: HTMLElement) {
        if (this instanceof HTMLElement && this.dataset.reviewId === "cta") {
          return {
            x: 40,
            y: 80,
            top: 80,
            right: 160,
            bottom: 140,
            left: 40,
            width: 120,
            height: 60,
            toJSON: () => ({})
          } as DOMRect;
        }

        return {
          x: 0,
          y: 0,
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          width: 0,
          height: 0,
          toJSON: () => ({})
        } as DOMRect;
      });

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

    const marker = await screen.findByLabelText("Open feedback from designer@example.com");

    expect(marker.style.top).toBe("80px");
    expect(marker.style.left).toBe("160px");
    getBoundingClientRect.mockRestore();
  });

  it("does not inspect elements before authentication finishes", async () => {
    const adapter = createAdapter({
      getCurrentUser: vi.fn(() => new Promise<{ email: string }>(() => undefined))
    });

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

    document.elementFromPoint = vi.fn(() => screen.getByText("CTA"));
    fireEvent.mouseMove(window, { clientX: 10, clientY: 10 });
    fireEvent.click(window, { clientX: 10, clientY: 10 });

    expect(screen.getByText("Authenticate with Google to inspect this page.")).toBeTruthy();
    expect(document.querySelector(".review-lens-highlight")).toBeNull();
    expect(screen.queryByText("[data-review-id=\"cta\"]")).toBeNull();
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
        marginTop: "",
        marginRight: "",
        marginBottom: "",
        marginLeft: "",
        padding: "",
        paddingTop: "",
        paddingRight: "",
        paddingBottom: "",
        paddingLeft: "",
        border: "",
        borderTopWidth: "",
        borderRightWidth: "",
        borderBottomWidth: "",
        borderLeftWidth: "",
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

function createFeedbackItem(): ReviewLensFeedback {
  return {
    id: "feedback-1",
    projectKey: "demo",
    contentId: "article-1",
    normalizedPath: "/article/1",
    originalUrl: "http://localhost:5173/article/1",
    selector: "[data-review-id=\"cta\"]",
    selectorStrategy: "stable-attribute",
    elementFingerprint: { tagName: "button", width: 120, height: 60 },
    cssSnapshot: {
      margin: "0px",
      marginTop: "0px",
      marginRight: "0px",
      marginBottom: "0px",
      marginLeft: "0px",
      padding: "0px",
      paddingTop: "0px",
      paddingRight: "0px",
      paddingBottom: "0px",
      paddingLeft: "0px",
      border: "0px",
      borderTopWidth: "0px",
      borderRightWidth: "0px",
      borderBottomWidth: "0px",
      borderLeftWidth: "0px",
      fontFamily: "",
      fontSize: "",
      lineHeight: "",
      color: "",
      backgroundColor: "",
      width: 120,
      height: 60
    },
    comment: "Move the CTA higher",
    status: "open",
    authorEmail: "designer@example.com",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z"
  };
}
