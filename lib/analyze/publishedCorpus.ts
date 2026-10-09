import type Database from "better-sqlite3";
import { buildIndex, type TfIdfIndex } from "@/lib/text/similarity";

export interface PublishedPaper {
  title: string | null;
  doi: string | null;
  abstract: string;
}

interface Corpus {
  index: TfIdfIndex;
  papers: Map<string, PublishedPaper>;
}

const corpusCache = new WeakMap<Database.Database, Corpus>();

export function loadPublishedCorpus(database: Database.Database): Corpus {
  const cached = corpusCache.get(database);
  if (cached) return cached;
  const table = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'research_papers_published'").get();
  const rows = table
    ? database.prepare("SELECT paper_id, title, doi, abstract FROM research_papers_published WHERE abstract IS NOT NULL AND LENGTH(TRIM(abstract)) > 0").all() as (PublishedPaper & { paper_id: string })[]
    : [];
  const corpus: Corpus = {
    index: buildIndex(rows.map((row) => ({ id: row.paper_id, text: `${row.title ?? ""} ${row.abstract}` }))),
    papers: new Map(rows.map((row) => [row.paper_id, { title: row.title, doi: row.doi, abstract: row.abstract }])),
  };
  corpusCache.set(database, corpus);
  return corpus;
}
