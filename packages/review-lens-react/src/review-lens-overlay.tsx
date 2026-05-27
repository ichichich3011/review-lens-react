import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildElementTarget } from "./selectors/build-element-target";
import type { ReviewLensFeedback, ReviewLensTarget } from "./types";
import { useReviewLens } from "./review-lens-provider";

type ReviewLensOverlayProps = {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: ReviewLensOverlayPlacement;
  showResolved?: boolean;
};

type ReviewLensPanelMode = "review" | "feedback";

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
  const [panelMode, setPanelMode] = useState<ReviewLensPanelMode>("review");
  const canInspect = Boolean(currentUser);
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
      setPanelMode("review");
    }
  }, [open]);

  useEffect(() => {
    if (!canInspect) {
      setHovered(undefined);
      setLocked(undefined);
    }
  }, [canInspect]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      onOpenChange?.(false);
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onOpenChange, open]);

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
    if (!open || !canInspect) {
      return;
    }

    function onMouseMove(event: MouseEvent) {
      const element = getInspectableElement(event);

      if (element) {
        setHovered(buildElementTarget(element));
      } else {
        setHovered(undefined);
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
      setPanelMode("review");
    }

    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("click", onClick, true);

    return () => {
      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("click", onClick, true);
    };
  }, [canInspect, getInspectableElement, locked, open]);

  if (!open) {
    return null;
  }

  const activeTarget = hovered ?? locked;
  const isComposing = Boolean(locked);

  function selectFeedback(item: ReviewLensFeedback) {
    setSelectedFeedback(item);
    setLocked(undefined);
    setPanelMode("feedback");

    const element = safeQuerySelector(item.selector);

    if (!element) {
      return;
    }

    element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    window.requestAnimationFrame(() => {
      setHovered(buildElementTarget(element));
    });
  }

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
    setHovered(undefined);
    setPanelMode("feedback");
  }

  return (
    <div className="review-lens-root" data-review-lens-ui>
      {canInspect && activeTarget ? <Highlight target={activeTarget} locked={Boolean(locked)} /> : null}
      {canInspect ? (
        <MarkerLayer
          feedback={visibleFeedback}
          selectedFeedback={selectedFeedback}
          onSelect={selectFeedback}
        />
      ) : null}
      <aside className={`review-lens-panel review-lens-panel--${placement}`} data-review-lens-ui>
        <header className="review-lens-panel__header">
          <div>
            <p className="review-lens-kicker">Review Lens</p>
            <h2>{panelMode === "feedback" ? "Feedback" : locked ? "Element locked" : "Inspecting"}</h2>
          </div>
          <button type="button" onClick={() => onOpenChange?.(false)}>
            Close
          </button>
        </header>

        <div className="review-lens-panel__body">
          <div className="review-lens-mode-switch" role="tablist" aria-label="Review Lens mode">
            <button
              type="button"
              role="tab"
              aria-selected={panelMode === "review"}
              onClick={() => setPanelMode("review")}
            >
              Review
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panelMode === "feedback"}
              onClick={() => setPanelMode("feedback")}
            >
              Feedback <span>{visibleFeedback.length}</span>
            </button>
          </div>

          {panelMode === "review" ? (
            <div className="review-lens-review-pane" role="tabpanel">
              <div className="review-lens-inspection">
                {!canInspect ? <p>Authenticate with Google to inspect this page.</p> : null}
                {canInspect && activeTarget ? <Metrics target={activeTarget} /> : null}
                {canInspect && !activeTarget ? <p>Move over the app to inspect.</p> : null}
              </div>

              {isComposing ? (
                <form
                  className="review-lens-feedback-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitFeedback();
                  }}
                >
                  <label htmlFor="review-lens-comment">New feedback</label>
                  <textarea
                    id="review-lens-comment"
                    value={comment}
                    disabled={!canCreate}
                    onChange={(event) => setComment(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") {
                        return;
                      }

                      if (event.metaKey) {
                        event.preventDefault();
                        void submitFeedback();
                      }
                    }}
                    placeholder={
                      canCreate ? "Describe the UX issue..." : "You do not have permission to comment."
                    }
                  />
                  {canCreate ? (
                    <p className="review-lens-feedback-form__hint">
                      Press <kbd>Command</kbd> + <kbd>Enter</kbd> to submit.
                    </p>
                  ) : null}
                  <div className="review-lens-actions">
                    <button type="submit" disabled={!comment.trim() || !canCreate}>
                      Save feedback
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          ) : (
            <div className="review-lens-comments">
              <div className="review-lens-comments__header">
                <h3>Page feedback</h3>
                <span>{visibleFeedback.length}</span>
              </div>
              <div className="review-lens-comments__list">
                {visibleFeedback.length === 0 ? <p>No feedback for this view.</p> : null}
                {visibleFeedback.map((item) => (
                  <article
                    key={item.id}
                    tabIndex={0}
                    className={
                      selectedFeedback?.id === item.id
                        ? "review-lens-comment review-lens-comment--selected"
                        : "review-lens-comment"
                    }
                    onClick={() => selectFeedback(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectFeedback(item);
                      }
                  }}
                >
                    <div className="review-lens-comment__content">
                      <p>{item.comment}</p>
                      <span>{item.authorEmail}</span>
                    </div>
                    {item.status === "open" && canResolve ? (
                      <div className="review-lens-comment__actions">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void resolveFeedback(item.id);
                          }}
                        >
                          Resolve
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Highlight({ target, locked }: { target: ReviewLensTarget; locked: boolean }) {
  const box = getBoxModel(target);

  return (
    <div
      className={locked ? "review-lens-highlight review-lens-highlight--locked" : "review-lens-highlight"}
      style={{
        top: box.margin.top,
        left: box.margin.left,
        width: box.margin.width,
        height: box.margin.height
      }}
    >
      <div
        className="review-lens-highlight__border"
        style={{
          top: box.border.top - box.margin.top,
          left: box.border.left - box.margin.left,
          width: box.border.width,
          height: box.border.height
        }}
      />
      <div
        className="review-lens-highlight__padding"
        style={{
          top: box.padding.top - box.margin.top,
          left: box.padding.left - box.margin.left,
          width: box.padding.width,
          height: box.padding.height
        }}
      />
      <div
        className="review-lens-highlight__content"
        style={{
          top: box.content.top - box.margin.top,
          left: box.content.left - box.margin.left,
          width: box.content.width,
          height: box.content.height
        }}
      />
      <div className="review-lens-highlight__label">
        {Math.round(target.rect.width)} x {Math.round(target.rect.height)}
      </div>
    </div>
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
      {feedback.map((item) => (
        <FeedbackMarker
          key={item.id}
          feedback={item}
          selected={selectedFeedback?.id === item.id}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function FeedbackMarker({
  feedback,
  selected,
  onSelect
}: {
  feedback: ReviewLensFeedback;
  selected: boolean;
  onSelect: (feedback: ReviewLensFeedback) => void;
}) {
  const markerRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    let frame = 0;

    const updatePosition = () => {
      frame = 0;
      const marker = markerRef.current;
      const element = safeQuerySelector(feedback.selector);
      const rect = element?.getBoundingClientRect();

      if (!marker || !rect) {
        return;
      }

      marker.style.top = `${rect.top}px`;
      marker.style.left = `${rect.right}px`;
      marker.hidden = rect.bottom < 0 || rect.top > window.innerHeight;
    };

    const scheduleUpdate = () => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(updatePosition);
    };

    updatePosition();
    window.addEventListener("scroll", scheduleUpdate, true);
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [feedback.selector]);

  return (
    <button
      ref={markerRef}
      type="button"
      className={selected ? "review-lens-marker review-lens-marker--selected" : "review-lens-marker"}
      onClick={() => onSelect(feedback)}
      aria-label={`Open feedback from ${feedback.authorEmail}`}
    />
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

function getBoxModel(target: ReviewLensTarget) {
  const margin = {
    top: toPixels(target.cssSnapshot.marginTop),
    right: toPixels(target.cssSnapshot.marginRight),
    bottom: toPixels(target.cssSnapshot.marginBottom),
    left: toPixels(target.cssSnapshot.marginLeft)
  };
  const border = {
    top: toPixels(target.cssSnapshot.borderTopWidth),
    right: toPixels(target.cssSnapshot.borderRightWidth),
    bottom: toPixels(target.cssSnapshot.borderBottomWidth),
    left: toPixels(target.cssSnapshot.borderLeftWidth)
  };
  const padding = {
    top: toPixels(target.cssSnapshot.paddingTop),
    right: toPixels(target.cssSnapshot.paddingRight),
    bottom: toPixels(target.cssSnapshot.paddingBottom),
    left: toPixels(target.cssSnapshot.paddingLeft)
  };

  const borderBox = {
    top: target.rect.top,
    left: target.rect.left,
    width: Math.max(target.rect.width, 0),
    height: Math.max(target.rect.height, 0)
  };
  const marginBox = {
    top: borderBox.top - margin.top,
    left: borderBox.left - margin.left,
    width: borderBox.width + margin.left + margin.right,
    height: borderBox.height + margin.top + margin.bottom
  };
  const paddingBox = {
    top: borderBox.top + border.top,
    left: borderBox.left + border.left,
    width: Math.max(borderBox.width - border.left - border.right, 0),
    height: Math.max(borderBox.height - border.top - border.bottom, 0)
  };
  const contentBox = {
    top: paddingBox.top + padding.top,
    left: paddingBox.left + padding.left,
    width: Math.max(paddingBox.width - padding.left - padding.right, 0),
    height: Math.max(paddingBox.height - padding.top - padding.bottom, 0)
  };

  return {
    margin: marginBox,
    border: borderBox,
    padding: paddingBox,
    content: contentBox
  };
}

function toPixels(value: string | undefined) {
  const parsed = Number.parseFloat(value || "0");

  return Number.isFinite(parsed) ? parsed : 0;
}
