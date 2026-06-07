import type {
  CreateMessageInput,
  CreateFeedbackInput,
  CssSnapshot,
  FeedbackCategory,
  FeedbackSeverity,
  FeedbackStatus,
  ReviewLensAttachment,
  ReviewLensAdapter,
  ReviewLensFeedback,
  ReviewLensPermission,
  ReviewLensRole,
  ReviewLensSendEmailInput,
  ReviewLensThreadMessage,
  ReviewLensViewportPreset,
  UpdateFeedbackInput
} from "../types";

type GoogleSheetsAdapterConfig = {
  googleClientId: string;
  contentSpreadsheetId: string;
  usersSpreadsheetId: string;
  feedbackSheetName?: string;
  messagesSheetName?: string;
  usersSheetName?: string;
  projectsSheetName?: string;
  enableEmailNotifications?: boolean;
};

type TokenClient = {
  requestAccessToken(options?: { prompt?: string }): void;
};

type GoogleToken = {
  accessToken: string;
  expiresAt: number;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; expires_in?: number; error?: string }) => void;
          }): TokenClient;
        };
      };
    };
  }
}

const googleScopes = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email"
];
const gmailSendScope = "https://www.googleapis.com/auth/gmail.send";
const userInfoEndpoint = "https://www.googleapis.com/oauth2/v3/userinfo";
const gmailSendEndpoint = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const tokenStoragePrefix = "review-lens-google-token";
const tokenExpiryBufferMs = 60_000;

