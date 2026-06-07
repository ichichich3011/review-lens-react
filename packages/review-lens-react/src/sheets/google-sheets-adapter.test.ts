import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGoogleSheetsAdapter } from "./google-sheets-adapter";

const config = {
  googleClientId: "google-client",
  contentSpreadsheetId: "content-sheet",
  usersSpreadsheetId: "users-sheet"
};

describe("createGoogleSheetsAdapter auth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-07T10:00:00.000Z"));
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(createUserInfoResponse));
  });

  afterEach(() => {
    delete window.google;
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reuses a valid Google access token from browser storage", async () => {
    const auth = installGoogleAuth([{ accessToken: "stored-token", expiresIn: 3600 }]);

    await createGoogleSheetsAdapter(config).getCurrentUser();
    await createGoogleSheetsAdapter(config).getCurrentUser();

    expect(auth.initTokenClient).toHaveBeenCalledOnce();
    expect(auth.requestAccessToken).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenNthCalledWith(2, "https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer stored-token" }
    });
  });

  it("requests a fresh Google access token after the stored token expires", async () => {
    const auth = installGoogleAuth([
      { accessToken: "old-token", expiresIn: 3600 },
      { accessToken: "new-token", expiresIn: 3600 }
    ]);

    await createGoogleSheetsAdapter(config).getCurrentUser();
    vi.setSystemTime(new Date("2026-06-07T11:00:01.000Z"));
    await createGoogleSheetsAdapter(config).getCurrentUser();

    expect(auth.initTokenClient).toHaveBeenCalledTimes(2);
    expect(auth.requestAccessToken).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(2, "https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer new-token" }
    });
  });
});

function installGoogleAuth(tokens: Array<{ accessToken: string; expiresIn: number }>) {
  const requestAccessToken = vi.fn();
  const initTokenClient = vi.fn((input: {
    callback: (response: { access_token: string; expires_in: number }) => void;
  }) => {
    return {
      requestAccessToken: vi.fn(() => {
        requestAccessToken();
        const token = tokens.shift();
        if (!token) {
          throw new Error("No mocked Google access token available");
        }

        input.callback({
          access_token: token.accessToken,
          expires_in: token.expiresIn
        });
      })
    };
  });

  window.google = {
    accounts: {
      oauth2: {
        initTokenClient
      }
    }
  };

  return { initTokenClient, requestAccessToken };
}

async function createUserInfoResponse() {
  return new Response(JSON.stringify({ email: "designer@example.com" }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
