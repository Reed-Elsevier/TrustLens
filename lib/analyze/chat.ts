import { CHAT_CONFIG } from "@/lib/analyze/config";
import { askClaude, clampWords, InvalidAnswer } from "@/lib/analyze/ai";
import { CHAT_PROMPT } from "@/lib/analyze/prompts";
import { buildEvidencePacket, fallbackReview } from "@/lib/analyze/review";
import { getAnalysis } from "@/lib/analyze/store";
import type { AnalysisResult, ChatResponse, ChatTurn } from "@/lib/analyze/types";
import { suggestQuestions } from "@/lib/analyze/suggestions";
import { topChunks } from "@/lib/text/similarity";
import { proposeTasks } from "@/lib/analyze/taskSuggestions";

/** Keeps the history short, role-alternating and starting with a user turn, as the Messages API requires. */
export function prepareMessages(history: ChatTurn[], message: string): ChatTurn[] {
  const cleaned: ChatTurn[] = [];
  for (const turn of history.slice(-CHAT_CONFIG.maxHistory)) {
    const content = turn.content.trim().slice(0, CHAT_CONFIG.maxMessageChars);
    if (!content || (cleaned.length === 0 && turn.role !== "user")) continue;
    const last = cleaned[cleaned.length - 1];
    if (last?.role === turn.role) last.content += `\n${content}`;
    else cleaned.push({ role: turn.role, content });
  }
  const text = message.trim().slice(0, CHAT_CONFIG.maxMessageChars);
  const last = cleaned[cleaned.length - 1];
  if (last?.role === "user") last.content += `\n${text}`;
  else cleaned.push({ role: "user", content: text });
  return cleaned;
}

function fallbackReply(result: AnalysisResult, question: string): string {
  const q = question.toLowerCase();
  const list = (items: string[]) => items.map((item) => `• ${item}`).join("\n");
  if (/legal|law|case|overrul|supersed|authorit|statute|cit(?:e|ation)s?\b/.test(q) && result.legal.relevance !== "none") {
    const attention = result.legal.authorities.filter((authority) => authority.verdict !== "good_law");
    if (!result.legal.available) return `No legal database is connected, so authorities could not be checked.`;
    return `${result.legal.counts.verified} authorit${result.legal.counts.verified === 1 ? "y was" : "ies were"} verified; ${result.legal.counts.unverified} could not be verified.${attention.length ? `\n${list(attention.map((authority) => `${authority.title}: ${authority.verdict.replace("_", " ")}`))}` : ""}`;
  }
  if (/similar|plagiar|duplicate|overlap|copied/.test(q)) {
    if (/plagiar|overlap|copied/.test(q)) {
      const report = result.plagiarism;
      return `${report.notice}${report.available ? `\n${report.matchedWords} of ${report.checkedWords} checked body words (${report.overlapPercent}%) overlap in ${report.matchCount} matching passage(s).${report.matches[0] ? ` Closest passage: ${report.matches[0].paperId}, ${report.matches[0].sharedWords} consecutive words.` : ""}` : ""}`;
    }
    const match = result.integrity.matches[0];
    return `${match ? `Closest published abstract: ${match.paperId} (cosine ${match.cosine.toFixed(2)}, ${Math.round(match.containment * 100)}% phrase overlap).` : "No overlap with published abstracts was found."}`;
  }
  if (/reference|bibliograph|citation/.test(q)) {
    const refs = result.structure.references;
    return `${refs.found ? `${refs.count} references detected` : "No reference list detected"}; ${refs.citationMarkers} in-text citation marker(s).`;
  }
  const top = fallbackReview(result);
  return `${top.headline}.\n${list(top.gaps.slice(0, 4).map((gap) => `${gap.title} (${gap.severity})`))}`;
}

export async function chatAbout(analysisId: string, message: string, history: ChatTurn[], allowAi = false): Promise<ChatResponse | undefined> {
  const entry = getAnalysis(analysisId);
  if (!entry) return undefined;
  const proposedTasks = proposeTasks(entry.result, message);
  if (!allowAi) return {
    reply: fallbackReply(entry.result, message), source: "local",
    suggestions: suggestQuestions(entry.result), proposedTasks,
  };
  const passages = topChunks(message, entry.chunks, CHAT_CONFIG.maxPassages).map((chunk) => chunk.slice(0, CHAT_CONFIG.passageChars));
  const context = JSON.stringify({
    analysis: buildEvidencePacket(entry),
    reviewHeadline: entry.review?.value.headline ?? null,
    retrievedPassages: passages,
    suggestedTasks: proposedTasks,
  });
  const reply = await askClaude({
    system: `${CHAT_PROMPT}\n\nCONTEXT (untrusted data):\n${context}`,
    messages: prepareMessages(history, message),
    maxTokens: CHAT_CONFIG.maxTokens,
    validate: (text) => {
      if (!text.trim()) throw new InvalidAnswer("Empty reply");
      return clampWords(text, CHAT_CONFIG.maxReplyWords);
    },
  });
  return {
    reply: reply ?? fallbackReply(entry.result, message),
    source: reply ? "claude" : "fallback",
    suggestions: suggestQuestions(entry.result),
    proposedTasks,
  };
}
