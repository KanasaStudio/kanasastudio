import { marked } from "marked";
import DOMPurify from "dompurify";
import { useMemo } from "react";

marked.setOptions({ gfm: true, breaks: true });

export function Markdown({ text, className = "" }: { text: string | null | undefined; className?: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(text ?? "", { async: false }) as string;
    const clean = DOMPurify.sanitize(raw, { ADD_ATTR: ["target", "rel"] });
    return clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
  }, [text]);
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
