"use client";

import { useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { CHAT_CONFIG } from "@/lib/analyze/config";
import { suggestQuestions } from "@/lib/analyze/suggestions";
import type { AnalysisResult, AnswerSource, ChatTurn, TaskProposal } from "@/lib/analyze/types";
import { ApiRequestError, sendChat } from "@/components/analyzer/api";
import { FOCUS_RING, IconLens, IconSend } from "@/components/analyzer/ui";

export interface ChatHandle {
  ask: (question: string) => void;
}

interface Bubble extends ChatTurn {
  source?: AnswerSource;
  failed?: boolean;
  proposedTasks?: TaskProposal[];
}

export function ChatPanel({ result, handle, onAddTask, hasTask, canAddTask, allowAi }: {
  result: AnalysisResult;
  handle: Ref<ChatHandle>;
  onAddTask: (proposal: TaskProposal) => boolean;
  hasTask: (proposal: TaskProposal) => boolean;
  canAddTask: boolean;
  allowAi: boolean;
}) {
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState(() => suggestQuestions(result));
  const listRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(text: string) {
    const message = text.trim().slice(0, CHAT_CONFIG.maxMessageChars);
    if (!message || sending) return;
    const history: ChatTurn[] = messages.filter((m) => !m.failed).map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, { role: "user", content: message }]);
    setDraft("");
    setSending(true);
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const reply = await sendChat(result.id, message, history, controller.signal, allowAi);
      setMessages((current) => [...current, { role: "assistant", content: reply.reply, source: reply.source, proposedTasks: reply.proposedTasks }]);
      setSuggestions(reply.suggestions);
    } catch (error) {
      if (controller.signal.aborted) return;
      const content = error instanceof ApiRequestError ? error.message : "I couldn’t reach the server. Please try again.";
      setMessages((current) => [...current, { role: "assistant", content, failed: true }]);
    } finally {
      if (controllerRef.current === controller) setSending(false);
    }
  }

  useImperativeHandle(handle, () => ({ ask: (question) => void send(question) }));

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(draft);
    }
  };

  return (
    <section id="chat" aria-label="Chat about this paper" className="flex h-[36rem] flex-col overflow-hidden rounded-xl border border-line bg-panel lg:h-[calc(100vh-6.5rem)]">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-canvas">
          <IconLens className="h-4 w-4" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-bright">Ask TrustLens</h2>
          <p className="truncate text-xs text-muted">Answers from this report and the paper’s text</p>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Grounded
        </span>
      </header>

      <div ref={listRef} role="log" aria-live="polite" className="scroll-thin flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <div className="max-w-[92%] rounded-lg rounded-tl-sm border border-line bg-canvas px-3.5 py-2.5 text-sm leading-relaxed text-ink">
          I’ve read <span className="font-medium text-bright">{result.file.name}</span>. Ask what’s missing, whether the legal authorities still hold, or how to fix a gap.
        </div>
        {messages.map((message, index) => (
          <div key={index} className={`animate-pop flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[92%] whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
                message.role === "user"
                  ? "rounded-tr-sm border border-accent-deep/70 bg-accent/[0.08] text-bright"
                  : message.failed
                    ? "rounded-tl-sm border border-danger/30 bg-danger/10 text-danger"
                    : "rounded-tl-sm border border-line bg-canvas text-ink"
              }`}
            >
              {message.content}
              {message.source === "fallback" ? <span className="mt-2 block font-mono text-[10px] uppercase tracking-wider text-muted">From computed checks · AI unavailable</span> : null}
              {message.source === "local" ? <span className="mt-2 block font-mono text-[10px] uppercase tracking-wider text-muted">From computed checks · AI processing off</span> : null}
              {message.proposedTasks?.length ? (
                <div className="mt-3 space-y-2 border-t border-line pt-3">
                  <p className="text-xs font-medium text-accent">Want me to add this to your bucket list?</p>
                  {message.proposedTasks.map((proposal) => (
                    <div key={proposal.findingIds.join("|") || proposal.action} className="rounded-md border border-line p-2">
                      <p className="text-xs font-medium text-bright">{proposal.title}</p>
                      <p className="mt-1 text-xs text-ink">{proposal.action}</p>
                      <button type="button" disabled={!canAddTask || hasTask(proposal)} onClick={() => onAddTask(proposal)} className={`mt-2 rounded border border-accent-deep px-2 py-1 text-xs text-accent disabled:text-muted ${FOCUS_RING}`}>
                        {hasTask(proposal) ? "Added to bucket list" : "Add task"}
                      </button>
                    </div>
                  ))}
                  {!canAddTask ? <p className="text-xs text-danger">Tasks cannot be saved until browser storage is available and this analysis has a saved bucket list.</p> : null}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {sending ? (
          <div className="flex" role="status" aria-label="TrustLens is typing">
            <div className="flex items-center gap-1.5 rounded-lg rounded-tl-sm border border-line bg-canvas px-4 py-3">
              {[0, 150, 300].map((delay) => (
                <span key={delay} className="animate-dot h-1.5 w-1.5 rounded-full bg-accent" style={{ animationDelay: `${delay}ms` }} />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-line p-3">
        {!sending ? (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {suggestions.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => void send(question)}
                className={`rounded-md border border-line bg-canvas px-2.5 py-1 text-left text-xs text-ink transition-colors hover:border-accent-deep hover:text-accent ${FOCUS_RING}`}
              >
                {question}
              </button>
            ))}
          </div>
        ) : null}
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <label htmlFor="chat-input" className="sr-only">
            Your question
          </label>
          <textarea
            id="chat-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={CHAT_CONFIG.maxMessageChars}
            placeholder="Ask about gaps, citations, similarity…"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-bright placeholder:text-muted focus:border-accent-deep focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label="Send message"
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent text-canvas transition enabled:hover:brightness-110 disabled:bg-raised disabled:text-muted ${FOCUS_RING}`}
          >
            <IconSend className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </form>
        <p className="mt-2 text-center text-[11px] text-muted">{allowAi ? "AI can make mistakes." : "AI processing is off; answers use server-side checks only."} Indicators need editorial judgement. Not legal advice.</p>
      </div>
    </section>
  );
}
