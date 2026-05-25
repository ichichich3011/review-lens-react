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
  CreateFeedbackInput,
  ReviewLensAdapter,
  ReviewLensConfig,
  ReviewLensFeedback,
  ReviewLensPermission,
  ReviewLensProviderProps
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
  resolveFeedback: (id: string) => Promise<ReviewLensFeedback>;
};

const ReviewLensContext = createContext<ReviewLensContextValue | null>(null);

export function ReviewLensProvider({ config, children }: ReviewLensProviderProps) {
  const adapter = useMemo(() => {
    if (config.adapter) {
      return config.adapter;
    }

    return createGoogleSheetsAdapter({
      googleClientId: requireConfig(config.googleClientId, "googleClientId"),
      spreadsheetId: requireConfig(config.spreadsheetId, "spreadsheetId"),
      feedbackSheetName: config.sheetName ?? "Feedback"
    });
  }, [config.adapter, config.googleClientId, config.sheetName, config.spreadsheetId]);

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

  const resolveFeedback = useCallback(
    async (id: string) => {
      const item = await adapter.resolveFeedback(id, currentUser?.email ?? "");
      setFeedback((current) =>
        current.map((feedbackItem) => (feedbackItem.id === id ? item : feedbackItem))
      );
      return item;
    },
    [adapter, currentUser?.email]
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
      resolveFeedback
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
      resolveFeedback
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

