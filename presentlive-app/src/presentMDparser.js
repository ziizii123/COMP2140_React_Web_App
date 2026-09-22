/**
 * presentMDparser.js — a parser for PresentMD
 * ==========================================
 *
 * Implements the *grammar* defined in `PresentMD_Spec_V3`. It implements none
 * of the *meaning*.
 *
 * This is the 2026 counterpart to the XML parsing library 2025 permitted:
 * fast-xml-parser returned elements, attributes and text, and had never heard
 * of a course, a chapter or `url_name`. This returns blocks, lists and runs,
 * and has never heard of a slide.
 *
 *     It returns a document, not a deck.
 *
 * THE LINE IT DRAWS
 *   It does anything that is about **characters**, and nothing that is about
 *   **decks**. Splitting `layout: section` into a key and a value is lexical
 *   work, so it does it. Deciding that a slide's `layout` beats the deck's is
 *   about decks, so it does not.
 *
 * WHAT IT DOES
 *   - splits the source into blocks, in source order
 *   - nests lists, normalising over-indentation (spec 3.2)
 *   - resolves inline formatting into runs (spec Part 4)
 *   - splits frontmatter and directives into keys and values (spec 1.2, 2.1)
 *   - never throws on malformed input; unrecognised lines become paragraphs
 *
 * WHAT IT DOES NOT DO — this is the assignment
 *   - slides. `---` comes back as a `separator` block sitting in the stream.
 *   - scope. A `directive` block says which key and which value; whether it
 *     configures one slide or the deck is decided by where it sits, and
 *     working that out is the converter's job.
 *   - meaning. Values come back as strings. `draft: true` is the string
 *     `"true"`, not a boolean, and `layout: hexagon` is returned as readily as
 *     `layout: section` — the parser has never heard of the directive set.
 *   - computed content (spec Part 6). The first colon splits, and everything
 *     after it is the value, so `<!-- compute: sum, filter: >100000 -->` comes
 *     back as the key `compute` and the value `sum, filter: >100000`. Nothing
 *     is split on a comma and no data file is read.
 *   - notes. `^ ...` is recognised as a block but attached to nothing.
 *   - drafts, layouts, the agenda slide, the deck model, and every part of the
 *     ODF side.
 *   - judgement. Nothing is reported "unsupported". A `#### heading` comes back
 *     as a heading of level 4; deciding that the spec defines only three levels
 *     and emitting the placeholder is a converter decision, not a parser one.
 *   - errors of meaning. An empty file parses to zero blocks. Whether a deck
 *     may be empty is a rule about decks, so it belongs to the converter.
 *
 * USAGE
 *     const { parsePresentMD } = require('./presentMDparser');
 *     const doc = parsePresentMD(source);
 *     doc.blocks.forEach(...)
 *
 *     node presentMDparser.js deck.md       # prints the block stream as JSON
 *
 * WHAT COMES BACK
 *   { blocks: BLOCK[] } — nine kinds, and no others:
 *     frontmatter  separator  directive  heading  paragraph
 *     list  quote  image  note
 *   Inline content is a tree of runs, of four types and no others:
 *     text  strong  em  strike
 *   Anything the spec does not define is not a tenth kind. It falls through to
 *   `paragraph`, carrying its own source text, for the converter to judge.
 *
 * DECISIONS THIS PARSER MAKES, so they are not silently inherited
 *   - Frontmatter is only frontmatter when `---` is line 1 and a closing `---`
 *     exists. Every other `---` on its own line is a separator.
 *   - Frontmatter contents are NOT parsed as Markdown. Each line is split at
 *     its first colon and the value taken whole: parsing it as Markdown would
 *     mangle any value containing `*`, `_` or `~`.
 *   - The FIRST colon splits, so a value of `16:9` survives intact.
 *   - One layer of surrounding quotes comes off a value, because quoting is
 *     lexical. Nothing else is coerced.
 *   - A line of frontmatter with no colon has no key, so it is dropped.
 *   - A blank line ends a block.
 *   - Speaker-note text is raw, not runs. Notes are presenter text (spec 4).
 *   - Image alt text is raw, not runs. The spec treats it as metadata (spec 4).
 *   - A list ends at the first line that is not a list item.
 *   - One tab of indentation is one level, the same as two spaces. Mixing the
 *     two in one list is legal and neither is an error.
 *   - Every list item carries the marker that produced it, in its own
 *     `ordered` field, so a bullet list nested inside a numbered one keeps its
 *     bullets. The block's own `ordered` describes the outermost level only.
 *   - `_` does not open a run in the middle of a word, so `snake_case_name`
 *     is text. `*` does, because that is the usual Markdown rule.
 */