export function createGoogleSheetsAdapter(
  config: GoogleSheetsAdapterConfig
): ReviewLensAdapter {
  const feedbackSheetName = config.feedbackSheetName ?? "Feedback";
  const messagesSheetName = config.messagesSheetName ?? "Messages";
  const usersSheetName = config.usersSheetName ?? "Users";
  const scopes = config.enableEmailNotifications
    ? [...googleScopes, gmailSendScope].join(" ")
    : googleScopes.join(" ");
  const tokenStorageKey = createTokenStorageKey(config.googleClientId, scopes);
  let tokenPromise: Promise<GoogleToken> | undefined;
  let currentEmail: string | undefined;

  async function getToken() {
    const storedToken = readStoredGoogleToken(tokenStorageKey);

    if (storedToken) {
      return storedToken.accessToken;
    }

    tokenPromise ??= requestGoogleToken(config.googleClientId, scopes).then((token) => {
      writeStoredGoogleToken(tokenStorageKey, token);
      return token;
    });

    const token = await tokenPromise;
    if (Date.now() >= token.expiresAt) {
      tokenPromise = undefined;
      return getToken();
    }

    return token.accessToken;
  }

  async function sheetsFetch<T>(
    targetSpreadsheetId: string,
    path: string,
    init?: RequestInit
  ): Promise<T> {
    const token = await getToken();
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...init?.headers
        }
      }
    );

    if (response.status === 401) {
      clearStoredGoogleToken(tokenStorageKey);
      tokenPromise = undefined;
      const retryToken = await getToken();
      const retryResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}${path}`,
        {
          ...init,
          headers: {
            Authorization: `Bearer ${retryToken}`,
            "Content-Type": "application/json",
            ...init?.headers
          }
        }
      );

      if (!retryResponse.ok) {
        throw new Error(`Google Sheets request failed with ${retryResponse.status}`);
      }

      return retryResponse.json() as Promise<T>;
    }

    if (!response.ok) {
      throw new Error(`Google Sheets request failed with ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  async function readRows(targetSpreadsheetId: string, sheetName: string): Promise<string[][]> {
    const data = await sheetsFetch<{ values?: string[][] }>(
      targetSpreadsheetId,
      `/values/${encodeURIComponent(sheetName)}`
    );
    return data.values ?? [];
  }

  return {
    async getCurrentUser() {
      if (!currentEmail) {
        currentEmail = await getCurrentEmail();
      }

      if (!currentEmail) {
        throw new Error("Google account did not return an email address");
      }

      return { email: currentEmail };
    },

    async getPermissions(projectKey) {
      const [{ email }, rows] = await Promise.all([
        this.getCurrentUser(),
        readRows(config.usersSpreadsheetId, usersSheetName)
      ]);
      const users = rowsToObjects(rows);
      const normalizedEmail = email.toLowerCase();
      const match = users.find(
        (row) =>
          row.email?.toLowerCase() === normalizedEmail &&
          row.active !== "false" &&
          (!row.projectKey || row.projectKey === projectKey)
      );

      return roleToPermissions((match?.role as ReviewLensRole | undefined) ?? "designer");
    },

    async listFeedback(params) {
      const rows = rowsToObjects(await readRows(config.contentSpreadsheetId, feedbackSheetName));
      return rows
        .map(rowToFeedback)
        .filter((item): item is ReviewLensFeedback => item !== null)
        .filter(
          (item) =>
            item.projectKey === params.projectKey &&
            item.contentId === params.contentId &&
            item.normalizedPath === params.normalizedPath
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async createFeedback(input: CreateFeedbackInput) {
      const now = new Date().toISOString();
      const item: ReviewLensFeedback = {
        ...input,
        id: crypto.randomUUID(),
        attachments: [],
        createdAt: now,
        updatedAt: now
      };

      await sheetsFetch(
        config.contentSpreadsheetId,
        `/values/${encodeURIComponent(feedbackSheetName)}:append?valueInputOption=RAW`,
        {
          method: "POST",
          body: JSON.stringify({ values: [feedbackToRow(item)] })
        }
      );

      return item;
    },

    async updateFeedback(id: string, patch: UpdateFeedbackInput) {
      const rows = await readRows(config.contentSpreadsheetId, feedbackSheetName);
      const header = rows[0] ?? feedbackHeader;
      const idColumn = header.indexOf("id");

      if (idColumn === -1) {
        throw new Error(`Sheet ${feedbackSheetName} is missing an id column`);
      }

      const rowIndex = rows.findIndex((row, index) => index > 0 && row[idColumn] === id);

      if (rowIndex < 1) {
        throw new Error(`Feedback ${id} was not found`);
      }

      const now = new Date().toISOString();
      const current = rowToFeedback(rowToObject(header, rows[rowIndex]));

      if (!current) {
        throw new Error(`Feedback ${id} could not be parsed before updating`);
      }

      const updated: ReviewLensFeedback = {
        ...current,
        ...patch,
        updatedAt: now
      };
      const row = feedbackToRow(updated);

      await sheetsFetch(
        config.contentSpreadsheetId,
        `/values/${encodeURIComponent(feedbackSheetName)}!A${rowIndex + 1}:${columnLetter(
          feedbackHeader.length
        )}${rowIndex + 1}?valueInputOption=RAW`,
        {
          method: "PUT",
          body: JSON.stringify({ values: [row] })
        }
      );

      return updated;
    },

    async listMessages(feedbackId: string) {
      const rows = rowsToObjects(await readRows(config.contentSpreadsheetId, messagesSheetName));
      return rows
        .map(rowToMessage)
        .filter((message): message is ReviewLensThreadMessage => message !== null)
        .filter((message) => message.feedbackId === feedbackId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async createMessage(input: CreateMessageInput) {
      const message: ReviewLensThreadMessage = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString()
      };

      await sheetsFetch(
        config.contentSpreadsheetId,
        `/values/${encodeURIComponent(messagesSheetName)}:append?valueInputOption=RAW`,
        {
          method: "POST",
          body: JSON.stringify({ values: [messageToRow(message)] })
        }
      );

      return message;
    },

    async sendEmail(input: ReviewLensSendEmailInput) {
      if (!config.enableEmailNotifications || input.to.length === 0) {
        return;
      }

      const token = await getToken();
      const sender = await this.getCurrentUser();
      const response = await fetch(gmailSendEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          raw: createRawEmail({
            from: sender.email,
            to: input.to,
            subject: input.subject,
            text: input.text
          })
        })
      });

      if (!response.ok) {
        throw new Error(`Gmail send request failed with ${response.status}`);
      }
    }
  };

  async function getCurrentEmail() {
    const response = await fetch(userInfoEndpoint, {
      headers: { Authorization: `Bearer ${await getToken()}` }
    });

    if (response.status === 401) {
      clearStoredGoogleToken(tokenStorageKey);
      tokenPromise = undefined;
      const retryResponse = await fetch(userInfoEndpoint, {
        headers: { Authorization: `Bearer ${await getToken()}` }
      });

      if (!retryResponse.ok) {
        throw new Error(`Google userinfo request failed with ${retryResponse.status}`);
      }

      const retryData = (await retryResponse.json()) as { email?: string };
      return retryData.email;
    }

    if (!response.ok) {
      throw new Error(`Google userinfo request failed with ${response.status}`);
    }

    const data = (await response.json()) as { email?: string };
    return data.email;
  }
}

