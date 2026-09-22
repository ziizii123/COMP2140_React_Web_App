"use strict";

const fs = require("fs");
const path = require("path");
const { parsePresentMD } = require("./presentMDparser.js");
const { execSync } = require("child_process");

/**
 * Splits a flat list of blocks into groups of slides, starting a new
 * slide each time a "separator" block is encountered.
 * @param {Array<{kind: string}>} blocks - The full list of parsed blocks
 *   from the document, in order.
 * @returns {Array<Array<Object>>} An array of slides, where each slide
 *   is itself an array of the blocks belonging to it (separators excluded).
 */
function splitIntoSlides(blocks) {
  return blocks.reduce(
    (slides, block) => {
      if (block.kind === "separator") {
        slides.push([]);
      } else {
        slides[slides.length - 1].push(block);
      }
      return slides;
    },
    [[]],
  );
}

function runsToText(runs) {
  if (!runs) return "";
  return runs
    .map((r) => {
      if (r.type === "text") {
        return r.value;
      } else {
        return runsToText(r.runs);
      }
    })
    .join("");
}

// Extract metadata from frontmatter block
function getMeta(blocks) {
  const fmBlock = blocks.find((b) => b.kind === "frontmatter");
  return fmBlock ? fmBlock.settings : {};
}

function getSlideTitle(slideBlocks) {
  const heading = slideBlocks.find(
    (b) => b.kind === "heading" && (b.level === 1 || b.level === 2),
  );
  return heading ? runsToText(heading.runs) : null;
}

/**
 * Builds the intermediate deck model from a parsed document by
 * extracting metadata and splitting blocks into per-slide objects
 * {title, blocks, notes, directives}.
 * @param {{blocks: Array<Object>}} doc - The parsed document, containing
 *   the full list of blocks.
 * @returns {{meta: Object, slides: Array<Object>}} The deck model, with
 *   deck metadata and an array of slide objects.
 */
// AI supported function
function buildDeckModel(doc) {
  const meta = getMeta(doc.blocks);
  const slidesBlocks = splitIntoSlides(doc.blocks);

  const slides = slidesBlocks.map((slideBlocks) => {
    const noFrontmatter = slideBlocks.filter((b) => b.kind !== "frontmatter");
    const directives = noFrontmatter.filter((b) => b.kind === "directive");

    const notes = noFrontmatter
      .filter((b) => b.kind === "note")
      .map((b) => b.text);

    const contentBlocks = noFrontmatter.filter(
      (b) => b.kind !== "note" && b.kind !== "directive",
    );

    return {
      title: getSlideTitle(contentBlocks),
      blocks: contentBlocks,
      notes,
      directives,
    };
  });

  return { meta, slides };
}

function escapeXml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function validBgColor(v) {
  const s = String(v || "").trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);
}

// Filter out draft slides before rendering
function filterSlides(model) {
  return { ...model, slides: model.slides.filter((s) => !s.draft) };
}

/**
 * Collects the titles of all non-agenda slides, for use in an agenda slide.
 * @param {{slides: Array<Object>}} model - The deck model.
 * @returns {Array<string>} Slide titles.
 */
function buildAgendaTitles(model) {
  const titles = model.slides
    .filter((s) => !s.isAgenda)
    .map((s) => s.title || "Untitled");
  return titles;
}

// Titles from 05-fifty-slides.md is exceeding the page limit; therefore, it needs to be split into columns
function splitIntoColumns(arr, n) {
  const cols = Array.from({ length: n }, () => []);
  arr.forEach((item, i) => cols[i % n].push(item));
  return cols;
}

// AI supported function
function uniquePageName(base, used) {
  const clean = String(base || "Untitled").trim() || "Untitled";

  if (!used.has(clean)) {
    used.add(clean);
    return clean;
  }

  let n = 2;
  while (used.has(`${clean} (${n})`)) n++;

  const name = `${clean} (${n})`;
  used.add(name);
  return name;
}

