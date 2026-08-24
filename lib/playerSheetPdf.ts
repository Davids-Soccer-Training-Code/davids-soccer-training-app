import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

import type { PlayerSheetData, SheetTestRow } from "@/lib/playerPrintSheet";

// A4 in points, and a 14mm margin.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 39.7;
const CONTENT_W = PAGE_W - MARGIN * 2;
const CONTENT_BOTTOM = PAGE_H - MARGIN;

const INK = rgb(0.07, 0.09, 0.15);
const MUTED = rgb(0.45, 0.48, 0.55);
const FAINT = rgb(0.72, 0.74, 0.78);
const RULE = rgb(0.85, 0.86, 0.89);
const BAND = rgb(0.95, 0.96, 0.97);
const GOOD = rgb(0.09, 0.55, 0.28);
const BAD = rgb(0.75, 0.15, 0.15);
const WARN = rgb(0.72, 0.42, 0.03);

// The standard fonts are WinAnsi-encoded and throw on anything outside it.
// Player names and coach-written report text are free-form, so fold the smart
// punctuation people actually paste in and drop whatever is left.
const SUBSTITUTIONS: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'",
  "“": '"', "”": '"', "„": '"',
  "–": "-", "—": "-", "−": "-", "‐": "-", "‑": "-",
  "…": "...", " ": " ", "•": "-", "×": "x",
  "→": "->", "≤": "<=", "≥": ">=",
};

function wa(input: string | null | undefined): string {
  if (!input) return "";
  let out = "";
  for (const ch of input) {
    if (ch in SUBSTITUTIONS) {
      out += SUBSTITUTIONS[ch];
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (code === 9 || code === 10) {
      out += " ";
      continue;
    }
    if (code >= 32 && code <= 126) out += ch;
    else if (code >= 160 && code <= 255) out += ch;
  }
  return out;
}

type Ctx = {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
};

// Everything below measures y downward from the top margin; the page itself
// measures upward, so this is the single place the two meet.
function flip(y: number) {
  return PAGE_H - y;
}

function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}
) {
  const size = opts.size ?? 8;
  ctx.page.drawText(wa(value), {
    x,
    y: flip(y),
    size,
    font: opts.bold ? ctx.bold : ctx.font,
    color: opts.color ?? INK,
  });
}

function textRight(
  ctx: Ctx,
  value: string,
  right: number,
  y: number,
  opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}
) {
  const size = opts.size ?? 8;
  const font = opts.bold ? ctx.bold : ctx.font;
  const clean = wa(value);
  const width = font.widthOfTextAtSize(clean, size);
  text(ctx, value, right - width, y, opts);
}

function rule(ctx: Ctx, x: number, y: number, width: number, color = RULE) {
  ctx.page.drawLine({
    start: { x, y: flip(y) },
    end: { x: x + width, y: flip(y) },
    thickness: 0.6,
    color,
  });
}

function band(ctx: Ctx, x: number, y: number, width: number, height: number) {
  ctx.page.drawRectangle({
    x,
    y: flip(y + height),
    width,
    height,
    color: BAND,
  });
}

// Truncates to a single line, ending in "..." when it does not fit.
function ellipsize(
  font: PDFFont,
  value: string,
  size: number,
  maxWidth: number
): string {
  const clean = wa(value);
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  let lo = 0;
  let hi = clean.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${clean.slice(0, mid).trimEnd()}...`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${clean.slice(0, lo).trimEnd()}...`;
}

// Word wrap to at most maxLines, with the overflow marked on the final line.
function wrap(
  font: PDFFont,
  value: string,
  size: number,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = wa(value).split(/\s+/).filter(Boolean);
  if (!words.length || maxLines <= 0) return [];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }

  if (lines.length < maxLines && current) lines.push(current);

  const consumed = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (consumed < words.length && lines.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = ellipsize(font, `${last} ...`, size, maxWidth);
  }
  return lines;
}

function checkbox(ctx: Ctx, x: number, y: number, checked: boolean) {
  const size = 6;
  ctx.page.drawRectangle({
    x,
    y: flip(y),
    width: size,
    height: size,
    borderColor: checked ? GOOD : FAINT,
    borderWidth: 0.8,
    color: checked ? GOOD : undefined,
  });
  if (checked) {
    ctx.page.drawLine({
      start: { x: x + 1.4, y: flip(y) + 3 },
      end: { x: x + 2.6, y: flip(y) + 1.4 },
      thickness: 0.9,
      color: rgb(1, 1, 1),
    });
    ctx.page.drawLine({
      start: { x: x + 2.6, y: flip(y) + 1.4 },
      end: { x: x + 4.8, y: flip(y) + 4.6 },
      thickness: 0.9,
      color: rgb(1, 1, 1),
    });
  }
}

