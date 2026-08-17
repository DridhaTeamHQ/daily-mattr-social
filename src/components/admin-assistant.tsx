"use client";

import * as React from "react";
import { Bot, CornerDownLeft, Loader2, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { askAssistant, type ChatMessage } from "@/lib/admin/assistant";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Who needs chasing this week?",
  "How is the Monsoon reel campaign doing?",
  "What are people saying in the food delivery survey?",
  "Which ambassador has the best conversion rate?",
];

/**
 * Floating admin assistant.
 *
 * Read-only by design — the panel says so, because an assistant that looks
 * like it might act on your behalf invites you to ask it to, and then to
 * assume it did.
 */
export function AdminAssistant() {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [used, setUsed] = React.useState<string[]>([]);
  const [input, setInput] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const scroller = React.useRef<HTMLDivElement>(null);

  // Keep the newest message in view as the conversation grows.
  React.useEffect(() => {
    scroller.current?.scrollTo({
      top: scroller.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending]);

  function send(question: string) {
    const text = question.trim();
    if (!text || pending) return;

    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");

    startTransition(async () => {
      const reply = await askAssistant(messages, text);
      setUsed(reply.used ?? []);
      setMessages([
        ...next,
        { role: "assistant", content: reply.message },
      ]);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open the admin assistant"
        className={cn(
          "brut fixed right-5 bottom-5 z-40 flex items-center gap-2 rounded-full bg-brand px-4 py-3",
          "text-[14px] font-extrabold text-ink transition-transform",
          "hover:-translate-x-px hover:-translate-y-px active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
        )}
      >
        <Sparkles className="size-4.5" />
        Ask
      </button>
    );
  }

  return (
    <div
      className={cn(
        "brut-lg fixed z-50 flex flex-col bg-surface",
        "inset-x-3 bottom-3 max-h-[80dvh] rounded-lg",
        "sm:inset-x-auto sm:right-5 sm:bottom-5 sm:h-[34rem] sm:w-[26rem]",
      )}
    >
      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 border-b-[3px] border-ink bg-brand px-4 py-3">
        <span className="brut-sm grid size-8 place-items-center rounded-full bg-surface">
          <Bot className="size-4 text-ink" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="display text-[15px] text-ink">Assistant</p>
          <p className="text-[11.5px] font-bold text-ink/70">
            Reads your data · can&apos;t change anything
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="grid size-8 place-items-center rounded-sm border-2 border-transparent text-ink hover:border-ink hover:bg-white/40"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* ─── Conversation ──────────────────────────────────────────────────── */}
      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div>
            <p className="text-[13.5px] leading-relaxed font-semibold text-ink-soft">
              Ask about ambassadors, campaigns, surveys, referrals or the review
              queue. I look the answer up rather than guessing.
            </p>

            <ul className="mt-3 space-y-2">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => send(s)}
                    className="brut-sm w-full rounded-sm bg-canvas-sunk px-3 py-2 text-left text-[13px] font-bold text-ink transition-transform hover:-translate-x-px hover:-translate-y-px"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "brut-sm max-w-[92%] rounded-sm px-3.5 py-2.5 text-[13.5px] leading-relaxed font-semibold",
              m.role === "user"
                ? "ml-auto bg-poll-tint text-ink"
                : "bg-canvas-sunk text-ink",
            )}
          >
            {/* Safely render bold text without innerHTML */}
            <FormattedMessage text={m.content} />
          </div>
        ))}

        {pending && (
          <div className="brut-sm inline-flex items-center gap-2 rounded-sm bg-canvas-sunk px-3.5 py-2.5 text-[13px] font-bold text-ink-soft">
            <Loader2 className="size-4 animate-spin" />
            Looking it up…
          </div>
        )}

        {!pending && used.length > 0 && (
          <p className="text-[11px] font-bold text-ink-faint">
            Checked: {used.join(", ")}
          </p>
        )}
      </div>

      {/* ─── Input ─────────────────────────────────────────────────────────── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t-[3px] border-ink bg-canvas-sunk p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the programme…"
          aria-label="Ask the assistant"
          disabled={pending}
          className="h-10 flex-1 rounded-sm border-[3px] border-ink bg-surface px-3 text-[14px] font-medium text-ink shadow-[2px_2px_0_var(--color-ink)] focus:outline-none disabled:opacity-60"
        />
        <Button type="submit" size="icon" loading={pending} disabled={!input.trim()}>
          <CornerDownLeft aria-hidden />
        </Button>
      </form>
    </div>
  );
}

function FormattedMessage({ text }: { text: string }) {
  // Replace markdown list dashes with actual bullet points
  const formattedText = text.replace(/^[-*]\s/gm, "• ");
  const parts = formattedText.split(/(\*\*.*?\*\*)/g);
  
  return (
    <p className="whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={i} className="font-extrabold text-ink">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </p>
  );
}
