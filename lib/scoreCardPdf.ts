import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";

import {
  SCORE_CARD_GROUPS,
  SCORE_CARD_LEGEND,
  SCORE_CARD_PREFIX_RULE,
  type ScoreCardData,
} from "@/lib/scoreCard";

// A4 landscape — 14 write-in columns need the width.
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 30;
const CONTENT_W = PAGE_W - MARGIN * 2;

const INK = rgb(0.07, 0.09, 0.15);
const MUTED = rgb(0.45, 0.48, 0.55);
const RULE = rgb(0.78, 0.8, 0.84);
const HAIRLINE = rgb(0.88, 0.89, 0.92);
const BAND = rgb(0.95, 0.96, 0.97);
const HEAD = rgb(0.06, 0.48, 0.32);

const NAME_W = 132;

// Column widths come from each group's `units` share; see lib/scoreCard.ts.
const GROUP_UNITS = SCORE_CARD_GROUPS.map((g) => g.units);
const TOTAL_UNITS = GROUP_UNITS.reduce((a, b) => a + b, 0);
const UNIT_W = (CONTENT_W - NAME_W) / TOTAL_UNITS;

// The standard fonts are WinAnsi-encoded and throw on anything outside it.
// Player names come from the CRM, so fold the smart punctuation people paste in
// and drop whatever is left rather than failing the whole render.
function wa(input: string | null | undefined): string {
  if (!input) return "";
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "’" || ch === "‘") out += "'";
    else if (ch === "“" || ch === "”") out += '"';
    else if (ch === "–" || ch === "—") out += "-";
    else if (code >= 32 && code <= 126) out += ch;
    else if (code >= 160 && code <= 255) out += ch;
  }
  return out;
}

// Shrink a header until it fits rather than eliding text the coach needs.
function fitSize(
  text: string,
  font: PDFFont,
  size: number,
  min: number,
  max: number
): number {
  let s = size;
  while (s > min && font.widthOfTextAtSize(wa(text), s) > max) s -= 0.25;
  return s;
}

// Player names can be genuinely long, so those do get elided.
function clip(text: string, font: PDFFont, size: number, max: number): string {
  let t = wa(text);
  if (font.widthOfTextAtSize(t, size) <= max) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + "...", size) > max) {
    t = t.slice(0, -1);
  }
  return t + "...";
}

// Wrap into at most `maxLines`; the last line is elided if it still overflows.
function wrapLines(
  text: string, font: PDFFont, size: number, max: number, maxLines: number
): string[] {
  const words = wa(text).split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= max) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines) {
    lines[maxLines - 1] = clip(lines[maxLines - 1], font, size, max);
  }
  return lines;
}

function centred(
  page: ReturnType<PDFDocument["addPage"]>,
  text: string,
  font: PDFFont,
  size: number,
  x: number,
  w: number,
  y: number,
  color: ReturnType<typeof rgb>
) {
  const s = fitSize(text, font, size, 5.5, w - 4);
  const t = wa(text);
  page.drawText(t, {
    x: x + (w - font.widthOfTextAtSize(t, s)) / 2,
    y,
    size: s,
    font,
    color,
  });
}

