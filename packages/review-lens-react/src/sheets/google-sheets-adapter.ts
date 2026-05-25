import type {
  CreateFeedbackInput,
  ReviewLensAdapter,
  ReviewLensFeedback,
  ReviewLensPermission,
  ReviewLensRole
} from "../types";

type GoogleSheetsAdapterConfig = {
  googleClientId: string;
  spreadsheetId: string;
  feedbackSheetName?: string;
  usersSheetName?: string;
  projectsSheetName?: string;
};

type TokenClient = {
  requestAccessToken(options?: { prompt?: string }): void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }): TokenClient;
        };
      };
    };
  }
}

const googleScopes = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email"
].join(" ");
const userInfoEndpoint = "https://www.googleapis.com/oauth2/v3/userinfo";

export function createGoogleSheetsAdapter(
  config: GoogleSheetsAdapterConfig
): ReviewLensAdapter {
  const feedbackSheetName = config.feedbackSheetName ?? "Feedback";
  const usersSheetName = config.usersSheetName ?? "Users";
  let tokenPromise: Promise<string> | undefined;
  let currentEmail: string | undefined;

  async function getToken() {
    tokenPromise ??= requestGoogleToken(config.googleClientId);
    return tokenPromise;
  }

  async function sheetsFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await getToken();
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...init?.headers
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Google Sheets request failed with ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  async function readRows(sheetName: string): Promise<string[][]> {
    const data = await sheetsFetch<{ values?: string[][] }>(
      `/values/${encodeURIComponent(sheetName)}`
    );
    return data.values ?? [];
  }

  return {
    async getCurrentUser() {
      if (!currentEmail) {
        const token = await getToken();
        const response = await fetch(userInfoEndpoint, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
          throw new Error(`Google userinfo request failed with ${response.status}`);
        }

        const data = (await response.json()) as { email?: string };
        currentEmail = data.email;
      }

      if (!currentEmail) {
        throw new Error("Google account did not return an email address");
      }

      return { email: currentEmail };
    },

    async getPermissions(projectKey) {
      const [{ email }, rows] = await Promise.all([this.getCurrentUser(), readRows(usersSheetName)]);
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
      const rows = rowsToObjects(await readRows(feedbackSheetName));
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
        status: "open",
        createdAt: now,
        updatedAt: now
      };

      await sheetsFetch(`/values/${encodeURIComponent(feedbackSheetName)}:append?valueInputOption=RAW`, {
        method: "POST",
        body: JSON.stringify({ values: [feedbackToRow(item)] })
      });

      return item;
    },

    async resolveFeedback(id, resolvedBy) {
      const rows = await readRows(feedbackSheetName);
      const header = rows[0] ?? feedbackHeader;
      const idColumn = header.indexOf("id");
      const statusColumn = header.indexOf("status");
      const updatedAtColumn = header.indexOf("updatedAt");
      const resolvedAtColumn = header.indexOf("resolvedAt");
      const resolvedByColumn = header.indexOf("resolvedBy");
      const rowIndex = rows.findIndex((row, index) => index > 0 && row[idColumn] === id);

      if (rowIndex < 1) {
        throw new Error(`Feedback ${id} was not found`);
      }

      const row = [...rows[rowIndex]];
      const now = new Date().toISOString();
      row[statusColumn] = "resolved";
      row[updatedAtColumn] = now;
      row[resolvedAtColumn] = now;
      row[resolvedByColumn] = resolvedBy;

      await sheetsFetch(
        `/values/${encodeURIComponent(feedbackSheetName)}!A${rowIndex + 1}:Q${rowIndex + 1}?valueInputOption=RAW`,
        {
          method: "PUT",
          body: JSON.stringify({ values: [row] })
        }
      );

      const feedback = rowToFeedback(rowToObject(header, row));

      if (!feedback) {
        throw new Error(`Feedback ${id} could not be parsed after resolving`);
      }

      return feedback;
    }
  };
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
  "cssSnapshotJson",
  "comment",
  "status",
  "authorEmail",
  "createdAt",
  "updatedAt",
  "resolvedAt",
  "resolvedBy"
];

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
    JSON.stringify(item.cssSnapshot),
    item.comment,
    item.status,
    item.authorEmail,
    item.createdAt,
    item.updatedAt,
    item.resolvedAt ?? "",
    item.resolvedBy ?? ""
  ];
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
    cssSnapshot: parseJson(row.cssSnapshotJson, {
      margin: "",
      padding: "",
      border: "",
      fontFamily: "",
      fontSize: "",
      lineHeight: "",
      color: "",
      backgroundColor: "",
      width: 0,
      height: 0
    }),
    comment: row.comment,
    status: row.status === "resolved" ? "resolved" : "open",
    authorEmail: row.authorEmail,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt || undefined,
    resolvedBy: row.resolvedBy || undefined
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function roleToPermissions(role: ReviewLensRole): ReviewLensPermission[] {
  if (role === "admin") {
    return ["create", "read", "resolve"];
  }

  if (role === "developer") {
    return ["read", "resolve"];
  }

  return ["create", "read"];
}

async function requestGoogleToken(clientId: string): Promise<string> {
  await loadGoogleIdentityScript();

  return new Promise((resolve, reject) => {
    const client = window.google?.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: googleScopes,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? "Google OAuth did not return an access token"));
          return;
        }

        resolve(response.access_token);
      }
    });

    client?.requestAccessToken({ prompt: "" });
  });
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
