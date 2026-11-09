'use client';

import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPdfBlob, printPdfBlob } from '../lib/print-pdf';
import { Button } from './ui/button';

/** Chiều rộng dựng canvas (px CSS) của một trang A4 ngang; canvas co theo khung bằng CSS nên không có thanh cuộn ngang. */
const RENDER_WIDTH = 1123;
const MAX_PIXEL_RATIO = 2;

type PageSize = { readonly width: number; readonly height: number };

/** Một trang PDF: chỉ dựng canvas khi gần vùng nhìn thấy và giải phóng khi đi xa để sổ dài không ngốn bộ nhớ. */
function PdfPage({
  doc,
  pageNumber,
  size,
}: {
  readonly doc: PDFDocumentProxy;
  readonly pageNumber: number;
  readonly size: PageSize;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(pageNumber <= 2);

  useEffect(() => {
    const node = holder.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => setNear(entries[0]?.isIntersecting ?? false),
      {
        rootMargin: '800px 0px',
      },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    if (!near) {
      el.width = 1;
      el.height = 1;
      return;
    }
    let task: RenderTask | undefined;
    let cancelled = false;
    void (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (RENDER_WIDTH / base.width) * ratio });
      el.width = Math.floor(viewport.width);
      el.height = Math.floor(viewport.height);
      const context = el.getContext('2d');
      if (!context) return;
      task = page.render({ canvasContext: context, viewport });
      try {
        await task.promise;
      } catch {
        // Hủy do cuộn đi chỗ khác hoặc đổi sổ: không phải lỗi.
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, near, pageNumber]);

  return (
    <div
      ref={holder}
      className="pdf-page"
      style={{ aspectRatio: `${size.width} / ${size.height}` }}
      data-testid="pdf-page"
    >
      <canvas ref={canvas} aria-label={`Trang ${pageNumber}`} role="img" />
    </div>
  );
}

/**
 * Khung xem trước sổ = chính file PDF sẽ in: dựng bằng pdf.js từ API nên bìa 1, bìa 2 và bảng
 * giống hệt bản in (A4 ngang, không thanh cuộn ngang). Nút in dùng cùng blob đã tải.
 */
export function BookPdfViewer({
  pdfUrl,
  downloadName,
  children,
}: {
  readonly pdfUrl: string;
  readonly downloadName: string;
  /** Nút bổ sung đặt cạnh nút in và tải (vd. Xuất Excel). */
  readonly children?: React.ReactNode;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [size, setSize] = useState<PageSize | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | undefined;
    setFailed(false);
    setDoc(null);
    setBlob(null);
    void (async () => {
      try {
        const file = await fetchPdfBlob(pdfUrl);
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
        const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
          .promise;
        if (cancelled) {
          void document.destroy();
          return;
        }
        loaded = document;
        const first = (await document.getPage(1)).getViewport({ scale: 1 });
        if (cancelled) return;
        setBlob(file);
        setSize({ width: first.width, height: first.height });
        setDoc(document);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      void loaded?.destroy();
    };
  }, [pdfUrl, attempt]);

  const print = useCallback(() => {
    if (blob) printPdfBlob(blob);
  }, [blob]);

  return (
    <div>
      <div className="print-hide mb-3 flex flex-wrap items-center justify-end gap-2">
        {children}
        <Button type="button" variant="primary" disabled={!blob} onClick={print}>
          Xuất PDF để in
        </Button>
        <Button asChild variant="secondary">
          <a className="no-underline" href={pdfUrl} download={downloadName}>
            Tải PDF
          </a>
        </Button>
      </div>
      {failed ? (
        <div className="state" role="alert">
          <h2>Không dựng được bản xem trước</h2>
          <p className="font-medium text-danger">Kiểm tra kết nối và thử lại.</p>
          <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            Thử lại
          </Button>
        </div>
      ) : doc && size ? (
        <div className="pdf-stage" data-testid="pdf-stage">
          {Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPage key={i + 1} doc={doc} pageNumber={i + 1} size={size} />
          ))}
        </div>
      ) : (
        <p className="muted py-10 text-center" role="status">
          Đang dựng bản xem trước…
        </p>
      )}
    </div>
  );
}
