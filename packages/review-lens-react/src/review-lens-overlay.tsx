import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { buildElementTarget } from "./selectors/build-element-target";
import type {
  CssSnapshot,
  FeedbackCategory,
  FeedbackSeverity,
  FeedbackStatus,
  ReviewLensFeedback,
  ReviewLensTarget,
  ReviewLensThreadMessage,
  ReviewLensViewportPreset
} from "./types";
import { useReviewLens } from "./review-lens-provider";

type ReviewLensOverlayProps = {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: ReviewLensOverlayPlacement;
  showResolved?: boolean;
  syncSelectionToUrl?: boolean;
  responsivePresets?: ReviewLensViewportOption[];
};

type ReviewLensPanelMode = "review" | "feedback" | "summary";
type FilterValue<T extends string> = "all" | T;

export type ReviewLensOverlayPlacement =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type ReviewLensViewportOption = {
  label: string;
  value: ReviewLensViewportPreset;
};

const defaultViewportPresets: ReviewLensViewportOption[] = [
  { label: "Desktop", value: "desktop" },
  { label: "Tablet", value: "tablet" },
  { label: "Mobile", value: "mobile" }
];

const statuses: FeedbackStatus[] = [
  "open",
  "in_progress",
  "needs_clarification",
  "fixed",
  "wontfix",
  "resolved"
];
const severities: FeedbackSeverity[] = ["low", "medium", "high"];
const categories: FeedbackCategory[] = ["bug", "visual", "copy", "accessibility", "responsive"];

const statusLabels: Record<FeedbackStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  needs_clarification: "Needs clarification",
  fixed: "Fixed",
  wontfix: "Won't fix",
  resolved: "Resolved"
};

const severityLabels: Record<FeedbackSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High"
};

const categoryLabels: Record<FeedbackCategory, string> = {
  bug: "Bug",
  visual: "Visual",
  copy: "Copy",
  accessibility: "Accessibility",
  responsive: "Responsive"
};

