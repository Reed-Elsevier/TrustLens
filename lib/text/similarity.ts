/** Lightweight text similarity helpers: TF-IDF + cosine ranking and word-shingle containment. */

const STOPWORDS = new Set(
  "the and for are but not you all any can had her was one our out has have been from that this with they will would there their what which when where who whom than then them these those into over such only also its were being does did about after before between both each more most other some very just may might must shall should could while because under again further once here how why".split(" "),
);

export function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

export function tokenize(text: string): string[] {
  return words(text).filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

export function shingles(tokens: string[], size: number): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i + size <= tokens.length; i++) result.add(tokens.slice(i, i + size).join(" "));
  return result;
}

/** Share of the query's shingles that also occur in the candidate (0..1). */
export function containment(query: Set<string>, candidate: Set<string>): number {
  if (query.size === 0) return 0;
  let shared = 0;
  for (const item of query) if (candidate.has(item)) shared++;
  return shared / query.size;
}

interface IndexedDoc {
  id: string;
  weights: Map<string, number>;
  norm: number;
}

export interface TfIdfIndex {
  idf: Map<string, number>;
  docs: IndexedDoc[];
  size: number;
}

function termFrequencies(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

function weigh(counts: Map<string, number>, idf: (term: string) => number): { weights: Map<string, number>; norm: number } {
  const weights = new Map<string, number>();
  let squares = 0;
  for (const [term, count] of counts) {
    const weight = (1 + Math.log(count)) * idf(term);
    weights.set(term, weight);
    squares += weight * weight;
  }
  return { weights, norm: Math.sqrt(squares) };
}

export function buildIndex(docs: { id: string; text: string }[]): TfIdfIndex {
  const counted = docs.map((doc) => ({ id: doc.id, counts: termFrequencies(tokenize(doc.text)) }));
  const documentFrequency = new Map<string, number>();
  for (const { counts } of counted) for (const term of counts.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  const size = docs.length;
  const idf = new Map<string, number>();
  for (const [term, df] of documentFrequency) idf.set(term, Math.log((size + 1) / (df + 1)) + 1);
  return {
    idf,
    size,
    docs: counted.map(({ id, counts }) => ({ id, ...weigh(counts, (term) => idf.get(term) ?? 1) })),
  };
}

/** Ranks indexed documents by cosine similarity to the query, best first, dropping zero scores. */
export function rank(index: TfIdfIndex, query: string, limit: number): { id: string; score: number }[] {
  const unseen = Math.log(index.size + 1) + 1;
  const { weights: queryWeights, norm: queryNorm } = weigh(termFrequencies(tokenize(query)), (term) => index.idf.get(term) ?? unseen);
  if (queryNorm === 0) return [];
  const scored: { id: string; score: number }[] = [];
  for (const doc of index.docs) {
    if (doc.norm === 0) continue;
    let dot = 0;
    for (const [term, weight] of queryWeights) {
      const other = doc.weights.get(term);
      if (other !== undefined) dot += weight * other;
    }
    if (dot > 0) scored.push({ id: doc.id, score: dot / (queryNorm * doc.norm) });
  }
  return scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
}

/** Splits text into roughly equal passages on line boundaries. */
export function splitChunks(text: string, targetChars = 700): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    current = current ? `${current} ${trimmed}` : trimmed;
    if (current.length >= targetChars) {
      chunks.push(current);
      current = "";
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function topChunks(query: string, chunks: string[], limit: number): string[] {
  if (chunks.length === 0) return [];
  const index = buildIndex(chunks.map((text, position) => ({ id: String(position), text })));
  return rank(index, query, limit).map(({ id }) => chunks[Number(id)]);
}
