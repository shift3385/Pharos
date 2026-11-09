// The small Markdown subset the manual's prose uses (MAN-01), to HTML for the
// PDF: paragraphs, `-`/`1.` lists, `>` notes, GFM tables (MAN-03, NC-044),
// **bold**, *italics*, `code`, [links](url) and <br>. Anything else is
// escaped as text.

export function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function inline(text) {
  const codes = [];
  let s = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `${codes.length - 1}`;
  });
  s = s
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${href}">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/&lt;br&gt;/g, "<br>");
  // Private-use characters mark where each `code` span goes back in.
  return s.replace(/(\d+)/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

/** The cells of a table row: split on «|» outside `code` (and not «\|»). */
export function tableCells(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells = [];
  let cell = "";
  let code = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && s[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (c === "`") {
      code = !code;
      cell += c;
    } else if (c === "|" && !code) {
      cells.push(cell.trim());
      cell = "";
    } else cell += c;
  }
  cells.push(cell.trim());
  return cells;
}

const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line);
const isTableRule = (line) => isTableRow(line) && tableCells(line).every((c) => /^:?-{3,}:?$/.test(c));

function tableHtml(rows) {
  const [head, , ...body] = rows.map(tableCells);
  const th = head.map((c) => `<th>${inline(c)}</th>`).join("");
  const trs = body.map((r) => `<tr>${head.map((_, i) => `<td>${inline(r[i] ?? "")}</td>`).join("")}</tr>`).join("");
  return `<table class="md-table"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

/** The first «| --- |» rule left as text in generated HTML, or null (NC-044). */
export function leftoverTable(html) {
  return /\|\s*:?-{3,}:?\s*\|/.exec(html)?.[0] ?? null;
}

export function markdownToHtml(md) {
  const out = [];
  let para = [];
  let list = null; // { tag, items: [{ text, sub: { tag, items: string[] } | null }] }
  let quote = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    const sub = (s) => (s ? `<${s.tag}>${s.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${s.tag}>` : "");
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i.text)}${sub(i.sub)}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote>${markdownToHtml(quote.join("\n"))}</blockquote>`);
    quote = [];
  };
  const lines = String(md).split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n];
    const line = raw.trimEnd();
    // A GFM table: a header row, a «| --- |» rule, then its rows.
    if (isTableRow(line) && n + 1 < lines.length && isTableRule(lines[n + 1])) {
      flushPara();
      flushList();
      flushQuote();
      const rows = [line, lines[n + 1]];
      n += 2;
      while (n < lines.length && isTableRow(lines[n])) rows.push(lines[n++]);
      n--;
      out.push(tableHtml(rows));
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      flushPara();
      flushList();
      quote.push(q[1]);
      continue;
    }
    flushQuote();
    const indented = /^\s{2,}/.test(raw);
    if ((bullet || numbered) && indented && list) {
      // One nested level (NC-046): an indented item belongs to the item above.
      const tag = bullet ? "ul" : "ol";
      const last = list.items[list.items.length - 1];
      if (!last.sub || last.sub.tag !== tag) last.sub = { tag, items: [] };
      last.sub.items.push((bullet ?? numbered)[1]);
    } else if (bullet || numbered) {
      flushPara();
      const tag = bullet ? "ul" : "ol";
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push({ text: (bullet ?? numbered)[1], sub: null });
    } else if (line.trim() === "") {
      flushPara();
      flushList();
    } else if (list && indented) {
      // A continuation line: of the nested item when there is one.
      const last = list.items[list.items.length - 1];
      if (last.sub && /^\s{4,}/.test(raw)) last.sub.items[last.sub.items.length - 1] += ` ${line.trim()}`;
      else last.text += ` ${line.trim()}`;
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  flushQuote();
  return out.join("\n");
}