const feedbackHeader = [
  "id",
  "projectKey",
  "contentId",
  "normalizedPath",
  "originalUrl",
  "selector",
  "selectorStrategy",
  "elementFingerprintJson",
  "createdCssSnapshotJson",
  "comment",
  "status",
  "severity",
  "category",
  "assigneeEmail",
  "viewportWidth",
  "viewportHeight",
  "viewportPreset",
  "screenshotUrl",
  "screenshotThumbnailUrl",
  "attachmentJson",
  "authorEmail",
  "createdAt",
  "updatedAt",
  "fixedCssSnapshotJson",
  "fixedAt",
  "fixedBy",
  "resolvedAt",
  "resolvedBy"
];

const messagesHeader = ["id", "feedbackId", "body", "authorEmail", "createdAt"];

function feedbackToRow(item: ReviewLensFeedback): string[] {
  return [
    item.id,
    item.projectKey,
    item.contentId,
    item.normalizedPath,
    item.originalUrl,
    item.selector,
    item.selectorStrategy,
    JSON.stringify(item.elementFingerprint),
    JSON.stringify(item.createdCssSnapshot),
    item.comment,
    item.status,
    item.severity,
    item.category,
    item.assigneeEmail ?? "",
    String(item.viewportWidth),
    String(item.viewportHeight),
    item.viewportPreset,
    item.screenshotUrl ?? "",
    item.screenshotThumbnailUrl ?? "",
    JSON.stringify(item.attachments),
    item.authorEmail,
    item.createdAt,
    item.updatedAt,
    item.fixedCssSnapshot ? JSON.stringify(item.fixedCssSnapshot) : "",
    item.fixedAt ?? "",
    item.fixedBy ?? "",
    item.resolvedAt ?? "",
    item.resolvedBy ?? ""
  ];
}

function messageToRow(item: ReviewLensThreadMessage): string[] {
  return messagesHeader.map((key) => item[key as keyof ReviewLensThreadMessage]);
}

function rowsToObjects(rows: string[][]): Record<string, string>[] {
  const [header, ...body] = rows;

  if (!header) {
    return [];
  }

  return body.map((row) => rowToObject(header, row));
}

function rowToObject(header: string[], row: string[]): Record<string, string> {
  return Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""]));
}

function rowToFeedback(row: Record<string, string>): ReviewLensFeedback | null {
  if (!row.id) {
    return null;
  }

  return {
    id: row.id,
    projectKey: row.projectKey,
    contentId: row.contentId,
    normalizedPath: row.normalizedPath,
    originalUrl: row.originalUrl,
    selector: row.selector,
    selectorStrategy: row.selectorStrategy === "stable-attribute" ? "stable-attribute" : "css-path",
    elementFingerprint: parseJson(row.elementFingerprintJson, {
      tagName: "",
      width: 0,
      height: 0
    }),
    createdCssSnapshot: parseCssSnapshot(row.createdCssSnapshotJson),
    fixedCssSnapshot: row.fixedCssSnapshotJson ? parseCssSnapshot(row.fixedCssSnapshotJson) : undefined,
    comment: row.comment,
    status: parseStatus(row.status),
    severity: parseSeverity(row.severity),
    category: parseCategory(row.category),
    assigneeEmail: row.assigneeEmail || undefined,
    viewportWidth: Number(row.viewportWidth) || 0,
    viewportHeight: Number(row.viewportHeight) || 0,
    viewportPreset: parseViewportPreset(row.viewportPreset),
    screenshotUrl: row.screenshotUrl || undefined,
    screenshotThumbnailUrl: row.screenshotThumbnailUrl || undefined,
    attachments: parseJson<ReviewLensAttachment[]>(row.attachmentJson, []),
    authorEmail: row.authorEmail,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    fixedAt: row.fixedAt || undefined,
    fixedBy: row.fixedBy || undefined,
    resolvedAt: row.resolvedAt || undefined,
    resolvedBy: row.resolvedBy || undefined
  };
}

