import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { createGoogleSheetsAdapter } from "./sheets/google-sheets-adapter";
import type {
  CreateAttachmentInput,
  CreateFeedbackInput,
  CreateMessageInput,
  FeedbackStatus,
  ReviewLensAdapter,
  ReviewLensAttachment,
  ReviewLensConfig,
  ReviewLensFeedback,
  ReviewLensPermission,
  ReviewLensProviderProps,
  ReviewLensThreadMessage,
  UpdateFeedbackInput
} from "./types";
import { normalizeReviewUrl } from "./url/normalize-review-url";

type ReviewLensContextValue = {
  config: ReviewLensConfig;
  adapter: ReviewLensAdapter;
  currentUser?: { email: string };
  permissions: ReviewLensPermission[];
  feedback: ReviewLensFeedback[];
  normalizedPath: string;
  refreshFeedback: () => Promise<void>;
  createFeedback: (input: CreateFeedbackInput) => Promise<ReviewLensFeedback>;
  updateFeedback: (id: string, patch: UpdateFeedbackInput) => Promise<ReviewLensFeedback>;
  listMessages: (feedbackId: string) => Promise<ReviewLensThreadMessage[]>;
  createMessage: (input: CreateMessageInput) => Promise<ReviewLensThreadMessage>;
  uploadAttachment: (
    feedbackId: string,
    input: CreateAttachmentInput
  ) => Promise<ReviewLensAttachment>;
};

const ReviewLensContext = createContext<ReviewLensContextValue | null>(null);

export function ReviewLensProvider({ config, children }: ReviewLensProviderProps) {
  const adapter = useMemo(() => {
    if (config.adapter) {
      return config.adapter;
    }

    return createGoogleSheetsAdapter({
      googleClientId: requireConfig(config.googleClientId, "googleClientId"),
      contentSpreadsheetId: requireConfig(config.contentSpreadsheetId, "contentSpreadsheetId"),
      usersSpreadsheetId: requireConfig(config.usersSpreadsheetId, "usersSpreadsheetId"),
      feedbackSheetName: config.sheetName ?? "Feedback",
      enableEmailNotifications: isEmailNotificationsEnabled(config)
    });
  }, [
    config.adapter,
    config.contentSpreadsheetId,
    config.emailNotifications,
    config.googleClientId,
    config.sheetName,
    config.usersSpreadsheetId
  ]);

  const currentUrl = config.currentUrl ?? window.location.href;
  const normalizedPath = (config.normalizeUrl ?? normalizeReviewUrl)(currentUrl);
  const [currentUser, setCurrentUser] = useState<{ email: string }>();
  const [permissions, setPermissions] = useState<ReviewLensPermission[]>([]);
  const [feedback, setFeedback] = useState<ReviewLensFeedback[]>([]);

  const refreshFeedback = useCallback(async () => {
    const items = await adapter.listFeedback({
      projectKey: config.projectKey,
      contentId: config.contentId,
      normalizedPath
    });
    setFeedback(items);
  }, [adapter, config.contentId, config.projectKey, normalizedPath]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const [user, nextPermissions] = await Promise.all([
        adapter.getCurrentUser(),
        adapter.getPermissions(config.projectKey)
      ]);

      if (!active) {
        return;
      }

      setCurrentUser(user);
      setPermissions(nextPermissions);
      await refreshFeedback();
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [adapter, config.projectKey, refreshFeedback]);

  const createFeedback = useCallback(
    async (input: CreateFeedbackInput) => {
      const item = await adapter.createFeedback(input);
      setFeedback((current) => [item, ...current]);
      void sendReviewNotification(config, adapter, {
        actorEmail: currentUser?.email ?? input.authorEmail,
        item,
        kind: "created"
      });
      return item;
    },
    [adapter, config, currentUser?.email]
  );

  const updateFeedback = useCallback(
    async (id: string, patch: UpdateFeedbackInput) => {
      const previousItem = feedback.find((feedbackItem) => feedbackItem.id === id);
      const item = await adapter.updateFeedback(id, patch);
      setFeedback((current) =>
        current.map((feedbackItem) => (feedbackItem.id === id ? item : feedbackItem))
      );
      void sendReviewNotification(config, adapter, {
        actorEmail: currentUser?.email,
        item,
        kind: getUpdateNotificationKind(patch),
        previousItem
      });
      return item;
    },
    [adapter, config, currentUser?.email, feedback]
  );

  const listMessages = useCallback(
    (feedbackId: string) => adapter.listMessages(feedbackId),
    [adapter]
  );

  const createMessage = useCallback(
    async (input: CreateMessageInput) => {
      const message = await adapter.createMessage(input);
      const item = feedback.find((feedbackItem) => feedbackItem.id === input.feedbackId);
      if (item) {
        void sendReviewNotification(config, adapter, {
          actorEmail: input.authorEmail,
          item,
          kind: "reply",
          replyBody: input.body
        });
      }
      return message;
    },
    [adapter, config, feedback]
  );

  const uploadAttachment = useCallback(
    async (feedbackId: string, input: CreateAttachmentInput) => {
      const upload = config.uploadAttachment ?? adapter.uploadAttachment;

      if (!upload) {
        throw new Error("Review Lens attachment upload is not configured");
      }

      return upload(feedbackId, input);
    },
    [adapter, config]
  );

  const value = useMemo(
    () => ({
      config,
      adapter,
      currentUser,
      permissions,
      feedback,
      normalizedPath,
      refreshFeedback,
      createFeedback,
      updateFeedback,
      listMessages,
      createMessage,
      uploadAttachment
    }),
    [
      adapter,
      config,
      createFeedback,
      currentUser,
      feedback,
      normalizedPath,
      permissions,
      refreshFeedback,
      updateFeedback,
      listMessages,
      createMessage,
      uploadAttachment
    ]
  );

  return <ReviewLensContext.Provider value={value}>{children}</ReviewLensContext.Provider>;
}

