import { useCallback, useEffect, useMemo, useState } from "react";
import { buildElementTarget } from "./selectors/build-element-target";
import type { ReviewLensFeedback, ReviewLensTarget } from "./types";
import { useReviewLens } from "./review-lens-provider";

type ReviewLensOverlayProps = {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: ReviewLensOverlayPlacement;
  showResolved?: boolean;
};

export type ReviewLensOverlayPlacement =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export function ReviewLensOverlay({
  open,
  onOpenChange,
  placement = "top-right",
  showResolved = false
}: ReviewLensOverlayProps) {
  const {
    config,
    currentUser,
    feedback,
    normalizedPath,
    permissions,
    createFeedback,
    resolveFeedback
  } = useReviewLens();
  const [hovered, setHovered] = useState<ReviewLensTarget>();
  const [locked, setLocked] = useState<ReviewLensTarget>();
  const [comment, setComment] = useState("");
  const [selectedFeedback, setSelectedFeedback] = useState<ReviewLensFeedback>();
  const canCreate = permissions.includes("create");
  const canResolve = permissions.includes("resolve");

  const visibleFeedback = useMemo(
    () => feedback.filter((item) => showResolved || item.status !== "resolved"),
    [feedback, showResolved]
  );

  useEffect(() => {
    if (!open) {
      setHovered(undefined);
      setLocked(undefined);
      setComment("");
    }
  }, [open]);

  const getInspectableElement = useCallback((event: MouseEvent): Element | null => {
    const eventTarget = event.target instanceof Element ? event.target : null;

    if (eventTarget) {
      return eventTarget.closest("[data-review-lens-ui]") ? null : eventTarget;
    }

    const element = document.elementFromPoint(event.clientX, event.clientY);

    if (!element || element.closest("[data-review-lens-ui]")) {
      return null;
    }

    return element;
  }, []);

  useEffect(() => {
    if (!open || locked) {
      return;
    }

    function onMouseMove(event: MouseEvent) {
      const element = getInspectableElement(event);

      if (element) {
        setHovered(buildElementTarget(element));
      }
    }

    function onClick(event: MouseEvent) {
      const element = getInspectableElement(event);

      if (!element) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setLocked(buildElementTarget(element));
    }

    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("click", onClick, true);

    return () => {
      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("click", onClick, true);
    };
  }, [getInspectableElement, locked, open]);

  if (!open) {
    return null;
  }

  const activeTarget = locked ?? hovered;

  async function submitFeedback() {
    if (!locked || !comment.trim() || !currentUser || !canCreate) {
      return;
    }

    await createFeedback({
      projectKey: config.projectKey,
      contentId: config.contentId,
      normalizedPath,
      originalUrl: config.currentUrl ?? window.location.href,
      selector: locked.selector,
      selectorStrategy: locked.selectorStrategy,
      elementFingerprint: locked.fingerprint,
      cssSnapshot: locked.cssSnapshot,
      comment: comment.trim(),
      authorEmail: currentUser.email
    });

    setComment("");
    setLocked(undefined);
  }

  return (
    <div className="review-lens-root" data-review-lens-ui>
      {activeTarget ? <Highlight target={activeTarget} locked={Boolean(locked)} /> : null}
      <MarkerLayer
        feedback={visibleFeedback}
        selectedFeedback={selectedFeedback}
        onSelect={setSelectedFeedback}
      />
      <aside className={`review-lens-panel review-lens-panel--${placement}`} data-review-lens-ui>
        <header className="review-lens-panel__header">
          <div>
            <p className="review-lens-kicker">Review Lens</p>
            <h2>{locked ? "Element locked" : "Inspecting"}</h2>
          </div>
          <button type="button" onClick={() => onOpenChange?.(false)}>
            Close
          </button>
        </header>

        {activeTarget ? <Metrics target={activeTarget} /> : <p>Move over the app to inspect.</p>}

        {locked ? (
          <form
            className="review-lens-feedback-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitFeedback();
            }}
          >
            <label htmlFor="review-lens-comment">Feedback</label>
            <textarea
              id="review-lens-comment"
              value={comment}
              disabled={!canCreate}
              onChange={(event) => setComment(event.target.value)}
              placeholder={
                canCreate ? "Describe the UX issue..." : "You do not have permission to comment."
              }
            />
            <div className="review-lens-actions">
              <button type="button" onClick={() => setLocked(undefined)}>
                Unlock
              </button>
              <button type="submit" disabled={!comment.trim() || !canCreate}>
                Save feedback
              </button>
            </div>
          </form>
        ) : null}

        <section className="review-lens-comments">
          <h3>Page feedback</h3>
          {visibleFeedback.length === 0 ? <p>No feedback for this view.</p> : null}
          {visibleFeedback.map((item) => (
            <article
              key={item.id}
              className={
                selectedFeedback?.id === item.id
                  ? "review-lens-comment review-lens-comment--selected"
                  : "review-lens-comment"
              }
            >
              <p>{item.comment}</p>
              <span>{item.authorEmail}</span>
              {item.status === "open" && canResolve ? (
                <button type="button" onClick={() => void resolveFeedback(item.id)}>
                  Resolve
                </button>
              ) : null}
            </article>
          ))}
        </section>
      </aside>
    </div>
  );
}

function Highlight({ target, locked }: { target: ReviewLensTarget; locked: boolean }) {
  return (
    <div
      className={locked ? "review-lens-highlight review-lens-highlight--locked" : "review-lens-highlight"}
      style={{
        top: target.rect.top + window.scrollY,
        left: target.rect.left + window.scrollX,
        width: target.rect.width,
        height: target.rect.height
      }}
    />
  );
}

function MarkerLayer({
  feedback,
  selectedFeedback,
  onSelect
}: {
  feedback: ReviewLensFeedback[];
  selectedFeedback?: ReviewLensFeedback;
  onSelect: (feedback: ReviewLensFeedback) => void;
}) {
  return (
    <>
      {feedback.map((item) => {
        const element = safeQuerySelector(item.selector);
        const rect = element?.getBoundingClientRect();

        if (!rect) {
          return null;
        }

        return (
          <button
            key={item.id}
            type="button"
            className={
              selectedFeedback?.id === item.id
                ? "review-lens-marker review-lens-marker--selected"
                : "review-lens-marker"
            }
            style={{
              top: rect.top + window.scrollY,
              left: rect.left + window.scrollX + rect.width
            }}
            onClick={() => onSelect(item)}
            aria-label={`Open feedback from ${item.authorEmail}`}
          />
        );
      })}
    </>
  );
}

function Metrics({ target }: { target: ReviewLensTarget }) {
  const rows = [
    ["Selector", target.selector],
    ["Size", `${target.cssSnapshot.width} x ${target.cssSnapshot.height}`],
    ["Margin", target.cssSnapshot.margin],
    ["Padding", target.cssSnapshot.padding],
    ["Border", target.cssSnapshot.border],
    ["Font", `${target.cssSnapshot.fontSize} / ${target.cssSnapshot.lineHeight}`],
    ["Family", target.cssSnapshot.fontFamily],
    ["Color", target.cssSnapshot.color],
    ["Background", target.cssSnapshot.backgroundColor]
  ];

  return (
    <dl className="review-lens-metrics">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function safeQuerySelector(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}