function rowToMessage(row: Record<string, string>): ReviewLensThreadMessage | null {
  if (!row.id || !row.feedbackId) {
    return null;
  }

  return {
    id: row.id,
    feedbackId: row.feedbackId,
    body: row.body,
    authorEmail: row.authorEmail,
    createdAt: row.createdAt
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function parseCssSnapshot(value: string): CssSnapshot {
  const snapshot = parseJson<Partial<CssSnapshot>>(value, {});

  return {
    margin: snapshot.margin ?? "",
    marginTop: snapshot.marginTop ?? "",
    marginRight: snapshot.marginRight ?? "",
    marginBottom: snapshot.marginBottom ?? "",
    marginLeft: snapshot.marginLeft ?? "",
    padding: snapshot.padding ?? "",
    paddingTop: snapshot.paddingTop ?? "",
    paddingRight: snapshot.paddingRight ?? "",
    paddingBottom: snapshot.paddingBottom ?? "",
    paddingLeft: snapshot.paddingLeft ?? "",
    border: snapshot.border ?? "",
    borderTopWidth: snapshot.borderTopWidth ?? "",
    borderRightWidth: snapshot.borderRightWidth ?? "",
    borderBottomWidth: snapshot.borderBottomWidth ?? "",
    borderLeftWidth: snapshot.borderLeftWidth ?? "",
    fontFamily: snapshot.fontFamily ?? "",
    fontSize: snapshot.fontSize ?? "",
    lineHeight: snapshot.lineHeight ?? "",
    color: snapshot.color ?? "",
    backgroundColor: snapshot.backgroundColor ?? "",
    borderRadius: snapshot.borderRadius ?? "",
    width: snapshot.width ?? 0,
    height: snapshot.height ?? 0
  };
}

function roleToPermissions(role: ReviewLensRole): ReviewLensPermission[] {
  if (role === "admin") {
    return ["create", "read", "reply", "update", "assign"];
  }

  if (role === "developer") {
    return ["read", "reply", "update", "assign"];
  }

  return ["create", "read", "reply"];
}

function parseStatus(value: string): FeedbackStatus {
  if (
    value === "in_progress" ||
    value === "needs_clarification" ||
    value === "fixed" ||
    value === "wontfix" ||
    value === "resolved"
  ) {
    return value;
  }

  return "open";
}

function parseSeverity(value: string): FeedbackSeverity {
  if (value === "low" || value === "high") {
    return value;
  }

  return "medium";
}

function parseCategory(value: string): FeedbackCategory {
  if (
    value === "visual" ||
    value === "copy" ||
    value === "accessibility" ||
    value === "responsive"
  ) {
    return value;
  }

  return "bug";
}

function parseViewportPreset(value: string): ReviewLensViewportPreset {
  if (value === "mobile" || value === "tablet" || value === "desktop") {
    return value;
  }

  return "custom";
}

function columnLetter(columnNumber: number): string {
  let remaining = columnNumber;
  let result = "";

  while (remaining > 0) {
    const modulo = (remaining - 1) % 26;
    result = String.fromCharCode(65 + modulo) + result;
    remaining = Math.floor((remaining - modulo) / 26);
  }

  return result;
}

async function requestGoogleToken(clientId: string, scope: string): Promise<GoogleToken> {
  await loadGoogleIdentityScript();

  return new Promise((resolve, reject) => {
    const client = window.google?.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? "Google OAuth did not return an access token"));
          return;
        }

        const expiresInSeconds = response.expires_in ?? 3600;
        resolve({
          accessToken: response.access_token,
          expiresAt: Date.now() + expiresInSeconds * 1000
        });
      }
    });

    client?.requestAccessToken({ prompt: "" });
  });
}

function createTokenStorageKey(clientId: string, scope: string): string {
  return `${tokenStoragePrefix}:${clientId}:${scope}`;
}

function readStoredGoogleToken(key: string): GoogleToken | undefined {
  try {
    const value = window.localStorage.getItem(key);
    if (!value) {
      return undefined;
    }

    const token = JSON.parse(value) as Partial<GoogleToken>;
    if (
      typeof token.accessToken !== "string" ||
      typeof token.expiresAt !== "number" ||
      Date.now() >= token.expiresAt - tokenExpiryBufferMs
    ) {
      window.localStorage.removeItem(key);
      return undefined;
    }

    return token as GoogleToken;
  } catch {
    return undefined;
  }
}

function writeStoredGoogleToken(key: string, token: GoogleToken): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(token));
  } catch {
    // Storage can be disabled by browser settings; in-memory token reuse still works.
  }
}

function clearStoredGoogleToken(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures so auth errors surface through the original request.
  }
}

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts.oauth2) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Google Identity failed to load")), {
        once: true
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Identity failed to load"));
    document.head.append(script);
  });
}

function createRawEmail(input: {
  from: string;
  to: string[];
  subject: string;
  text: string;
}): string {
  const message = [
    `From: ${input.from}`,
    `To: ${input.to.join(", ")}`,
    `Subject: ${input.subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    input.text
  ].join("\r\n");

  return base64UrlEncode(message);
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
