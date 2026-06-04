# review-lens-react

<img src="https://raw.githubusercontent.com/ichichich3011/review-lens-react/main/packages/review-lens-react/review-lens-logo.svg" alt="Review Lens logo" width="64" height="64">

`review-lens-react` is a React overlay for UX reviews inside frontend apps. Designers can inspect real DOM elements, see computed spacing and typography details, lock an element, write feedback, and store that feedback in Google Sheets. Developers can open the same app, see page comments anchored to selectors, and resolve feedback while implementing the review.

The package is intended to be mounted by the host app only when review mode is needed. It does not add a global launcher by default.

## Features

- Inspect elements in-place with a visual overlay.
- Capture padding, margin, border, dimensions, font size, line height, colors, and selector metadata.
- Prefer stable selectors such as `data-review-id`, `data-testid`, `id`, `aria-label`, and `name`.
- Fall back to a generated CSS path when no stable attribute exists.
- Save feedback with selector, URL, content id, author, status, timestamps, CSS snapshot, and element fingerprint.
- Triage feedback by status, severity, type, assignee, viewport, threaded replies, and summary groups.
- Detect target drift by comparing the stored fingerprint and CSS snapshot with the current DOM.
- Show accessibility hints and host-configured design token mismatches for the selected element.
- Store screenshot metadata and URLs when the host app provides capture and upload hooks.
- Match feedback across localhost and production by `projectKey`, `contentId`, and normalized path.
- Use Google OAuth in the browser and Google Sheets as the feedback store.
- Support panel placement in all four corners.

## Install

```sh
npm install review-lens-react
```

Import the component and its CSS once in the host app.

```tsx
import {
  ReviewLensOverlay,
  ReviewLensProvider
} from "review-lens-react";
import "review-lens-react/styles.css";
```

## Basic Usage

```tsx
import { useState } from "react";
import {
  ReviewLensOverlay,
  ReviewLensProvider
} from "review-lens-react";
import "review-lens-react/styles.css";

export function AppReviewMode() {
  const [reviewOpen, setReviewOpen] = useState(false);

  return (
    <ReviewLensProvider
      config={{
        googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        contentSpreadsheetId: import.meta.env.VITE_REVIEW_LENS_CONTENT_SPREADSHEET_ID,
        usersSpreadsheetId: import.meta.env.VITE_REVIEW_LENS_USERS_SPREADSHEET_ID,
        projectKey: "landing-pages-app",
        contentId: "article-123"
      }}
    >
      <button type="button" onClick={() => setReviewOpen(true)}>
        Start UX review
      </button>

      <ReviewLensOverlay
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        placement="top-right"
      />
    </ReviewLensProvider>
  );
}
```

Add stable attributes to important review targets when possible:

```tsx
<button data-review-id="hero-cta">Register now</button>
```

## API

### `ReviewLensProvider`

Wrap the host app or the reviewed page area.

```tsx
<ReviewLensProvider config={config}>{children}</ReviewLensProvider>
```

Config:

| Name | Required | Description |
| --- | --- | --- |
| `googleClientId` | yes, unless `adapter` is provided | OAuth web client id from Google Cloud. |
| `contentSpreadsheetId` | yes, unless `adapter` is provided | Google Sheet id for review feedback and messages. |
| `usersSpreadsheetId` | yes, unless `adapter` is provided | Google Sheet id for user roles and authentication metadata. |
| `sheetName` | no | Feedback sheet name. Defaults to `Feedback`. |
| `projectKey` | yes | Stable app/project key, for example `landing-pages-app`. |
| `contentId` | yes | Stable content key shared by localhost and production. |
| `currentUrl` | no | URL to store and normalize. Defaults to `window.location.href`. |
| `normalizeUrl` | no | Custom URL normalization function. |
| `designTokens` | no | Allowed spacing, font size, line height, color, and radius values for advisory token checks. |
| `captureScreenshot` | no | Optional hook that captures a screenshot for a selected target. |
| `emailNotifications` | no | Enables Gmail notifications for authors and assignees. Requires the Gmail send scope. |
| `uploadAttachment` | no | Optional hook that stores screenshots and returns attachment URLs. |
| `adapter` | no | Custom storage adapter for tests, demos, or a future backend. |

