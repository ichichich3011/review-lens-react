import { render, waitFor } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { ReviewLensProvider, useReviewLens } from "./review-lens-provider";
import type {
  CreateFeedbackInput,
  ReviewLensAdapter,
  ReviewLensFeedback,
  ReviewLensPermission,
  UpdateFeedbackInput
} from "./types";

describe("ReviewLensProvider notifications", () => {
  it("emails the assignee when feedback is created", async () => {
    const sendEmail = vi.fn(async () => undefined);
    const createFeedback = vi.fn(async (input: CreateFeedbackInput) =>
      createFeedbackItem({
        ...input,
        id: "feedback-created",
        assigneeEmail: "developer@example.com"
      })
    );
    const adapter = createAdapter({ createFeedback, sendEmail });

    render(
      <ReviewLensProvider
        config={{
          adapter,
          emailNotifications: true,
          projectKey: "demo",
          contentId: "article-1",
          currentUrl: "http://localhost:5173/article/1"
        }}
      >
        <CreateFeedbackTrigger />
      </ReviewLensProvider>
    );

    await waitFor(() => expect(sendEmail).toHaveBeenCalledOnce());
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["developer@example.com"],
        subject: "Review Lens: New review feedback",
        text: expect.stringContaining("[Review Lens]\nNew review feedback")
      })
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Sent by Review Lens on behalf of designer@example.com.")
      })
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(
          "Link: http://localhost:5173/article/1?reviewLensFeedback=feedback-created"
        )
      })
    );
  });

  it("emails the author when an assigned review is updated", async () => {
    const sendEmail = vi.fn(async () => undefined);
    const item = createFeedbackItem({
      authorEmail: "designer@example.com",
      assigneeEmail: "developer@example.com"
    });
    const updateFeedback = vi.fn(async (id: string, patch: UpdateFeedbackInput) => ({
      ...item,
      id,
      ...patch,
      updatedAt: "2026-05-25T00:00:01.000Z"
    }));
    const adapter = createAdapter({
      getCurrentUser: vi.fn(async () => ({ email: "developer@example.com" })),
      listFeedback: vi.fn(async () => [item]),
      updateFeedback,
      sendEmail
    });

    render(
      <ReviewLensProvider
        config={{
          adapter,
          emailNotifications: { subjectPrefix: "UX review" },
          projectKey: "demo",
          contentId: "article-1",
          currentUrl: "http://localhost:5173/article/1"
        }}
      >
        <UpdateFeedbackTrigger id={item.id} />
      </ReviewLensProvider>
    );

    await waitFor(() => expect(sendEmail).toHaveBeenCalledOnce());
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["designer@example.com"],
        subject: "UX review: Review marked fixed",
        text: expect.stringContaining("Sent by Review Lens on behalf of developer@example.com.")
      })
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(
          "Link: http://localhost:5173/article/1?reviewLensFeedback=feedback-1"
        )
      })
    );
  });

  it("does not email when notifications are disabled", async () => {
    const sendEmail = vi.fn(async () => undefined);
    const adapter = createAdapter({ sendEmail });

    render(
      <ReviewLensProvider
        config={{
          adapter,
          projectKey: "demo",
          contentId: "article-1",
          currentUrl: "http://localhost:5173/article/1"
        }}
      >
        <CreateFeedbackTrigger />
      </ReviewLensProvider>
    );

    await waitFor(() => expect(adapter.createFeedback).toHaveBeenCalledOnce());
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

function CreateFeedbackTrigger() {
  const { createFeedback, currentUser } = useReviewLens();
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!currentUser || submittedRef.current) {
      return;
    }

    submittedRef.current = true;
    void createFeedback({
      projectKey: "demo",
      contentId: "article-1",
      normalizedPath: "/article/1",
      originalUrl: "http://localhost:5173/article/1",
      selector: "[data-review-id=\"cta\"]",
      selectorStrategy: "stable-attribute",
      elementFingerprint: { tagName: "button", width: 0, height: 0 },
      createdCssSnapshot: createCssSnapshot(),
      comment: "Move the CTA higher",
      status: "open",
      severity: "medium",
      category: "visual",
      assigneeEmail: "developer@example.com",
      viewportWidth: 1024,
      viewportHeight: 768,
      viewportPreset: "desktop",
      screenshotUrl: undefined,
      screenshotThumbnailUrl: undefined,
      authorEmail: currentUser.email
    });
  }, [createFeedback, currentUser]);

  return null;
}

function UpdateFeedbackTrigger({ id }: { id: string }) {
  const { feedback, updateFeedback } = useReviewLens();
  const submittedRef = useRef(false);

  useEffect(() => {
    if (feedback.length === 0 || submittedRef.current) {
      return;
    }

    submittedRef.current = true;
    void updateFeedback(id, {
      status: "fixed",
      fixedAt: "2026-05-25T00:00:01.000Z",
      fixedBy: "developer@example.com"
    });
  }, [feedback, id, updateFeedback]);

  return null;
}

function createAdapter(overrides: Partial<ReviewLensAdapter> = {}): ReviewLensAdapter {
  return {
    getCurrentUser: vi.fn(async () => ({ email: "designer@example.com" })),
    getPermissions: vi.fn(
      async () => ["create", "read", "reply", "update", "assign"] satisfies ReviewLensPermission[]
    ),
    listFeedback: vi.fn(async () => []),
    createFeedback: vi.fn(async (input) =>
      createFeedbackItem({
        ...input,
        id: "feedback-1"
      })
    ),
    updateFeedback: vi.fn(async (id, patch) =>
      createFeedbackItem({
        id,
        ...patch
      })
    ),
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
    createdCssSnapshot: createCssSnapshot(),
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

function createCssSnapshot() {
  return {
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
  };
}
