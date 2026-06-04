import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("shows the Review Lens logo in the panel header", async () => {
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

    expect(await screen.findByRole("img", { name: "Review Lens logo" })).toBeTruthy();
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

  it("allows feedback and summary panes to scroll inside the panel", async () => {
    const adapter = createAdapter({
      listFeedback: vi.fn(async () => [createFeedbackItem()])
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
        <ReviewLensOverlay open />
      </ReviewLensProvider>
    );

    fireEvent.click(await screen.findByRole("tab", { name: /Feedback 1/ }));
    const feedbackPane = document.querySelector<HTMLElement>(".review-lens-comments");
    expect(feedbackPane).not.toBeNull();
    expect(feedbackPane!.className).toBe("review-lens-comments");

    fireEvent.click(screen.getByRole("tab", { name: "Summary" }));
    const summaryPane = document.querySelector<HTMLElement>(".review-lens-summary");
    expect(summaryPane).not.toBeNull();
    expect(summaryPane!.className).toBe("review-lens-summary");
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
        normalizedPath: "/article/1",
        severity: "medium",
        category: "visual",
        viewportPreset: "desktop"
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
    expect(screen.getByText("button")).toBeTruthy();
  });

  it("shows distance measurements from the locked element while shift is held", async () => {
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

    const first = screen.getByText("First CTA");
    const second = screen.getByText("Second CTA");
    first.getBoundingClientRect = vi.fn(() => ({
      x: 40,
      y: 80,
      top: 80,
      right: 140,
      bottom: 120,
      left: 40,
      width: 100,
      height: 40,
      toJSON: () => ({})
    })) as Element["getBoundingClientRect"];
    second.getBoundingClientRect = vi.fn(() => ({
      x: 180,
      y: 80,
      top: 80,
      right: 280,
      bottom: 120,
      left: 180,
      width: 100,
      height: 40,
      toJSON: () => ({})
    })) as Element["getBoundingClientRect"];

    document.elementFromPoint = vi.fn(() => first);
    fireEvent.click(window, { clientX: 50, clientY: 90 });
    fireEvent.keyDown(window, { key: "Shift" });
    document.elementFromPoint = vi.fn(() => second);
    fireEvent.mouseMove(window, { clientX: 190, clientY: 90 });

    expect(await screen.findByText("40px")).toBeTruthy();

    fireEvent.keyUp(window, { key: "Shift" });
    await waitFor(() => expect(screen.queryByText("40px")).toBeNull());
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
    await waitFor(() => expect(screen.getByText("No replies yet.")).toBeTruthy());
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

  it("scrolls and focuses the composer when an element is locked", async () => {
    const adapter = createAdapter();
    const scrollIntoView = vi.fn();
    const focus = vi.fn();
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

    await screen.findByText("Inspecting");
    await waitFor(() => expect(screen.queryByText("Authenticate with Google to inspect this page.")).toBeNull());

    document.elementFromPoint = vi.fn(() => screen.getByText("CTA"));
    fireEvent.click(window, { clientX: 10, clientY: 10 });

    const textarea = await screen.findByLabelText("New feedback");
    textarea.scrollIntoView = scrollIntoView;
    textarea.focus = focus;
    fireEvent.click(window, { clientX: 10, clientY: 10 });

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" }));
    expect(focus).toHaveBeenCalled();
    requestAnimationFrame.mockRestore();
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

  it("filters feedback by severity", async () => {
    const adapter = createAdapter({
      listFeedback: vi.fn(async () => [
        createFeedbackItem({ id: "feedback-1", comment: "High priority", severity: "high" }),
        createFeedbackItem({ id: "feedback-2", comment: "Low priority", severity: "low" })
      ])
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

    fireEvent.click(await screen.findByRole("tab", { name: /Feedback 2/ }));
    expect(screen.queryByLabelText("Filter severity")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.change(screen.getByLabelText("Filter severity"), { target: { value: "high" } });

    expect(screen.getByText("High priority")).toBeTruthy();
    expect(screen.queryByText("Low priority")).toBeNull();
    expect(screen.getByRole("button", { name: /Filters 1/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByText("High priority")).toBeTruthy();
    expect(screen.getByText("Low priority")).toBeTruthy();
  });

  it("shows a grouped summary", async () => {
    const adapter = createAdapter({
      listFeedback: vi.fn(async () => [
        createFeedbackItem({ id: "feedback-1", status: "open", severity: "high" }),
        createFeedbackItem({ id: "feedback-2", status: "fixed", severity: "low" })
      ])
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
        <ReviewLensOverlay open />
      </ReviewLensProvider>
    );

    fireEvent.click(await screen.findByRole("tab", { name: "Summary" }));

    expect(screen.getByRole("heading", { name: "Status" })).toBeTruthy();
    expect(screen.getByText("Fixed")).toBeTruthy();
    expect(screen.getByText("High")).toBeTruthy();
  });

  it("creates thread replies and stores fixed snapshots", async () => {
    const updateFeedback = vi.fn(async (id, patch) => ({
      ...createFeedbackItem({ id }),
      ...patch,
      updatedAt: "2026-05-25T00:00:01.000Z"
    })) as ReviewLensAdapter["updateFeedback"];
    const createMessage = vi.fn(async (input) => ({
      ...input,
      id: "message-1",
      createdAt: "2026-05-25T00:00:00.000Z"
    })) as ReviewLensAdapter["createMessage"];
    const adapter = createAdapter({
      listFeedback: vi.fn(async () => [createFeedbackItem()]),
      updateFeedback,
      createMessage
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

    fireEvent.click(await screen.findByRole("tab", { name: /Feedback 1/ }));
    fireEvent.click(await screen.findByText("Move the CTA higher"));
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "Fixed locally" } });
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));

    await waitFor(() => expect(createMessage).toHaveBeenCalledOnce());
    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ feedbackId: "feedback-1", body: "Fixed locally" })
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark fixed" }));

    await waitFor(() => expect(updateFeedback).toHaveBeenCalled());
    expect(updateFeedback).toHaveBeenCalledWith(
      "feedback-1",
      expect.objectContaining({ status: "fixed", fixedCssSnapshot: expect.any(Object) })
    );
  });

  it("shows accessibility and token insights for the inspected element", async () => {
    const adapter = createAdapter();

    render(
      <ReviewLensProvider
        config={{
          adapter,
          projectKey: "demo",
          contentId: "article-1",
          currentUrl: "http://localhost:5173/article/1",
          designTokens: {
            fontSize: ["16px"],
            spacing: ["0px", "24px"],
            lineHeight: ["normal"],
            radius: ["0px"],
            color: ["rgb(0, 0, 0)"]
          }
        }}
      >
        <button
          data-review-id="icon-button"
          style={{ fontSize: "13px", padding: "0px 0px 24px 0px", width: 20, height: 20 }}
        />
        <ReviewLensOverlay open />
      </ReviewLensProvider>
    );

    await waitFor(() => expect(screen.queryByText("Authenticate with Google to inspect this page.")).toBeNull());

    const button = document.querySelector("[data-review-id='icon-button']") as HTMLButtonElement;
    document.elementFromPoint = vi.fn(() => button);
    fireEvent.mouseMove(window, { clientX: 10, clientY: 10 });

    expect(await screen.findByText("Interactive element has no accessible name.")).toBeTruthy();
    expect(screen.getByText("Tap target is smaller than 44 x 44.")).toBeTruthy();
    expect(screen.getByText(/Font size .* is outside configured tokens/)).toBeTruthy();
    expect(screen.queryByText(/Padding .* is outside configured tokens/)).toBeNull();
  });

  describe("syncSelectionToUrl", () => {
    it("auto-opens the panel and selects the feedback when the URL has a reviewLensFeedback param", async () => {
      const onOpenChange = vi.fn();
      const feedbackItem = createFeedbackItem({ id: "fb-link-1" });
      const adapter = createAdapter({
        listFeedback: vi.fn(async () => [feedbackItem])
      });

      Object.defineProperty(window, "location", {
        value: new URL("http://localhost/article/1?reviewLensFeedback=fb-link-1"),
        configurable: true
      });
      window.history.replaceState = vi.fn();

      render(
        <ReviewLensProvider
          config={{
            adapter,
            projectKey: "demo",
            contentId: "article-1",
            currentUrl: "http://localhost/article/1"
          }}
        >
          <ReviewLensOverlay open={false} onOpenChange={onOpenChange} syncSelectionToUrl />
        </ReviewLensProvider>
      );

      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(true));
      expect(window.location.search).toContain("reviewLensFeedback=fb-link-1");
    });

    it("clears the URL param when the panel closes", async () => {
      const feedbackItem = createFeedbackItem({ id: "fb-link-2" });
      const adapter = createAdapter({
        listFeedback: vi.fn(async () => [feedbackItem])
      });

      const url = new URL("http://localhost:5173/article/1?reviewLensFeedback=fb-link-2");
      Object.defineProperty(window, "location", { value: url, configurable: true });
      window.history.replaceState = vi.fn((_, __, next) => {
        Object.defineProperty(window, "location", { value: new URL(String(next)), configurable: true });
      });

      const { rerender } = render(
        <ReviewLensProvider
          config={{
            adapter,
            projectKey: "demo",
            contentId: "article-1",
            currentUrl: "http://localhost:5173/article/1"
          }}
        >
          <ReviewLensOverlay open syncSelectionToUrl />
        </ReviewLensProvider>
      );

      await screen.findByRole("tab", { name: /Feedback 1/ });

      await act(async () => {
        rerender(
          <ReviewLensProvider
            config={{
              adapter,
              projectKey: "demo",
              contentId: "article-1",
              currentUrl: "http://localhost:5173/article/1"
            }}
          >
            <ReviewLensOverlay open={false} syncSelectionToUrl />
          </ReviewLensProvider>
        );
      });

      expect(window.history.replaceState).toHaveBeenCalled();
      expect(window.location.search).not.toContain("reviewLensFeedback");
    });

    it("shows a Copy link button on the selected feedback detail when syncSelectionToUrl is enabled", async () => {
      const adapter = createAdapter({
        listFeedback: vi.fn(async () => [createFeedbackItem()])
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
          <ReviewLensOverlay open syncSelectionToUrl />
        </ReviewLensProvider>
      );

      fireEvent.click(await screen.findByRole("tab", { name: /Feedback 1/ }));
      fireEvent.click(await screen.findByText("Move the CTA higher"));

      expect(await screen.findByRole("button", { name: "Copy link to this feedback" })).toBeTruthy();
    });

    it("does not show a Copy link button when syncSelectionToUrl is disabled", async () => {
      const adapter = createAdapter({
        listFeedback: vi.fn(async () => [createFeedbackItem()])
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
          <ReviewLensOverlay open />
        </ReviewLensProvider>
      );

      fireEvent.click(await screen.findByRole("tab", { name: /Feedback 1/ }));
      fireEvent.click(await screen.findByText("Move the CTA higher"));

      await waitFor(() => expect(screen.queryByRole("button", { name: "Copy link to this feedback" })).toBeNull());
    });

    it("copies a feedback link with the selected feedback id", async () => {
      const writeText = vi.fn(async () => undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true
      });
      Object.defineProperty(window, "location", {
        value: new URL("http://localhost:5173/article/1?preview=true"),
        configurable: true
      });
      const adapter = createAdapter({
        listFeedback: vi.fn(async () => [createFeedbackItem({ id: "fb-copy-1" })])
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
          <ReviewLensOverlay open syncSelectionToUrl />
        </ReviewLensProvider>
      );

      fireEvent.click(await screen.findByRole("tab", { name: /Feedback 1/ }));
      fireEvent.click(await screen.findByText("Move the CTA higher"));
      fireEvent.click(await screen.findByRole("button", { name: "Copy link to this feedback" }));

      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith(
          "http://localhost:5173/article/1?preview=true&reviewLensFeedback=fb-copy-1"
        )
      );
    });

    it("falls back when the Clipboard API is unavailable", async () => {
      const execCommand = vi.fn(() => true);
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        configurable: true
      });
      Object.defineProperty(document, "execCommand", {
        value: execCommand,
        configurable: true
      });
      Object.defineProperty(window, "location", {
        value: new URL("http://localhost:5173/article/1"),
        configurable: true
      });
      const adapter = createAdapter({
        listFeedback: vi.fn(async () => [createFeedbackItem({ id: "fb-fallback-1" })])
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
          <ReviewLensOverlay open syncSelectionToUrl />
        </ReviewLensProvider>
      );

      fireEvent.click(await screen.findByRole("tab", { name: /Feedback 1/ }));
      fireEvent.click(await screen.findByText("Move the CTA higher"));
      fireEvent.click(await screen.findByRole("button", { name: "Copy link to this feedback" }));

      await waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"));
    });
  });
});

function createAdapter(overrides: Partial<ReviewLensAdapter> = {}): ReviewLensAdapter {
  const feedback: ReviewLensFeedback[] = [];

  return {
    getCurrentUser: vi.fn(async () => ({ email: "designer@example.com" })),
    getPermissions: vi.fn(
      async () => ["create", "read", "reply", "update", "assign"] satisfies ReviewLensPermission[]
    ),
    listFeedback: vi.fn(async () => feedback),
    createFeedback: vi.fn(async (input) => ({
      ...input,
      id: "feedback-1",
      status: "open",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    })),
    updateFeedback: vi.fn(async (id, patch) => ({
      id,
      projectKey: "demo",
      contentId: "article-1",
      normalizedPath: "/article/1",
      originalUrl: "http://localhost:5173/article/1",
      selector: "[data-review-id=\"cta\"]",
      selectorStrategy: "stable-attribute" as const,
      elementFingerprint: { tagName: "button", width: 0, height: 0 },
      createdCssSnapshot: {
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
        borderRadius: "",
        width: 0,
        height: 0
      },
      comment: "Done",
      status: patch.status ?? "resolved",
      severity: "medium" as const,
      category: "visual" as const,
      viewportWidth: 1024,
      viewportHeight: 768,
      viewportPreset: "desktop" as const,
      attachments: [],
      authorEmail: "designer@example.com",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      ...patch
    })),
    listMessages: vi.fn(async () => []),
    createMessage: vi.fn(async (input) => ({
      ...input,
      id: "message-1",
      createdAt: "2026-05-25T00:00:00.000Z"
    })),
    ...overrides
  };
}

function createFeedbackItem(overrides: Partial<ReviewLensFeedback> = {}): ReviewLensFeedback {
  return {
    id: "feedback-1",
    projectKey: "demo",
    contentId: "article-1",
    normalizedPath: "/article/1",
    originalUrl: "http://localhost:5173/article/1",
    selector: "[data-review-id=\"cta\"]",
    selectorStrategy: "stable-attribute",
    elementFingerprint: { tagName: "button", width: 120, height: 60 },
    createdCssSnapshot: {
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
      borderRadius: "0px",
      width: 120,
      height: 60
    },
    comment: "Move the CTA higher",
    status: "open",
    severity: "medium",
    category: "visual",
    viewportWidth: 1024,
    viewportHeight: 768,
    viewportPreset: "desktop",
    attachments: [],
    authorEmail: "designer@example.com",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z",
    ...overrides
  };
}