### `ReviewLensOverlay`

Render this when review mode should be available.

```tsx
<ReviewLensOverlay
  open={reviewOpen}
  onOpenChange={setReviewOpen}
  placement="bottom-left"
  showResolved={false}
  syncSelectionToUrl={true}
/>
```

Props:

| Name | Required | Description |
| --- | --- | --- |
| `open` | yes | Controls whether the overlay is active. |
| `onOpenChange` | no | Called when the overlay requests closing. |
| `placement` | no | `top-left`, `top-right`, `bottom-left`, or `bottom-right`. Defaults to `top-right`. |
| `showResolved` | no | Shows resolved comments when true. Defaults to false. |
| `syncSelectionToUrl` | no | Writes `reviewLensFeedback=<id>` into the URL and opens matching shared links. |
| `responsivePresets` | no | Viewport preset labels stored with new feedback. |

## Google Setup

The default adapter uses Google Identity Services in the browser and the Google Sheets API. No API key is required.

Official references:

- Google Identity Services token model: https://developers.google.com/identity/oauth2/web/guides/use-token-model
- Google Identity Services setup: https://developers.google.com/identity/oauth2/web/guides/load-3p-authorization-library
- Google Sheets API values guide: https://developers.google.com/workspace/sheets/api/guides/values
- Google Sheets `values.append`: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append

### 1. Create or choose a Google Cloud project

Open Google Cloud Console and choose the project that should own the OAuth client.

### 2. Enable Google APIs

In Google Cloud Console:

1. Go to `APIs & Services`.
2. Enable `Google Sheets API`.
3. Enable `Gmail API` when `emailNotifications` should send notification emails.

### 3. Configure OAuth consent

In Google Cloud Console:

1. Open the Google Auth Platform or OAuth consent configuration.
2. Use `Internal` if the app should only be available inside your Google Workspace organization.
3. Add the app name, support email, and developer contact.
4. Add these scopes:

```text
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/userinfo.email
```

The Sheets scope is used to read/write feedback rows. The email scope is used to match the signed-in Google account against the `Users` tab.

To send review notifications from the signed-in user's Gmail account, also add:

```text
https://www.googleapis.com/auth/gmail.send
```

Then enable notifications in the provider config:

```tsx
<ReviewLensProvider
  config={{
    googleClientId,
    contentSpreadsheetId,
    usersSpreadsheetId,
    projectKey: "demo",
    contentId: "article-123",
    emailNotifications: true
  }}
>
  {children}
</ReviewLensProvider>
```

Notification emails include a `reviewLensFeedback=<id>` link back to the selected feedback and state that they were sent by Review Lens on behalf of the signed-in user. The default Google adapter only requests the Gmail scope when `emailNotifications` is enabled.

The package also exports `ReviewLensLogo` for host apps that want to reuse the same mark in custom launchers or review entry points:

```tsx
import { ReviewLensLogo } from "review-lens-react";
```

### 4. Create an OAuth web client

In Google Cloud Console:

1. Go to `APIs & Services` -> `Credentials`.
2. Create an OAuth client.
3. Choose `Web application`.
4. Add authorized JavaScript origins for every host that will run review mode.

Examples:

```text
http://localhost:5173
http://localhost:3000
https://your-staging-app.example.com
https://your-production-app.example.com
```

Use the generated client id as `googleClientId`.

### 5. Create the Google Sheets

Create a content Google Sheet and copy its id from the URL:

```text
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
```

Use this id as `contentSpreadsheetId`. Share the content Sheet with every reviewer/developer who should create or update review content.

Create a separate users/auth Google Sheet and use its id as `usersSpreadsheetId`. Normal reviewers only need read access to this Sheet; admins can keep write access to themselves.

### 6. Add the `Feedback` tab

Create a tab named `Feedback` with this exact header row:

