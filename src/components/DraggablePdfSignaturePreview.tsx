import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

export interface SignaturePosition {
  x: number;
  y: number;
}

interface DraggablePdfSignaturePreviewProps {
  pdfUrl: string;
  signatureUrl: string;
  position: SignaturePosition;
  placement: "canonical" | "output_attachment";
  onPositionChange: (position: SignaturePosition) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function DraggablePdfSignaturePreview({
  pdfUrl,
  signatureUrl,
  position,
  placement,
  onPositionChange,
}: DraggablePdfSignaturePreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastPageRef = useRef<HTMLDivElement | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let loadingTask: { destroy: () => Promise<void> } | null = null;
    setPdf(null);
    setError("");

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const task = pdfjs.getDocument({ url: pdfUrl });
        loadingTask = task;
        const document = await task.promise;
        if (active) setPdf(document);
      } catch {
        if (active) setError("Não foi possível renderizar o PDF para posicionar a assinatura.");
      }
    })();

    return () => {
      active = false;
      if (loadingTask) void loadingTask.destroy();
    };
  }, [pdfUrl]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf) return;
    lastPageRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [pdf]);

  if (error) {
    return (
      <div className="flex h-full min-h-80 items-center justify-center p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const pageNumbers = pdf ? Array.from({ length: pdf.numPages }, (_, index) => index + 1) : [];

  return (
    <div ref={containerRef} className="h-full overflow-y-auto bg-slate-200 px-3 py-4 sm:px-6">
      {!pdf || !containerWidth ? (
        <div className="flex h-full min-h-80 items-center justify-center text-sm text-slate-600">
          Carregando páginas do PDF...
        </div>
      ) : (
        <div className="mx-auto flex w-fit min-w-full flex-col items-center gap-4">
          {pageNumbers.map((pageNumber) => (
            <PdfPageCanvas
              key={`${pdfUrl}-${pageNumber}`}
              pdf={pdf}
              pageNumber={pageNumber}
              maxWidth={Math.max(0, containerWidth - 48)}
              isLastPage={pageNumber === pdf.numPages}
              pageRef={pageNumber === pdf.numPages ? lastPageRef : undefined}
              signatureUrl={signatureUrl}
              position={position}
              placement={placement}
              onPositionChange={onPositionChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface PdfPageCanvasProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  maxWidth: number;
  isLastPage: boolean;
  pageRef?: React.RefObject<HTMLDivElement | null>;
  signatureUrl: string;
  position: SignaturePosition;
  placement: "canonical" | "output_attachment";
  onPositionChange: (position: SignaturePosition) => void;
}

function PdfPageCanvas({
  pdf,
  pageNumber,
  maxWidth,
  isLastPage,
  pageRef,
  signatureUrl,
  position,
  placement,
  onPositionChange,
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pageBoxRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<SignaturePosition | null>(null);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pageError, setPageError] = useState(false);

  useEffect(() => {
    let active = true;
    void pdf
      .getPage(pageNumber)
      .then((loadedPage) => {
        if (active) setPage(loadedPage);
      })
      .catch(() => {
        if (active) setPageError(true);
      });
    return () => {
      active = false;
    };
  }, [pdf, pageNumber]);

  const baseViewport = useMemo(() => page?.getViewport({ scale: 1 }), [page]);
  const scale = baseViewport && maxWidth > 0 ? Math.min(1.5, maxWidth / baseViewport.width) : 0;
  const viewport = useMemo(
    () => (page && scale > 0 ? page.getViewport({ scale }) : null),
    [page, scale],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!page || !viewport || !canvas || !context) return;

    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.ceil(viewport.width * pixelRatio);
    canvas.height = Math.ceil(viewport.height * pixelRatio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const renderTask = page.render({
      canvasContext: context,
      viewport,
      transform: pixelRatio > 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : undefined,
    });
    void renderTask.promise.catch(() => undefined);
    return () => renderTask.cancel();
  }, [page, viewport]);

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pageBox = pageBoxRef.current;
    if (!pageBox) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = pageBox.getBoundingClientRect();
    dragOffsetRef.current = {
      x: (event.clientX - rect.left) / rect.width - position.x,
      y: (event.clientY - rect.top) / rect.height - position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pageBox = pageBoxRef.current;
    const offset = dragOffsetRef.current;
    if (!dragging || !pageBox || !offset) return;
    const rect = pageBox.getBoundingClientRect();
    onPositionChange({
      x: clamp((event.clientX - rect.left) / rect.width - offset.x, 0.04, 0.96),
      y: clamp((event.clientY - rect.top) / rect.height - offset.y, 0.035, 0.965),
    });
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragOffsetRef.current = null;
    setDragging(false);
  };

  const moveByKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.02 : 0.005;
    const next = { ...position };
    if (event.key === "ArrowLeft") next.x -= step;
    else if (event.key === "ArrowRight") next.x += step;
    else if (event.key === "ArrowUp") next.y -= step;
    else if (event.key === "ArrowDown") next.y += step;
    else return;
    event.preventDefault();
    onPositionChange({ x: clamp(next.x, 0.04, 0.96), y: clamp(next.y, 0.035, 0.965) });
  };

  if (pageError) {
    return (
      <div className="rounded border border-red-200 bg-white p-5 text-sm text-red-700">
        Não foi possível carregar a página {pageNumber}.
      </div>
    );
  }
  if (!viewport) {
    return <div className="h-24 w-[min(90vw,700px)] animate-pulse rounded bg-white" />;
  }

  const signatureWidth = placement === "output_attachment" ? 24 : 34.3;
  const signatureHeight = placement === "output_attachment" ? 5 : 5.72;

  return (
    <div
      ref={(element) => {
        pageBoxRef.current = element;
        if (pageRef) pageRef.current = element;
      }}
      className="relative shrink-0 bg-white shadow-lg"
      style={{ width: viewport.width, height: viewport.height }}
    >
      <canvas ref={canvasRef} className="block" aria-label={`Página ${pageNumber} do PDF`} />
      {isLastPage && signatureUrl ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Rubrica móvel: arraste para posicionar na linha de assinatura. Use as setas para ajustes finos."
          title="Segure e arraste para posicionar a rubrica"
          className={`absolute z-10 select-none border border-dashed border-emerald-700/70 bg-white/10 ${dragging ? "cursor-grabbing ring-2 ring-emerald-500/60" : "cursor-grab hover:ring-2 hover:ring-emerald-500/50"}`}
          style={{
            left: `${position.x * 100}%`,
            top: `${position.y * 100}%`,
            width: `${signatureWidth}%`,
            height: `${signatureHeight}%`,
            transform: "translate(-50%, -50%)",
            touchAction: "none",
          }}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={moveByKeyboard}
        >
          <img
            src={signatureUrl}
            alt="Rubrica cadastrada"
            draggable={false}
            className="h-full w-full pointer-events-none object-contain"
          />
        </div>
      ) : null}
    </div>
  );
}