"use strict";

// ---------------------------------------------------------------------------
// The grammar, as patterns
// ---------------------------------------------------------------------------

const SEPARATOR = /^---\s*$/;
const COMMENT = /^<!--\s*([\s\S]*?)\s*-->$/;
const NOTE = /^\^\s?(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^(\s*)[-*]\s+(.*)$/;
const ORDERED = /^(\s*)\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const IMAGE_ONLY =
  /^!\[([^\]]*)\]\(([^\s)]*)(?:\s+"([^"]*)")?\)(?:\{([^}]*)\})?\s*$/;

const SPACES_PER_LEVEL = 2;

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

const normalise = (text) => text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

const isBlank = (line) => line.trim() === "";

/** One layer of surrounding quotes off a value. Quoting is lexical. */
const unquote = (value) =>
  value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");

/**
 * `key: value` -> { key, value }. The FIRST colon splits, so `16:9` survives
 * and a value may contain a comma, a colon or anything else. A line with no
 * colon has no value; a line with no key is not a setting at all.
 */
function splitSetting(line) {
  const at = line.indexOf(":");
  const key = (at === -1 ? line : line.slice(0, at)).trim();
  if (key === "") return null;
  return { key, value: at === -1 ? null : unquote(line.slice(at + 1).trim()) };
}

/** Merge neighbouring text runs, so `a` + `b` is one run rather than two. */
const mergeText = (runs) =>
  runs.reduce((acc, run) => {
    const previous = acc[acc.length - 1];
    return previous && previous.type === "text" && run.type === "text"
      ? [
          ...acc.slice(0, -1),
          { type: "text", value: previous.value + run.value },
        ]
      : [...acc, run];
  }, []);

// ---------------------------------------------------------------------------
// Inline scanning
// ---------------------------------------------------------------------------

/**
 * Find the closing marker for a run that opens with `open`.
 *
 * For single-character markers a doubled run is skipped, so `*a **b** c*`
 * closes on the final `*` rather than the first `*` of the inner `**`. That
 * case is the reason this is a scan and not a regex.
 */
function matchDelimited(text, open, close = open) {
  if (!text.startsWith(open)) return null;

  let i = open.length;
  while (i < text.length) {
    if (text.startsWith(close, i)) {
      if (close.length === 1 && text[i + 1] === close) {
        i += 2;
        continue;
      }
      if (i === open.length) return null; // `**` with nothing inside
      return { inner: text.slice(open.length, i), length: i + close.length };
    }
    i += 1;
  }
  return null;
}

/** `{w=12cm h=8cm}` -> `{ w: '12cm', h: '8cm' }` */
const parseAttributes = (source) =>
  Object.fromEntries(
    (source || "")
      .split(/\s+/)
      .map((pair) => pair.match(/^(\w+)=(.+)$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value]),
  );

/**
 * Ordered by precedence: strong is tried before em, so `**` is never read as
 * two `*`.
 *
 * `intraword: false` marks the underscore forms, which may not open in the
 * middle of a word. Without it `snake_case_name` italicises `case`, and
 * ordinary identifiers in prose come apart.
 */
const INLINE_RULES = [
  { type: "strong", open: "**", intraword: true },
  { type: "strong", open: "__", intraword: false },
  { type: "strike", open: "~~", intraword: true },
  { type: "em", open: "*", intraword: true },
  { type: "em", open: "_", intraword: false },
];

const isWordCharacter = (character) =>
  character !== undefined && /\w/.test(character);

