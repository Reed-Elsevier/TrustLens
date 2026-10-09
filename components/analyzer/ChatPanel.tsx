"use client";

import { useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { CHAT_CONFIG } from "@/lib/analyze/config";
import { suggestQuestions } from "@/lib/analyze/suggestions";
import type { AnalysisResult, ChatTurn } from "@/lib/analyze/types";
import { ApiRequestError, sendChat } from "@/components/analyzer/api";
import { IconSend, IconSpark } from "@/components/analyzer/ui";

export interface ChatHandle {
  ask: (question: string) => void;
}

interface Bubble extends ChatTurn {
  source?: "claude" | "fallback";
  failed?: boolean;
}

export function ChatPanel({ result, handle }: { result: AnalysisResult; handle: Ref<ChatHandle> }) {
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
      const reply = await sendChat(result.id, message, history, controller.signal);
      setMessages((current) => [...current, { role: "assistant", content: reply.reply, source: reply.source }]);
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
    <section
      id="chat"
      aria-label="Chat about this paper"
      className="flex h-[36rem] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-xl shadow-indigo-500/10 backdrop-blur lg:h-[calc(100vh-7rem)] dark:border-white/10 dark:bg-slate-900/70"
    >
      <header className="flex items-center gap-3 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-4 py-3 text-white">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-white/20"><IconSpark className="h-5 w-5" /></span>
        <div>
          <h2 className="text-sm font-semibold">Ask TrustLens</h2>
          <p className="text-xs text-white/80">Answers come from this report and the paper’s text</p>
        </div>
      </header>

      <div ref={listRef} role="log" aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-slate-100 px-3.5 py-2.5 text-sm leading-relaxed dark:bg-white/10">
          Hi! I’ve read <span className="font-medium">{result.file.name}</span>. Ask me what’s missing, whether the legal authorities still hold, or how to fix a gap.
        </div>
        {messages.map((message, index) => (
          <div key={index} className={`animate-pop flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                message.role === "user"
                  ? "rounded-tr-sm bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white"
                  : message.failed
                    ? "rounded-tl-sm bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30"
                    : "rounded-tl-sm bg-slate-100 dark:bg-white/10"
              }`}
            >
              {message.content}
              {message.source === "fallback" ? <span className="mt-1.5 block text-[11px] opacity-60">Answered from the computed checks (AI unavailable)</span> : null}
            </div>
          </div>
        ))}
        {sending ? (
          <div className="flex" role="status" aria-label="TrustLens is typing">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 dark:bg-white/10">
              {[0, 150, 300].map((delay) => (
                <span key={delay} className="animate-dot h-2 w-2 rounded-full bg-indigo-500" style={{ animationDelay: `${delay}ms` }} />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-200/80 p-3 dark:border-white/10">
        {!sending ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {suggestions.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => void send(question)}
                className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/30 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-200"
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
          <label htmlFor="chat-input" className="sr-only">Your question</label>
          <textarea
            id="chat-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={CHAT_CONFIG.maxMessageChars}
            placeholder="Ask about gaps, citations, similarity…"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 dark:border-white/15 dark:bg-white/5"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label="Send message"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white shadow-md transition enabled:hover:scale-105 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/40"
          >
            <IconSend className="h-4 w-4" />
          </button>
        </form>
        <p className="mt-2 text-center text-[11px] text-slate-400">AI can make mistakes. Indicators need editorial judgement; not legal advice.</p>
      </div>
    </section>
  );
}