function listMdFiles(inputPath) {
  const entries = fs.readdirSync(inputPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
    .map((e) => path.join(inputPath, e.name))
    .sort();
}

const KNOWN_DIRECTIVES = new Set([
  "layout",
  "agenda",
  "draft",
  "backgroundColor",
  "color",
]);

// AI supported function
function processDirectives(model) {
  const deckLayout = model.meta?.layout || "default";
  const deckBg = model.meta?.backgroundColor || "#ffffff";
  const deckColor = model.meta?.color || null;

  const slides = model.slides.map((s, index) => {
    const warnings = [];

    // Warn unknown directives
    for (const d of s.directives || []) {
      if (!KNOWN_DIRECTIVES.has(d.key)) {
        warnings.push(
          `Unknown directive ignored on slide ${index + 1}: ${d.key}=${d.value}`,
        );
      }
    }

    const getDirective = (key) =>
      (s.directives || []).filter((d) => d.key === key).at(-1);

    const layoutDirective = getDirective("layout");
    const layout = layoutDirective
      ? String(layoutDirective.value).trim()
      : deckLayout;

    const isAgenda = !!getDirective("agenda");

    const draftDirective = getDirective("draft");
    const draft = draftDirective
      ? String(draftDirective.value).trim() === "true"
      : false;

    // BackgroundColor validate and fallback
    const backgroundColorDirective = getDirective("backgroundColor");
    let backgroundColor = deckBg;

    if (backgroundColorDirective) {
      const raw = String(backgroundColorDirective.value).trim();
      if (validBgColor(raw)) {
        backgroundColor = raw;
      } else {
        warnings.push(
          `Invalid backgroundColor ignored on slide ${index + 1}: ${raw}`,
        );
        backgroundColor = deckBg;
      }
    }

    const slideColorDirective = getDirective("color");
    if (slideColorDirective) {
      warnings.push(
        `Slide-level color directive ignored on slide ${index + 1}: ${slideColorDirective.value}`,
      );
    }

    return {
      ...s,
      layout,
      isAgenda,
      draft,
      backgroundColor,
      color: deckColor,
      warnings,
    };
  });

  return { ...model, slides };
}

const STYLE_MAP = {
  strong: "t-bold",
  em: "t-italic",
  strike: "t-strike",
};

function renderTextStyle(runs) {
  if (!runs) return "";
  return runs
    .map((r) => {
      if (r.type === "text") return escapeXml(r.value);

      const styleName = STYLE_MAP[r.type];
      if (styleName) {
        return `<text:span text:style-name="${styleName}">${renderTextStyle(r.runs)}</text:span>`;
      }

      // Fallback visible placeholder for unsupported run types
      return `[Unsupported run: ${escapeXml(r.type)}]`;
    })
    .join("");
}

function renderParagraph(block) {
  return `<text:p text:style-name="p-body">${renderTextStyle(block.runs || [])}</text:p>`;
}

function renderSpeakerNotes(notes) {
  if (!notes || notes.length === 0) return "";

  const notesParagraphs = notes
    .map(
      (note) => `<text:p text:style-name="p-notes">${escapeXml(note)}</text:p>`,
    )
    .join("\n");

  return `
    <presentation:notes>
      <draw:page-thumbnail/>
      <draw:frame draw:style-name="fr-nofill" presentation:class="notes"
                  svg:x="1.4cm" svg:y="1.0cm"
                  svg:width="22.6cm"  svg:height="10cm">
        <draw:text-box>
          ${notesParagraphs}
        </draw:text-box>
      </draw:frame>
    </presentation:notes>
  `;
}

// AI supported function
function renderOfficeMeta(frontmatter) {
  const title = frontmatter?.title;
  const author = frontmatter?.author;

  const dcTitle = title ? `<dc:title>${escapeXml(title)}</dc:title>\n` : "";
  const dcCreator = author
    ? `<dc:creator>${escapeXml(author)}</dc:creator>\n`
    : "";

  const known = new Set([
    "title",
    "author",
    "backgroundColor",
    "color",
    "layout",
  ]);
  const userDefined = Object.entries(frontmatter || {})
    .filter(([k]) => !known.has(k))
    .map(
      ([k, v]) =>
        `<meta:user-defined meta:name="${escapeXml(k)}" meta:value-type="string">${escapeXml(String(v))}</meta:user-defined>`,
    )
    .join("\n");

  return `<office:meta>
<meta:generator>deckconverter</meta:generator>
${dcTitle}${dcCreator}${userDefined}</office:meta>`;
}

function renderFodp(model) {
  const officeMetaXml = renderOfficeMeta(model.meta);
  const deckTextColor = model.meta?.color || "#000000";
  const deckBg = model.meta?.backgroundColor || "#ffffff";

  const bgColours = Array.from(
    new Set(model.slides.map((s) => s.backgroundColor || deckBg)),
  );

  const bgByColor = new Map(bgColours.map((c, i) => [c, `bg-${i}`]));

  const bgStylesXml = bgColours
    .map((c, i) => {
      const styleName = `bg-${i}`;
      return `
    <style:style style:name="${styleName}" style:family="drawing-page">
      <style:drawing-page-properties
        draw:fill="solid"
        draw:fill-color="${escapeXml(c)}"
        presentation:background-visible="true"
        presentation:background-objects-visible="true"/>
    </style:style>`;
    })
    .join("\n");

  // Layout divider
  const slideDimensions = {
    default: {
      title: { x: "1.4cm", y: "1.0cm", width: "22.6cm", height: "2.5cm" },
      body: { x: "1.4cm", y: "4.3cm", width: "22.6cm", height: "9.5cm" },
    },
    section: {
      title: { x: "2.5cm", y: "5.4cm", width: "20.4cm", height: "3.5cm" },
      body: null,
    },
    title: {
      title: { x: "1.4cm", y: "2.8cm", width: "22.6cm", height: "3.6cm" },
      body: { x: "1.4cm", y: "7.2cm", width: "22.6cm", height: "3.5cm" },
    },
  };

  const dimensionsFor = (layout) =>
    slideDimensions[layout] || slideDimensions.default;

  const usedNames = new Set();
  const pagesXml = model.slides
    .map((slide, index) => {
      const baseName = slide.isAgenda
        ? "Agenda"
        : slide.title || `Slide${index + 1}`;
      const pageName = uniquePageName(baseName, usedNames);

      if (pageName !== baseName) {
        console.warn(
          `Duplicate slide title, draw:name changed: "${baseName}" -> "${pageName}"`,
        );
      }
      const layout = slide.layout || model.meta?.layout || "default";
      const dimensions = dimensionsFor(layout);

      let computedTitle = slide.isAgenda ? "Agenda" : slide.title;
      let bodyXml = "";

      let agendaFramesXml = "";

      if (slide.isAgenda) {
        computedTitle = "Agenda";
        const titles = buildAgendaTitles(model);
        const THRESHOLD = 12;

        if (dimensions.body) {
          if (titles.length > THRESHOLD) {
            agendaFramesXml = renderAgendaFrames(titles, dimensions);
          } else {
            const agendaItems = titles.map((t) => ({
              runs: [{ type: "text", value: t }],
              items: [],
            }));
            bodyXml = renderBulletList(agendaItems, true, "p-agenda");
          }
        }
      } else {
        const titleHeadingLevel = slide.blocks.findIndex(
          (b) => b.kind === "heading" && (b.level === 1 || b.level === 2),
        );

        bodyXml = slide.blocks
          .filter((b, i) => {
            if (b.kind === "note") return false;
            if (b.kind === "frontmatter") return false;
            if (b.kind === "heading" && i === titleHeadingLevel) return false;
            return true;
          })

          .map((b) => {
            if (b.kind === "paragraph") return renderParagraph(b);

            if (b.kind === "heading") {
              const headingText = runsToText(b.runs || []);

              if (b.level === 1) {
                return `<text:p text:style-name="p-h1">${escapeXml(headingText)}</text:p>`;
              }
              if (b.level === 2) {
                return `<text:p text:style-name="p-h2">${escapeXml(headingText)}</text:p>`;
              }
              if (b.level === 3) {
                return `<text:p text:style-name="p-h3">${escapeXml(headingText)}</text:p>`;
              }

              //Level 4+ unsupported
              return `<text:p text:style-name="p-body">[Unsupported: heading level ${b.level} omitted]</text:p>`;
            }

            if (b.kind === "quote") {
              const quoteText = runsToText(b.runs || []);
              return `<text:p text:style-name="p-quote">${escapeXml(quoteText)}</text:p>`;
            }

            if (b.kind === "list") {
              return b.ordered
                ? renderNumberedList(b.items, true)
                : renderBulletList(b.items, true);
            }

            return `<text:p text:style-name="p-body">[Unsupported: ${escapeXml(b.kind)} omitted]</text:p>`;
          })
          .join("\n");
      }

      const notesXml = renderSpeakerNotes(slide.notes);

      const titleParaStyle =
        layout === "title"
          ? "p-title"
          : layout === "section"
            ? "p-section"
            : "p-hero";

      const titleXml = computedTitle
        ? `<draw:frame draw:style-name="fr-nofill" presentation:class="title"
        svg:x="${dimensions.title.x}" svg:y="${dimensions.title.y}"
        svg:width="${dimensions.title.width}" svg:height="${dimensions.title.height}">
    <draw:text-box>
      <text:p text:style-name="${titleParaStyle}">${escapeXml(computedTitle)}</text:p>
    </draw:text-box>
  </draw:frame>`
        : "";

      return `   <draw:page draw:name="${escapeXml(pageName)}"
                      draw:style-name="${bgByColor.get(slide.backgroundColor || deckBg)}"
                      draw:master-page-name="Default">
        ${titleXml}

   
        ${
          dimensions.body
            ? slide.isAgenda && agendaFramesXml
              ? agendaFramesXml
              : `
  <draw:frame draw:style-name="fr-nofill" presentation:class="outline"
              svg:x="${dimensions.body.x}" svg:y="${dimensions.body.y}"
              svg:width="${dimensions.body.width}" svg:height="${dimensions.body.height}">
    <draw:text-box>
${bodyXml}
    </draw:text-box>
  </draw:frame>`
            : ""
        }
        ${notesXml}
      </draw:page>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
  xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
  xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  office:version="1.2"
  office:mimetype="application/vnd.oasis.opendocument.presentation">
  ${officeMetaXml}
  <office:styles/>

  <office:automatic-styles>
    <style:page-layout style:name="PM1">
      <style:page-layout-properties
        fo:page-width="25.4cm"
        fo:page-height="14.29cm"
        style:print-orientation="landscape"/>
    </style:page-layout>

    <!--Paragraph-->
    <style:style style:name="p-hero" style:family="paragraph">
      <style:paragraph-properties fo:text-align="center"/>
      <style:text-properties fo:font-size="40pt" fo:font-weight="bold"/>
    </style:style>

    <!--Heading style for layout: title-->
    <style:style style:name="p-title" style:family="paragraph">
      <style:paragraph-properties fo:text-align="center"/>
      <style:text-properties fo:font-size="52pt" fo:font-weight="bold" fo:color="${escapeXml(deckTextColor)}"/>
    </style:style>

    <!--Heading style for layout: section-->
    <style:style style:name="p-section" style:family="paragraph">
      <style:paragraph-properties fo:text-align="center"/>
      <style:text-properties fo:font-size="52pt" fo:font-weight="bold" fo:color="${escapeXml(deckTextColor)}"/>
    </style:style>

    <!-- Standard body text -->
    <style:style style:name="p-body" style:family="paragraph">
      <style:paragraph-properties fo:text-align="left"/>
      <style:text-properties fo:font-size="18pt" fo:color="${escapeXml(deckTextColor)}"/>
    </style:style>

    <!-- Speaker notes -->
    <style:style style:name="p-notes" style:family="paragraph">
      <style:paragraph-properties fo:text-align="left"/>
      <style:text-properties fo:font-size="14pt" fo:color="${escapeXml(deckTextColor)}"/>
    </style:style>

    <!-- Heading levels -->
    <style:style style:name="p-h1" style:family="paragraph">
      <style:paragraph-properties fo:text-align="left" fo:margin-top="0.25cm" fo:margin-bottom="0.15cm"/>
      <style:text-properties fo:font-size="40pt" fo:font-weight="bold" fo:color="${escapeXml(deckTextColor)}"/>
    </style:style>

    <style:style style:name="p-h2" style:family="paragraph">
      <style:paragraph-properties fo:text-align="left" fo:margin-top="0.20cm" fo:margin-bottom="0.10cm"/>
      <style:text-properties fo:font-size="30pt" fo:font-weight="bold" fo:color="${escapeXml(deckTextColor)}"/>
    </style:style>

    <style:style style:name="p-h3" style:family="paragraph">
      <style:paragraph-properties fo:text-align="left" fo:margin-top="0.15cm" fo:margin-bottom="0.10cm"/>
      <style:text-properties fo:font-size="25pt" fo:font-weight="bold" fo:color="${escapeXml(deckTextColor)}"/>
    </style:style>

    <!-- Unordered list -->
     <text:list-style style:name="bullet-list">
      <text:list-level-style-bullet text:level="1" text:bullet-char="•">
        <style:list-level-properties text:space-before="0cm" text:min-label-width="0.7cm"/>
       </text:list-level-style-bullet>

      <text:list-level-style-bullet text:level="2" text:bullet-char="–">
        <style:list-level-properties text:space-before="0.9cm" text:min-label-width="0.7cm"/>
      </text:list-level-style-bullet>

      <text:list-level-style-bullet text:level="3" text:bullet-char="◦">
        <style:list-level-properties text:space-before="1.8cm" text:min-label-width="0.7cm"/>
      </text:list-level-style-bullet>
    </text:list-style>

    <!-- Ordered list -->
    <text:list-style style:name="numbered-list">
      <text:list-level-style-number text:level="1"
                                    style:num-format="1"
                                    style:num-suffix=".">
        <style:list-level-properties text:space-before="0cm"
                                    text:min-label-width="0.9cm"/>
      </text:list-level-style-number>

      <text:list-level-style-number text:level="2"
                                    style:num-format="a"
                                    style:num-suffix=")">
        <style:list-level-properties text:space-before="0.9cm"
                                    text:min-label-width="0.9cm"/>
      </text:list-level-style-number>

      <text:list-level-style-number text:level="3"
                                    style:num-format="i"
                                    style:num-suffix=".">
        <style:list-level-properties text:space-before="1.8cm"
                                    text:min-label-width="0.9cm"/>
      </text:list-level-style-number>
    </text:list-style>

    <!-- Quotes -->
    <style:style style:name="p-quote" style:family="paragraph">
      <style:paragraph-properties fo:text-align="left" fo:margin-left="1cm" fo:margin-right="1cm"/>
      <style:text-properties fo:font-size="18pt" fo:font-style="italic" fo:color="${escapeXml(deckTextColor)}"/>
    </style:style>

    <!-- Inline formatting styles -->
    <style:style style:name="t-bold" style:family="text">
      <style:text-properties fo:font-weight="bold"/>
    </style:style>

    <style:style style:name="t-italic" style:family="text">
      <style:text-properties fo:font-style="italic"/>
    </style:style>

    <style:style style:name="t-strike" style:family="text">
      <style:text-properties style:text-line-through-style="solid"/>
    </style:style>

    <!-- No-fill frame -->
    <style:style style:name="fr-nofill" style:family="graphic">
      <style:graphic-properties draw:fill="none" draw:stroke="none"/>
    </style:style>

    <!--Agenda items--> 
    <style:style style:name="p-agenda" style:family="paragraph">
      <style:paragraph-properties fo:text-align="left" fo:line-height="105%"/>
      <style:text-properties fo:font-size="12pt" fo:color="${escapeXml(deckTextColor)}"/>
    </style:style>

    <!-- Deck background -->
   ${bgStylesXml}
  </office:automatic-styles>

  <office:master-styles>
    <style:master-page style:name="Default" style:page-layout-name="PM1"/>
  </office:master-styles>

  <office:body>
    <office:presentation>
${pagesXml}
    </office:presentation>
  </office:body>
</office:document>
`;
}

function renderBulletList(items, outermost = true, itemParaStyle = "p-body") {
  return renderListItems(items, outermost, itemParaStyle);
}

function renderListItems(items, outermost = true, itemParaStyle = "p-body") {
  const inner = items
    .map((item) => renderListItem(item, false, itemParaStyle))
    .join("\n");
  return outermost
    ? `<text:list text:style-name="bullet-list">\n${inner}\n</text:list>`
    : `<text:list>\n${inner}\n</text:list>`;
}

function renderListItem(item, ordered, itemParaStyle = "p-body") {
  const itemParagraph = `<text:p text:style-name="${itemParaStyle}">${renderTextStyle(item.runs || [])}</text:p>`;
  const nested =
    item.items && item.items.length
      ? ordered
        ? renderNumberedList(item.items, false)
        : renderBulletList(item.items, false, itemParaStyle)
      : "";

  return `<text:list-item>\n${itemParagraph}${nested}\n</text:list-item>`;
}

function renderNumberedList(items, isOuter = true) {
  return renderNumberItems(items, isOuter);
}

function renderNumberItems(items, isOuter = true) {
  const innerNumbered = items
    .map((item) => renderNumberItem(item, true))
    .join("\n");
  return isOuter
    ? `<text:list text:style-name="numbered-list">\n${innerNumbered}\n</text:list>`
    : `<text:list>\n${innerNumbered}\n</text:list>`;
}

function renderNumberItem(item, ordered) {
  const itemNoParagraph = `<text:p text:style-name="p-body">${renderTextStyle(item.runs || [])}</text:p>`;

  const nested =
    item.items && item.items.length
      ? ordered
        ? renderNumberedList(item.items, false)
        : renderBulletList(item.items, false)
      : "";

  return `<text:list-item>\n${itemNoParagraph}${nested}\n</text:list-item>`;
}

// AI supported code
function renderAgendaFrames(titles, dimensions) {
  const columns = splitIntoColumns(titles, 3);
  const toItems = (ts) =>
    ts.map((t) => ({
      runs: [{ type: "text", value: t }],
      items: [],
    }));

  const colXml = columns.map((col) =>
    renderBulletList(toItems(col), true, "p-agenda"),
  );

  // 3 columns inside the same body area
  const gap = 0.4;
  const totalWidthCm = 22.6;
  const colWidth = (totalWidthCm - gap * 2) / 3;

  const x0 = 1.4;
  const x1 = x0 + colWidth + gap;
  const x2 = x1 + colWidth + gap;

  const y = dimensions.body.y;
  const h = dimensions.body.height;
  const w = colWidth.toFixed(1) + "cm";

  const xs = [x0, x1, x2].map((x) => x.toFixed(1) + "cm");

  return `
  <draw:frame draw:style-name="fr-nofill" presentation:class="outline"
              svg:x="${xs[0]}" svg:y="${y}"
              svg:width="${w}" svg:height="${h}">
    <draw:text-box>
${colXml[0]}
    </draw:text-box>
  </draw:frame>

  <draw:frame draw:style-name="fr-nofill" presentation:class="outline"
              svg:x="${xs[1]}" svg:y="${y}"
              svg:width="${w}" svg:height="${h}">
    <draw:text-box>
${colXml[1]}
    </draw:text-box>
  </draw:frame>

  <draw:frame draw:style-name="fr-nofill" presentation:class="outline"
              svg:x="${xs[2]}" svg:y="${y}"
              svg:width="${w}" svg:height="${h}">
    <draw:text-box>
${colXml[2]}
    </draw:text-box>
  </draw:frame>`;
}

// AI supported code
function convertOneDeck(inputFile, outputDir, writeModel = false) {
  try {
    const source = fs.readFileSync(inputFile, "utf8");

    // Invalid: binary / bad UTF-8
    if (source.includes("\uFFFD") || source.includes("\0")) {
      const reason = "binary content or invalid UTF-8 encoding";
      console.error(`[Invalid deck] ${inputFile}: ${reason}. Skipping.`);
      return { ok: false, reason };
    }

    // Invalid: empty file
    if (!source || source.trim().length === 0) {
      const reason = "empty file (no content)";
      console.error(`[Invalid deck] ${inputFile}: ${reason}. Skipping.`);
      return { ok: false, reason };
    }

    // Invalid: unterminated frontmatter
    const lines = source.split(/\r?\n/).map((l) => l.trim());
    if (lines[0] === "---") {
      const closingIndex = lines.indexOf("---", 1);
      if (closingIndex === -1) {
        const reason = "unterminated frontmatter (missing closing ---)";
        console.error(`[Invalid deck] ${inputFile}: ${reason}. Skipping.`);
        return { ok: false, reason };
      }
    }

    const doc = parsePresentMD(source);
    const rawModel = buildDeckModel(doc);

    // Invalid: no slides content (only frontmatter)
    const hasActualContent = rawModel.slides.some(
      (s) =>
        s.title ||
        (s.blocks && s.blocks.length > 0) ||
        (s.notes && s.notes.length > 0),
    );
    if (!hasActualContent) {
      const reason = "no slides to render (deck has no slide content)";
      console.error(`[Invalid deck] ${inputFile}: ${reason}. Skipping.`);
      return { ok: false, reason };
    }

    const model1 = processDirectives(rawModel);
    const model2 = filterSlides(model1);

    // Invalid: after filtering draft slides, nothing left
    if (!model2.slides || model2.slides.length === 0) {
      const reason = "no slides to render (all slides filtered out or empty)";
      console.error(`[Invalid deck] ${inputFile}: ${reason}. Skipping.`);
      return { ok: false, reason };
    }

    // Warnings
    model2.slides.forEach((s) =>
      (s.warnings || []).forEach((w) => console.warn(w)),
    );

    const xml = renderFodp(model2);
    const base = path.basename(inputFile, ".md");
    const fodpPath = path.join(outputDir, `${base}.fodp`);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(fodpPath, xml, "utf8");
    tryConvertToPdf(fodpPath, outputDir);

    if (writeModel) {
      const modelPath = path.join(outputDir, `${base}.model.json`);
      fs.writeFileSync(modelPath, JSON.stringify(model2, null, 2), "utf8");
    }

    console.log(`[OK] Wrote fodp: ${fodpPath}`);
    return { ok: true, fodpPath };
  } catch (err) {
    console.error(`[Failed deck] ${inputFile}: ${err.message}`);
    return { ok: false, reason: err.message };
  }
}

// AI supported code
function tryConvertToPdf(fodpPath, outputDir) {
  try {
    const sofficePath = `"C:\\Program Files\\LibreOffice\\program\\soffice.exe"`;
    const cmd = `${sofficePath} --headless --norestore --convert-to pdf --outdir "${outputDir}" "${fodpPath}"`;
    execSync(cmd, { stdio: "inherit" });
    console.log(
      `[OK] Wrote pdf: ${path.join(outputDir, path.basename(fodpPath, ".fodp") + ".pdf")}`,
    );
  } catch (e) {
    console.warn(`[Warn] PDF conversion failed for ${fodpPath}: ${e.message}`);
  }
}

// AI supported code
function main() {
  const inputPath = process.argv[2];
  const outputDir = process.argv[3];
  const writeModel = process.argv.includes("--model");

  if (!inputPath || !outputDir) {
    console.error(
      "Usage: node deckconverter.js <input.md | inputFolder> <outputFolder> [--model]",
    );
    process.exit(1);
  }

  let stat;
  try {
    stat = fs.statSync(inputPath);
  } catch {
    console.error(`[Error] Input not found: ${inputPath}`);
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  // Single file
  if (stat.isFile()) {
    console.log("1 decks to convert");

    let ok = 0,
      bad = 0;
    const result = convertOneDeck(inputPath, outputDir, writeModel);
    if (result.ok) ok++;
    else bad++;

    console.log(`${ok} decks converted`);
    console.log(`${bad} decks could not be converted`);
    return;
  }

  // Folder
  if (stat.isDirectory()) {
    const mdFiles = fs
      .readdirSync(inputPath)
      .filter((f) => f.toLowerCase().endsWith(".md"))
      .map((f) => path.join(inputPath, f));

    console.log(`${mdFiles.length} decks to convert`);

    let ok = 0,
      bad = 0;
    for (const file of mdFiles) {
      const result = convertOneDeck(file, outputDir, writeModel);
      if (result.ok) ok++;
      else bad++;
    }

    console.log(`${ok} decks converted`);
    console.log(`${bad} decks could not be converted`);
    return;
  }

  console.error("Input must be a .md file or a folder containing .md files.");
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildDeckModel,
  processDirectives,
  filterSlides,
  renderFodp,
  escapeXml,
  validBgColor,
};
