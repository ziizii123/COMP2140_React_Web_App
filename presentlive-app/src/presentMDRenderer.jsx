import { parsePresentMD } from "./presentMDparser";

/**
 * Renders a preview of PresentMD source content.
 *
 * Parses the PresentMD source into blocks, extracts slide-level styles (done by presentMDparser),
 * and renders the supported content blocks as React elements.
 *
 * @component
 * @param {string} props.source - PresentMD source content to parse and preview
 * @returns {JSX.Element}  The rendered PresentMD preview
 */

function renderRuns(runs) {
  return runs.map((run, i) => {
    switch (run.type) {
      case "text":
        return run.value;
      case "strong":
        return <strong key={i}>{renderRuns(run.runs)}</strong>;
      case "em":
        return <em key={i}>{renderRuns(run.runs)}</em>;
      case "strike":
        return <s key={i}>{renderRuns(run.runs)}</s>;
      default:
        return null;
    }
  });
}

function renderList(items, ordered) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag>
      {items.map((item, i) => (
        <li key={i}>
          {renderRuns(item.runs)}
          {item.items?.length > 0 && renderList(item.items, item.ordered)}
        </li>
      ))}
    </Tag>
  );
}

function renderBlock(block, i) {
  switch (block.kind) {
    case "heading": {
      const level = Math.min(block.level, 6);
      const Tag = `h${level}`;
      return <Tag key={i}>{renderRuns(block.runs)}</Tag>;
    }
    case "paragraph":
      return <p key={i}>{renderRuns(block.runs)}</p>;
    case "list":
      return <div key={i}>{renderList(block.items, block.ordered)}</div>;
    case "quote":
      return <blockquote key={i}>{renderRuns(block.runs)}</blockquote>;
    case "image":
      return (
        <img
          key={i}
          src={block.src}
          alt={block.alt}
          style={{ maxWidth: "100%" }}
        />
      );
    default:
      // separator, directive, frontmatter, note: not displayed directly
      return null;
  }
}

function isValidHexColor(value) {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(value || "").trim());
}

function extractSlideStyle(blocks) {
  const style = {};

  blocks.forEach((block) => {
    if (block.kind === "directive") {
      if (block.key === "backgroundColor" && isValidHexColor(block.value)) {
        style.backgroundColor = block.value;
      }
      if (block.key === "color" && isValidHexColor(block.value)) {
        style.color = block.value;
      }
    }
  });

  const contentBlocks = blocks.filter(
    (b) =>
      b.kind !== "directive" && b.kind !== "frontmatter" && b.kind !== "note",
  );

  return { style, contentBlocks };
}

export function PresentMDPreview({ source }) {
  const { blocks } = parsePresentMD(source || "");
  const { style, contentBlocks } = extractSlideStyle(blocks);

  return (
    <div style={{ ...style, padding: 16, borderRadius: 8, minHeight: "100%" }}>
      {contentBlocks.map(renderBlock)}
    </div>
  );
}
