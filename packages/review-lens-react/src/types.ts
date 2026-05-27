import type { ReactNode } from "react";

export type FeedbackStatus = "open" | "resolved";
export type ReviewLensRole = "designer" | "developer" | "admin";
export type ReviewLensPermission = "create" | "read" | "resolve";

export type CssSnapshot = {
  margin: string;
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
  padding: string;
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
  border: string;
  borderTopWidth: string;
  borderRightWidth: string;
  borderBottomWidth: string;
  borderLeftWidth: string;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  color: string;
  backgroundColor: string;
  width: number;
  height: number;
};

export type ElementFingerprint = {
  tagName: string;
  id?: string;
  className?: string;
  textSnippet?: string;
  ariaLabel?: string;
  width: number;
  height: number;
};

export type ReviewLensTarget = {
  selector: string;
  selectorStrategy: "stable-attribute" | "css-path";
  fingerprint: ElementFingerprint;
  cssSnapshot: CssSnapshot;
  rect: DOMRect;
};

export type ReviewLensFeedback = {
  id: string;
  projectKey: string;
  contentId: string;
  normalizedPath: string;
  originalUrl: string;
  selector: string;
  selectorStrategy: ReviewLensTarget["selectorStrategy"];
  elementFingerprint: ElementFingerprint;
  cssSnapshot: CssSnapshot;
  comment: string;
  status: FeedbackStatus;
  authorEmail: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
};

export type CreateFeedbackInput = Omit<
  ReviewLensFeedback,
  "id" | "status" | "createdAt" | "updatedAt" | "resolvedAt" | "resolvedBy"
>;

export type ReviewLensAdapter = {
  getCurrentUser(): Promise<{ email: string }>;
  getPermissions(projectKey: string): Promise<ReviewLensPermission[]>;
  listFeedback(params: {
    projectKey: string;
    contentId: string;
    normalizedPath: string;
  }): Promise<ReviewLensFeedback[]>;
  createFeedback(input: CreateFeedbackInput): Promise<ReviewLensFeedback>;
  resolveFeedback(id: string, resolvedBy: string): Promise<ReviewLensFeedback>;
};

export type ReviewLensConfig = {
  googleClientId?: string;
  spreadsheetId?: string;
  sheetName?: string;
  projectKey: string;
  contentId: string;
  currentUrl?: string;
  normalizeUrl?: (url: string) => string;
  adapter?: ReviewLensAdapter;
};

export type ReviewLensProviderProps = {
  config: ReviewLensConfig;
  children: ReactNode;
};