function ratingDots(ctx: Ctx, x: number, y: number, value: number | null) {
  for (let i = 0; i < 5; i += 1) {
    const filled = value !== null && i < value;
    ctx.page.drawCircle({
      x: x + i * 7 + 2.5,
      y: flip(y),
      size: 2.4,
      color: filled ? INK : undefined,
      borderColor: filled ? INK : FAINT,
      borderWidth: 0.7,
    });
  }
}

function dash(value: string | null | undefined) {
  const clean = (value ?? "").toString().trim();
  return clean || "-";
}

function fmtNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

// generatedAt is an instant, not a calendar day — resolve it in the gym's
// timezone so an evening print does not stamp tomorrow's date.
function fmtInstant(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function infoPair(
  ctx: Ctx,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number
) {
  text(ctx, label.toUpperCase(), x, y, { size: 5.6, color: MUTED });
  text(ctx, ellipsize(ctx.bold, value, 8, width), x, y + 8.5, {
    size: 8,
    bold: true,
  });
}

function drawHeader(ctx: Ctx, data: PlayerSheetData, photoImage: {
  width: number;
  height: number;
} | null, embedded: Parameters<PDFPage["drawImage"]>[0] | null, top: number) {
  const photoBox = 74;
  const infoX = MARGIN + photoBox + 14;
  const infoW = CONTENT_W - photoBox - 14;

  ctx.page.drawRectangle({
    x: MARGIN,
    y: flip(top + photoBox),
    width: photoBox,
    height: photoBox,
    borderColor: RULE,
    borderWidth: 0.8,
    color: BAND,
  });

  if (embedded && photoImage) {
    // Contain rather than cover — pdf-lib has no clipping, so a cover fit
    // would spill the photo over the rest of the header.
    const scale = Math.min(
      (photoBox - 4) / photoImage.width,
      (photoBox - 4) / photoImage.height
    );
    const w = photoImage.width * scale;
    const h = photoImage.height * scale;
    ctx.page.drawImage(embedded, {
      x: MARGIN + (photoBox - w) / 2,
      y: flip(top + photoBox - (photoBox - h) / 2) ,
      width: w,
      height: h,
    });
  } else {
    const initials = wa(data.player.name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
    const size = 26;
    const width = ctx.bold.widthOfTextAtSize(initials, size);
    text(ctx, initials, MARGIN + (photoBox - width) / 2, top + 46, {
      size,
      bold: true,
      color: FAINT,
    });
  }

  const nameW = infoW - 86;
  let nameSize = 17;
  while (
    nameSize > 11 &&
    ctx.bold.widthOfTextAtSize(wa(data.player.name), nameSize) > nameW
  ) {
    nameSize -= 0.5;
  }
  text(
    ctx,
    ellipsize(ctx.bold, data.player.name, nameSize, nameW),
    infoX,
    top + 15,
    { size: nameSize, bold: true }
  );
  textRight(
    ctx,
    `Printed ${fmtInstant(data.generatedAt)}`,
    MARGIN + CONTENT_W,
    top + 8,
    { size: 6.5, color: MUTED }
  );

  const colW = infoW / 3;
  const cols = [infoX, infoX + colW, infoX + colW * 2];
  const rowY = [top + 28, top + 51];

  const ageParts = [
    data.player.age !== null ? `${data.player.age} yrs` : null,
    data.player.ageGroup,
  ].filter(Boolean);

  infoPair(ctx, "Age", dash(ageParts.join(" / ")), cols[0], rowY[0], colW - 8);
  infoPair(
    ctx,
    "Team",
    dash(data.player.teamLevel),
    cols[1],
    rowY[0],
    colW - 8
  );
  infoPair(
    ctx,
    "Position",
    dash(
      [data.player.primaryPosition, data.player.secondaryPosition]
        .filter(Boolean)
        .join(" / ")
    ),
    cols[2],
    rowY[0],
    colW - 8
  );

  infoPair(
    ctx,
    "Birthdate",
    dash(data.player.birthdate ? fmtDate(data.player.birthdate) : null),
    cols[0],
    rowY[1],
    colW - 8
  );
  infoPair(
    ctx,
    "Location / Shirt",
    dash(
      [data.player.location, data.player.shirtSize].filter(Boolean).join(" / ")
    ),
    cols[1],
    rowY[1],
    colW - 8
  );
  infoPair(
    ctx,
    "Dominant Foot",
    dash(data.player.dominantFoot),
    cols[2],
    rowY[1],
    colW - 8
  );

  rule(ctx, infoX, top + 68, infoW);

  const contact = [data.parent.phone, data.parent.email]
    .filter(Boolean)
    .join("  |  ");
  text(ctx, "PARENT", infoX, top + 78, { size: 5.6, color: MUTED });
  text(
    ctx,
    ellipsize(ctx.bold, dash(data.parent.name), 8.5, infoW),
    infoX + 34,
    top + 78,
    { size: 8.5, bold: true }
  );
  text(
    ctx,
    ellipsize(ctx.font, dash(contact), 7.5, infoW),
    infoX,
    top + 88.5,
    { size: 7.5, color: MUTED }
  );
  if (data.parent.secondaryName) {
    text(
      ctx,
      ellipsize(ctx.font, `2nd contact: ${data.parent.secondaryName}`, 7, infoW),
      infoX,
      top + 97.5,
      { size: 7, color: MUTED }
    );
  }

  return top + Math.max(photoBox, 104) + 12;
}

function testFlag(row: SheetTestRow): { label: string; color: ReturnType<typeof rgb> } {
  if (row.atMax) return { label: "MAX", color: GOOD };
  if (!row.tested) return { label: "NOT TESTED", color: WARN };
  if (row.gap !== null) return { label: `-${fmtNumber(row.gap)}`, color: BAD };
  return { label: "NO DATA", color: WARN };
}

function drawTests(ctx: Ctx, data: PlayerSheetData, top: number, width: number) {
  const cTest = MARGIN;
  const cNow = MARGIN + 84;
  const cBest = MARGIN + 110;
  const cNeeds = MARGIN + 156;
  const cFlagRight = MARGIN + width;
  const needsW = cFlagRight - cNeeds - 50;
  const testW = cNow - cTest - 4;

  text(ctx, "THE 8 TESTS - THE NEXT LEVEL IN EACH", cTest, top + 8, {
    size: 8.5,
    bold: true,
  });

  let y = top + 21;
  text(ctx, "TEST", cTest, y, { size: 5.6, color: MUTED });
  text(ctx, "LEVEL", cNow, y, { size: 5.6, color: MUTED });
  text(ctx, "BEST", cBest, y, { size: 5.6, color: MUTED });
  text(ctx, "TO REACH IT", cNeeds, y, { size: 5.6, color: MUTED });
  textRight(ctx, "GAP", cFlagRight, y, { size: 5.6, color: MUTED });
  y += 3.5;
  rule(ctx, cTest, y, width);

  const rowH = 15.5;
  for (const row of data.tests) {
    y += rowH;
    const flag = testFlag(row);
    // Only a maxed-out test has nothing left to do, so only it recedes.
    const tone = row.atMax ? MUTED : INK;

    if (!row.tested) band(ctx, cTest, y - 11, width, 14);

    text(ctx, ellipsize(ctx.bold, row.test, 7.8, testW), cTest, y, {
      size: 7.8,
      bold: !row.atMax,
      color: tone,
    });
    // The column header already says LEVEL, so the "Lvl" prefix only crowds
    // out the requirement text.
    text(
      ctx,
      row.atMax ? `${row.level}` : `${row.level} > ${row.nextLevel}`,
      cNow,
      y,
      { size: 8, color: tone }
    );
    // Every condition, in the requirement's own order, so the coach can see
    // which foot is already there and which one is holding the level back.
    const bests =
      row.bests.some((b) => b !== null)
        ? row.bests.map(fmtNumber).join("/")
        : "-";
    text(ctx, ellipsize(ctx.font, bests, 7.4, cNeeds - cBest - 4), cBest, y, {
      size: 7.4,
      color: tone,
    });
    text(ctx, ellipsize(ctx.font, row.requirement, 6.8, needsW), cNeeds, y, {
      size: 6.8,
      color: row.atMax ? MUTED : rgb(0.3, 0.33, 0.4),
    });
    textRight(ctx, flag.label, cFlagRight, y, {
      size: 7,
      bold: true,
      color: flag.color,
    });
    rule(ctx, cTest, y + 4.5, width, rgb(0.93, 0.94, 0.95));
  }

  return y + 12;
}

function drawGoalPanel(
  ctx: Ctx,
  data: PlayerSheetData,
  top: number,
  x: number,
  width: number,
  maxBottom: number
) {
  let y = top + 8;
  text(ctx, "CURRENT GOAL", x, y, { size: 8.5, bold: true });
  y += 6;
  rule(ctx, x, y, width);
  y += 12;

  if (data.goal) {
    for (const line of wrap(ctx.bold, data.goal.title, 8.5, width, 2)) {
      text(ctx, line, x, y, { size: 8.5, bold: true });
      y += 10;
    }
    text(
      ctx,
      `${fmtDate(data.goal.startDate)} - ${fmtDate(data.goal.endDate)}`,
      x,
      y,
      { size: 6.8, color: MUTED }
    );
    y += 12;

    let drawn = 0;
    for (const step of data.goal.steps.slice(0, 7)) {
      if (y > maxBottom - 46) break;
      checkbox(ctx, x, y - 0.5, step.completed);
      text(ctx, ellipsize(ctx.font, step.title, 7.2, width - 11), x + 11, y, {
        size: 7.2,
        color: step.completed ? MUTED : INK,
      });
      y += 11;
      drawn += 1;
    }
    if (data.goal.steps.length > drawn) {
      text(ctx, `+${data.goal.steps.length - drawn} more`, x + 11, y, {
        size: 6.5,
        color: MUTED,
      });
      y += 10;
    }
  } else {
    text(ctx, "No goal set", x, y, { size: 8, color: MUTED });
    y += 12;
  }

  // The other two gates on the same checklist as the tests.
  let gateY = maxBottom - 34;
  rule(ctx, x, gateY, width);
  gateY += 11;

  checkbox(ctx, x, gateY - 0.5, data.mission.ok);
  text(ctx, "Coach mission", x + 11, gateY, { size: 7.2, bold: true });
  textRight(
    ctx,
    data.mission.ok ? "done" : data.mission.title ? "assigned" : "none",
    x + width,
    gateY,
    { size: 7, color: data.mission.ok ? GOOD : BAD }
  );
  gateY += 12;

  // Plain count, not a gate — the session minimum is deliberately not shown.
  text(ctx, "Sessions", x, gateY, { size: 7.2, bold: true });
  textRight(ctx, `${data.sessions.count}`, x + width, gateY, {
    size: 7.5,
    bold: true,
  });
}

function drawHistory(ctx: Ctx, data: PlayerSheetData, top: number) {
  const cTest = MARGIN;
  const cFirst = MARGIN + 96;
  const cPrev = MARGIN + 196;
  const cLatest = MARGIN + 296;
  const right = MARGIN + CONTENT_W;

  text(ctx, "TEST HISTORY", cTest, top + 8, { size: 8.5, bold: true });
  text(
    ctx,
    "the metric each level is measured on, over time",
    cTest + 66,
    top + 8,
    { size: 6.5, color: MUTED }
  );

  let y = top + 21;
  text(ctx, "TEST", cTest, y, { size: 5.6, color: MUTED });
  text(ctx, "FIRST", cFirst, y, { size: 5.6, color: MUTED });
  text(ctx, "PREVIOUS", cPrev, y, { size: 5.6, color: MUTED });
  text(ctx, "LATEST", cLatest, y, { size: 5.6, color: MUTED });
  textRight(ctx, "CHANGE", right, y, { size: 5.6, color: MUTED });
  y += 3.5;
  rule(ctx, cTest, y, CONTENT_W);

  for (const row of data.history) {
    y += 14;
    text(ctx, row.test, cTest, y, { size: 7.6 });
    if (row.metricLevel !== null) {
      const nameW = ctx.font.widthOfTextAtSize(wa(row.test), 7.6);
      text(ctx, `lvl ${row.metricLevel}`, cTest + nameW + 5, y, {
        size: 6,
        color: MUTED,
      });
    }

    const cell = (point: typeof row.first, x: number) => {
      if (!point) {
        text(ctx, "-", x, y, { size: 7.6, color: FAINT });
        return;
      }
      const value = point.values.map(fmtNumber).join("/");
      text(ctx, value, x, y, { size: 7.6 });
      const valueW = ctx.font.widthOfTextAtSize(wa(value), 7.6);
      text(ctx, fmtDate(point.date), x + valueW + 5, y, {
        size: 6.4,
        color: MUTED,
      });
    };

    cell(row.first, cFirst);
    cell(row.previous, cPrev);
    cell(row.latest, cLatest);

    // Each condition gets its own signed, coloured delta — one foot can be
    // climbing while the other slides, and a single number would hide that.
    const parts = row.deltas.map((delta) =>
      delta === null
        ? { label: "-", color: FAINT }
        : {
            label: `${delta > 0 ? "+" : ""}${fmtNumber(delta)}`,
            color: delta > 0 ? GOOD : delta < 0 ? BAD : MUTED,
          }
    );

    if (!parts.length) {
      textRight(ctx, "-", right, y, { size: 7.4, color: FAINT });
    } else {
      const sep = "/";
      const sepW = ctx.bold.widthOfTextAtSize(sep, 7.4);
      const totalW =
        parts.reduce(
          (sum, part) => sum + ctx.bold.widthOfTextAtSize(part.label, 7.4),
          0
        ) +
        sepW * (parts.length - 1);
      let cursor = right - totalW;
      parts.forEach((part, i) => {
        if (i > 0) {
          text(ctx, sep, cursor, y, { size: 7.4, bold: true, color: FAINT });
          cursor += sepW;
        }
        text(ctx, part.label, cursor, y, {
          size: 7.4,
          bold: true,
          color: part.color,
        });
        cursor += ctx.bold.widthOfTextAtSize(part.label, 7.4);
      });
    }
    rule(ctx, cTest, y + 4, CONTENT_W, rgb(0.93, 0.94, 0.95));
  }

  return y + 14;
}

// The report is last precisely because it is the only variable-length block:
// it takes whatever vertical space is left and clamps its text to fit, so the
// sheet is always exactly one page.
function drawReport(ctx: Ctx, data: PlayerSheetData, top: number) {
  const available = CONTENT_BOTTOM - top;
  if (available < 40) return;

  const report = data.report;
  const heading = report
    ? `${report.kind === "progress" ? "PROGRESS REPORT" : "BASELINE SNAPSHOT"} - ${fmtDate(report.date)}`
    : "LATEST REPORT";

  text(ctx, heading, MARGIN, top + 8, { size: 8.5, bold: true });
  if (report) {
    text(
      ctx,
      ellipsize(ctx.font, report.title, 7, CONTENT_W - 180),
      MARGIN + 172,
      top + 8,
      { size: 7, color: MUTED }
    );
  }
  let y = top + 14;
  rule(ctx, MARGIN, y, CONTENT_W);
  y += 13;

  if (!report) {
    text(ctx, "No baseline or progress report on file.", MARGIN, y, {
      size: 8,
      color: MUTED,
    });
    return;
  }

  if (report.ratings.length) {
    const colW = CONTENT_W / 3;
    report.ratings.forEach((rating, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = MARGIN + col * colW;
      const rowY = y + row * 13;
      text(ctx, rating.label, x, rowY, { size: 7.2 });
      ratingDots(ctx, x + 84, rowY - 2.4, rating.value);
    });
    y += Math.ceil(report.ratings.length / 3) * 13 + 6;
  }

  if (!report.fields.length) return;

  // Split what is left evenly, so no single long field crowds out the rest.
  const lineH = 9.5;
  const perFieldOverhead = 9;
  const budget = CONTENT_BOTTOM - y;
  const totalLines = Math.floor(
    (budget - report.fields.length * perFieldOverhead) / lineH
  );
  if (totalLines < report.fields.length) return;
  const linesEach = Math.max(1, Math.floor(totalLines / report.fields.length));

  for (const field of report.fields) {
    if (CONTENT_BOTTOM - y < perFieldOverhead + lineH) break;
    text(ctx, field.label.toUpperCase(), MARGIN, y, {
      size: 5.8,
      color: MUTED,
    });
    y += perFieldOverhead;
    const room = Math.min(
      linesEach,
      Math.floor((CONTENT_BOTTOM - y) / lineH)
    );
    for (const line of wrap(ctx.font, field.text, 8, CONTENT_W, room)) {
      text(ctx, line, MARGIN, y, { size: 8 });
      y += lineH;
    }
    y += 4;
  }
}

export async function buildPlayerSheetPdf(
  data: PlayerSheetData
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { page, font, bold };

  let embedded = null;
  let dims: { width: number; height: number } | null = null;
  if (data.photo) {
    try {
      const image =
        data.photo.kind === "png"
          ? await doc.embedPng(data.photo.bytes)
          : await doc.embedJpg(data.photo.bytes);
      embedded = image;
      dims = { width: image.width, height: image.height };
    } catch {
      embedded = null;
    }
  }

  let y = MARGIN;
  y = drawHeader(ctx, data, dims, embedded, y);

  const testsW = 334;
  const goalX = MARGIN + testsW + 22;
  const goalW = CONTENT_W - testsW - 22;
  const testsBottom = drawTests(ctx, data, y, testsW);
  drawGoalPanel(ctx, data, y, goalX, goalW, testsBottom - 6);

  y = drawHistory(ctx, data, testsBottom + 4);
  drawReport(ctx, data, y);

  return doc.save();
}