/** STRING -> RUN[] */
function parseInline(text) {
  const runs = [];
  let plain = "";
  let rest = text;
  let previous; // the character before `rest`, for the intraword rule

  const flush = () => {
    if (plain) runs.push({ type: "text", value: plain });
    plain = "";
  };

  while (rest.length > 0) {
    const emphasis = INLINE_RULES.filter(
      (rule) => rule.intraword || !isWordCharacter(previous),
    )
      .map((rule) => ({ rule, hit: matchDelimited(rest, rule.open) }))
      .find(({ hit }) => hit);

    if (emphasis) {
      flush();
      runs.push({
        type: emphasis.rule.type,
        runs: parseInline(emphasis.hit.inner),
      });
      previous = rest[emphasis.hit.length - 1];
      rest = rest.slice(emphasis.hit.length);
      continue;
    }

    // anything else is one literal character
    plain += rest[0];
    previous = rest[0];
    rest = rest.slice(1);
  }

  flush();
  return mergeText(runs);
}

/** LINE[] -> RUN[]. Consecutive lines join with a space (spec 3.1). */
const linesToRuns = (lines) =>
  mergeText(
    lines.flatMap((line, index) => {
      const runs = parseInline(line.trim());
      return index === lines.length - 1
        ? runs
        : [...runs, { type: "text", value: " " }];
    }),
  );

// ---------------------------------------------------------------------------
// List nesting
// ---------------------------------------------------------------------------

/**
 * The indent of a list item -> its level. One tab counts as one level, the
 * same as two spaces, so a list written with tabs nests rather than
 * collapsing flat.
 */
const indentLevel = (indent) => {
  const columns = [...indent].reduce(
    (total, character) => total + (character === "\t" ? SPACES_PER_LEVEL : 1),
    0,
  );
  return Math.floor(columns / SPACES_PER_LEVEL);
};

/**
 * An over-indented item drops to the next level down rather than being an
 * error (spec 3.2), so levels only ever step up by one.
 */
const clampLevels = (items) =>
  items.reduce((acc, item) => {
    const previous = acc.length > 0 ? acc[acc.length - 1].level : -1;
    return [...acc, { ...item, level: Math.min(item.level, previous + 1) }];
  }, []);

/** Flat, level-tagged items -> a tree. */
function nest(items) {
  const tree = [];
  let i = 0;

  while (i < items.length) {
    let end = i + 1;
    while (end < items.length && items[end].level > items[i].level) end += 1;

    tree.push({ ...items[i].fields, items: nest(items.slice(i + 1, end)) });
    i = end;
  }

  return tree;
}

// ---------------------------------------------------------------------------
// Block readers
//
// Each reader takes (lines, index) and returns { block, next } — the
// block, and the index of the first line it did not consume. A reader that
// returns null declines, and the next one is tried.
// ---------------------------------------------------------------------------

function readSeparator(lines, index) {
  return SEPARATOR.test(lines[index])
    ? { block: { kind: "separator" }, next: index + 1 }
    : null;
}

/**
 * A directive comment -> a key and a value (spec 2.1). `<!-- agenda -->` takes
 * no value, so its value is null. Which keys mean anything, and whether this
 * one may appear on a slide at all, are not questions for a parser.
 */
function readComment(lines, index) {
  const hit = lines[index].trim().match(COMMENT);
  if (!hit) return null;

  const setting = splitSetting(hit[1]);
  return setting
    ? { block: { kind: "directive", ...setting }, next: index + 1 }
    : { block: { kind: "directive", key: "", value: null }, next: index + 1 };
}

function readNote(lines, index) {
  const hit = lines[index].match(NOTE);
  return hit
    ? { block: { kind: "note", text: hit[1].trim() }, next: index + 1 }
    : null;
}

function readHeading(lines, index) {
  const hit = lines[index].match(HEADING);
  if (!hit) return null;

  return {
    block: {
      kind: "heading",
      level: hit[1].length,
      runs: linesToRuns([hit[2]]),
    },
    next: index + 1,
  };
}

function readImage(lines, index) {
  const hit = lines[index].trim().match(IMAGE_ONLY);
  if (!hit) return null;

  const attributes = parseAttributes(hit[4]);
  return {
    block: {
      kind: "image",
      alt: hit[1],
      src: hit[2],
      ...(hit[3] ? { title: hit[3] } : {}),
      ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
    },
    next: index + 1,
  };
}

