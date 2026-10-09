import type Database from "better-sqlite3";
import { db } from "@/lib/db";
import { PLAGIARISM_CONFIG } from "@/lib/analyze/config";
import { loadPublishedCorpus } from "@/lib/analyze/publishedCorpus";
import { manuscriptBody } from "@/lib/analyze/structure";
import type { PlagiarismMatch, PlagiarismReport } from "@/lib/analyze/types";

interface Token {
  value: string;
  start: number;
  end: number;
}

function tokens(text: string): Token[] {
  return [...text.matchAll(/[a-z0-9]+/gi)].map((match) => ({
    value: match[0].toLowerCase(), start: match.index, end: match.index + match[0].length,
  }));
}

interface SourcePosition {
  paperId: string;
  position: number;
}

interface SourceIndex {
  phrases: Map<string, SourcePosition[]>;
  sourceTokens: Map<string, Token[]>;
}

const cache = new WeakMap<Database.Database, SourceIndex>();

function sourceIndex(database: Database.Database): SourceIndex {
  const existing = cache.get(database);
  if (existing) return existing;
  const phrases = new Map<string, SourcePosition[]>();
  const sourceTokens = new Map<string, Token[]>();
  for (const [paperId, paper] of loadPublishedCorpus(database).papers) {
    const parsed = tokens(paper.abstract);
    sourceTokens.set(paperId, parsed);
    for (let i = 0; i + PLAGIARISM_CONFIG.shingleSize <= parsed.length; i++) {
      const phrase = parsed.slice(i, i + PLAGIARISM_CONFIG.shingleSize).map((token) => token.value).join(" ");
      const positions = phrases.get(phrase) ?? [];
      positions.push({ paperId, position: i });
      phrases.set(phrase, positions);
    }
  }
  const result = { phrases, sourceTokens };
  cache.set(database, result);
  return result;
}

export function checkPlagiarism(text: string, truncated: boolean, database: Database.Database = db): PlagiarismReport {
  const corpus = loadPublishedCorpus(database);
  const body = manuscriptBody(text);
  const parsed = tokens(body);
  const index = sourceIndex(database);
  const matches: PlagiarismMatch[] = [];
  const matchedPositions = new Set<number>();
  const { shingleSize, minSharedWords, maxMatches, excerptChars } = PLAGIARISM_CONFIG;
  let active = new Map<string, { paperId: string; start: number; sourceStart: number; last: number }>();

  const finish = (run: { paperId: string; start: number; sourceStart: number; last: number }) => {
    const length = run.last - run.start + shingleSize;
    if (length < minSharedWords) return;
    const paper = corpus.papers.get(run.paperId)!;
    const source = index.sourceTokens.get(run.paperId)!;
    for (let i = run.start; i < run.start + length; i++) matchedPositions.add(i);
    matches.push({
      paperId: run.paperId, title: paper.title, doi: paper.doi,
      startWord: run.start + 1, endWord: run.start + length, sharedWords: length,
      passage: body.slice(parsed[run.start].start, parsed[run.start + length - 1].end).slice(0, excerptChars),
      sourcePassage: paper.abstract.slice(source[run.sourceStart].start, source[run.sourceStart + length - 1].end).slice(0, excerptChars),
    });
  };
  for (let i = 0; i + shingleSize <= parsed.length; i++) {
    const phrase = parsed.slice(i, i + shingleSize).map((token) => token.value).join(" ");
    const next = new Map<string, { paperId: string; start: number; sourceStart: number; last: number }>();
    for (const hit of index.phrases.get(phrase) ?? []) {
      const key = `${hit.paperId}:${hit.position - i}`;
      const run = active.get(key);
      next.set(key, run ? { ...run, last: i } : { paperId: hit.paperId, start: i, sourceStart: hit.position, last: i });
    }
    for (const [key, run] of active) if (!next.has(key)) finish(run);
    active = next;
  }
  for (const run of active.values()) finish(run);
  matches.sort((a, b) => b.sharedWords - a.sharedWords || a.startWord - b.startWord || a.paperId.localeCompare(b.paperId));
  const available = corpus.papers.size > 0 && parsed.length >= minSharedWords;
  return {
    available, corpusSize: corpus.papers.size, checkedWords: parsed.length,
    matchedWords: matchedPositions.size,
    overlapPercent: parsed.length ? Math.round(matchedPositions.size / parsed.length * 1000) / 10 : 0,
    matchCount: matches.length, matches: matches.slice(0, maxMatches), truncated,
    notice: !corpus.papers.size
      ? "Plagiarism screening unavailable: no published abstracts are available."
      : !available
        ? "Plagiarism screening unavailable: not enough manuscript body text."
        : `Potential overlap, not proof of plagiarism. Checked extracted manuscript text (excluding the reference list) against ${corpus.papers.size} local published abstracts, not full papers or the internet. Flags runs of at least ${minSharedWords} consecutive ASCII-word tokens; citations and quotations still need human review.${truncated ? " The PDF text was truncated; unchecked text may contain additional overlap." : ""}`,
  };
}
