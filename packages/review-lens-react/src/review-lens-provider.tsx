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
      feedbackSheetName: config.sheetName ?? "Feedback"
    });
  }, [
    config.adapter,
    config.contentSpreadsheetId,
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
      return item;
    },
    [adapter]
  );

  const updateFeedback = useCallback(
    async (id: string, patch: UpdateFeedbackInput) => {
      const item = await adapter.updateFeedback(id, patch);
      setFeedback((current) =>
        current.map((feedbackItem) => (feedbackItem.id === id ? item : feedbackItem))
      );
      return item;
    },
    [adapter]
  );

  const listMessages = useCallback(
    (feedbackId: string) => adapter.listMessages(feedbackId),
    [adapter]
  );

  const createMessage = useCallback(
    (input: CreateMessageInput) => adapter.createMessage(input),
    [adapter]
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
