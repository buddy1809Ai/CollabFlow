import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  FileText,
  FileType2,
  StickyNote,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  Trash2,
  GripHorizontal,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Check,
} from "lucide-react";
import { computeZoomPatch } from "../utils/mediaGeometry";
import {
  renderAllMediaAnnotations,
  renderMediaAnnotationOp,
} from "../utils/mediaAnnotations";

const OVERLAY_BASE_W = 1400;

const NOTE_THEMES = [
  { name: "Yellow", bgColor: "#fef08a", headerColor: "#fde047", borderColor: "#eab308", textColor: "#422006" },
  { name: "Pink", bgColor: "#fbcfe8", headerColor: "#f9a8d4", borderColor: "#ec4899", textColor: "#500724" },
  { name: "Blue", bgColor: "#bfdbfe", headerColor: "#93c5fd", borderColor: "#3b82f6", textColor: "#172554" },
  { name: "Green", bgColor: "#bbf7d0", headerColor: "#86efac", borderColor: "#22c55e", textColor: "#052e16" },
];

/**
 * BoardMediaLayer
 * Renders movable, aspect-locked 8-way resizable, Acrobat-pannable, and individually
 * removable media objects (PDF slides, Images, Word .docx & Text/Code docs).
 */
const EDGE_HANDLES = [
  {
    dir: "w",
    title: "Drag left edge to resize",
    wrapClass: "top-6 bottom-6 -left-1.5 w-3 cursor-ew-resize",
    pillClass: "h-10 w-1.5",
  },
  {
    dir: "e",
    title: "Drag right edge to resize",
    wrapClass: "top-6 bottom-6 -right-1.5 w-3 cursor-ew-resize",
    pillClass: "h-10 w-1.5",
  },
  {
    dir: "n",
    title: "Drag top edge to resize",
    wrapClass: "left-6 right-6 -top-1.5 h-3 cursor-ns-resize",
    pillClass: "w-10 h-1.5",
  },
  {
    dir: "s",
    title: "Drag bottom edge to resize",
    wrapClass: "left-6 right-6 -bottom-1.5 h-3 cursor-ns-resize",
    pillClass: "w-10 h-1.5",
  },
];

const CORNER_HANDLES = [
  {
    dir: "nw",
    title: "Drag top-left corner to resize",
    posClass: "-top-2 -left-2 cursor-nwse-resize",
  },
  {
    dir: "ne",
    title: "Drag top-right corner to resize",
    posClass: "-top-2 -right-2 cursor-nesw-resize",
  },
  {
    dir: "sw",
    title: "Drag bottom-left corner to resize",
    posClass: "-bottom-2 -left-2 cursor-nesw-resize",
  },
  {
    dir: "se",
    title: "Drag bottom-right corner to resize",
    posClass: "-bottom-2 -right-2 cursor-nwse-resize",
  },
];