function readList(lines, index) {
  const ordered = ORDERED.test(lines[index]);
  if (!ordered && !BULLET.test(lines[index])) return null;

  const items = [];
  let i = index;
  while (i < lines.length) {
    const numbered = lines[i].match(ORDERED);
    const hit = numbered || lines[i].match(BULLET);
    if (!hit) break;
    items.push({
      level: indentLevel(hit[1]),
      // Each item keeps its own marker, so a nested list of a different kind
      // is not flattened into its parent's. Only the outermost level is
      // described by the block's `ordered`.
      fields: { runs: linesToRuns([hit[2]]), ordered: Boolean(numbered) },
    });
    i += 1;
  }

  return {
    block: { kind: "list", ordered, items: nest(clampLevels(items)) },
    next: i,
  };
}

function readQuote(lines, index) {
  if (!QUOTE.test(lines[index])) return null;

  const body = [];
  let i = index;
  while (i < lines.length && QUOTE.test(lines[i])) {
    body.push(lines[i].match(QUOTE)[1]);
    i += 1;
  }

  return { block: { kind: "quote", runs: linesToRuns(body) }, next: i };
}

/**
 * The fallback. Consecutive non-blank lines form one paragraph, ending at a
 * blank line or at any line that starts a different block.
 */
function readParagraph(lines, index) {
  const body = [];
  let i = index;

  while (i < lines.length && !isBlank(lines[i])) {
    if (i > index && startsAnotherBlock(lines, i)) break;
    body.push(lines[i]);
    i += 1;
  }

  return { block: { kind: "paragraph", runs: linesToRuns(body) }, next: i };
}

/** Readers in precedence order. Order is the grammar's, and it matters. */
const READERS = [
  readSeparator,
  readComment,
  readNote,
  readHeading,
  readImage,
  readList,
  readQuote,
];

/** May a block other than a paragraph start here? Used for interruption. */
const startsAnotherBlock = (lines, index) =>
  READERS.some((reader) => reader(lines, index) !== null);

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

/**
 * Frontmatter is only frontmatter when `---` is line 1 and a closing `---`
 * exists (spec 1.2). Each line is split at its first colon; the value is taken
 * whole, because the contents are not Markdown and reading them as Markdown
 * would mangle any value containing `*`, `_` or `~`. A repeated key keeps its
 * last value.
 */
function readFrontmatter(lines) {
  if (lines.length === 0 || !SEPARATOR.test(lines[0])) return null;

  const close = lines.findIndex((line, i) => i > 0 && SEPARATOR.test(line));
  if (close === -1) return null;

  const settings = lines.slice(1, close).reduce((found, line) => {
    const setting = splitSetting(line);
    return setting ? { ...found, [setting.key]: setting.value } : found;
  }, {});

  return { block: { kind: "frontmatter", settings }, next: close + 1 };
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

/**
 * TEXT -> { blocks: BLOCK[] }
 *
 * Blocks appear in source order. Runs of blank lines collapse.
 */
function parsePresentMD(source) {
  if (typeof source !== "string") {
    throw new TypeError("parsePresentMD expects a string");
  }

  const lines = normalise(source).split("\n");
  const blocks = [];

  const front = readFrontmatter(lines);
  let i = front ? front.next : 0;
  if (front) blocks.push(front.block);

  while (i < lines.length) {
    if (isBlank(lines[i])) {
      i += 1;
      continue;
    }

    const hit =
      READERS.reduce((found, reader) => found || reader(lines, i), null) ||
      readParagraph(lines, i);

    blocks.push(hit.block);
    i = hit.next > i ? hit.next : i + 1; // never stall
  }

  return { blocks };
}

// ---------------------------------------------------------------------------

// module.exports = { parsePresentMD, parseInline, nest };

// if (require.main === module) {
//   const fs = require("fs");
//   const file = process.argv[2];

//   if (!file) {
//     console.error("usage: node presentMDparser.js <deck.md>");
//     process.exit(1);
//   }

//   const document = parsePresentMD(fs.readFileSync(file, "utf8"));
//   console.log(JSON.stringify(document, null, 2));
// }

export { parsePresentMD, parseInline, nest };
