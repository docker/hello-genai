import { memo, useEffect, useMemo, useRef, useState } from "react";
import { enhanceCodeBlocks, renderMarkdown } from "../markdown";

/**
 * Renders sanitized markdown.
 *
 * Performance note: `renderMarkdown` parses the *whole* string and the result is
 * written with dangerouslySetInnerHTML, which replaces the entire subtree. While a
 * reply streams, `content` changes on every chunk — so parsing per chunk is
 * quadratic in the length of the answer and gets visibly worse the longer it runs.
 *
 * Two fixes, both here:
 *   1. the parse is memoised, so a re-render that doesn't change the text is free;
 *   2. while streaming, the text feeding the parser is throttled, capping the parse
 *      rate (~12/s) instead of once per token. The final value always flushes the
 *      moment `streaming` goes false, so a settled message is never stale.
 */
export const MarkdownView = memo(function MarkdownView({
  content, className, enhance = true, streaming = false,
}: { content: string; className?: string; enhance?: boolean; streaming?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useThrottled(content, streaming ? 80 : 0);
  const html = useMemo(() => renderMarkdown(shown), [shown]);

  // Highlight + add copy buttons once the markup settles (skipped mid-stream so
  // half-written code fences aren't decorated).
  useEffect(() => {
    if (enhance && ref.current) enhanceCodeBlocks(ref.current);
  }, [html, enhance]);

  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
});

/** Latest value, updated at most every `ms`. `ms <= 0` passes through instantly. */
function useThrottled(value: string, ms: number): string {
  const [shown, setShown] = useState(value);
  const last = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (ms <= 0) {                       // streaming finished — flush immediately
      window.clearTimeout(timer.current);
      setShown(value);
      return;
    }
    const wait = ms - (Date.now() - last.current);
    if (wait <= 0) {
      last.current = Date.now();
      setShown(value);
      return;
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { last.current = Date.now(); setShown(value); }, wait);
    return () => window.clearTimeout(timer.current);
  }, [value, ms]);

  return shown;
}
