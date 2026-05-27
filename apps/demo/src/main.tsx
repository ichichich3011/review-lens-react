import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ReviewLensOverlay,
  ReviewLensProvider,
  type CreateFeedbackInput,
  type CreateMessageInput,
  type ReviewLensAdapter,
  type ReviewLensAttachment,
  type ReviewLensFeedback,
  type ReviewLensOverlayPlacement,
  type ReviewLensThreadMessage,
  type UpdateFeedbackInput
} from "review-lens-react";
import "review-lens-react/styles.css";
import "./styles.css";

function App() {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<ReviewLensOverlayPlacement>("top-right");
  const adapter = useMemo(() => createMemoryAdapter(), []);

  return (
    <ReviewLensProvider
      config={{
        adapter,
        projectKey: "demo-app",
        contentId: "article-42",
        currentUrl: "http://localhost:5173/articles/42?preview=true",
        designTokens: {
          spacing: ["0px", "8px", "12px", "16px", "24px", "32px", "48px"],
          fontSize: ["14px", "16px", "18px", "20px", "48px"],
          lineHeight: ["20px", "24px", "56px", "normal"],
          color: ["rgb(15, 23, 42)", "rgb(255, 255, 255)", "rgb(37, 99, 235)"],
          radius: ["0px", "8px", "12px", "999px"]
        }
      }}
    >
      <main>
        <nav>
          <strong>Review Lens Demo</strong>
          <div className="toolbar">
            <label>
              Panel
              <select
                value={placement}
                onChange={(event) =>
                  setPlacement(event.target.value as ReviewLensOverlayPlacement)
                }
              >
                <option value="top-right">Top right</option>
                <option value="top-left">Top left</option>
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
              </select>
            </label>
            <button type="button" onClick={() => setOpen(true)}>
              Start review
            </button>
          </div>
        </nav>

        <section className="hero" data-review-id="hero">
          <p>Product Design</p>
          <h1>Review UI details directly in the app.</h1>
          <button data-review-id="hero-cta" type="button">
            Inspect this button
          </button>
        </section>

        <section className="grid">
          <article data-review-id="spacing-card">
            <h2>Spacing</h2>
            <p>Hover this card to inspect margin, padding, border, and dimensions.</p>
          </article>
          <article data-review-id="type-card">
            <h2>Typography</h2>
            <p>Lock this text to capture font size, family, line height, and color.</p>
          </article>
        </section>
      </main>
      <ReviewLensOverlay
        open={open}
        onOpenChange={setOpen}
        placement={placement}
        syncSelectionToUrl
      />
    </ReviewLensProvider>
  );
}

function createMemoryAdapter(): ReviewLensAdapter {
  let feedback: ReviewLensFeedback[] = [];
  let messages: ReviewLensThreadMessage[] = [];

  return {
    async getCurrentUser() {
      return { email: "designer@example.com" };
    },
    async getPermissions() {
      return ["create", "read", "reply", "update", "assign"];
    },
    async listFeedback(params) {
      return feedback.filter(
        (item) =>
          item.projectKey === params.projectKey &&
          item.contentId === params.contentId &&
          item.normalizedPath === params.normalizedPath
      );
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
      feedback = [item, ...feedback];
      return item;
    },
    async updateFeedback(id: string, patch: UpdateFeedbackInput) {
      const now = new Date().toISOString();
      feedback = feedback.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
              updatedAt: now
            }
          : item
      );

      const item = feedback.find((nextItem) => nextItem.id === id);

      if (!item) {
        throw new Error(`Feedback ${id} was not found`);
      }

      return item;
    },
    async listMessages(feedbackId: string) {
      return messages.filter((message) => message.feedbackId === feedbackId);
    },
    async createMessage(input: CreateMessageInput) {
      const message: ReviewLensThreadMessage = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString()
      };
      messages = [...messages, message];
      return message;
    },
    async uploadAttachment(feedbackId: string, input): Promise<ReviewLensAttachment> {
      const now = new Date().toISOString();
      const url =
        typeof input.data === "string" ? input.data : URL.createObjectURL(input.data);
      return {
        id: crypto.randomUUID(),
        feedbackId,
        type: "screenshot",
        url,
        createdAt: now,
        createdBy: input.createdBy
      };
    }
  };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