export async function buildScoreCardPdf(
  data: ScoreCardData
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);

  const today = new Date().toLocaleDateString("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  let y = PAGE_H - MARGIN;

  // ---- title block -------------------------------------------------------
  // COACH_LABELS already carries the "Coach " prefix.
  page.drawText(wa(`Score Card - ${data.coachLabel}`), {
    x: MARGIN,
    y: y - 15,
    size: 16,
    font: bold,
    color: INK,
  });
  page.drawText(wa(today), {
    x: PAGE_W - MARGIN - reg.widthOfTextAtSize(wa(today), 9),
    y: y - 12,
    size: 9,
    font: reg,
    color: MUTED,
  });
  y -= 30;
  page.drawText(
    wa(
      `${data.players.length} player${data.players.length === 1 ? "" : "s"} trained in the last 6 weeks` +
        `   -   leave a cell blank if the drill was not run (a zero holds the player's level down)`
    ),
    { x: MARGIN, y, size: 8.5, font: reg, color: MUTED }
  );
  y -= 14;

  if (data.players.length === 0) {
    page.drawText(wa("No players trained in the last six weeks."), {
      x: MARGIN,
      y: y - 20,
      size: 11,
      font: reg,
      color: MUTED,
    });
    return doc.save();
  }

  // ---- geometry: always one page ----------------------------------------
  const H1 = 17; // group header row
  const H2 = 15; // sub-label row
  const tableTop = y - 6;
  const bodyTop = tableTop - H1 - H2;
  // The legend is reserved out of the page before the rows are sized, so the
  // table shrinks to make room rather than the key being pushed off the page.
  const LEGEND_H = 80;
  const available = bodyTop - MARGIN - LEGEND_H;
  // Fill what's left, but don't let a two-player card get absurdly tall rows.
  const rowH = Math.max(14, Math.min(46, available / data.players.length));
  const bodyH = rowH * data.players.length;
  const bodyBottom = bodyTop - bodyH;

  // ---- header ------------------------------------------------------------
  page.drawRectangle({
    x: MARGIN,
    y: bodyTop,
    width: CONTENT_W,
    height: H1 + H2,
    color: BAND,
  });
  page.drawText("PLAYER", {
    x: MARGIN + 6,
    y: bodyTop + (H1 + H2) / 2 - 3,
    size: 8,
    font: bold,
    color: INK,
  });

  // Column geometry, resolved once: the bands have to be painted before any
  // vertical rule, or they cover the cell dividers on every other row.
  const groupX: number[] = [];
  {
    let gx = MARGIN + NAME_W;
    for (let i = 0; i < SCORE_CARD_GROUPS.length; i++) {
      groupX.push(gx);
      gx += UNIT_W * GROUP_UNITS[i];
    }
  }

  SCORE_CARD_GROUPS.forEach((g, gi) => {
    const gw = UNIT_W * GROUP_UNITS[gi];
    const cw = gw / g.cells.length;
    centred(page, g.test, bold, 8.5, groupX[gi], gw, tableTop - H1 + 5, HEAD);
    g.cells.forEach((c, i) =>
      centred(page, c, reg, 7, groupX[gi] + cw * i, cw, bodyTop + 5, MUTED)
    );
  });

  // ---- body --------------------------------------------------------------
  const nameSize = Math.min(10, Math.max(7, rowH * 0.34));
  data.players.forEach((p, i) => {
    const top = bodyTop - rowH * i;
    if (i % 2 === 1) {
      page.drawRectangle({
        x: MARGIN,
        y: top - rowH,
        width: CONTENT_W,
        height: rowH,
        color: BAND,
      });
    }
    page.drawText(clip(p.name, reg, nameSize, NAME_W - 12), {
      x: MARGIN + 6,
      y: top - rowH / 2 - nameSize * 0.35,
      size: nameSize,
      font: reg,
      color: INK,
    });
    if (i > 0) {
      page.drawLine({
        start: { x: MARGIN, y: top },
        end: { x: PAGE_W - MARGIN, y: top },
        thickness: 0.5,
        color: RULE,
      });
    }
  });

  // ---- column rules (over the bands) -------------------------------------
  SCORE_CARD_GROUPS.forEach((g, gi) => {
    const gw = UNIT_W * GROUP_UNITS[gi];
    const cw = gw / g.cells.length;
    for (let i = 1; i < g.cells.length; i++) {
      page.drawLine({
        start: { x: groupX[gi] + cw * i, y: bodyBottom },
        end: { x: groupX[gi] + cw * i, y: bodyTop },
        thickness: 0.4,
        color: HAIRLINE,
      });
    }
    page.drawLine({
      start: { x: groupX[gi], y: bodyBottom },
      end: { x: groupX[gi], y: tableTop },
      thickness: 1,
      color: RULE,
    });
  });

  // ---- frame -------------------------------------------------------------
  page.drawRectangle({
    x: MARGIN,
    y: bodyBottom,
    width: CONTENT_W,
    height: H1 + H2 + bodyH,
    borderColor: RULE,
    borderWidth: 1,
  });
  page.drawLine({
    start: { x: MARGIN, y: bodyTop },
    end: { x: PAGE_W - MARGIN, y: bodyTop },
    thickness: 1,
    color: RULE,
  });
  page.drawLine({
    start: { x: MARGIN, y: tableTop - H1 },
    end: { x: PAGE_W - MARGIN, y: tableTop - H1 },
    thickness: 0.5,
    color: HAIRLINE,
  });
  page.drawLine({
    start: { x: MARGIN + NAME_W, y: bodyBottom },
    end: { x: MARGIN + NAME_W, y: tableTop },
    thickness: 1,
    color: RULE,
  });

  // ---- legend ------------------------------------------------------------
  // Four columns, two rows: unit first, then which drill applies at which
  // level and any scoring rule the column header can't carry.
  const legendTop = bodyBottom - 16;
  page.drawText(wa("WHAT TO WRITE IN EACH CELL"), {
    x: MARGIN, y: legendTop, size: 7, font: bold, color: HEAD,
  });

  // The level-prefix rule spans the full width above the per-test key.
  const ruleLines = wrapLines(SCORE_CARD_PREFIX_RULE, reg, 6.2, CONTENT_W, 2);
  ruleLines.forEach((ln, i) => {
    page.drawText(ln, {
      x: MARGIN, y: legendTop - 10 - i * 7.5, size: 6.2, font: reg, color: INK,
    });
  });
  const keyTop = legendTop - 10 - ruleLines.length * 7.5 - 4;

  const LCOLS = 4;
  const colW = CONTENT_W / LCOLS;
  SCORE_CARD_LEGEND.forEach((l, i) => {
    const lx = MARGIN + colW * (i % LCOLS);
    const ly = keyTop - Math.floor(i / LCOLS) * 25;
    page.drawText(clip(`${l.test} - ${l.unit}`, bold, 6.5, colW - 10), {
      x: lx, y: ly, size: 6.5, font: bold, color: INK,
    });
    wrapLines(l.note, reg, 5.8, colW - 10, 2).forEach((ln, j) => {
      page.drawText(ln, {
        x: lx, y: ly - 7.5 - j * 7, size: 5.8, font: reg, color: MUTED,
      });
    });
  });

  return doc.save();
}
