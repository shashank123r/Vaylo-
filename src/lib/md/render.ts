import "server-only";

// Minimal, SAFE Markdown -> HTML for AI-generated resume/cover content.
// Escapes HTML first (so model output can never inject markup), then applies a
// small, known set of constructs: headings, bold, links, and bullet lists.
// Shared by the PDF renderer and the on-page preview so they stay identical.

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noreferrer noopener">$1</a>');
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return out;
}

export function mdToHtml(md: string): string {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push("<li>" + inline(line.replace(/^\s*[-*]\s+/, "")) + "</li>");
      continue;
    }
    closeList();
    if (/^###\s+/.test(line)) out.push("<h3>" + inline(line.replace(/^###\s+/, "")) + "</h3>");
    else if (/^##\s+/.test(line)) out.push("<h2>" + inline(line.replace(/^##\s+/, "")) + "</h2>");
    else if (/^#\s+/.test(line)) out.push("<h1>" + inline(line.replace(/^#\s+/, "")) + "</h1>");
    else if (line === "") out.push("");
    else out.push("<p>" + inline(line) + "</p>");
  }
  closeList();
  return out.join("\n");
}