```csv
id,projectKey,contentId,normalizedPath,originalUrl,selector,selectorStrategy,elementFingerprintJson,createdCssSnapshotJson,comment,status,severity,category,assigneeEmail,viewportWidth,viewportHeight,viewportPreset,screenshotUrl,screenshotThumbnailUrl,attachmentJson,authorEmail,createdAt,updatedAt,fixedCssSnapshotJson,fixedAt,fixedBy,resolvedAt,resolvedBy
```

The library appends new feedback rows and updates existing rows when status, assignment, screenshot metadata, or fixed-state snapshots change.

### 7. Add the `Messages` tab

Create a tab named `Messages` with this header row:

```csv
id,feedbackId,body,authorEmail,createdAt
```

### 8. Add the `Users` tab in the users Sheet

Create a tab named `Users` with this header row:

```csv
email,role,active,projectKey
```

Example rows:

```csv
designer@example.com,designer,true,landing-pages-app
developer@example.com,developer,true,landing-pages-app
lead@example.com,admin,true,
```

Roles:

| Role | Permissions |
| --- | --- |
| `designer` | Read, create, and reply. |
| `developer` | Read, reply, update status, and assign. |
| `admin` | Read, create, reply, update status, and assign. |

If `projectKey` is empty, the user role applies to every project using the Sheet. If `active` is `false`, the row is ignored.

## URL and Content Matching

Feedback is loaded by:

- `projectKey`
- `contentId`
- normalized path

By default, the normalizer removes origin, port, query params, hashes, and trailing slashes. This means these URLs match the same feedback when `projectKey` and `contentId` are equal:

```text
https://www.example.com/articles/123?utm_source=newsletter
http://localhost:5173/articles/123
```

If your app has a different URL model, pass a custom normalizer:

```tsx
<ReviewLensProvider
  config={{
    googleClientId,
    contentSpreadsheetId,
    usersSpreadsheetId,
    projectKey: "landing-pages-app",
    contentId: article.id,
    normalizeUrl: (url) => new URL(url).pathname.replace(/^\/preview/, "")
  }}
>
  {children}
</ReviewLensProvider>
```

## Local Development

This repository contains the package and a demo app.

```sh
npm install
npm run dev --workspace review-lens-demo
npm test
npm run typecheck
npm run build
```

The demo uses an in-memory adapter, so it does not require Google credentials.

## Custom Adapter

Use a custom adapter when testing, demoing, or replacing direct Google Sheets access with a backend later.

```tsx
const adapter = {
  async getCurrentUser() {
    return { email: "designer@example.com" };
  },
  async getPermissions() {
    return ["create", "read", "reply", "update", "assign"];
  },
  async listFeedback(params) {
    return [];
  },
  async createFeedback(input) {
    return {
      ...input,
      id: crypto.randomUUID(),
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  },
  async updateFeedback(id, patch) {
    throw new Error("Implement updateFeedback");
  },
  async listMessages(feedbackId) {
    return [];
  },
  async createMessage(input) {
    return {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
  }
};
```

Then pass it to the provider:

```tsx
<ReviewLensProvider
  config={{
    adapter,
    projectKey: "demo",
    contentId: "article-123"
  }}
>
  {children}
</ReviewLensProvider>
```

## Troubleshooting

### Google sign-in popup does not work

Check that the current origin is listed as an authorized JavaScript origin on the OAuth web client. The origin must include protocol and host, for example `http://localhost:5173`.

### `Google Sheets request failed with 403`

Check that:

- Google Sheets API is enabled.
- The signed-in user has access to the Sheet.
- OAuth consent includes the Sheets scope.
- The Sheet id is correct.

### The user can sign in but has the wrong permissions

Check the `Users` tab:

- `email` must match the Google account email.
- `active` must not be `false`.
- `role` must be `designer`, `developer`, or `admin`.
- `projectKey` must be empty or match the provider config.

### Feedback does not appear on localhost

Check that production and localhost pass the same `projectKey`, the same `contentId`, and normalize to the same path. Use `normalizeUrl` when the routes differ between environments.

### Markers do not anchor after DOM changes

Prefer stable attributes on important elements:

```tsx
data-review-id="hero-cta"
data-testid="registration-form"
```

Generated CSS paths work, but they are more likely to break when DOM structure changes.
