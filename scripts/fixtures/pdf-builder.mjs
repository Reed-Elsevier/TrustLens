// Dependency-free text PDF writer used for fixtures and tests (ASCII text, Helvetica, US Letter).
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const LINE_HEIGHT = 14;
const CHARS_PER_LINE = 92;

function wrap(text) {
  const lines = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && line.length + word.length + 1 > CHARS_PER_LINE) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
  }
  return lines;
}

const escapeText = (value) => value.replace(/[^\x20-\x7e]/g, "?").replace(/([\\()])/g, "\\$1");

/** Builds a PDF Buffer from plain text; blank lines are preserved and long lines are wrapped. */
export function buildPdf(text, { title = "Untitled" } = {}) {
  const linesPerPage = Math.floor((PAGE_HEIGHT - 2 * MARGIN) / LINE_HEIGHT);
  const lines = wrap(text);
  const pages = [];
  for (let i = 0; i < lines.length; i += linesPerPage) pages.push(lines.slice(i, i + linesPerPage));
  if (pages.length === 0) pages.push([""]);

  const objects = [];
  const add = (body) => objects.push(body) && objects.length;
  const catalog = add("");
  const pagesRoot = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const info = add(`<< /Title (${escapeText(title)}) /Producer (TrustLens fixture builder) >>`);
  const pageIds = [];
  for (const pageLines of pages) {
    const stream = `BT /F1 10 Tf ${LINE_HEIGHT} TL ${MARGIN} ${PAGE_HEIGHT - MARGIN} Td ${pageLines
      .map((line) => `(${escapeText(line)}) Tj T*`)
      .join(" ")} ET`;
    const content = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesRoot} 0 R >>`;
  objects[pagesRoot - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let output = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(output, "latin1"));
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(output, "latin1");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(output, "latin1");
}
