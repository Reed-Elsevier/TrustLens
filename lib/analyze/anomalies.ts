import type { Anomaly, AnomalyKind } from "@/lib/analyze/types";
import { words } from "@/lib/text/similarity";

// Phrases documented as machine-paraphrase artefacts of standard terms (Cabanac, Labbé & Magazinov, 2021).
const TORTURED_PHRASES = [
  "counterfeit consciousness",
  "profound learning",
  "irregular woodland",
  "colossal information",
  "bosom peril",
  "flag to commotion",
  "fake neural organization",
  "haze figuring",
  "enormous information",
  "mean square mistake",
];

const RULES: { kind: AnomalyKind; label: string; patterns: RegExp[] }[] = [
  {
    kind: "tortured_phrase",
    label: "Tortured phrases (machine-paraphrased terminology)",
    patterns: TORTURED_PHRASES.map((phrase) => new RegExp(`\\b${phrase.replace(/ /g, "\\s+")}\\b`, "gi")),
  },
  {
    kind: "llm_artifact",
    label: "Chatbot output left in the text",
    patterns: [
      /as an ai language model/gi,
      /regenerate response/gi,
      /as of my (?:last )?knowledge (?:cutoff|update)/gi,
      /i(?:'|’)?m sorry, but i (?:cannot|can(?:'|’)?t)/gi,
      /\bcertainly! here(?:'|’)?s\b/gi,
    ],
  },
  {
    kind: "reviewer_manipulation",
    label: "Text aimed at manipulating reviewers or AI tools",
    patterns: [
      /ignore (?:all |any )?(?:previous|prior|above|earlier) (?:instructions|prompts)/gi,
      /(?:give|write|provide|recommend) (?:this paper |the paper |this manuscript )?(?:a |an )?(?:positive|favou?rable|glowing|excellent) review/gi,
      /do not (?:mention|point out|flag|report) (?:any )?(?:weakness(?:es)?|flaws?|limitations?|problems?)/gi,
      /\bsystem prompt\b/gi,
    ],
  },
  {
    kind: "placeholder",
    label: "Unfinished placeholder text",
    patterns: [/lorem ipsum/gi, /\[(?:insert|todo|tbd)[^\]]{0,40}\]/gi, /\bTODO\b/g],
  },
];

function excerpt(text: string, index: number, length = 140): string {
  const start = Math.max(0, index - 40);
  return text.slice(start, start + length).replace(/\s+/g, " ").trim();
}

function internalDuplicates(text: string): { count: number; example: string } {
  const seen = new Map<string, number>();
  let example = "";
  let count = 0;
  for (const sentence of text.replace(/\n/g, " ").split(/(?<=[.!?])\s+/)) {
    if (words(sentence).length < 12) continue;
    const key = words(sentence).join(" ");
    const times = (seen.get(key) ?? 0) + 1;
    seen.set(key, times);
    if (times > 1) {
      count++;
      example ||= sentence.trim().slice(0, 140);
    }
  }
  return { count, example };
}

/** Pattern-based red flags. These are indicators for editorial follow-up, never proof of misconduct. */
export function detectAnomalies(text: string): Anomaly[] {
  const anomalies: Anomaly[] = [];
  for (const rule of RULES) {
    let count = 0;
    let example = "";
    for (const pattern of rule.patterns) {
      for (const match of text.matchAll(pattern)) {
        count++;
        example ||= excerpt(text, match.index ?? 0);
      }
    }
    if (count > 0) anomalies.push({ kind: rule.kind, label: rule.label, count, example });
  }
  const duplicates = internalDuplicates(text);
  if (duplicates.count > 0) {
    anomalies.push({ kind: "duplicate_text", label: "Sentences repeated verbatim within the paper", count: duplicates.count, example: duplicates.example });
  }
  return anomalies;
}