export function ReviewLensOverlay({
  open,
  onOpenChange,
  placement = "top-right",
  showResolved = false,
  syncSelectionToUrl = false,
  responsivePresets = defaultViewportPresets
}: ReviewLensOverlayProps) {
  const {
    adapter,
    config,
    currentUser,
    feedback,
    normalizedPath,
    permissions,
    createFeedback,
    updateFeedback,
    listMessages,
    createMessage,
    uploadAttachment
  } = useReviewLens();
  const [hovered, setHovered] = useState<ReviewLensTarget>();
  const [locked, setLocked] = useState<ReviewLensTarget>();
  const [comment, setComment] = useState("");
  const [severity, setSeverity] = useState<FeedbackSeverity>("medium");
  const [category, setCategory] = useState<FeedbackCategory>("visual");
  const [assigneeEmail, setAssigneeEmail] = useState("");
  const [viewportPreset, setViewportPreset] = useState<ReviewLensViewportPreset>(
    responsivePresets[0]?.value ?? "desktop"
  );
  const [selectedFeedback, setSelectedFeedback] = useState<ReviewLensFeedback>();
  const [panelMode, setPanelMode] = useState<ReviewLensPanelMode>("review");
  const [distanceMode, setDistanceMode] = useState(false);
  const [statusFilter, setStatusFilter] = useState<FilterValue<FeedbackStatus>>("all");
  const [severityFilter, setSeverityFilter] = useState<FilterValue<FeedbackSeverity>>("all");
  const [categoryFilter, setCategoryFilter] = useState<FilterValue<FeedbackCategory>>("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [viewportFilter, setViewportFilter] = useState<FilterValue<ReviewLensViewportPreset>>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [messagesByFeedbackId, setMessagesByFeedbackId] = useState<
    Record<string, ReviewLensThreadMessage[]>
  >({});
  const [messageDraft, setMessageDraft] = useState("");
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const canInspect = Boolean(currentUser);
  const canCreate = permissions.includes("create");
  const canReply = permissions.includes("reply");
  const canUpdate = permissions.includes("update");
  const canAssign = permissions.includes("assign");
  const activeTarget = hovered ?? locked;
  const isComposing = Boolean(locked);
  const screenshotEnabled = Boolean(
    config.captureScreenshot && (config.uploadAttachment || adapter.uploadAttachment)
  );

  const assignees = useMemo(() => {
    const values = feedback
      .map((item) => item.assigneeEmail)
      .filter((value): value is string => Boolean(value));
    if (currentUser?.email) {
      values.push(currentUser.email);
    }
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [currentUser?.email, feedback]);

  const visibleFeedback = useMemo(
    () =>
      feedback
        .filter((item) => showResolved || item.status !== "resolved")
        .filter((item) => statusFilter === "all" || item.status === statusFilter)
        .filter((item) => severityFilter === "all" || item.severity === severityFilter)
        .filter((item) => categoryFilter === "all" || item.category === categoryFilter)
        .filter((item) => assigneeFilter === "all" || item.assigneeEmail === assigneeFilter)
        .filter((item) => viewportFilter === "all" || item.viewportPreset === viewportFilter),
    [
      assigneeFilter,
      categoryFilter,
      feedback,
      severityFilter,
      showResolved,
      statusFilter,
      viewportFilter
    ]
  );
  const activeFilterCount = [
    statusFilter,
    severityFilter,
    categoryFilter,
    assigneeFilter,
    viewportFilter
  ].filter((value) => value !== "all").length;

  useEffect(() => {
    if (!open) {
      setHovered(undefined);
      setLocked(undefined);
      setComment("");
      setMessageDraft("");
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
    if (!locked || panelMode !== "review") {
      return;
    }

    window.requestAnimationFrame(() => {
      commentRef.current?.scrollIntoView?.({ block: "nearest" });
      commentRef.current?.focus();
    });
  }, [locked, panelMode]);

  useEffect(() => {
    if (!selectedFeedback) {
      return;
    }

    let active = true;
    void listMessages(selectedFeedback.id).then((messages) => {
      if (active) {
        setMessagesByFeedbackId((current) => ({ ...current, [selectedFeedback.id]: messages }));
      }
    });

    return () => {
      active = false;
    };
  }, [listMessages, selectedFeedback]);

  useEffect(() => {
    if (!open || !syncSelectionToUrl || selectedFeedback || feedback.length === 0) {
      return;
    }

    const selectedId = new URL(window.location.href).searchParams.get("reviewLensFeedback");
    const item = feedback.find((nextItem) => nextItem.id === selectedId);
    if (item) {
      selectFeedback(item, { syncUrl: false });
    }
  }, [feedback, open, selectedFeedback, syncSelectionToUrl]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Shift") {
        setDistanceMode(true);
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange?.(false);
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key === "n" || event.key === "ArrowDown") {
        event.preventDefault();
        selectAdjacentFeedback(1);
      }

      if (event.key === "p" || event.key === "ArrowUp") {
        event.preventDefault();
        selectAdjacentFeedback(-1);
      }

      if (event.key === "c") {
        event.preventDefault();
        setPanelMode("review");
        commentRef.current?.focus();
      }

      if (event.key === "f" && selectedFeedback && canUpdate) {
        event.preventDefault();
        void markFixed(selectedFeedback);
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.key === "Shift") {
        setDistanceMode(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

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
      setHovered(element ? buildElementTarget(element) : undefined);
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
  }, [canInspect, getInspectableElement, open]);

  if (!open) {
    return null;
  }

  function selectFeedback(
    item: ReviewLensFeedback,
    options: { syncUrl?: boolean } = { syncUrl: true }
  ) {
    setSelectedFeedback(item);
    setLocked(undefined);
    setPanelMode("feedback");

    if (syncSelectionToUrl && options.syncUrl !== false) {
      const url = new URL(window.location.href);
      url.searchParams.set("reviewLensFeedback", item.id);
      window.history.replaceState({}, "", url);
    }

    const element = safeQuerySelector(item.selector);

    if (!element) {
      setHovered(undefined);
      return;
    }

    element.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "center" });
    window.requestAnimationFrame(() => {
      setHovered(buildElementTarget(element));
    });
  }

  function selectAdjacentFeedback(direction: 1 | -1) {
    if (visibleFeedback.length === 0) {
      return;
    }

    const currentIndex = selectedFeedback
      ? visibleFeedback.findIndex((item) => item.id === selectedFeedback.id)
      : -1;
    const nextIndex =
      currentIndex < 0
        ? direction > 0
          ? 0
          : visibleFeedback.length - 1
        : (currentIndex + direction + visibleFeedback.length) % visibleFeedback.length;

    selectFeedback(visibleFeedback[nextIndex]);
  }

  async function submitFeedback() {
    if (!locked || !comment.trim() || !currentUser || !canCreate) {
      return;
    }

    let item = await createFeedback({
      projectKey: config.projectKey,
      contentId: config.contentId,
      normalizedPath,
      originalUrl: config.currentUrl ?? window.location.href,
      selector: locked.selector,
      selectorStrategy: locked.selectorStrategy,
      elementFingerprint: locked.fingerprint,
      createdCssSnapshot: locked.cssSnapshot,
      comment: comment.trim(),
      status: "open",
      severity,
      category,
      assigneeEmail: assigneeEmail.trim() || undefined,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      viewportPreset,
      screenshotUrl: undefined,
      screenshotThumbnailUrl: undefined,
      authorEmail: currentUser.email
    });

    if (config.captureScreenshot) {
      try {
        const screenshot = await config.captureScreenshot(locked);
        const attachment = await uploadAttachment(item.id, {
          type: "screenshot",
          data: screenshot,
          createdBy: currentUser.email
        });
        item = await updateFeedback(item.id, {
          attachments: [attachment],
          screenshotUrl: attachment.url,
          screenshotThumbnailUrl: attachment.thumbnailUrl
        });
      } catch {
        // Feedback should still be saved when optional screenshot capture fails.
      }
    }

    setComment("");
    setAssigneeEmail("");
    setLocked(undefined);
    setHovered(undefined);
    setPanelMode("feedback");
    setSelectedFeedback(item);
  }

  async function updateSelectedStatus(item: ReviewLensFeedback, status: FeedbackStatus) {
    const now = new Date().toISOString();
    const patch =
      status === "resolved"
        ? { status, resolvedAt: now, resolvedBy: currentUser?.email }
        : { status };
    const updated = await updateFeedback(item.id, patch);
    setSelectedFeedback(updated);
  }

  async function markFixed(item: ReviewLensFeedback) {
    const element = safeQuerySelector(item.selector);
    if (!element || !currentUser) {
      return;
    }

    const target = buildElementTarget(element);
    const updated = await updateFeedback(item.id, {
      status: "fixed",
      fixedCssSnapshot: target.cssSnapshot,
      fixedAt: new Date().toISOString(),
      fixedBy: currentUser.email
    });
    setSelectedFeedback(updated);
  }

  async function submitMessage(item: ReviewLensFeedback) {
    if (!messageDraft.trim() || !currentUser || !canReply) {
      return;
    }

    const message = await createMessage({
      feedbackId: item.id,
      body: messageDraft.trim(),
      authorEmail: currentUser.email
    });
    setMessagesByFeedbackId((current) => ({
      ...current,
      [item.id]: [...(current[item.id] ?? []), message]
    }));
    setMessageDraft("");
  }

  return (
    <div className="review-lens-root" data-review-lens-ui>
      {canInspect && activeTarget ? <Highlight target={activeTarget} locked={Boolean(locked)} /> : null}
      {canInspect && locked && hovered && distanceMode ? (
        <DistanceOverlay from={locked} to={hovered} />
      ) : null}
      {canInspect ? (
        <>
          <MarkerLayer
            feedback={visibleFeedback}
            selectedFeedback={selectedFeedback}
            onSelect={selectFeedback}
          />
          <MiniMap
            feedback={visibleFeedback}
            selectedFeedback={selectedFeedback}
            onSelect={selectFeedback}
          />
        </>
      ) : null}
      <aside className={`review-lens-panel review-lens-panel--${placement}`} data-review-lens-ui>
        <header className="review-lens-panel__header">
          <div>
            <p className="review-lens-kicker">Review Lens</p>
            <h2>
              {panelMode === "summary"
                ? "Summary"
                : panelMode === "feedback"
                  ? "Feedback"
                  : locked
                    ? "Element locked"
                    : "Inspecting"}
            </h2>
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
            <button
              type="button"
              role="tab"
              aria-selected={panelMode === "summary"}
              onClick={() => setPanelMode("summary")}
            >
              Summary
            </button>
          </div>

          {panelMode === "review" ? (
            <div className="review-lens-review-pane" role="tabpanel">
              <div className="review-lens-inspection">
                {!canInspect ? <p>Authenticate with Google to inspect this page.</p> : null}
                {canInspect && activeTarget ? (
                  <>
                    <Metrics target={activeTarget} />
                    <InsightList title="Accessibility" items={getAccessibilityInsights(activeTarget)} />
                    <InsightList
                      title="Design tokens"
                      items={getTokenInsights(activeTarget.cssSnapshot, config.designTokens)}
                    />
                  </>
                ) : null}
                {canInspect && !activeTarget ? <p>Move over the app to inspect.</p> : null}
              </div>

              {isComposing ? (
                <div className="review-lens-composer-panel">
                <form
                  className="review-lens-feedback-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitFeedback();
                  }}
                >
                  <label htmlFor="review-lens-comment">New feedback</label>
                  <textarea
                    ref={commentRef}
                    id="review-lens-comment"
                    value={comment}
                    disabled={!canCreate}
                    onChange={(event) => setComment(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && event.metaKey) {
                        event.preventDefault();
                        void submitFeedback();
                      }
                    }}
                    placeholder={
                      canCreate ? "Describe the UX issue..." : "You do not have permission to comment."
                    }
                  />
                  <div className="review-lens-form-grid">
                    <label>
                      Severity
                      <select
                        value={severity}
                        onChange={(event) => setSeverity(event.target.value as FeedbackSeverity)}
                        disabled={!canCreate}
                      >
                        {severities.map((value) => (
                          <option key={value} value={value}>
                            {severityLabels[value]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Type
                      <select
                        value={category}
                        onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
                        disabled={!canCreate}
                      >
                        {categories.map((value) => (
                          <option key={value} value={value}>
                            {categoryLabels[value]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Assignee
                      <input
                        value={assigneeEmail}
                        onChange={(event) => setAssigneeEmail(event.target.value)}
                        disabled={!canCreate}
                        placeholder="optional@email.com"
                      />
                    </label>
                    <label>
                      Viewport
                      <select
                        value={viewportPreset}
                        onChange={(event) =>
                          setViewportPreset(event.target.value as ReviewLensViewportPreset)
                        }
                        disabled={!canCreate}
                      >
                        {responsivePresets.map((preset) => (
                          <option key={preset.value} value={preset.value}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {canCreate ? (
                    <p className="review-lens-feedback-form__hint">
                      Press <kbd>Command</kbd> + <kbd>Enter</kbd> to submit.
                      {screenshotEnabled ? " Screenshot capture runs after save." : ""}
                    </p>
                  ) : null}
                  <div className="review-lens-actions">
                    <button type="submit" disabled={!comment.trim() || !canCreate}>
                      Save feedback
                    </button>
                  </div>
                </form>
                </div>
              ) : null}
            </div>
          ) : null}

          {panelMode === "feedback" ? (
            <div className="review-lens-comments">
              <FeedbackFilters
                open={filtersOpen}
                activeCount={activeFilterCount}
                statusFilter={statusFilter}
                severityFilter={severityFilter}
                categoryFilter={categoryFilter}
                assigneeFilter={assigneeFilter}
                viewportFilter={viewportFilter}
                assignees={assignees}
                responsivePresets={responsivePresets}
                onStatusChange={setStatusFilter}
                onSeverityChange={setSeverityFilter}
                onCategoryChange={setCategoryFilter}
                onAssigneeChange={setAssigneeFilter}
                onViewportChange={setViewportFilter}
                onToggle={() => setFiltersOpen((current) => !current)}
                onClear={() => {
                  setStatusFilter("all");
                  setSeverityFilter("all");
                  setCategoryFilter("all");
                  setAssigneeFilter("all");
                  setViewportFilter("all");
                }}
              />
              <div className="review-lens-list-panel">
                <div className="review-lens-comments__header">
                  <h3>All feedback</h3>
                  <span>{visibleFeedback.length}</span>
                </div>
                <div className="review-lens-comments__list">
                  {visibleFeedback.length === 0 ? <p>No feedback for this view.</p> : null}
                  {visibleFeedback.map((item) => (
                    <FeedbackCard
                      key={item.id}
                      item={item}
                      selected={selectedFeedback?.id === item.id}
                      onSelect={selectFeedback}
                    />
                  ))}
                </div>
              </div>
              {selectedFeedback ? (
                <div className="review-lens-selected-panel">
                  <div className="review-lens-selected-panel__label">Selected feedback</div>
                  <FeedbackDetail
                    key={selectedFeedback.id}
                    item={selectedFeedback}
                    messages={messagesByFeedbackId[selectedFeedback.id] ?? []}
                    messageDraft={messageDraft}
                    canReply={canReply}
                    canUpdate={canUpdate}
                    canAssign={canAssign}
                    onMessageDraftChange={setMessageDraft}
                    onSubmitMessage={() => void submitMessage(selectedFeedback)}
                    onStatusChange={(status) => void updateSelectedStatus(selectedFeedback, status)}
                    onAssigneeChange={(value) =>
                      void updateFeedback(selectedFeedback.id, {
                        assigneeEmail: value.trim() || undefined
                      }).then(setSelectedFeedback)
                    }
                    onMarkFixed={() => void markFixed(selectedFeedback)}
                  />
                </div>
              ) : (
                <div className="review-lens-selected-panel review-lens-selected-panel--empty">
                  <div className="review-lens-selected-panel__label">Selected feedback</div>
                  <p>Select a feedback item above to review status, assignment, drift, and replies.</p>
                </div>
              )}
            </div>
          ) : null}

          {panelMode === "summary" ? <Summary feedback={feedback} /> : null}
        </div>
      </aside>
    </div>
  );
}

function FeedbackFilters({
  open,
  activeCount,
  statusFilter,
  severityFilter,
  categoryFilter,
  assigneeFilter,
  viewportFilter,
  assignees,
  responsivePresets,
  onStatusChange,
  onSeverityChange,
  onCategoryChange,
  onAssigneeChange,
  onViewportChange,
  onToggle,
  onClear
}: {
  open: boolean;
  activeCount: number;
  statusFilter: FilterValue<FeedbackStatus>;
  severityFilter: FilterValue<FeedbackSeverity>;
  categoryFilter: FilterValue<FeedbackCategory>;
  assigneeFilter: string;
  viewportFilter: FilterValue<ReviewLensViewportPreset>;
  assignees: string[];
  responsivePresets: ReviewLensViewportOption[];
  onStatusChange: (value: FilterValue<FeedbackStatus>) => void;
  onSeverityChange: (value: FilterValue<FeedbackSeverity>) => void;
  onCategoryChange: (value: FilterValue<FeedbackCategory>) => void;
  onAssigneeChange: (value: string) => void;
  onViewportChange: (value: FilterValue<ReviewLensViewportPreset>) => void;
  onToggle: () => void;
  onClear: () => void;
}) {
  return (
    <div className="review-lens-filter-shell">
      <div className="review-lens-filter-bar">
        <button type="button" aria-expanded={open} onClick={onToggle}>
          Filters
          {activeCount > 0 ? <span>{activeCount}</span> : null}
        </button>
        {activeCount > 0 ? (
          <button type="button" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="review-lens-filters">
      <label>
        Status
        <select
          aria-label="Filter status"
          value={statusFilter}
          onChange={(event) => onStatusChange(event.target.value as FilterValue<FeedbackStatus>)}
        >
          <option value="all">All statuses</option>
          {statuses.map((value) => (
            <option key={value} value={value}>
              {statusLabels[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Priority
        <select
          aria-label="Filter severity"
          value={severityFilter}
          onChange={(event) => onSeverityChange(event.target.value as FilterValue<FeedbackSeverity>)}
        >
          <option value="all">All priorities</option>
          {severities.map((value) => (
            <option key={value} value={value}>
              {severityLabels[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Type
        <select
          aria-label="Filter type"
          value={categoryFilter}
          onChange={(event) => onCategoryChange(event.target.value as FilterValue<FeedbackCategory>)}
        >
          <option value="all">All types</option>
          {categories.map((value) => (
            <option key={value} value={value}>
              {categoryLabels[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Assignee
        <select
          aria-label="Filter assignee"
          value={assigneeFilter}
          onChange={(event) => onAssigneeChange(event.target.value)}
        >
          <option value="all">All assignees</option>
          {assignees.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label>
        Viewport
        <select
          aria-label="Filter viewport"
          value={viewportFilter}
          onChange={(event) =>
            onViewportChange(event.target.value as FilterValue<ReviewLensViewportPreset>)
          }
        >
          <option value="all">All viewports</option>
          {responsivePresets.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
        </div>
      ) : null}
    </div>
  );
}

function FeedbackCard({
  item,
  selected,
  onSelect
}: {
  item: ReviewLensFeedback;
  selected: boolean;
  onSelect: (feedback: ReviewLensFeedback) => void;
}) {
  const drift = getDriftState(item);

  return (
    <article
      tabIndex={0}
      className={[
        "review-lens-comment",
        `review-lens-comment--${item.severity}`,
        selected ? "review-lens-comment--selected" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item);
        }
      }}
    >
      <div className="review-lens-comment__header">
        <span>{statusLabels[item.status]}</span>
        <strong>{severityLabels[item.severity]}</strong>
      </div>
      <div className="review-lens-comment__content">
        <p>{item.comment}</p>
        <span>
          {item.authorEmail}
          {item.assigneeEmail ? ` -> ${item.assigneeEmail}` : ""}
        </span>
      </div>
      <div className="review-lens-tags">
        <span>{categoryLabels[item.category]}</span>
        <span>{item.viewportPreset}</span>
        <span>{drift.label}</span>
      </div>
    </article>
  );
}

function FeedbackDetail({
  item,
  messages,
  messageDraft,
  canReply,
  canUpdate,
  canAssign,
  onMessageDraftChange,
  onSubmitMessage,
  onStatusChange,
  onAssigneeChange,
  onMarkFixed
}: {
  item: ReviewLensFeedback;
  messages: ReviewLensThreadMessage[];
  messageDraft: string;
  canReply: boolean;
  canUpdate: boolean;
  canAssign: boolean;
  onMessageDraftChange: (value: string) => void;
  onSubmitMessage: () => void;
  onStatusChange: (status: FeedbackStatus) => void;
  onAssigneeChange: (value: string) => void;
  onMarkFixed: () => void;
}) {
  const drift = getDriftState(item);

  return (
    <section className="review-lens-detail" aria-label="Selected feedback detail">
      <div className="review-lens-detail__header">
        <h3>{categoryLabels[item.category]} feedback</h3>
        <strong>{severityLabels[item.severity]}</strong>
      </div>
      <blockquote>{item.comment}</blockquote>
      <dl className="review-lens-detail-meta">
        <div>
          <dt>Target</dt>
          <dd>{drift.label}</dd>
        </div>
        <div>
          <dt>Viewport</dt>
          <dd>{item.viewportPreset}</dd>
        </div>
        {item.screenshotUrl ? (
          <div>
            <dt>Evidence</dt>
            <dd>
              <a href={item.screenshotUrl} target="_blank" rel="noreferrer">
                Screenshot
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="review-lens-form-grid">
        <label>
          Status
          <select
            value={item.status}
            disabled={!canUpdate}
            onChange={(event) => onStatusChange(event.target.value as FeedbackStatus)}
          >
            {statuses.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Assignee
          <input
            defaultValue={item.assigneeEmail ?? ""}
            disabled={!canAssign}
            onBlur={(event) => onAssigneeChange(event.target.value)}
            placeholder="optional@email.com"
          />
        </label>
      </div>
      <div className="review-lens-status-actions">
        <button
          type="button"
          className="review-lens-button-secondary"
          disabled={!canUpdate}
          onClick={onMarkFixed}
        >
          Mark fixed
        </button>
        <button
          type="button"
          className="review-lens-button-primary"
          disabled={!canUpdate}
          onClick={() => onStatusChange("resolved")}
        >
          Resolve
        </button>
      </div>
      <div className="review-lens-thread">
        <div className="review-lens-thread__header">
          <h3>Thread</h3>
          <span>{messages.length}</span>
        </div>
        {messages.length === 0 ? <p>No replies yet.</p> : null}
        {messages.map((message) => (
          <div key={message.id} className="review-lens-thread__message">
            <p>{message.body}</p>
            <span>{message.authorEmail}</span>
          </div>
        ))}
        <textarea
          aria-label="Reply"
          value={messageDraft}
          disabled={!canReply}
          onChange={(event) => onMessageDraftChange(event.target.value)}
          placeholder={canReply ? "Reply..." : "You do not have permission to reply."}
        />
        <div className="review-lens-actions">
          <button type="button" disabled={!messageDraft.trim() || !canReply} onClick={onSubmitMessage}>
            Reply
          </button>
        </div>
      </div>
    </section>
  );
}

function Summary({ feedback }: { feedback: ReviewLensFeedback[] }) {
  return (
    <div className="review-lens-summary" role="tabpanel">
      <SummaryGroup title="Status" values={countBy(feedback, (item) => statusLabels[item.status])} />
      <SummaryGroup title="Severity" values={countBy(feedback, (item) => severityLabels[item.severity])} />
      <SummaryGroup title="Type" values={countBy(feedback, (item) => categoryLabels[item.category])} />
      <SummaryGroup title="Assignee" values={countBy(feedback, (item) => item.assigneeEmail ?? "Unassigned")} />
      <SummaryGroup title="Viewport" values={countBy(feedback, (item) => item.viewportPreset)} />
    </div>
  );
}

function SummaryGroup({ title, values }: { title: string; values: Array<[string, number]> }) {
  return (
    <section>
      <h3>{title}</h3>
      <dl>
        {values.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Highlight({ target, locked }: { target: ReviewLensTarget; locked: boolean }) {
  const box = getBoxModel(target);
  const elementLabel = formatElementLabel(target.fingerprint);

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
        <strong>{elementLabel}</strong>
        <span>
          {Math.round(target.rect.width)} x {Math.round(target.rect.height)}
        </span>
      </div>
    </div>
  );
}

function DistanceOverlay({ from, to }: { from: ReviewLensTarget; to: ReviewLensTarget }) {
  const measurements = getDistanceMeasurements(from.rect, to.rect);

  if (measurements.length === 0) {
    return null;
  }

  return (
    <>
      {measurements.map((measurement) => (
        <div
          key={measurement.key}
          className={`review-lens-distance review-lens-distance--${measurement.axis}`}
          style={{
            top: measurement.top,
            left: measurement.left,
            width: measurement.width,
            height: measurement.height
          }}
        >
          <span>{measurement.label}</span>
        </div>
      ))}
    </>
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

function MiniMap({
  feedback,
  selectedFeedback,
  onSelect
}: {
  feedback: ReviewLensFeedback[];
  selectedFeedback?: ReviewLensFeedback;
  onSelect: (feedback: ReviewLensFeedback) => void;
}) {
  const points = feedback
    .map((item) => {
      const element = safeQuerySelector(item.selector);
      const rect = element?.getBoundingClientRect();
      const documentHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        window.innerHeight
      );

      if (!rect || documentHeight <= 0) {
        return null;
      }

      return {
        item,
        top: Math.min(100, Math.max(0, ((rect.top + window.scrollY) / documentHeight) * 100))
      };
    })
    .filter((point): point is { item: ReviewLensFeedback; top: number } => point !== null);

  if (points.length === 0) {
    return null;
  }

  return (
    <div className="review-lens-minimap" data-review-lens-ui aria-label="Feedback map">
      {points.map((point) => (
        <button
          key={point.item.id}
          type="button"
          className={
            selectedFeedback?.id === point.item.id
              ? "review-lens-minimap__point review-lens-minimap__point--selected"
              : "review-lens-minimap__point"
          }
          style={{ top: `${point.top}%` }}
          onClick={() => onSelect(point.item)}
          aria-label={`Jump to feedback from ${point.item.authorEmail}`}
        />
      ))}
    </div>
  );
}

function Metrics({ target }: { target: ReviewLensTarget }) {
  const rows = [
    ["Selector", target.selector],
    ["Size", `${target.cssSnapshot.width} x ${target.cssSnapshot.height}`],
    ["Margin", target.cssSnapshot.margin],
    ["Padding", target.cssSnapshot.padding],
    ["Border", target.cssSnapshot.border],
    ["Radius", target.cssSnapshot.borderRadius],
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

function InsightList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="review-lens-insights">
      <h3>{title}</h3>
      {items.length === 0 ? <p>No issues detected.</p> : null}
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function safeQuerySelector(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function getDriftState(item: ReviewLensFeedback): { label: string; level: "ok" | "warning" } {
  const element = safeQuerySelector(item.selector);
  if (!element) {
    return { label: "Target missing", level: "warning" };
  }

  const target = buildElementTarget(element);
  if (target.fingerprint.tagName !== item.elementFingerprint.tagName) {
    return { label: "Element changed", level: "warning" };
  }

  if (
    Math.abs(target.fingerprint.width - item.elementFingerprint.width) > 2 ||
    Math.abs(target.fingerprint.height - item.elementFingerprint.height) > 2
  ) {
    return { label: "Size changed", level: "warning" };
  }

  if (
    target.cssSnapshot.fontSize !== item.createdCssSnapshot.fontSize ||
    target.cssSnapshot.color !== item.createdCssSnapshot.color ||
    target.cssSnapshot.padding !== item.createdCssSnapshot.padding
  ) {
    return { label: "Style changed", level: "warning" };
  }

  return { label: "Target unchanged", level: "ok" };
}

function getAccessibilityInsights(target: ReviewLensTarget): string[] {
  const element = safeQuerySelector(target.selector);
  if (!element) {
    return ["Selected element is no longer available."];
  }

  const issues: string[] = [];
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute("role");
  const interactive =
    ["button", "a", "input", "select", "textarea"].includes(tagName) ||
    role === "button" ||
    role === "link";
  const accessibleName =
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    element.textContent?.trim();

  if (interactive && !accessibleName) {
    issues.push("Interactive element has no accessible name.");
  }

  if (interactive && (target.rect.width < 44 || target.rect.height < 44)) {
    issues.push("Tap target is smaller than 44 x 44.");
  }

  if (tagName === "img" && !element.getAttribute("alt")) {
    issues.push("Image is missing alt text.");
  }

  const headingLevel = /^h[1-6]$/.test(tagName) ? Number(tagName.slice(1)) : 0;
  if (headingLevel > 1 && !document.querySelector(`h${headingLevel - 1}`)) {
    issues.push("Heading may skip the previous level.");
  }

  if (contrastLooksLow(target.cssSnapshot.color, target.cssSnapshot.backgroundColor)) {
    issues.push("Text contrast may be low.");
  }

  return issues;
}

function getTokenInsights(
  snapshot: CssSnapshot,
  tokens: { spacing?: string[]; fontSize?: string[]; lineHeight?: string[]; color?: string[]; radius?: string[] } = {}
): string[] {
  const issues: string[] = [];

  checkToken("Padding", snapshot.padding, tokens.spacing, issues);
  checkToken("Margin", snapshot.margin, tokens.spacing, issues);
  checkToken("Font size", snapshot.fontSize, tokens.fontSize, issues);
  checkToken("Line height", snapshot.lineHeight, tokens.lineHeight, issues);
  checkToken("Text color", snapshot.color, tokens.color, issues);
  checkToken("Background", snapshot.backgroundColor, tokens.color, issues);
  checkToken("Radius", snapshot.borderRadius, tokens.radius, issues);

  return issues;
}

function checkToken(label: string, value: string, allowed: string[] | undefined, issues: string[]) {
  if (!allowed || allowed.length === 0 || !value || allowed.includes(value)) {
    return;
  }

  issues.push(`${label} ${value} is outside configured tokens.`);
}

function formatElementLabel(fingerprint: ReviewLensTarget["fingerprint"]) {
  const id = fingerprint.id ? `#${fingerprint.id}` : "";
  const className = fingerprint.className
    ? `.${fingerprint.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".")}`
    : "";
  const aria = fingerprint.ariaLabel ? `[aria-label="${fingerprint.ariaLabel}"]` : "";
  return `${fingerprint.tagName}${id}${className}${aria}` || fingerprint.tagName;
}

function getDistanceMeasurements(from: DOMRect, to: DOMRect) {
  const measurements: Array<{
    key: string;
    axis: "horizontal" | "vertical";
    top: number;
    left: number;
    width: number;
    height: number;
    label: string;
  }> = [];
  const centerX = (Math.max(from.left, to.left) + Math.min(from.right, to.right)) / 2;
  const centerY = (Math.max(from.top, to.top) + Math.min(from.bottom, to.bottom)) / 2;

  if (from.right <= to.left || to.right <= from.left) {
    const left = from.right <= to.left ? from.right : to.right;
    const right = from.right <= to.left ? to.left : from.left;
    measurements.push({
      key: "horizontal",
      axis: "horizontal",
      top: clamp(centerY, 0, window.innerHeight),
      left,
      width: Math.max(right - left, 1),
      height: 1,
      label: `${Math.round(right - left)}px`
    });
  }

  if (from.bottom <= to.top || to.bottom <= from.top) {
    const top = from.bottom <= to.top ? from.bottom : to.bottom;
    const bottom = from.bottom <= to.top ? to.top : from.top;
    measurements.push({
      key: "vertical",
      axis: "vertical",
      top,
      left: clamp(centerX, 0, window.innerWidth),
      width: 1,
      height: Math.max(bottom - top, 1),
      label: `${Math.round(bottom - top)}px`
    });
  }

  return measurements;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function countBy(
  feedback: ReviewLensFeedback[],
  getValue: (item: ReviewLensFeedback) => string
): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of feedback) {
    const value = getValue(item);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function contrastLooksLow(color: string, backgroundColor: string) {
  const foreground = parseRgb(color);
  const background = parseRgb(backgroundColor);

  if (!foreground || !background || background.alpha === 0) {
    return false;
  }

  const contrast = contrastRatio(foreground, background);
  return contrast < 4.5;
}

function parseRgb(value: string): { red: number; green: number; blue: number; alpha: number } | null {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) {
    return null;
  }

  const [red, green, blue, alpha = "1"] = match[1].split(",").map((part) => part.trim());
  return {
    red: Number(red),
    green: Number(green),
    blue: Number(blue),
    alpha: Number(alpha)
  };
}

function contrastRatio(
  foreground: { red: number; green: number; blue: number },
  background: { red: number; green: number; blue: number }
) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: { red: number; green: number; blue: number }) {
  const channels = [color.red, color.green, color.blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
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

function toPixels(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
