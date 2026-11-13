import { mdToHtml } from "@/lib/md/render";

// Renders AI-generated resume/cover Markdown as clean, readable HTML (styled via
// the `.md-view` rules in globals.css). The HTML is produced by mdToHtml, which
// escapes all model output first, so this is safe to inject.
export function MarkdownView({ md, className = "" }: { md: string; className?: string }) {
  return <div className={`md-view ${className}`} dangerouslySetInnerHTML={{ __html: mdToHtml(md) }} />;
}