const BoardMediaLayer = forwardRef(function BoardMediaLayer(
  {
    items,
    selectedId,
    isInteractive,
    onSelect,
    onUpdateItem,
    onCommitSync,
    onRemoveItem,
    onPdfPageChange,
    onPanStateChange,
  },
  ref
) {
  const dragActionRef = useRef(null);
  const scrollRefs = useRef({});
  const cardRefs = useRef({});
  const overlayRefs = useRef({});
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const callbacksRef = useRef({ onSelect, onUpdateItem, onCommitSync, onPanStateChange });
  callbacksRef.current = { onSelect, onUpdateItem, onCommitSync, onPanStateChange };

  // Re-render page-pinned PDF/Image vector annotations whenever items, pages, or history restore changes
  useEffect(() => {
    for (const item of items || []) {
      if (item.kind !== "pdf" && item.kind !== "image") continue;
      const overlayCanvas = overlayRefs.current[item.id];
      if (!overlayCanvas) continue;
      const oCtx = overlayCanvas.getContext("2d");
      if (!oCtx) continue;
      const pageKey = String(item.currentPage || 1);
      const ops = item.annotationsByPage?.[pageKey] || [];
      renderAllMediaAnnotations(oCtx, ops, overlayCanvas.width, overlayCanvas.height);
    }
  }, [items]);

  const [activePanId, setActivePanId] = useState(null);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteText, setEditingNoteText] = useState("");

  useEffect(() => {
    if (!isInteractive && editingNoteId) {
      setEditingNoteId(null);
    }
  }, [isInteractive, editingNoteId]);

  const commitNoteEdit = useCallback(
    (item) => {
      if (!item || editingNoteId !== item.id) return;
      const trimmed = editingNoteText.trim();
      setEditingNoteId(null);
      if (!trimmed) {
        onRemoveItem?.(item.id);
        return;
      }
      onUpdateItem(
        item.id,
        {
          text: trimmed,
          plainText: trimmed,
          title: trimmed.length > 22 ? `${trimmed.slice(0, 22)}...` : trimmed,
        },
        true
      );
    },
    [editingNoteId, editingNoteText, onRemoveItem, onUpdateItem]
  );

  // Sync programmatic scroll positions (zoom-to-cursor, ▲/▼ scroll buttons, page resets, peers)
  useEffect(() => {
    for (const item of items || []) {
      const el = scrollRefs.current[item.id];
      if (!el) continue;
      if (typeof item.scrollX === "number" && Math.abs(el.scrollLeft - item.scrollX) > 1) {
        el.scrollLeft = item.scrollX;
      }
      if (typeof item.scrollY === "number" && Math.abs(el.scrollTop - item.scrollY) > 1) {
        el.scrollTop = item.scrollY;
      }
    }
  }, [items]);

  // Begin card move, aspect-locked resize, or Acrobat-style internal panning
  const beginDrag = useCallback((item, clientX, clientY, explicitKind = null) => {
    if (!item) return;
    callbacksRef.current.onSelect(item.id);

    let kind = explicitKind;
    let origScrollX = 0;
    let origScrollY = 0;
    let maxScrollX = 0;
    let maxScrollY = 0;

    if (!kind) {
      const scrollEl = scrollRefs.current[item.id];
      const canPanInside =
        (item.kind === "pdf" || item.kind === "image") &&
        scrollEl &&
        (scrollEl.scrollWidth > scrollEl.clientWidth + 2 ||
          scrollEl.scrollHeight > scrollEl.clientHeight + 2);

      if (canPanInside) {
        kind = "pan-scroll";
        origScrollX = scrollEl.scrollLeft;
        origScrollY = scrollEl.scrollTop;
        maxScrollX = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth);
        maxScrollY = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
      } else {
        kind = "move";
      }
    }

    const ratio =
      item.aspectRatio || (item.width && item.height ? item.width / item.height : 0.7727);

    dragActionRef.current = {
      id: item.id,
      itemKind: item.kind,
      kind,
      startMouseX: clientX,
      startMouseY: clientY,
      origX: item.x,
      origY: item.y,
      origW: item.width,
      origH: item.height,
      contentZoom: item.contentZoom || 1,
      aspectRatio: ratio,
      origScrollX,
      origScrollY,
      maxScrollX,
      maxScrollY,
      lastScrollX: origScrollX,
      lastScrollY: origScrollY,
    };

    if (kind === "move" || kind === "pan-scroll") {
      setActivePanId(item.id);
      callbacksRef.current.onPanStateChange?.(true, clientX, clientY);
      document.body.style.cursor = "grabbing";
    }
    document.body.style.userSelect = "none";
  }, []);

  // Expose Acrobat interaction + subpixel PDF/Image annotation overlay hooks to Canvas layer
  useImperativeHandle(
    ref,
    () => ({
      startInteractionFromCanvas: (item, clientX, clientY) => {
        beginDrag(item, clientX, clientY);
      },
      hitTestAnnotatableItem: (clientX, clientY) => {
        const list = itemsRef.current || [];
        for (let i = list.length - 1; i >= 0; i--) {
          const it = list[i];
          if (it.kind !== "pdf" && it.kind !== "image") continue;
          const cardEl = cardRefs.current[it.id];
          const overlayEl = overlayRefs.current[it.id];
          if (!cardEl || !overlayEl) continue;
          const cardRect = cardEl.getBoundingClientRect();
          const overlayRect = overlayEl.getBoundingClientRect();
          if (
            clientX >= cardRect.left &&
            clientX <= cardRect.right &&
            clientY >= cardRect.top &&
            clientY <= cardRect.bottom &&
            clientX >= overlayRect.left &&
            clientX <= overlayRect.right &&
            clientY >= overlayRect.top &&
            clientY <= overlayRect.bottom
          ) {
            return {
              id: it.id,
              page: String(it.currentPage || 1),
              refWidth: it.width || 400,
            };
          }
        }
        return null;
      },
      clientToNormalizedPoint: (itemId, clientX, clientY) => {
        const overlayEl = overlayRefs.current[itemId];
        if (!overlayEl) return null;
        const rect = overlayEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        const nx = Math.max(0, Math.min(1, Number(((clientX - rect.left) / rect.width).toFixed(4))));
        const ny = Math.max(0, Math.min(1, Number(((clientY - rect.top) / rect.height).toFixed(4))));
        return { nx, ny };
      },
      drawLiveStrokeSegment: (itemId, prevPt, currPt, { color, normWidth, isEraser }) => {
        const canvas = overlayRefs.current[itemId];
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        renderMediaAnnotationOp(
          ctx,
          {
            kind: "stroke",
            points: [
              [prevPt.nx, prevPt.ny],
              [currPt.nx, currPt.ny],
            ],
            color,
            normWidth,
            isEraser,
          },
          canvas.width,
          canvas.height
        );
      },
      previewLiveAnnotation: (itemId, pageKey, liveOp) => {
        const canvas = overlayRefs.current[itemId];
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const target = (itemsRef.current || []).find((it) => it.id === itemId);
        const committedOps = target?.annotationsByPage?.[String(pageKey || 1)] || [];
        renderAllMediaAnnotations(ctx, committedOps, canvas.width, canvas.height);
        if (liveOp) renderMediaAnnotationOp(ctx, liveOp, canvas.width, canvas.height);
      },
      redrawItemOverlay: (itemId, pageKey = null) => {
        const canvas = overlayRefs.current[itemId];
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const target = (itemsRef.current || []).find((it) => it.id === itemId);
        const pKey = String(pageKey || target?.currentPage || 1);
        const ops = target?.annotationsByPage?.[pKey] || [];
        renderAllMediaAnnotations(ctx, ops, canvas.width, canvas.height);
      },
    }),
    [beginDrag]
  );

  // Global mousemove/mouseup/blur listeners bound once (never torn down mid-drag!)
  useEffect(() => {
    const finishDrag = (endX = null, endY = null) => {
      const action = dragActionRef.current;
      if (!action) return;
      dragActionRef.current = null;

      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setActivePanId(null);
      callbacksRef.current.onPanStateChange?.(false, endX, endY);

      if (action.kind === "pan-scroll") {
        callbacksRef.current.onUpdateItem(
          action.id,
          { scrollX: action.lastScrollX, scrollY: action.lastScrollY },
          true
        );
      } else {
        callbacksRef.current.onCommitSync();
      }
    };

    const handlePointerMove = (e) => {
      const action = dragActionRef.current;
      if (!action) return;

      const isTouch = Boolean(e.touches);
      if (isTouch) {
        if (e.touches.length !== 1) return;
        e.preventDefault();
      } else if ((e.buttons & 1) === 0) {
        // Guard against mouse button released outside browser window
        finishDrag(e.clientX, e.clientY);
        return;
      }

      const pt = isTouch ? e.touches[0] : e;
      const dx = pt.clientX - action.startMouseX;
      const dy = pt.clientY - action.startMouseY;

      if (action.kind === "pan-scroll") {
        const el = scrollRefs.current[action.id];
        if (!el) return;
        const nextScrollX = Math.max(
          0,
          Math.min(action.maxScrollX, Math.round(action.origScrollX - dx))
        );
        const nextScrollY = Math.max(
          0,
          Math.min(action.maxScrollY, Math.round(action.origScrollY - dy))
        );
        el.scrollLeft = nextScrollX;
        el.scrollTop = nextScrollY;
        action.lastScrollX = nextScrollX;
        action.lastScrollY = nextScrollY;
        return;
      }

      if (action.kind === "move") {
        const maxX = Math.max(8, window.innerWidth - Math.min(action.origW, 140));
        const maxY = Math.max(64, window.innerHeight - 110);
        const nextX = Math.max(8, Math.min(maxX, Math.round(action.origX + dx)));
        const nextY = Math.max(64, Math.min(maxY, Math.round(action.origY + dy)));
        callbacksRef.current.onUpdateItem(action.id, { x: nextX, y: nextY });
        return;
      }

      if (action.kind.startsWith("resize-")) {
        const dir = action.kind.slice(7); // n, s, e, w, nw, ne, sw, se
        const origRight = action.origX + action.origW;
        const origBottom = action.origY + action.origH;

        if (action.itemKind === "doc" || action.itemKind === "note") {
          // Word / Text / Sticky Note cards reflow text cleanly, so free width & height stay flexible
          const isNote = action.itemKind === "note";
          const minW = isNote ? 150 : 200;
          const minH = isNote ? 110 : 140;
          let nextX = action.origX;
          let nextY = action.origY;
          let nextW = action.origW;
          let nextH = action.origH;

          if (dir.includes("e")) {
            const maxW = Math.max(minW, window.innerWidth - action.origX - 12);
            nextW = Math.max(minW, Math.min(maxW, action.origW + dx));
          } else if (dir.includes("w")) {
            const clampedX = Math.max(8, Math.min(origRight - minW, action.origX + dx));
            nextX = clampedX;
            nextW = origRight - clampedX;
          }

          if (dir.includes("s")) {
            const maxH = Math.max(minH, window.innerHeight - action.origY - 76);
            nextH = Math.max(minH, Math.min(maxH, action.origH + dy));
          } else if (dir.includes("n")) {
            const clampedY = Math.max(64, Math.min(origBottom - minH, action.origY + dy));
            nextY = clampedY;
            nextH = origBottom - clampedY;
          }

          callbacksRef.current.onUpdateItem(action.id, {
            x: Math.round(nextX),
            y: Math.round(nextY),
            width: Math.round(nextW),
            height: Math.round(nextH),
          });
          return;
        }

        // Free horizontal & vertical resize (Fit-to-Width) for both Portrait & Landscape PDFs:
        // No portrait aspect-height cap blocking side handles; keep height <= width/ratio (0 blank gaps)
        const ratio = action.aspectRatio;
        const minH = 100;
        const minW = Math.max(160, Math.round(minH * ratio));

        const maxW = dir.includes("w")
          ? Math.max(minW, origRight - 8)
          : Math.max(minW, window.innerWidth - action.origX - 12);
        const maxH = dir.includes("n")
          ? Math.max(minH, origBottom - 64)
          : Math.max(minH, window.innerHeight - action.origY - 76);

        let nextW = action.origW;
        let nextH = action.origH;

        if (dir === "e" || dir === "w") {
          const targetW = dir === "e" ? action.origW + dx : action.origW - dx;
          nextW = Math.max(minW, Math.min(maxW, Math.round(targetW)));
          nextH = Math.max(minH, Math.min(action.origH, Math.round(nextW / ratio)));
        } else if (dir === "n" || dir === "s") {
          const targetH = dir === "s" ? action.origH + dy : action.origH - dy;
          nextH = Math.max(minH, Math.min(maxH, Math.round(targetH)));
          const minRequiredW = Math.round(nextH * ratio);
          if (minRequiredW > nextW) {
            nextW = Math.min(maxW, minRequiredW);
            nextH = Math.max(minH, Math.min(nextH, Math.floor(nextW / ratio)));
          }
        } else {
          const targetW = dir.includes("w") ? action.origW - dx : action.origW + dx;
          const targetH = dir.includes("n") ? action.origH - dy : action.origH + dy;
          nextW = Math.max(minW, Math.min(maxW, Math.round(targetW)));
          nextH = Math.max(minH, Math.min(maxH, Math.round(targetH)));
          const maxContentH = Math.round(nextW / ratio);
          if (nextH > maxContentH) {
            const expandedW = Math.round(nextH * ratio);
            if (expandedW <= maxW) {
              nextW = expandedW;
            } else {
              nextW = maxW;
              nextH = Math.max(minH, Math.floor(nextW / ratio));
            }
          }
        }

        const nextX = dir.includes("w") ? Math.round(origRight - nextW) : action.origX;
        const nextY = dir.includes("n") ? Math.round(origBottom - nextH) : action.origY;

        const contentScale = action.contentZoom || 1;
        const scrollEl = scrollRefs.current[action.id];
        const nextMaxScrollX = Math.max(0, Math.round(nextW * contentScale - nextW));
        const nextMaxScrollY = Math.max(0, Math.round((nextW * contentScale) / ratio - nextH));

        callbacksRef.current.onUpdateItem(action.id, {
          x: nextX,
          y: nextY,
          width: nextW,
          height: nextH,
          baseWidth: nextW,
          baseHeight: nextH,
          scrollX: scrollEl
            ? Math.max(0, Math.min(nextMaxScrollX, scrollEl.scrollLeft))
            : 0,
          scrollY: scrollEl
            ? Math.max(0, Math.min(nextMaxScrollY, scrollEl.scrollTop))
            : 0,
        });
      }
    };

    const handlePointerUp = (e) => {
      const pt = e.changedTouches?.[0] || e;
      finishDrag(pt?.clientX ?? null, pt?.clientY ?? null);
    };
    const handleWindowBlur = () => finishDrag();

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
    window.addEventListener("touchmove", handlePointerMove, { passive: false });
    window.addEventListener("touchend", handlePointerUp);
    window.addEventListener("touchcancel", handlePointerUp);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
      window.removeEventListener("touchmove", handlePointerMove);
      window.removeEventListener("touchend", handlePointerUp);
      window.removeEventListener("touchcancel", handlePointerUp);
      window.removeEventListener("blur", handleWindowBlur);
      if (dragActionRef.current) {
        dragActionRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
  }, []);

  if (!items || items.length === 0) return null;

  const startHandleDrag = (e, item, kind) => {
    if (!e.touches && e.button !== 0) return;
    if (e.touches && e.touches.length !== 1) return;
    e.stopPropagation();
    if (!e.touches) e.preventDefault();
    const pt = e.touches?.[0] || e;
    beginDrag(item, pt.clientX, pt.clientY, kind);
  };

  // Zoom INSIDE the PDF / Image / Word Doc content (50% to 300%) cleanly via shared geometry helper
  const handleContentZoom = (e, item, delta) => {
    e.stopPropagation();
    const patch = computeZoomPatch(
      item,
      (item.contentZoom || 1) + delta,
      window.innerWidth,
      window.innerHeight
    );
    if (patch) onUpdateItem(item.id, patch, true);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {items.map((item) => {
        const isSelected = selectedId === item.id;
        const zoom = item.contentZoom || 1;
        const isPanningThis = activePanId === item.id;
        const isNote = item.kind === "note";
        const isEditingThisNote = isNote && editingNoteId === item.id;
        const KindIcon =
          item.kind === "pdf"
            ? FileText
            : item.kind === "doc"
            ? FileType2
            : isNote
            ? StickyNote
            : ImageIcon;

        return (
          <div
            key={item.id}
            ref={(el) => {
              cardRefs.current[item.id] = el;
            }}
            data-media-card-id={item.id}
            onDragStart={(e) => e.preventDefault()}
            style={{
              left: item.x,
              top: item.y,
              width: item.width,
              height: item.height,
              ...(isNote
                ? {
                    backgroundColor: item.bgColor || "#fef08a",
                    borderColor: isSelected && isInteractive ? undefined : item.borderColor || "#eab308",
                  }
                : {}),
            }}
            onMouseDown={(e) => {
              if (!isInteractive || e.button !== 0 || isEditingThisNote) return;
              e.stopPropagation();
              e.preventDefault();
              beginDrag(item, e.clientX, e.clientY);
            }}
            onTouchStart={(e) => {
              if (!isInteractive || e.touches.length !== 1 || isEditingThisNote) return;
              e.stopPropagation();
              beginDrag(item, e.touches[0].clientX, e.touches[0].clientY);
            }}
            onDoubleClick={(e) => {
              if (!isInteractive || !isNote) return;
              e.stopPropagation();
              setEditingNoteId(item.id);
              setEditingNoteText(item.plainText ?? item.text ?? "");
            }}
            className={`absolute group rounded-xl select-none transition-shadow ${
              isInteractive ? "pointer-events-auto touch-none" : "pointer-events-none"
            } ${
              isInteractive
                ? isEditingThisNote
                  ? "cursor-text"
                  : isPanningThis
                  ? "cursor-grabbing"
                  : item.kind === "doc"
                  ? "cursor-default"
                  : "cursor-grab"
                : ""
            } ${
              isSelected && isInteractive
                ? "ring-2 ring-indigo-500 shadow-2xl"
                : isNote
                ? "border-[1.5px] shadow-md"
                : "border border-slate-200/90 shadow-lg"
            }`}
          >
            {/* Floating Mini Control Header on Item (Interactive in Move Mode; dragging header moves card) */}
            {isInteractive && (
              <div
                onMouseDown={(e) => startHandleDrag(e, item, "move")}
                onTouchStart={(e) => startHandleDrag(e, item, "move")}
                className="pointer-events-auto touch-none absolute -top-11 left-1/2 -translate-x-1/2 z-40 min-w-full w-max max-w-[92vw] flex items-center justify-between gap-2 rounded-xl bg-slate-900/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg backdrop-blur-md cursor-grab active:cursor-grabbing"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <GripHorizontal className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <KindIcon className="h-3.5 w-3.5 text-indigo-300 shrink-0" />
                  <span className="truncate max-w-[130px]" title={item.title}>
                    {isNote ? "Note" : item.title}
                  </span>
                </div>

                <div
                  className="flex items-center gap-1 shrink-0"
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                >
                  {isNote && (
                    <div className="flex items-center gap-1 pr-1.5 border-r border-slate-700">
                      {NOTE_THEMES.map((theme) => (
                        <button
                          key={theme.name}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateItem(
                              item.id,
                              {
                                bgColor: theme.bgColor,
                                headerColor: theme.headerColor,
                                borderColor: theme.borderColor,
                                textColor: theme.textColor,
                              },
                              true
                            );
                          }}
                          style={{ backgroundColor: theme.bgColor, borderColor: theme.borderColor }}
                          className={`h-3.5 w-3.5 rounded-full border transition hover:scale-125 cursor-pointer ${
                            (item.bgColor || "#fef08a") === theme.bgColor
                              ? "ring-2 ring-white scale-110"
                              : ""
                          }`}
                          title={`${theme.name} Note`}
                        />
                      ))}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isEditingThisNote) {
                            commitNoteEdit(item);
                          } else {
                            setEditingNoteId(item.id);
                            setEditingNoteText(item.plainText ?? item.text ?? "");
                          }
                        }}
                        className="ml-0.5 p-1 rounded hover:bg-slate-700 cursor-pointer transition"
                        title={isEditingThisNote ? "Save note text" : "Edit note text"}
                      >
                        {isEditingThisNote ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Pencil className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  )}

                  {item.kind === "pdf" && item.totalPages > 1 && (
                    <div className="flex items-center gap-0.5 pr-1 border-r border-slate-700">
                      <button
                        type="button"
                        disabled={item.currentPage <= 1}
                        onClick={() => onPdfPageChange(item, item.currentPage - 1)}
                        className="p-0.5 rounded hover:bg-slate-700 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed transition"
                        title="Previous Page"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-[10px] px-0.5 tabular-nums min-w-[30px] text-center">
                        {item.currentPage}/{item.totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={item.currentPage >= item.totalPages}
                        onClick={() => onPdfPageChange(item, item.currentPage + 1)}
                        className="p-0.5 rounded hover:bg-slate-700 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed transition"
                        title="Next Page"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={(e) => handleContentZoom(e, item, -0.25)}
                    className="p-1 rounded hover:bg-slate-700 cursor-pointer transition"
                    title="Zoom Out Inside Content"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-[10px] tabular-nums min-w-[32px] text-center text-slate-300">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleContentZoom(e, item, 0.25)}
                    className="p-1 rounded hover:bg-slate-700 cursor-pointer transition"
                    title="Zoom In Inside Content"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveItem(item.id);
                    }}
                    className="ml-0.5 p-1 rounded text-rose-300 hover:bg-rose-600 hover:text-white cursor-pointer transition"
                    title="Remove from board"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Item Body: Fixed Outer Frame with Zoom/Scroll-Locked Page Annotation Canvas */}
            {(item.kind === "image" || item.kind === "pdf") && (() => {
              const cardRatio =
                item.aspectRatio || item.width / Math.max(1, item.height);
              const contentW = item.width * zoom;
              const contentH = contentW / Math.max(0.1, cardRatio);
              const isShrinkCentered = zoom < 1 && contentH <= item.height + 1;
              const overlayW = OVERLAY_BASE_W;
              const overlayH = Math.max(1, Math.round(OVERLAY_BASE_W / Math.max(0.1, cardRatio)));
              return (
                <div
                  ref={(el) => {
                    scrollRefs.current[item.id] = el;
                  }}
                  className={`h-full w-full rounded-xl overflow-hidden select-none ${
                    isShrinkCentered ? "flex items-center justify-center bg-slate-100/80" : "bg-white"
                  }`}
                >
                  <div
                    style={{ width: `${Math.round(zoom * 100)}%` }}
                    className={`relative shrink-0 ${
                      zoom < 1 && !isShrinkCentered ? "mx-auto" : ""
                    }`}
                  >
                    <img
                      src={item.src}
                      alt={item.title}
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
                      className="block w-full h-auto select-none pointer-events-none"
                    />
                    <canvas
                      ref={(el) => {
                        overlayRefs.current[item.id] = el;
                      }}
                      width={overlayW}
                      height={overlayH}
                      className="pointer-events-none absolute inset-0 h-full w-full"
                    />
                  </div>
                </div>
              );
            })()}

            {item.kind === "doc" && (
              <div className="h-full w-full rounded-xl bg-white flex flex-col overflow-hidden">
                <div
                  onMouseDown={(e) => {
                    if (isInteractive) startHandleDrag(e, item, "move");
                  }}
                  onTouchStart={(e) => {
                    if (isInteractive) startHandleDrag(e, item, "move");
                  }}
                  className={`flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 shrink-0 ${
                    isInteractive ? "cursor-grab active:cursor-grabbing touch-none" : ""
                  }`}
                >
                  <FileType2 className="h-4 w-4 text-indigo-600 shrink-0" />
                  <span className="truncate text-xs font-bold text-slate-800">
                    {item.title}
                  </span>
                </div>
                <div
                  ref={(el) => {
                    scrollRefs.current[item.id] = el;
                  }}
                  onMouseDown={(e) => {
                    if (isInteractive) e.stopPropagation();
                  }}
                  onTouchStart={(e) => {
                    if (isInteractive) e.stopPropagation();
                  }}
                  onScroll={(e) => {
                    onUpdateItem(item.id, {
                      scrollY: Math.round(e.currentTarget.scrollTop),
                    });
                  }}
                  style={{ fontSize: `${Math.round(13 * zoom)}px` }}
                  className="flex-1 overflow-y-auto p-3.5 leading-relaxed text-slate-700 whitespace-pre-wrap break-words font-sans select-text"
                >
                  {item.plainText}
                </div>
              </div>
            )}

            {item.kind === "note" && (
              <div
                className="h-full w-full rounded-xl flex flex-col overflow-hidden"
                style={{ backgroundColor: item.bgColor || "#fef08a" }}
              >
                <div
                  onMouseDown={(e) => {
                    if (isInteractive) startHandleDrag(e, item, "move");
                  }}
                  onTouchStart={(e) => {
                    if (isInteractive) startHandleDrag(e, item, "move");
                  }}
                  style={{ backgroundColor: item.headerColor || "#fde047" }}
                  className={`h-4 w-full shrink-0 ${
                    isInteractive ? "cursor-grab active:cursor-grabbing touch-none" : ""
                  }`}
                />
                {isEditingThisNote ? (
                  <textarea
                    autoFocus
                    value={editingNoteText}
                    onChange={(e) => setEditingNoteText(e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onBlur={() => commitNoteEdit(item)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        commitNoteEdit(item);
                      } else if (e.key === "Escape") {
                        setEditingNoteId(null);
                      }
                    }}
                    style={{
                      fontSize: `${Math.round(13 * zoom)}px`,
                      color: item.textColor || "#422006",
                    }}
                    className="flex-1 w-full bg-transparent px-3.5 py-2 font-medium leading-snug outline-none resize-none select-text"
                  />
                ) : (
                  <div
                    style={{
                      fontSize: `${Math.round(13 * zoom)}px`,
                      color: item.textColor || "#422006",
                    }}
                    className="flex-1 overflow-y-auto px-3.5 py-2.5 font-medium leading-snug whitespace-pre-wrap break-words font-sans"
                  >
                    {item.plainText ?? item.text}
                  </div>
                )}
              </div>
            )}

            {/* Edge Middle Dash Resize Handles (Left, Right, Top, Bottom) */}
            {isInteractive &&
              EDGE_HANDLES.map((h) => (
                <div
                  key={h.dir}
                  onMouseDown={(e) => startHandleDrag(e, item, `resize-${h.dir}`)}
                  onTouchStart={(e) => startHandleDrag(e, item, `resize-${h.dir}`)}
                  title={h.title}
                  className={`pointer-events-auto touch-none absolute z-20 flex items-center justify-center group/edge ${h.wrapClass}`}
                >
                  <div
                    className={`${h.pillClass} rounded-full bg-indigo-500/85 group-hover/edge:bg-indigo-600 group-hover/edge:scale-110 transition-all shadow-sm`}
                  />
                </div>
              ))}

            {/* 4 Corner Circle Resize Handles (NW, NE, SW, SE) */}
            {isInteractive &&
              CORNER_HANDLES.map((c) => (
                <div
                  key={c.dir}
                  onMouseDown={(e) => startHandleDrag(e, item, `resize-${c.dir}`)}
                  onTouchStart={(e) => startHandleDrag(e, item, `resize-${c.dir}`)}
                  title={c.title}
                  className={`pointer-events-auto touch-none absolute z-30 h-4 w-4 rounded-full bg-indigo-600 border-2 border-white shadow-md hover:scale-125 transition-transform ${c.posClass}`}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
});

export default BoardMediaLayer;