export function useReviewLens() {
  const context = useContext(ReviewLensContext);

  if (!context) {
    throw new Error("useReviewLens must be used inside ReviewLensProvider");
  }

  return context;
}

function requireConfig<T>(value: T | undefined, key: string): T {
  if (!value) {
    throw new Error(`review-lens-react requires config.${key} when no adapter is provided`);
  }

  return value;
}

type ReviewNotificationKind = "created" | "updated" | "assigned" | "status" | "fixed" | "resolved" | "reply";

type ReviewNotificationInput = {
  actorEmail?: string;
  item: ReviewLensFeedback;
  kind: ReviewNotificationKind;
  previousItem?: ReviewLensFeedback;
  replyBody?: string;
};

function isEmailNotificationsEnabled(config: ReviewLensConfig) {
  return typeof config.emailNotifications === "object"
    ? config.emailNotifications.enabled !== false
    : Boolean(config.emailNotifications);
}

function getUpdateNotificationKind(patch: UpdateFeedbackInput): ReviewNotificationKind {
  if (patch.status === "resolved") {
    return "resolved";
  }

  if (patch.status === "fixed" || patch.fixedAt || patch.fixedBy) {
    return "fixed";
  }

  if (patch.status) {
    return "status";
  }

  if ("assigneeEmail" in patch) {
    return "assigned";
  }

  return "updated";
}

async function sendReviewNotification(
  config: ReviewLensConfig,
  adapter: ReviewLensAdapter,
  input: ReviewNotificationInput
) {
  if (!isEmailNotificationsEnabled(config) || !adapter.sendEmail) {
    return;
  }

  const recipients = getNotificationRecipients(input);
  if (recipients.length === 0) {
    return;
  }

  try {
    await adapter.sendEmail({
      to: recipients,
      subject: buildNotificationSubject(config, input),
      text: buildNotificationText(input)
    });
  } catch (error) {
    console.warn("Review Lens email notification failed", error);
  }
}

function getNotificationRecipients(input: ReviewNotificationInput) {
  const recipients = new Set<string>();
  recipients.add(input.item.authorEmail);

  if (input.previousItem?.assigneeEmail) {
    recipients.add(input.previousItem.assigneeEmail);
  }

  if (input.item.assigneeEmail) {
    recipients.add(input.item.assigneeEmail);
  }

  return [...recipients].filter((email) => {
    if (!email) {
      return false;
    }

    return email.toLowerCase() !== input.actorEmail?.toLowerCase();
  });
}

function buildNotificationSubject(config: ReviewLensConfig, input: ReviewNotificationInput) {
  const options = typeof config.emailNotifications === "object" ? config.emailNotifications : {};
  const prefix = options.subjectPrefix ?? "Review Lens";
  return `${prefix}: ${getNotificationLabel(input)}`;
}

function buildNotificationText(input: ReviewNotificationInput) {
  const lines = [
    "[Review Lens]",
    getNotificationLabel(input),
    getSenderDisclosure(input),
    "",
    `Review: ${input.item.comment}`,
    `Status: ${formatStatus(input.item.status)}`,
    `Author: ${input.item.authorEmail}`,
    `Assignee: ${input.item.assigneeEmail ?? "Unassigned"}`,
    `Link: ${buildFeedbackLink(input.item)}`
  ];

  if (input.replyBody) {
    lines.splice(2, 0, `Reply: ${input.replyBody}`, "");
  }

  return lines.join("\n");
}

function getSenderDisclosure(input: ReviewNotificationInput) {
  return input.actorEmail
    ? `Sent by Review Lens on behalf of ${input.actorEmail}.`
    : "Sent by Review Lens on behalf of the signed-in Google user.";
}

function getNotificationLabel(input: ReviewNotificationInput) {
  if (input.kind === "created") {
    return "New review feedback";
  }

  if (input.kind === "assigned") {
    return `Review assignment changed to ${input.item.assigneeEmail ?? "unassigned"}`;
  }

  if (input.kind === "status") {
    return `Review status changed to ${formatStatus(input.item.status)}`;
  }

  if (input.kind === "fixed") {
    return "Review marked fixed";
  }

  if (input.kind === "resolved") {
    return "Review resolved";
  }

  if (input.kind === "reply") {
    return "New review reply";
  }

  return "Review updated";
}

function buildFeedbackLink(item: ReviewLensFeedback) {
  try {
    const url = new URL(item.originalUrl);
    url.searchParams.set("reviewLensFeedback", item.id);
    return url.toString();
  } catch {
    return item.originalUrl;
  }
}

function formatStatus(status: FeedbackStatus) {
  return status.replace(/_/g, " ");
}
