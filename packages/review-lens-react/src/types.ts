import type { ReactNode } from "react";

export type FeedbackStatus =
  | "open"
  | "in_progress"
  | "needs_clarification"
  | "fixed"
  | "wontfix"
  | "resolved";
export type FeedbackSeverity = "low" | "medium" | "high";
export type FeedbackCategory = "bug" | "visual" | "copy" | "accessibility" | "responsive";
export type ReviewLensRole = "designer" | "developer" | "admin";
export type ReviewLensPermission = "create" | "read" | "reply" | "update" | "assign";
export type ReviewLensViewportPreset = "mobile" | "tablet" | "desktop" | "custom";

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
  borderRadius: string;
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
  createdCssSnapshot: CssSnapshot;
  fixedCssSnapshot?: CssSnapshot;
  comment: string;
  status: FeedbackStatus;
  severity: FeedbackSeverity;
  category: FeedbackCategory;
  assigneeEmail?: string;
  viewportWidth: number;
  viewportHeight: number;
  viewportPreset: ReviewLensViewportPreset;
  screenshotUrl?: string;
  screenshotThumbnailUrl?: string;
  attachments: ReviewLensAttachment[];
  authorEmail: string;
  createdAt: string;
  updatedAt: string;
  fixedAt?: string;
  fixedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
};

export type CreateFeedbackInput = Omit<
  ReviewLensFeedback,
  | "id"
  | "attachments"
  | "createdAt"
  | "updatedAt"
  | "fixedAt"
  | "fixedBy"
  | "resolvedAt"
  | "resolvedBy"
>;

export type UpdateFeedbackInput = Partial<
  Pick<
    ReviewLensFeedback,
    | "status"
    | "severity"
    | "category"
    | "assigneeEmail"
    | "screenshotUrl"
    | "screenshotThumbnailUrl"
    | "attachments"
    | "fixedCssSnapshot"
    | "fixedAt"
    | "fixedBy"
    | "resolvedAt"
    | "resolvedBy"
  >
>;

export type ReviewLensThreadMessage = {
  id: string;
  feedbackId: string;
  body: string;
  authorEmail: string;
  createdAt: string;
};

export type CreateMessageInput = Omit<ReviewLensThreadMessage, "id" | "createdAt">;

export type ReviewLensAttachment = {
  id: string;
  feedbackId: string;
  type: "screenshot";
  url: string;
  thumbnailUrl?: string;
  createdAt: string;
  createdBy: string;
};

export type CreateAttachmentInput = {
  type: "screenshot";
  data: Blob | string;
  createdBy: string;
};

export type ReviewLensEmailNotificationOptions = {
  enabled?: boolean;
  subjectPrefix?: string;
};

export type ReviewLensSendEmailInput = {
  to: string[];
  subject: string;
  text: string;
};

export type ReviewLensDesignTokens = {
  spacing?: string[];
  fontSize?: string[];
  lineHeight?: string[];
  color?: string[];
  radius?: string[];
};

export type ReviewLensAdapter = {
  getCurrentUser(): Promise<{ email: string }>;
  getPermissions(projectKey: string): Promise<ReviewLensPermission[]>;
  listFeedback(params: {
    projectKey: string;
    contentId: string;
    normalizedPath: string;
  }): Promise<ReviewLensFeedback[]>;
  createFeedback(input: CreateFeedbackInput): Promise<ReviewLensFeedback>;
  updateFeedback(id: string, patch: UpdateFeedbackInput): Promise<ReviewLensFeedback>;
  listMessages(feedbackId: string): Promise<ReviewLensThreadMessage[]>;
  createMessage(input: CreateMessageInput): Promise<ReviewLensThreadMessage>;
  sendEmail?(input: ReviewLensSendEmailInput): Promise<void>;
  uploadAttachment?(
    feedbackId: string,
    input: CreateAttachmentInput
  ): Promise<ReviewLensAttachment>;
};

export type ReviewLensConfig = {
  googleClientId?: string;
  contentSpreadsheetId?: string;
  usersSpreadsheetId?: string;
  sheetName?: string;
  projectKey: string;
  contentId: string;
  currentUrl?: string;
  normalizeUrl?: (url: string) => string;
  designTokens?: ReviewLensDesignTokens;
  captureScreenshot?: (target: ReviewLensTarget) => Promise<Blob | string>;
  emailNotifications?: boolean | ReviewLensEmailNotificationOptions;
  uploadAttachment?: (
    feedbackId: string,
    input: CreateAttachmentInput
  ) => Promise<ReviewLensAttachment>;
  adapter?: ReviewLensAdapter;
};

export type ReviewLensProviderProps = {
  config: ReviewLensConfig;
  children: ReactNode;
};
