import { highlightParts } from '../lib/highlight';

/** Hiện `text` với các từ khóa của `query` được tô sáng (thẻ `mark`). Dùng được ở cả server và client. */
export function HighlightedText({
  text,
  query,
}: {
  readonly text: string;
  readonly query: string;
}) {
  return (
    <>
      {highlightParts(text, query).map((p, i) =>
        p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>,
      )}
    </>
  );
}
