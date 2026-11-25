import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  MousePointer2,
  Pencil,
  Eraser,
  Type,
  StickyNote,
  Square,
  Circle,
  Minus,
  ArrowUpRight,
  Diamond,
  Triangle,
  Shapes,
  ChevronUp,
  Crosshair,
  Image as ImageIcon,
  FileText,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  X,
  Grid3x3,
  Trash2,
  Undo2,
  Redo2,
  Camera,
  Check,
  GripVertical,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import mammoth from "mammoth/mammoth.browser.min.js";
import Cursor from "./Cursor";
import BoardMediaLayer from "./BoardMediaLayer";
import { throttle } from "../utils/throttle";
import { buildCompositeBoardDataUrl } from "../utils/exportBoard";
import {
  computeZoomPatch,
  fitItemToViewport,
  findMediaItemAtPoint,
} from "../utils/mediaGeometry";

const PDF_ONLY_SET = new Set(["pdf"]);

// Configure official Mozilla PDF.js worker for Vite local & production builds
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Flowchart & geometric shapes available in the Shapes popover menu
const SHAPE_OPTIONS = [
  { id: "rect", label: "Rectangle", shortcut: "R", Icon: Square },
  { id: "circle", label: "Circle", shortcut: "C", Icon: Circle },
  { id: "line", label: "Line", shortcut: "L", Icon: Minus },
  { id: "arrow", label: "Arrow", shortcut: "A", Icon: ArrowUpRight },
  { id: "diamond", label: "Diamond", shortcut: "D", Icon: Diamond },
  { id: "triangle", label: "Triangle", shortcut: "V", Icon: Triangle },
];

const SHAPE_IDS = SHAPE_OPTIONS.map((shape) => shape.id);

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "csv",
  "json",
  "js",
  "jsx",
  "ts",
  "py",
  "java",
  "cpp",
  "c",
  "html",
  "css",
]);

function wrapTextLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Reusable Shape Rendering Helper (supports Flowchart Shapes + AI Labels)
 */
export const renderShape = (
  ctx,
  { type, startX, startY, endX, endY, color, width = 3, label }
) => {
  if (!ctx) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "source-over";

  const minX = Math.min(startX, endX);
  const maxX = Math.max(startX, endX);
  const minY = Math.min(startY, endY);
  const maxY = Math.max(startY, endY);
  const w = maxX - minX;
  const h = maxY - minY;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  if (type === "rect") {
    ctx.strokeRect(minX, minY, w, h);
  } else if (type === "circle") {
    const centerX = (startX + endX) / 2;
    const centerY = (startY + endY) / 2;
    const radius = Math.hypot(endX - startX, endY - startY) / 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.stroke();
  } else if (type === "line") {
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  } else if (type === "arrow") {
    if (Math.hypot(endX - startX, endY - startY) >= 2) {
      const headLen = Math.max(12, width * 3.5);
      const angle = Math.atan2(endY - startY, endX - startX);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.lineTo(
        endX - headLen * Math.cos(angle - Math.PI / 6),
        endY - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - headLen * Math.cos(angle + Math.PI / 6),
        endY - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
    }
  } else if (type === "diamond") {
    ctx.beginPath();
    ctx.moveTo(midX, minY);
    ctx.lineTo(maxX, midY);
    ctx.lineTo(midX, maxY);
    ctx.lineTo(minX, midY);
    ctx.closePath();
    ctx.stroke();
  } else if (type === "triangle") {
    ctx.beginPath();
    ctx.moveTo(midX, minY);
    ctx.lineTo(maxX, maxY);
    ctx.lineTo(minX, maxY);
    ctx.closePath();
    ctx.stroke();
  }

  if (label && typeof label === "string" && label.trim()) {
    ctx.font = "600 13px Inter, system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (type === "arrow" || type === "line") {
      const arrowMidX = (startX + endX) / 2;
      const arrowMidY = (startY + endY) / 2;
      const textWidth = ctx.measureText(label.trim()).width;
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.fillRect(arrowMidX - textWidth / 2 - 4, arrowMidY - 10, textWidth + 8, 20);
      ctx.fillStyle = "#334155";
      ctx.fillText(label.trim(), arrowMidX, arrowMidY);
    } else {
      ctx.fillStyle = color;
      ctx.fillText(label.trim(), midX, midY, Math.max(40, w - 16));
    }
  }

  ctx.restore();
};

export const renderText = (ctx, { text, x, y, color, fontSize = 18 }) => {
  if (!ctx || !text) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `600 ${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.globalCompositeOperation = "source-over";

  const lines = text.split("\n");
  lines.forEach((line, idx) => {
    ctx.fillText(line, x, y + idx * (fontSize * 1.3));
  });
  ctx.restore();
};

export const renderNote = (
  ctx,
  { text, x, y, bgColor = "#fef08a", borderColor = "#eab308", textColor = "#422006" }
) => {
  if (!ctx || !text) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.font = "500 13px Inter, system-ui, -apple-system, sans-serif";

  const noteW = 190;
  const padX = 14;
  const padY = 22;
  const maxTextWidth = noteW - padX * 2;

  const paragraphs = text.split("\n");
  const lines = [];
  for (const para of paragraphs) {
    if (!para.trim()) lines.push("");
    else lines.push(...wrapTextLines(ctx, para, maxTextWidth));
  }

  const lineHeight = 18;
  const noteH = Math.max(120, padY + lines.length * lineHeight + 16);

  ctx.shadowColor = "rgba(15, 23, 42, 0.14)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 5;

  ctx.fillStyle = bgColor;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, noteW, noteH, 10);
  else ctx.rect(x, y, noteW, noteH);
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "rgba(234, 179, 8, 0.25)";
  ctx.fillRect(x + 1, y + 1, noteW - 2, 12);

  ctx.fillStyle = textColor;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  lines.forEach((line, idx) => {
    ctx.fillText(line, x + padX, y + padY + idx * lineHeight);
  });

  ctx.restore();
};

/**
 * CollabFlow Master Canvas Component
 * Layers:
 * - z-0: Dot-Grid CSS pattern (toggleable via Grid button or 'G')
 * - z-10: BoardMediaLayer (Movable, resizable, zoomable & removable PDF slides, Images, Word .docx & Text/Code notes)
 * - z-20: Primary High-DPI Canvas + Ephemeral Laser Pointer Overlay
 * - z-30: Floating PDF/Media Quick Controls, Header, Bottom Single-Line Toolbar
 */
export default function Canvas({
  socket,
  isConnected,
  roomId,
  currentUser,
  onRegisterControls,
}) {
  const canvasRef = useRef(null);
  const laserCanvasRef = useRef(null);
  const ctxRef = useRef(null);
  const laserCtxRef = useRef(null);
  const fileInputRef = useRef(null);
  const shapesMenuRef = useRef(null);

  const isDrawing = useRef(false);
  const lastCoords = useRef({ x: 0, y: 0 });
  const shapeStartCoords = useRef({ x: 0, y: 0 });
  const dragSnapshot = useRef(null);

  // Ephemeral laser pointer trail
  const laserSegments = useRef([]);
  const isLaserLoopRunning = useRef(false);
  const laserRafId = useRef(null);

  // Time-lapse session replay
  const actionLog = useRef([]);
  const replayTimers = useRef([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const [canReplay, setCanReplay] = useState(false);

  // Movable / Resizable / Removable Board Media Items (Images, PDFs, Word Docs, Code/Notes)
  const boardWrapperRef = useRef(null);
  const mediaLayerRef = useRef(null);
  const wheelSyncTimerRef = useRef(null);
  const isPanningPdfRef = useRef(false);
  const [hoveredCanvasCursor, setHoveredCanvasCursor] = useState(null);
  const [boardItems, setBoardItems] = useState([]);
  const boardItemsRef = useRef([]);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const selectedItemIdRef = useRef(null);
  selectedItemIdRef.current = selectedItemId;
  const pdfDocsMapRef = useRef({}); // { [itemId]: pdfDocumentProxy }
  const pdfPageCacheRef = useRef({}); // { [`${itemId}:${page}`]: { src, aspectWidth, aspectHeight } }
  const pdfInFlightRef = useRef({}); // Deduplicate concurrent renders of the same page
  const latestPdfRequestRef = useRef({}); // { [itemId]: targetPage } to drop stale async renders
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Undo / Redo stacks
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const [remoteCursors, setRemoteCursors] = useState({});

  // Floating Text / Sticky Note inline editor
  const [pendingInput, setPendingInput] = useState(null);
  const isInputOpenRef = useRef(false);
  const textInputRef = useRef(null);
  const inputWrapperRef = useRef(null);
  const textSpawnTimeRef = useRef(0);

  // Toolbar UI States
  const [tool, setTool] = useState("pen");
  const toolRef = useRef("pen");
  toolRef.current = tool;

  const handlePdfPanStateChange = useCallback((panning, clientX = null, clientY = null) => {
    isPanningPdfRef.current = panning;
    if (panning) {
      setHoveredCanvasCursor("grabbing");
      return;
    }
    if (
      typeof clientX === "number" &&
      typeof clientY === "number" &&
      toolRef.current === "pen"
    ) {
      const stillOverPdf = Boolean(
        findMediaItemAtPoint(
          boardItemsRef.current,
          clientX,
          clientY,
          selectedItemIdRef.current,
          PDF_ONLY_SET
        )
      );
      setHoveredCanvasCursor(stillOverPdf ? "grab" : null);
    } else {
      setHoveredCanvasCursor(null);
    }
  }, []);
  const [lastShape, setLastShape] = useState("rect");
  const [showShapesMenu, setShowShapesMenu] = useState(false);
  const [color, setColor] = useState("#1e293b");
  const [lineWidth, setLineWidth] = useState(4);
  const [showGrid, setShowGrid] = useState(true);
  const [justSavedSnapshot, setJustSavedSnapshot] = useState(false);

  // Draggable position offset for the Active Media Quick Controls Bar
  const [mediaBarOffset, setMediaBarOffset] = useState({ x: 0, y: 0 });
  const mediaBarDragRef = useRef(null);

  const colors = [
    { name: "Slate", value: "#1e293b" },
    { name: "Blue", value: "#2563eb" },
    { name: "Red", value: "#dc2626" },
    { name: "Green", value: "#16a34a" },
    { name: "Purple", value: "#9333ea" },
    { name: "Amber", value: "#d97706" },
  ];

  const brushSizes = [
    { label: "Fine", title: "Fine (2px)", size: 2 },
    { label: "Medium", title: "Medium (4px)", size: 4 },
    { label: "Thick", title: "Thick (8px)", size: 8 },
  ];

  const throttledEmitCursor = useRef(
    throttle((data) => {
      if (socket && socket.connected) socket.emit("cursor-move", data);
    }, 25)
  ).current;

  const throttledEmitLaser = useRef(
    throttle((data) => {
      if (socket && socket.connected) socket.emit("laser-move", data);
    }, 25)
  ).current;

  // Broadcast updated movable media items to room peers
  const commitBoardItemsSync = useCallback(
    (itemsOverride = null) => {
      const itemsToSync = itemsOverride || boardItemsRef.current;
      if (socket && socket.connected) {
        socket.emit("sync-board-items", { roomId, items: itemsToSync });
      }
    },
    [socket, roomId]
  );

  // Update a single media item cleanly (optionally broadcasting right away)
  const handleUpdateBoardItem = useCallback(
    (id, patch, shouldSyncImmediately = false) => {
      const next = boardItemsRef.current.map((it) =>
        it.id === id ? { ...it, ...patch } : it
      );
      boardItemsRef.current = next;
      setBoardItems(next);
      if (shouldSyncImmediately) {
        commitBoardItemsSync(next);
      }
    },
    [commitBoardItemsSync]
  );

  // Remove a specific PDF, Image, or Word Doc without touching drawings
  const handleRemoveBoardItem = useCallback(
    (id) => {
      delete pdfDocsMapRef.current[id];
      delete latestPdfRequestRef.current[id];
      const prefix = `${id}:`;
      for (const key of Object.keys(pdfPageCacheRef.current)) {
        if (key.startsWith(prefix)) delete pdfPageCacheRef.current[key];
      }
      for (const key of Object.keys(pdfInFlightRef.current)) {
        if (key.startsWith(prefix)) delete pdfInFlightRef.current[key];
      }
      const next = boardItemsRef.current.filter((it) => it.id !== id);
      boardItemsRef.current = next;
      setBoardItems(next);
      setSelectedItemId((prev) =>
        prev === id ? next[next.length - 1]?.id || null : prev
      );
      commitBoardItemsSync(next);
    },
    [commitBoardItemsSync]
  );

  // Inside Content Zoom (50% to 300%) — aspect-locked via shared mediaGeometry helper
  const handleInsideZoomItem = useCallback(
    (item, delta) => {
      if (!item) return;
      const patch = computeZoomPatch(
        item,
        (item.contentZoom || 1) + delta,
        window.innerWidth,
        window.innerHeight
      );
      if (patch) handleUpdateBoardItem(item.id, patch, true);
    },
    [handleUpdateBoardItem]
  );

  // Quick scroll inside a zoomed PDF or Word Doc even while Pen tool is active
  const handleScrollInsideItem = useCallback(
    (item, dy) => {
      if (!item) return;
      const currentY = item.scrollY || 0;
      const nextY = Math.max(0, currentY + dy);
      handleUpdateBoardItem(item.id, { scrollY: nextY }, true);
    },
    [handleUpdateBoardItem]
  );

  // Smooth mouse-wheel / trackpad zoom-toward-cursor inside media cards (Move & Draw modes)
  useEffect(() => {
    const wrapper = boardWrapperRef.current;
    if (!wrapper) return;

    const scheduleWheelSync = () => {
      if (wheelSyncTimerRef.current) clearTimeout(wheelSyncTimerRef.current);
      wheelSyncTimerRef.current = setTimeout(() => {
        commitBoardItemsSync();
        wheelSyncTimerRef.current = null;
      }, 180);
    };

    const handleWheel = (e) => {
      const targetEl = e.target;
      if (!(targetEl instanceof Element)) return;

      const cardEl = targetEl.closest("[data-media-card-id]");
      const isOnCanvas = targetEl === canvasRef.current;
      if (!cardEl && !isOnCanvas) return;

      const items = boardItemsRef.current;
      if (!items.length) return;

      const targetItem = cardEl
        ? items.find((it) => it.id === cardEl.getAttribute("data-media-card-id"))
        : findMediaItemAtPoint(items, e.clientX, e.clientY, selectedItemIdRef.current);
      if (!targetItem) return;

      const rawDelta =
        e.deltaMode === 1 ? e.deltaY * 24 : e.deltaMode === 2 ? e.deltaY * 200 : e.deltaY;
      if (!rawDelta) return;

      // Word / code docs: native vertical scroll in Move mode, scroll/zoom in Draw or Ctrl+Wheel
      if (targetItem.kind === "doc" && !e.ctrlKey && !e.metaKey) {
        if (isOnCanvas) {
          e.preventDefault();
          const nextY = Math.max(0, Math.round((targetItem.scrollY || 0) + rawDelta));
          handleUpdateBoardItem(targetItem.id, { scrollY: nextY }, false);
          scheduleWheelSync();
        }
        return;
      }

      e.preventDefault();

      if (selectedItemIdRef.current !== targetItem.id) {
        setSelectedItemId(targetItem.id);
      }

      // Shift + Wheel scrolls vertically inside zoomed PDFs/Images
      if (
        e.shiftKey &&
        targetItem.kind !== "doc" &&
        (targetItem.contentZoom || 1) > 1
      ) {
        const nextY = Math.max(0, Math.round((targetItem.scrollY || 0) + rawDelta));
        handleUpdateBoardItem(targetItem.id, { scrollY: nextY }, false);
        scheduleWheelSync();
        return;
      }

      const step = Math.max(-0.25, Math.min(0.25, (-rawDelta / 100) * 0.15));
      const oldZoom = targetItem.contentZoom || 1;
      const patch = computeZoomPatch(
        targetItem,
        oldZoom + step,
        window.innerWidth,
        window.innerHeight,
        { clientX: e.clientX, clientY: e.clientY }
      );
      if (!patch) return;

      handleUpdateBoardItem(targetItem.id, patch, false);
      scheduleWheelSync();
    };

    wrapper.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      wrapper.removeEventListener("wheel", handleWheel);
      if (wheelSyncTimerRef.current) {
        clearTimeout(wheelSyncTimerRef.current);
        wheelSyncTimerRef.current = null;
      }
    };
  }, [handleUpdateBoardItem, commitBoardItemsSync]);

  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStack.current.push(snapshot);

    if (undoStack.current.length > 25) undoStack.current.shift();

    redoStack.current = [];
    setCanUndo(undoStack.current.length > 1);
    setCanRedo(false);
    if (actionLog.current.length > 0) setCanReplay(true);
  }, []);

  const broadcastCanvasState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !socket || !socket.connected) return;
    const imageBase64 = canvas.toDataURL("image/png");
    socket.emit("sync-canvas-state", { roomId, imageBase64 });
  }, [socket, roomId]);

  const triggerLaserAnimation = useCallback(() => {
    if (isLaserLoopRunning.current) return;
    isLaserLoopRunning.current = true;

    const renderFrame = () => {
      const lCanvas = laserCanvasRef.current;
      const lCtx = laserCtxRef.current;
      if (!lCanvas || !lCtx) {
        isLaserLoopRunning.current = false;
        return;
      }

      lCtx.save();
      lCtx.setTransform(1, 0, 0, 1, 0, 0);
      lCtx.clearRect(0, 0, lCanvas.width, lCanvas.height);
      lCtx.restore();

      const now = Date.now();
      const lifetimeMs = 650;
      laserSegments.current = laserSegments.current.filter(
        (seg) => now - seg.createdAt < lifetimeMs
      );

      if (laserSegments.current.length > 0) {
        lCtx.save();
        lCtx.lineCap = "round";
        lCtx.lineJoin = "round";

        for (const seg of laserSegments.current) {
          const life = Math.max(0, 1 - (now - seg.createdAt) / lifetimeMs);
          lCtx.globalAlpha = life * 0.22;
          lCtx.strokeStyle = seg.color || "#fb7185";
          lCtx.lineWidth = Math.max(2, life * 10);
          lCtx.beginPath();
          lCtx.moveTo(seg.x1, seg.y1);
          lCtx.lineTo(seg.x2, seg.y2);
          lCtx.stroke();
        }

        lCtx.shadowBlur = 8;
        for (const seg of laserSegments.current) {
          const life = Math.max(0, 1 - (now - seg.createdAt) / lifetimeMs);
          const beamColor = seg.color || "#fb7185";
          lCtx.shadowColor = beamColor;
          lCtx.globalAlpha = life * 0.85;
          lCtx.strokeStyle = beamColor;
          lCtx.lineWidth = Math.max(0.8, life * 4);
          lCtx.beginPath();
          lCtx.moveTo(seg.x1, seg.y1);
          lCtx.lineTo(seg.x2, seg.y2);
          lCtx.stroke();
        }

        const tip = laserSegments.current[laserSegments.current.length - 1];
        const tipLife = Math.max(0, 1 - (now - tip.createdAt) / lifetimeMs);
        const tipColor = tip.color || "#fb7185";
        lCtx.shadowColor = tipColor;
        lCtx.shadowBlur = 12;

        lCtx.globalAlpha = tipLife * 0.3;
        lCtx.fillStyle = tipColor;
        lCtx.beginPath();
        lCtx.arc(tip.x2, tip.y2, 8, 0, 2 * Math.PI);
        lCtx.fill();

        lCtx.globalAlpha = tipLife;
        lCtx.fillStyle = tipColor;
        lCtx.beginPath();
        lCtx.arc(tip.x2, tip.y2, 3.2, 0, 2 * Math.PI);
        lCtx.fill();

        lCtx.restore();
        laserRafId.current = requestAnimationFrame(renderFrame);
      } else {
        isLaserLoopRunning.current = false;
        laserRafId.current = null;
      }
    };

    laserRafId.current = requestAnimationFrame(renderFrame);
  }, []);

  const clearCanvasLocally = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }, []);

  // 1. Setup Canvas, Laser Overlay & Resize Preservation
  useEffect(() => {
    const canvas = canvasRef.current;
    const laserCanvas = laserCanvasRef.current;
    if (!canvas || !laserCanvas) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const lCtx = laserCanvas.getContext("2d");
    ctxRef.current = ctx;
    laserCtxRef.current = lCtx;

    const configureCanvasSize = (targetCanvas, targetCtx) => {
      const dpr = window.devicePixelRatio || 1;
      targetCanvas.style.width = `${window.innerWidth}px`;
      targetCanvas.style.height = `${window.innerHeight}px`;
      targetCanvas.width = window.innerWidth * dpr;
      targetCanvas.height = window.innerHeight * dpr;
      targetCtx.scale(dpr, dpr);
      targetCtx.lineCap = "round";
      targetCtx.lineJoin = "round";
    };

    configureCanvasSize(canvas, ctx);
    configureCanvasSize(laserCanvas, lCtx);

    undoStack.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
    redoStack.current = [];
    setCanUndo(false);
    setCanRedo(false);

    const handleResize = () => {
      const currentCanvas = canvasRef.current;
      const currentCtx = ctxRef.current;
      const currentLaser = laserCanvasRef.current;
      const currentLaserCtx = laserCtxRef.current;
      if (!currentCanvas || !currentCtx) return;

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = currentCanvas.width;
      tempCanvas.height = currentCanvas.height;
      tempCanvas.getContext("2d").drawImage(currentCanvas, 0, 0);

      configureCanvasSize(currentCanvas, currentCtx);
      if (currentLaser && currentLaserCtx) {
        configureCanvasSize(currentLaser, currentLaserCtx);
      }

      currentCtx.save();
      currentCtx.setTransform(1, 0, 0, 1, 0, 0);
      currentCtx.drawImage(tempCanvas, 0, 0);
      currentCtx.restore();

      if (boardItemsRef.current.length > 0) {
        const fitted = boardItemsRef.current.map((it) => {
          const patch = fitItemToViewport(it, window.innerWidth, window.innerHeight);
          return patch ? { ...it, ...patch } : it;
        });
        boardItemsRef.current = fitted;
        setBoardItems(fitted);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (laserRafId.current) cancelAnimationFrame(laserRafId.current);
      replayTimers.current.forEach((id) => clearTimeout(id));
    };
  }, []);

  // 2. Clear board & reset states on room switch
  useEffect(() => {
    clearCanvasLocally();
    setRemoteCursors({});
    isInputOpenRef.current = false;
    setPendingInput(null);
    isPanningPdfRef.current = false;
    setHoveredCanvasCursor(null);
    pdfDocsMapRef.current = {};
    pdfPageCacheRef.current = {};
    pdfInFlightRef.current = {};
    latestPdfRequestRef.current = {};
    if (wheelSyncTimerRef.current) {
      clearTimeout(wheelSyncTimerRef.current);
      wheelSyncTimerRef.current = null;
    }
    boardItemsRef.current = [];
    setBoardItems([]);
    setSelectedItemId(null);
    setMediaBarOffset({ x: 0, y: 0 });
    setUploadError(null);
    actionLog.current = [];
    setCanReplay(false);
    replayTimers.current.forEach((id) => clearTimeout(id));
    replayTimers.current = [];
    setIsReplaying(false);

    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (canvas && ctx) {
      undoStack.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
      redoStack.current = [];
      setCanUndo(false);
      setCanRedo(false);
    }
  }, [roomId, clearCanvasLocally]);

  const drawLine = useCallback(
    ({ prevX, prevY, currX, currY, color: strokeColor, width: strokeWidth, isEraser }) => {
      const ctx = ctxRef.current;
      if (!ctx) return;

      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(currX, currY);

      if (isEraser) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.lineWidth = strokeWidth * 3;
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
      }

      ctx.stroke();
    },
    []
  );

  const stopReplay = useCallback(() => {
    replayTimers.current.forEach((id) => clearTimeout(id));
    replayTimers.current = [];
    setIsReplaying(false);

    const ctx = ctxRef.current;
    if (ctx && undoStack.current.length > 0) {
      ctx.putImageData(undoStack.current[undoStack.current.length - 1], 0, 0);
    }
  }, []);

  const startReplay = useCallback(() => {
    const actions = actionLog.current;
    const ctx = ctxRef.current;
    if (!ctx || actions.length === 0) return;

    replayTimers.current.forEach((id) => clearTimeout(id));
    replayTimers.current = [];
    setIsReplaying(true);
    clearCanvasLocally();

    let elapsed = 80;
    actions.forEach((action) => {
      const stepDelay = action.kind === "line" ? 10 : 180;
      const timerId = setTimeout(() => {
        const currentCtx = ctxRef.current;
        if (!currentCtx) return;

        if (action.kind === "line") drawLine(action);
        else if (action.kind === "shape") renderShape(currentCtx, action);
        else if (action.kind === "text") renderText(currentCtx, action);
        else if (action.kind === "note") renderNote(currentCtx, action);
        else if (action.kind === "clear") clearCanvasLocally();
      }, elapsed);

      replayTimers.current.push(timerId);
      elapsed += stepDelay;
    });

    const endTimer = setTimeout(() => {
      setIsReplaying(false);
      replayTimers.current = [];
    }, elapsed + 200);
    replayTimers.current.push(endTimer);
  }, [clearCanvasLocally, drawLine]);

  const drawAiDiagram = useCallback(
    (elements = []) => {
      if (!Array.isArray(elements) || elements.length === 0) return;

      elements.forEach((el, index) => {
        setTimeout(() => {
          const ctx = ctxRef.current;
          if (!ctx) return;

          const shapePayload = {
            roomId,
            type: el.type || "rect",
            startX: Number(el.startX) || 150,
            startY: Number(el.startY) || 150,
            endX: Number(el.endX) || 300,
            endY: Number(el.endY) || 220,
            color: el.color || "#2563eb",
            width: 2.5,
            label: el.label || "",
          };

          renderShape(ctx, shapePayload);
          actionLog.current.push({ kind: "shape", ...shapePayload });

          if (socket && socket.connected) {
            socket.emit("draw-shape", shapePayload);
          }

          if (index === elements.length - 1) saveSnapshot();
        }, index * 110);
      });
    },
    [roomId, socket, saveSnapshot]
  );

  // Save composite board PNG (White bg + PDFs/Images/Word Docs + all Canvas drawings)
  const handleExport = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = await buildCompositeBoardDataUrl(canvas, boardItemsRef.current);
    if (!dataUrl) return;

    const downloadLink = document.createElement("a");
    downloadLink.href = dataUrl;
    downloadLink.download = `collabflow-${roomId || "board"}.png`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    setJustSavedSnapshot(true);
    setTimeout(() => setJustSavedSnapshot(false), 1800);
  }, [roomId]);

  useEffect(() => {
    if (!onRegisterControls) return;
    onRegisterControls({
      getImage: async () =>
        buildCompositeBoardDataUrl(canvasRef.current, boardItemsRef.current),
      drawAiDiagram,
      startReplay,
      stopReplay,
      isReplaying,
      canReplay,
      hasActions: () =>
        actionLog.current.length > 0 || boardItemsRef.current.length > 0,
    });
  }, [onRegisterControls, drawAiDiagram, startReplay, stopReplay, isReplaying, canReplay]);

  // 4. Socket.io Listeners
  useEffect(() => {
    if (!socket) return;

    const handleRemoteDraw = (data) => {
      drawLine(data);
      actionLog.current.push({ kind: "line", ...data });
    };

    const handleRemoteShape = (shapeData) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      renderShape(ctx, shapeData);
      actionLog.current.push({ kind: "shape", ...shapeData });
      saveSnapshot();
    };

    const handleRemoteText = (textData) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      renderText(ctx, textData);
      actionLog.current.push({ kind: "text", ...textData });
      saveSnapshot();
    };

    const handleRemoteNote = (noteData) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      renderNote(ctx, noteData);
      actionLog.current.push({ kind: "note", ...noteData });
      saveSnapshot();
    };

    const handleRemoteLaser = (seg) => {
      laserSegments.current.push({ ...seg, createdAt: Date.now() });
      triggerLaserAnimation();
    };

    const handleRemoteClear = () => {
      clearCanvasLocally();
      actionLog.current.push({ kind: "clear" });
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (canvas && ctx) {
        undoStack.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
        redoStack.current = [];
        setCanUndo(false);
        setCanRedo(false);
      }
    };

    const handleRemoteSyncState = ({ imageBase64 }) => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      const img = new Image();
      img.onload = () => {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        ctx.restore();

        const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
        undoStack.current.push(snapshot);
        if (undoStack.current.length > 25) undoStack.current.shift();
        setCanUndo(undoStack.current.length > 1);
      };
      img.src = imageBase64;
    };

    const handleRemoteSyncBoardItems = ({ items }) => {
      if (!Array.isArray(items)) return;
      boardItemsRef.current = items;
      setBoardItems(items);
    };

    const handleRemoteCursorMove = ({ userId, x, y, username, color: cursorColor }) => {
      setRemoteCursors((prev) => ({
        ...prev,
        [userId]: { x, y, username, color: cursorColor },
      }));
    };

    const handleRemoteCursorLeave = ({ userId }) => {
      setRemoteCursors((prev) => {
        const updated = { ...prev };
        delete updated[userId];
        return updated;
      });
    };

    socket.on("draw-line", handleRemoteDraw);
    socket.on("draw-shape", handleRemoteShape);
    socket.on("draw-text", handleRemoteText);
    socket.on("draw-note", handleRemoteNote);
    socket.on("laser-move", handleRemoteLaser);
    socket.on("clear-canvas", handleRemoteClear);
    socket.on("sync-canvas-state", handleRemoteSyncState);
    socket.on("sync-board-items", handleRemoteSyncBoardItems);
    socket.on("cursor-move", handleRemoteCursorMove);
    socket.on("cursor-leave", handleRemoteCursorLeave);

    return () => {
      socket.off("draw-line", handleRemoteDraw);
      socket.off("draw-shape", handleRemoteShape);
      socket.off("draw-text", handleRemoteText);
      socket.off("draw-note", handleRemoteNote);
      socket.off("laser-move", handleRemoteLaser);
      socket.off("clear-canvas", handleRemoteClear);
      socket.off("sync-canvas-state", handleRemoteSyncState);
      socket.off("sync-board-items", handleRemoteSyncBoardItems);
      socket.off("cursor-move", handleRemoteCursorMove);
      socket.off("cursor-leave", handleRemoteCursorLeave);
    };
  }, [socket, drawLine, saveSnapshot, clearCanvasLocally, triggerLaserAnimation]);

  const commitPendingInput = useCallback(() => {
    if (!isInputOpenRef.current || !pendingInput) return;
    isInputOpenRef.current = false;
    const text = pendingInput.value.trim();
    const ctx = ctxRef.current;

    if (text && ctx) {
      if (pendingInput.mode === "text") {
        const fontSize = lineWidth === 2 ? 15 : lineWidth === 8 ? 26 : 19;
        const payload = {
          roomId,
          text,
          x: pendingInput.x,
          y: pendingInput.y,
          color,
          fontSize,
        };
        renderText(ctx, payload);
        actionLog.current.push({ kind: "text", ...payload });
        saveSnapshot();
        if (socket && socket.connected) socket.emit("draw-text", payload);
      } else if (pendingInput.mode === "note") {
        const payload = {
          roomId,
          text,
          x: pendingInput.x,
          y: pendingInput.y,
          bgColor: "#fef08a",
        };
        renderNote(ctx, payload);
        actionLog.current.push({ kind: "note", ...payload });
        saveSnapshot();
        if (socket && socket.connected) socket.emit("draw-note", payload);
      }
    }

    setPendingInput(null);
  }, [pendingInput, color, lineWidth, roomId, socket, saveSnapshot]);

  useEffect(() => {
    if (!pendingInput) return;
    const id = setTimeout(() => {
      textInputRef.current?.focus();
    }, 10);
    return () => clearTimeout(id);
  }, [pendingInput?.x, pendingInput?.y, pendingInput?.mode]);

  const startDrawing = (e) => {
    if (isReplaying || tool === "move") return;
    if (showShapesMenu) setShowShapesMenu(false);

    // Acrobat-style mouse navigation: left-click directly on a PDF pans/moves the PDF without drawing
    if (e.button === 0 && tool === "pen") {
      const hitPdf = findMediaItemAtPoint(
        boardItemsRef.current,
        e.clientX,
        e.clientY,
        selectedItemIdRef.current,
        PDF_ONLY_SET
      );
      if (hitPdf) {
        e.preventDefault();
        isPanningPdfRef.current = true;
        setHoveredCanvasCursor("grabbing");
        mediaLayerRef.current?.startInteractionFromCanvas(hitPdf, e.clientX, e.clientY);
        return;
      }
    }

    const { offsetX, offsetY } = e.nativeEvent;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    if (tool === "text" || tool === "note") {
      e.preventDefault();
      if (pendingInput) {
        commitPendingInput();
        return;
      }
      const clampedX = Math.min(offsetX, window.innerWidth - 260);
      const clampedY = Math.min(offsetY, window.innerHeight - 170);
      textSpawnTimeRef.current = Date.now();
      isInputOpenRef.current = true;
      setPendingInput({
        mode: tool,
        x: Math.max(20, clampedX),
        y: Math.max(70, clampedY),
        value: "",
      });
      return;
    }

    isDrawing.current = true;

    if (tool === "pen" || tool === "eraser" || tool === "laser") {
      lastCoords.current = { x: offsetX, y: offsetY };
    } else if (SHAPE_IDS.includes(tool)) {
      shapeStartCoords.current = { x: offsetX, y: offsetY };
      dragSnapshot.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
  };

  const handleMouseMove = (e) => {
    const { offsetX, offsetY } = e.nativeEvent;
    const ctx = ctxRef.current;

    if (!isDrawing.current && !isPanningPdfRef.current) {
      if (tool === "pen") {
        const overPdf = Boolean(
          findMediaItemAtPoint(
            boardItemsRef.current,
            e.clientX,
            e.clientY,
            selectedItemIdRef.current,
            PDF_ONLY_SET
          )
        );
        const nextCursor = overPdf ? "grab" : null;
        setHoveredCanvasCursor((prev) => (prev === nextCursor ? prev : nextCursor));
      } else if (hoveredCanvasCursor !== null) {
        setHoveredCanvasCursor(null);
      }
    }

    if (currentUser) {
      throttledEmitCursor({
        roomId,
        x: offsetX,
        y: offsetY,
        username: currentUser.username,
        color: currentUser.color,
      });
    }

    if (!isDrawing.current || !ctx || isReplaying || tool === "move") return;

    if (tool === "laser") {
      const laserColor = color === "#1e293b" ? "#fb7185" : color;
      const seg = {
        x1: lastCoords.current.x,
        y1: lastCoords.current.y,
        x2: offsetX,
        y2: offsetY,
        color: laserColor,
      };
      laserSegments.current.push({ ...seg, createdAt: Date.now() });
      triggerLaserAnimation();
      throttledEmitLaser({ roomId, ...seg });
      lastCoords.current = { x: offsetX, y: offsetY };
      return;
    }

    if (tool === "pen" || tool === "eraser") {
      const isEraser = tool === "eraser";
      const linePayload = {
        roomId,
        prevX: lastCoords.current.x,
        prevY: lastCoords.current.y,
        currX: offsetX,
        currY: offsetY,
        color,
        width: lineWidth,
        isEraser,
      };

      drawLine(linePayload);
      actionLog.current.push({ kind: "line", ...linePayload });
      if (socket && socket.connected) socket.emit("draw-line", linePayload);
      lastCoords.current = { x: offsetX, y: offsetY };
    } else if (SHAPE_IDS.includes(tool) && dragSnapshot.current) {
      ctx.putImageData(dragSnapshot.current, 0, 0);
      renderShape(ctx, {
        type: tool,
        startX: shapeStartCoords.current.x,
        startY: shapeStartCoords.current.y,
        endX: offsetX,
        endY: offsetY,
        color,
        width: lineWidth,
      });
    }
  };

  const stopDrawing = (e) => {
    if (!isDrawing.current) return;
    const ctx = ctxRef.current;

    if (tool === "laser") {
      isDrawing.current = false;
      return;
    }

    if (SHAPE_IDS.includes(tool) && dragSnapshot.current && ctx) {
      const { offsetX, offsetY } = e.nativeEvent;
      const shapePayload = {
        roomId,
        type: tool,
        startX: shapeStartCoords.current.x,
        startY: shapeStartCoords.current.y,
        endX: offsetX,
        endY: offsetY,
        color,
        width: lineWidth,
      };

      ctx.putImageData(dragSnapshot.current, 0, 0);
      renderShape(ctx, shapePayload);
      actionLog.current.push({ kind: "shape", ...shapePayload });
      saveSnapshot();

      if (socket && socket.connected) socket.emit("draw-shape", shapePayload);
      dragSnapshot.current = null;
    } else if (tool === "pen" || tool === "eraser") {
      saveSnapshot();
    }

    isDrawing.current = false;
  };

  const handleMouseLeave = () => {
    if (!isPanningPdfRef.current && hoveredCanvasCursor !== null) {
      setHoveredCanvasCursor(null);
    }
    if (isDrawing.current) {
      const ctx = ctxRef.current;
      if (tool === "laser") {
        isDrawing.current = false;
      } else if (dragSnapshot.current && ctx) {
        ctx.putImageData(dragSnapshot.current, 0, 0);
        dragSnapshot.current = null;
        isDrawing.current = false;
      } else {
        saveSnapshot();
        isDrawing.current = false;
      }
    }
    if (socket && socket.connected) socket.emit("cursor-leave", { roomId });
  };

  const handleClear = () => {
    clearCanvasLocally();
    actionLog.current.push({ kind: "clear" });
    saveSnapshot();
    if (socket && socket.connected) socket.emit("clear-canvas", { roomId });
  };

  const handleUndo = useCallback(() => {
    if (undoStack.current.length <= 1) return;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const currentState = undoStack.current.pop();
    redoStack.current.push(currentState);

    const previousState = undoStack.current[undoStack.current.length - 1];
    ctx.putImageData(previousState, 0, 0);

    setCanUndo(undoStack.current.length > 1);
    setCanRedo(true);
    broadcastCanvasState();
  }, [broadcastCanvasState]);

  const handleRedo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const nextState = redoStack.current.pop();
    undoStack.current.push(nextState);
    ctx.putImageData(nextState, 0, 0);

    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
    broadcastCanvasState();
  }, [broadcastCanvasState]);

  // Add a newly uploaded Image onto movable BoardMediaLayer (preserves all drawings!)
  const addImageItem = useCallback(
    (file) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result;
        if (!dataUrl) return;
        const img = new Image();
        img.onload = () => {
          const maxW = Math.max(260, window.innerWidth * 0.45);
          const maxH = Math.max(200, window.innerHeight * 0.45);
          const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
          const drawW = Math.round(img.width * ratio);
          const drawH = Math.round(img.height * ratio);

          // Slightly stagger subsequent uploads so multiple images don't stack identically
          const offset = (boardItemsRef.current.length % 4) * 24;
          const posX = Math.round((window.innerWidth - drawW) / 2 + offset);
          const posY = Math.round(Math.max(120, (window.innerHeight - drawH) / 2 + offset));

          const aspectRatio = img.width / Math.max(1, img.height);
          const newItem = {
            id: `img-${Date.now()}`,
            kind: "image",
            title: file.name || "Image.png",
            src: dataUrl,
            x: posX,
            y: posY,
            width: drawW,
            height: drawH,
            baseWidth: drawW,
            baseHeight: drawH,
            aspectRatio,
            contentZoom: 1,
            scrollX: 0,
            scrollY: 0,
          };

          const next = [...boardItemsRef.current, newItem];
          boardItemsRef.current = next;
          setBoardItems(next);
          setSelectedItemId(newItem.id);
          commitBoardItemsSync(next);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    },
    [commitBoardItemsSync]
  );

  // Render & cache a PDF page at crisp 2x scale as lightweight opaque WebP (instant switching + fast sync)
  const renderPdfPageToDataUrl = useCallback(async (itemId, doc, pageNumber) => {
    const cacheKey = `${itemId}:${pageNumber}`;
    const existing = pdfPageCacheRef.current[cacheKey];
    if (existing) {
      // Refresh insertion order for lightweight LRU eviction
      delete pdfPageCacheRef.current[cacheKey];
      pdfPageCacheRef.current[cacheKey] = existing;
      return existing;
    }

    if (pdfInFlightRef.current[cacheKey]) {
      return pdfInFlightRef.current[cacheKey];
    }

    const renderPromise = (async () => {
      const page = await doc.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      // Keep sharp HD detail up to 2x while capping oversized blueprint PDFs at 2200px
      const renderScale = Math.min(
        2,
        2200 / Math.max(baseViewport.width || 1, baseViewport.height || 1)
      );
      const viewport = page.getViewport({ scale: renderScale });

      const offCanvas = document.createElement("canvas");
      offCanvas.width = Math.max(1, Math.floor(viewport.width));
      offCanvas.height = Math.max(1, Math.floor(viewport.height));
      const offCtx = offCanvas.getContext("2d", { alpha: false });
      offCtx.fillStyle = "#ffffff";
      offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);

      await page.render({ canvasContext: offCtx, viewport }).promise;
      const result = {
        src: offCanvas.toDataURL("image/webp", 0.92),
        aspectWidth: offCanvas.width,
        aspectHeight: offCanvas.height,
      };

      if (pdfDocsMapRef.current[itemId] === doc) {
        const cacheKeys = Object.keys(pdfPageCacheRef.current);
        if (cacheKeys.length >= 24) {
          delete pdfPageCacheRef.current[cacheKeys[0]];
        }
        pdfPageCacheRef.current[cacheKey] = result;
      }
      return result;
    })();

    pdfInFlightRef.current[cacheKey] = renderPromise;
    try {
      return await renderPromise;
    } finally {
      delete pdfInFlightRef.current[cacheKey];
    }
  }, []);

  // Silently warm up N+1 and N-1 pages in the background right after a page displays
  const prefetchPdfNeighbors = useCallback(
    (itemId, doc, currentPage) => {
      if (!doc || !itemId) return;
      const neighbors = [currentPage + 1, currentPage - 1].filter(
        (p) => p >= 1 && p <= doc.numPages
      );
      neighbors.forEach((neighborPage, idx) => {
        const cacheKey = `${itemId}:${neighborPage}`;
        if (pdfPageCacheRef.current[cacheKey] || pdfInFlightRef.current[cacheKey]) {
          return;
        }
        setTimeout(() => {
          if (pdfDocsMapRef.current[itemId] !== doc) return;
          renderPdfPageToDataUrl(itemId, doc, neighborPage).catch(() => {});
        }, 60 + idx * 90);
      });
    },
    [renderPdfPageToDataUrl]
  );

  const handlePdfUpload = useCallback(
    async (file) => {
      if (!file) return;
      setIsPdfLoading(true);
      setUploadError(null);
      try {
        const buffer = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
        const itemId = `pdf-${Date.now()}`;
        pdfDocsMapRef.current[itemId] = doc;
        latestPdfRequestRef.current[itemId] = 1;

        const rendered = await renderPdfPageToDataUrl(itemId, doc, 1);
        const aspectRatio = rendered.aspectWidth / Math.max(1, rendered.aspectHeight);

        const maxW = Math.max(320, window.innerWidth * 0.56);
        const maxH = Math.max(240, window.innerHeight * 0.58);
        const ratio = Math.min(maxW / rendered.aspectWidth, maxH / rendered.aspectHeight);
        const drawW = Math.round(rendered.aspectWidth * ratio);
        const drawH = Math.max(120, Math.round(drawW / aspectRatio));

        const newItem = {
          id: itemId,
          kind: "pdf",
          title: file.name,
          src: rendered.src,
          x: Math.round((window.innerWidth - drawW) / 2),
          y: Math.round(Math.max(120, (window.innerHeight - drawH) / 2)),
          width: drawW,
          height: drawH,
          baseWidth: drawW,
          baseHeight: drawH,
          aspectRatio,
          contentZoom: 1,
          scrollX: 0,
          scrollY: 0,
          currentPage: 1,
          totalPages: doc.numPages,
        };

        const next = [...boardItemsRef.current, newItem];
        boardItemsRef.current = next;
        setBoardItems(next);
        setSelectedItemId(itemId);
        commitBoardItemsSync(next);
        prefetchPdfNeighbors(itemId, doc, 1);
      } catch (err) {
        console.error("[PDF Load Error]", err);
        setUploadError("Failed to open PDF file. Ensure it is not password-protected.");
      } finally {
        setIsPdfLoading(false);
      }
    },
    [renderPdfPageToDataUrl, prefetchPdfNeighbors, commitBoardItemsSync]
  );

  // Switch page instantaneously from cache when warm, maintaining aspect lock without blank margins
  const handlePdfPageChange = useCallback(
    async (item, targetPage) => {
      const doc = pdfDocsMapRef.current[item.id];
      if (!doc || targetPage < 1 || targetPage > doc.numPages) return;

      latestPdfRequestRef.current[item.id] = targetPage;
      setUploadError(null);

      const commitRenderedPage = (rendered) => {
        const latestItem =
          boardItemsRef.current.find((it) => it.id === item.id) || item;
        const pageRatio = rendered.aspectWidth / Math.max(1, rendered.aspectHeight);
        const patch = {
          src: rendered.src,
          currentPage: targetPage,
          scrollX: 0,
          scrollY: 0,
        };

        if (Math.abs(pageRatio - (latestItem.aspectRatio || pageRatio)) > 0.01) {
          const baseW = latestItem.baseWidth || latestItem.width;
          const prevBaseH = latestItem.baseHeight || latestItem.height;
          const maxContentH = Math.round(baseW / pageRatio);
          const fitted = fitItemToViewport(
            {
              ...latestItem,
              aspectRatio: pageRatio,
              baseWidth: baseW,
              baseHeight: Math.min(prevBaseH, maxContentH),
            },
            window.innerWidth,
            window.innerHeight
          );
          if (fitted) Object.assign(patch, fitted);
        }

        handleUpdateBoardItem(item.id, patch, true);
        prefetchPdfNeighbors(item.id, doc, targetPage);
      };

      const cacheKey = `${item.id}:${targetPage}`;
      const cached = pdfPageCacheRef.current[cacheKey];
      if (cached) {
        delete pdfPageCacheRef.current[cacheKey];
        pdfPageCacheRef.current[cacheKey] = cached;
        commitRenderedPage(cached);
        return;
      }

      // Optimistically update page counter so rapid clicks advance cleanly (N -> N+1 -> N+2)
      handleUpdateBoardItem(
        item.id,
        { currentPage: targetPage, scrollX: 0, scrollY: 0 },
        false
      );

      try {
        const rendered = await renderPdfPageToDataUrl(item.id, doc, targetPage);
        if (
          latestPdfRequestRef.current[item.id] !== targetPage ||
          pdfDocsMapRef.current[item.id] !== doc
        ) {
          return;
        }
        commitRenderedPage(rendered);
      } catch (err) {
        if (latestPdfRequestRef.current[item.id] === targetPage) {
          console.error("[PDF Page Error]", err);
          setUploadError("Could not switch PDF page.");
        }
      }
    },
    [renderPdfPageToDataUrl, prefetchPdfNeighbors, handleUpdateBoardItem]
  );

  // Parse Microsoft Word (.docx) or plain text/code notes into a movable Document Card
  const addDocumentItem = useCallback(
    async (file, isDocx = false) => {
      if (!file) return;
      setUploadError(null);
      try {
        let extractedText = "";
        if (isDocx) {
          const buffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer: buffer });
          extractedText = (result.value || "").trim();
        } else {
          extractedText = (await file.text()).trim();
        }

        if (!extractedText) {
          setUploadError("The uploaded document appears to be empty.");
          return;
        }

        const docW = Math.min(440, Math.round(window.innerWidth * 0.38));
        const docH = Math.min(380, Math.round(window.innerHeight * 0.48));
        const offset = (boardItemsRef.current.length % 4) * 24;

        const newItem = {
          id: `doc-${Date.now()}`,
          kind: "doc",
          title: file.name,
          plainText: extractedText.slice(0, 6000),
          x: Math.round((window.innerWidth - docW) / 2 + offset),
          y: Math.round(Math.max(120, (window.innerHeight - docH) / 2 + offset)),
          width: docW,
          height: docH,
          contentZoom: 1,
          scrollX: 0,
          scrollY: 0,
          fontScale: 1,
        };

        const next = [...boardItemsRef.current, newItem];
        boardItemsRef.current = next;
        setBoardItems(next);
        setSelectedItemId(newItem.id);
        commitBoardItemsSync(next);
      } catch (err) {
        console.error("[Document Import Error]", err);
        setUploadError(
          isDocx
            ? "Failed to read .docx Word file. Legacy .doc binary files are not supported."
            : "Could not read text document."
        );
      }
    },
    [commitBoardItemsSync]
  );

  const processUploadedFile = useCallback(
    (file) => {
      if (!file) return;
      setUploadError(null);
      const ext = (file.name.split(".").pop() || "").toLowerCase();

      if (file.type === "application/pdf" || ext === "pdf") {
        handlePdfUpload(file);
      } else if (
        ext === "docx" ||
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        addDocumentItem(file, true);
      } else if (file.type.startsWith("text/") || TEXT_EXTENSIONS.has(ext)) {
        addDocumentItem(file, false);
      } else if (file.type.startsWith("image/")) {
        addImageItem(file);
      } else {
        setUploadError(
          "Unsupported file. Supported: Images, PDF slides, Word (.docx), .txt, .md & code files."
        );
      }
    },
    [handlePdfUpload, addDocumentItem, addImageItem]
  );

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) processUploadedFile(file);
    e.target.value = "";
  };

  const handleCanvasDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) processUploadedFile(file);
  };

  // Global Clipboard Paste (Ctrl+V) adds pasted screenshots as movable items
  useEffect(() => {
    const handlePaste = (e) => {
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName) || e.target.isContentEditable) {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) addImageItem(file);
          break;
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [addImageItem]);

  const activeMediaItem =
    boardItems.find((i) => i.id === selectedItemId) ||
    boardItems[boardItems.length - 1] ||
    null;

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName) || e.target.isContentEditable) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      if (
        (cmdOrCtrl && e.key.toLowerCase() === "y") ||
        (cmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (!cmdOrCtrl && !e.altKey) {
        const key = e.key.toLowerCase();
        const selectShapeTool = (shapeId) => {
          setTool(shapeId);
          setLastShape(shapeId);
          setShowShapesMenu(false);
        };

        if (key === "m") {
          setTool("move");
          setShowShapesMenu(false);
        } else if (key === "p") {
          setTool("pen");
          setShowShapesMenu(false);
        } else if (key === "e") {
          setTool("eraser");
          setShowShapesMenu(false);
        } else if (key === "t") {
          setTool("text");
          setShowShapesMenu(false);
        } else if (key === "n") {
          setTool("note");
          setShowShapesMenu(false);
        } else if (key === "z") {
          setTool("laser");
          setShowShapesMenu(false);
        } else if (key === "r") selectShapeTool("rect");
        else if (key === "c") selectShapeTool("circle");
        else if (key === "l") selectShapeTool("line");
        else if (key === "a") selectShapeTool("arrow");
        else if (key === "d") selectShapeTool("diamond");
        else if (key === "v") selectShapeTool("triangle");
        else if (key === "g") setShowGrid((prev) => !prev);
        else if (
          (e.key === "Delete" || e.key === "Backspace") &&
          tool === "move" &&
          activeMediaItem
        ) {
          e.preventDefault();
          handleRemoveBoardItem(activeMediaItem.id);
        } else if (
          e.key === "ArrowLeft" &&
          activeMediaItem?.kind === "pdf" &&
          activeMediaItem.currentPage > 1
        ) {
          e.preventDefault();
          handlePdfPageChange(activeMediaItem, activeMediaItem.currentPage - 1);
        } else if (
          e.key === "ArrowRight" &&
          activeMediaItem?.kind === "pdf" &&
          activeMediaItem.currentPage < activeMediaItem.totalPages
        ) {
          e.preventDefault();
          handlePdfPageChange(activeMediaItem, activeMediaItem.currentPage + 1);
        } else if (e.key === "Escape") {
          setShowShapesMenu(false);
          isInputOpenRef.current = false;
          setPendingInput(null);
          if (isReplaying) stopReplay();
          if (dragSnapshot.current && ctxRef.current) {
            ctxRef.current.putImageData(dragSnapshot.current, 0, 0);
            dragSnapshot.current = null;
            isDrawing.current = false;
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleUndo,
    handleRedo,
    isReplaying,
    stopReplay,
    tool,
    activeMediaItem,
    handlePdfPageChange,
    handleRemoveBoardItem,
  ]);

  useEffect(() => {
    if (!showShapesMenu) return;
    const handleOutsideClick = (e) => {
      if (shapesMenuRef.current && !shapesMenuRef.current.contains(e.target)) {
        setShowShapesMenu(false);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [showShapesMenu]);

  // Global mousemove/mouseup listeners for dragging the Active Media Quick Controls Bar
  useEffect(() => {
    const handleBarMouseMove = (e) => {
      const drag = mediaBarDragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const maxOffsetX = Math.max(120, window.innerWidth / 2 - 140);
      const nextX = Math.max(-maxOffsetX, Math.min(maxOffsetX, drag.origX + dx));
      const nextY = Math.max(-64, Math.min(window.innerHeight - 170, drag.origY + dy));
      setMediaBarOffset({ x: Math.round(nextX), y: Math.round(nextY) });
    };

    const handleBarMouseUp = () => {
      mediaBarDragRef.current = null;
    };

    window.addEventListener("mousemove", handleBarMouseMove);
    window.addEventListener("mouseup", handleBarMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleBarMouseMove);
      window.removeEventListener("mouseup", handleBarMouseUp);
    };
  }, []);

  // Reset quick-bar position automatically once all uploaded media items are removed
  useEffect(() => {
    if (boardItems.length === 0) {
      setMediaBarOffset({ x: 0, y: 0 });
    }
  }, [boardItems.length]);

  const startMediaBarDrag = (e) => {
    // Allow clicking buttons directly inside the bar without triggering drag
    if (e.target.closest("button")) return;
    e.preventDefault();
    e.stopPropagation();
    mediaBarDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: mediaBarOffset.x,
      origY: mediaBarOffset.y,
    };
  };

  const activeShapeMeta =
    SHAPE_OPTIONS.find((s) => s.id === (SHAPE_IDS.includes(tool) ? tool : lastShape)) ||
    SHAPE_OPTIONS[0];
  const ActiveShapeIcon = SHAPE_IDS.includes(tool) ? activeShapeMeta.Icon : Shapes;
  const isShapeActive = SHAPE_IDS.includes(tool);

  const cursorStyle =
    tool === "text"
      ? "cursor-text"
      : tool === "laser"
      ? "cursor-pointer"
      : tool === "move"
      ? "cursor-default"
      : tool === "pen" && hoveredCanvasCursor === "grabbing"
      ? "cursor-grabbing"
      : tool === "pen" && hoveredCanvasCursor === "grab"
      ? "cursor-grab"
      : "cursor-crosshair";

  return (
    <div
      ref={boardWrapperRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleCanvasDrop}
      className={`relative w-screen h-screen overflow-hidden select-none transition-colors duration-200 ${
        showGrid ? "bg-slate-50" : "bg-white"
      }`}
      style={
        showGrid
          ? {
              backgroundImage: "radial-gradient(#d1d5db 1.5px, transparent 1.5px)",
              backgroundSize: "24px 24px",
            }
          : undefined
      }
    >
      {/* Layer 1 (z-10): Movable, Aspect-Locked Resizable, Acrobat-Pannable PDF/Image/Doc Cards */}
      <BoardMediaLayer
        ref={mediaLayerRef}
        items={boardItems}
        selectedId={activeMediaItem?.id || null}
        isInteractive={tool === "move"}
        onSelect={setSelectedItemId}
        onUpdateItem={handleUpdateBoardItem}
        onCommitSync={() => commitBoardItemsSync()}
        onRemoveItem={handleRemoveBoardItem}
        onPdfPageChange={handlePdfPageChange}
        onPanStateChange={handlePdfPanStateChange}
      />

      {/* Layer 2 (z-20): Transparent High-DPI Drawing Canvas (pointer-events-none in Move mode) */}
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrawing}
        onMouseLeave={handleMouseLeave}
        className={`absolute inset-0 z-20 touch-none ${cursorStyle} ${
          tool === "move" ? "pointer-events-none" : ""
        }`}
      />

      {/* Ephemeral Laser Pointer Overlay Canvas */}
      <canvas
        ref={laserCanvasRef}
        className="pointer-events-none absolute inset-0 z-20"
      />

      {/* Inline Text / Sticky Note Floating Input Editor */}
      {pendingInput && (
        <div
          ref={inputWrapperRef}
          style={{ left: pendingInput.x, top: pendingInput.y }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute z-40 select-text"
        >
          {pendingInput.mode === "text" ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 rounded-xl border-2 border-indigo-500 bg-white/95 p-1.5 shadow-2xl">
                <input
                  ref={textInputRef}
                  type="text"
                  value={pendingInput.value}
                  onChange={(e) =>
                    setPendingInput((prev) => ({ ...prev, value: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitPendingInput();
                    } else if (e.key === "Escape") {
                      isInputOpenRef.current = false;
                      setPendingInput(null);
                    }
                  }}
                  onBlur={(e) => {
                    if (Date.now() - textSpawnTimeRef.current < 250) return;
                    if (inputWrapperRef.current?.contains(e.relatedTarget)) return;
                    commitPendingInput();
                  }}
                  placeholder="Type text..."
                  style={{ color }}
                  className="min-w-[180px] bg-transparent px-1.5 py-0.5 text-sm font-semibold outline-none select-text"
                />
                <button
                  type="button"
                  onClick={commitPendingInput}
                  className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 transition"
                >
                  Add
                </button>
              </div>
              <span className="text-[10px] font-medium text-slate-400 bg-white/90 px-1.5 py-0.5 rounded shadow-sm w-fit">
                Enter to place · Esc to cancel
              </span>
            </div>
          ) : (
            <div className="w-52 rounded-xl border border-amber-300 bg-amber-100 p-2.5 shadow-2xl">
              <textarea
                ref={textInputRef}
                rows={3}
                value={pendingInput.value}
                onChange={(e) =>
                  setPendingInput((prev) => ({ ...prev, value: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    commitPendingInput();
                  } else if (e.key === "Escape") {
                    isInputOpenRef.current = false;
                    setPendingInput(null);
                  }
                }}
                placeholder="Write a sticky note..."
                className="w-full bg-transparent text-xs font-medium text-amber-950 placeholder-amber-600/60 outline-none resize-none select-text"
              />
              <div className="mt-1.5 flex items-center justify-between border-t border-amber-200 pt-1.5">
                <button
                  type="button"
                  onClick={() => {
                    isInputOpenRef.current = false;
                    setPendingInput(null);
                  }}
                  className="text-[11px] font-medium text-amber-700 hover:text-amber-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commitPendingInput}
                  className="rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-600 transition"
                >
                  Pin Note
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hidden File Input (PDFs, Word .docx, Images, Text/Code Notes) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.docx,.txt,.md,.csv,.json,.js,.jsx,.ts,.py,.java,.cpp,.c,.html,.css"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Remote Cursors */}
      {Object.entries(remoteCursors).map(([userId, cursor]) => (
        <Cursor
          key={userId}
          x={cursor.x}
          y={cursor.y}
          username={cursor.username}
          color={cursor.color}
        />
      ))}

      {/* Top-Center Draggable Active Media Quick Controls Bar (Works in ANY tool mode!) */}
      {(activeMediaItem || isPdfLoading || isReplaying || uploadError) && (
        <div
          style={{
            transform: `translate(calc(-50% + ${mediaBarOffset.x}px), ${mediaBarOffset.y}px)`,
          }}
          className="absolute top-20 left-1/2 z-30 flex w-max max-w-[96vw] flex-col items-center gap-2 pointer-events-none"
        >
          {(activeMediaItem || isPdfLoading) && (
            <div
              onMouseDown={startMediaBarDrag}
              title="Drag bar anywhere on board"
              className="pointer-events-auto flex flex-wrap sm:flex-nowrap items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-white/95 px-3 py-1.5 shadow-xl backdrop-blur-md border border-slate-200 text-xs cursor-grab active:cursor-grabbing select-none"
            >
              <GripVertical className="h-3.5 w-3.5 text-slate-400 shrink-0 -ml-1" />
              <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200">
                <FileText className="h-4 w-4 text-indigo-600 shrink-0" />
                <span
                  className="max-w-[140px] truncate font-semibold text-slate-800"
                  title={activeMediaItem?.title}
                >
                  {isPdfLoading && !activeMediaItem
                    ? "Loading PDF..."
                    : activeMediaItem?.title}
                </span>
              </div>

              {/* Multi-item switcher badge if more than 1 file uploaded */}
              {boardItems.length > 1 && (
                <div className="flex items-center gap-1 pr-2 border-r border-slate-200">
                  {boardItems.map((it, idx) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => setSelectedItemId(it.id)}
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold transition ${
                        activeMediaItem?.id === it.id
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                      title={it.title}
                    >
                      #{idx + 1}
                    </button>
                  ))}
                </div>
              )}

              {/* PDF Page Controls */}
              {activeMediaItem?.kind === "pdf" && (
                <div className="flex items-center gap-1 pr-2 border-r border-slate-200">
                  <button
                    type="button"
                    disabled={activeMediaItem.currentPage <= 1}
                    onClick={() =>
                      handlePdfPageChange(activeMediaItem, activeMediaItem.currentPage - 1)
                    }
                    className="p-1 rounded-lg text-slate-600 hover:bg-slate-100 disabled:text-slate-300 disabled:cursor-not-allowed transition"
                    title="Previous Slide (Left Arrow)"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <span className="px-1 font-semibold text-slate-700 tabular-nums min-w-[46px] text-center">
                    {activeMediaItem.currentPage} / {activeMediaItem.totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={activeMediaItem.currentPage >= activeMediaItem.totalPages}
                    onClick={() =>
                      handlePdfPageChange(activeMediaItem, activeMediaItem.currentPage + 1)
                    }
                    className="p-1 rounded-lg text-slate-600 hover:bg-slate-100 disabled:text-slate-300 disabled:cursor-not-allowed transition"
                    title="Next Slide (Right Arrow)"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Inside PDF / Image / Word Doc Zoom Controls */}
              {activeMediaItem && (
                <div className="flex items-center gap-1 pr-2 border-r border-slate-200">
                  <button
                    type="button"
                    onClick={() => handleInsideZoomItem(activeMediaItem, -0.25)}
                    className="p-1 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-indigo-600 transition"
                    title="Zoom Out Inside Content"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-[11px] font-semibold text-slate-600 tabular-nums px-0.5">
                    {Math.round((activeMediaItem.contentZoom || 1) * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => handleInsideZoomItem(activeMediaItem, 0.25)}
                    className="p-1 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-indigo-600 transition"
                    title="Zoom In Inside PDF / Image / Doc"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Quick Scroll Inside Zoomed / Widened PDF or Word Doc (Works even in Pen mode) */}
              {activeMediaItem &&
                ((activeMediaItem.contentZoom || 1) > 1 ||
                  activeMediaItem.kind === "doc" ||
                  (activeMediaItem.aspectRatio &&
                    activeMediaItem.width / Math.max(1, activeMediaItem.height) >
                      activeMediaItem.aspectRatio + 0.03)) && (
                  <div className="flex items-center gap-0.5 pr-2 border-r border-slate-200">
                    <button
                      type="button"
                      onClick={() => handleScrollInsideItem(activeMediaItem, -140)}
                      className="p-1 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-indigo-600 transition"
                      title="Scroll Up Inside File"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleScrollInsideItem(activeMediaItem, 140)}
                      className="p-1 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-indigo-600 transition"
                      title="Scroll Down Inside File"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

              {/* Toggle Move/Resize vs Draw on Top */}
              {activeMediaItem && (
                <button
                  type="button"
                  onClick={() => setTool((t) => (t === "move" ? "pen" : "move"))}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
                    tool === "move"
                      ? "bg-indigo-600 text-white"
                      : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                  }`}
                  title={
                    tool === "move"
                      ? "Switch back to Pen to draw over this file (P)"
                      : "Move & drag edges/corners to resize freely (M)"
                  }
                >
                  <MousePointer2 className="h-3 w-3" />
                  <span>{tool === "move" ? "Done Moving" : "Move"}</span>
                </button>
              )}

              {/* Remove ONLY this PDF / Image / Word Doc */}
              {activeMediaItem && (
                <button
                  type="button"
                  onClick={() => handleRemoveBoardItem(activeMediaItem.id)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 transition"
                  title="Remove this file from whiteboard (keeps your drawings)"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Remove</span>
                </button>
              )}
            </div>
          )}

          {isReplaying && (
            <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-slate-900/90 px-4 py-1.5 text-xs font-semibold text-white shadow-xl backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping"></span>
              <span>Replaying Session History...</span>
              <button
                type="button"
                onClick={stopReplay}
                className="ml-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] hover:bg-white/25 transition"
              >
                Stop
              </button>
            </div>
          )}

          {uploadError && (
            <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 shadow-lg">
              <span>{uploadError}</span>
              <button
                type="button"
                onClick={() => setUploadError(null)}
                className="text-rose-500 hover:text-rose-800"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bottom Floating Toolbar (Strictly Single-Line on 1024px+, safely wraps only on tiny panes) */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex max-w-[96vw] flex-wrap justify-center lg:flex-nowrap items-center gap-1 whitespace-nowrap rounded-2xl bg-white/95 px-2.5 py-2 shadow-2xl backdrop-blur-md border border-slate-200">
        
        {/* Tool Group: Move, Pen, Eraser, Text, Note, Shapes, Laser */}
        <div className="flex items-center gap-0.5 pr-1.5 border-r border-slate-200">
          <button
            type="button"
            onClick={() => {
              setTool("move");
              setShowShapesMenu(false);
            }}
            className={`flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold transition ${
              tool === "move"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            title="Move & Resize Images, PDF & Docs (M)"
          >
            <MousePointer2 className="h-4 w-4" />
            <span className="hidden 2xl:inline">Move</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTool("pen");
              setShowShapesMenu(false);
            }}
            className={`flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold transition ${
              tool === "pen"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            title="Pen Tool (P)"
          >
            <Pencil className="h-4 w-4" />
            <span className="hidden xl:inline">Pen</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTool("eraser");
              setShowShapesMenu(false);
            }}
            className={`flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold transition ${
              tool === "eraser"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            title="Eraser Tool (E)"
          >
            <Eraser className="h-4 w-4" />
            <span className="hidden xl:inline">Eraser</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTool("text");
              setShowShapesMenu(false);
            }}
            className={`flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold transition ${
              tool === "text"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            title="Text Tool (T)"
          >
            <Type className="h-4 w-4" />
            <span className="hidden xl:inline">Text</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTool("note");
              setShowShapesMenu(false);
            }}
            className={`flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold transition ${
              tool === "note"
                ? "bg-amber-500 text-white shadow-md shadow-amber-500/20"
                : "text-slate-600 hover:bg-amber-50 hover:text-amber-700"
            }`}
            title="Sticky Note (N)"
          >
            <StickyNote className="h-4 w-4" />
            <span className="hidden 2xl:inline">Note</span>
          </button>

          {/* Single Shapes Trigger + Floating 6-Shape Popover */}
          <div className="relative" ref={shapesMenuRef}>
            <button
              type="button"
              onClick={() => setShowShapesMenu((prev) => !prev)}
              className={`flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold transition ${
                isShapeActive
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                  : showShapesMenu
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
              title="Flowchart & Geometric Shapes"
              aria-expanded={showShapesMenu}
            >
              <ActiveShapeIcon className="h-4 w-4" />
              <span>{isShapeActive ? activeShapeMeta.label : "Shapes"}</span>
              <ChevronUp
                className={`h-3.5 w-3.5 transition-transform duration-150 ${
                  showShapesMenu ? "rotate-180" : ""
                }`}
              />
            </button>

            {showShapesMenu && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-64 rounded-2xl bg-white p-2.5 shadow-2xl border border-slate-200 z-40">
                <div className="px-1.5 pb-1.5 mb-1.5 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Select Shape
                  </span>
                  <span className="text-[10px] text-slate-400">Drag on board</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {SHAPE_OPTIONS.map((shape) => {
                    const IconComponent = shape.Icon;
                    const active = tool === shape.id;
                    return (
                      <button
                        key={shape.id}
                        type="button"
                        onClick={() => {
                          setTool(shape.id);
                          setLastShape(shape.id);
                          setShowShapesMenu(false);
                        }}
                        className={`flex items-center justify-between rounded-xl px-2.5 py-2 text-xs font-semibold transition ${
                          active
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <IconComponent className="h-4 w-4 shrink-0" />
                          <span>{shape.label}</span>
                        </span>
                        <span
                          className={`text-[10px] font-mono px-1 rounded ${
                            active
                              ? "bg-indigo-500 text-indigo-100"
                              : "bg-slate-100 text-slate-400"
                          }`}
                        >
                          {shape.shortcut}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setTool("laser");
              setShowShapesMenu(false);
            }}
            className={`flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold transition border ${
              tool === "laser"
                ? "bg-rose-50 text-rose-600 border-rose-200 shadow-sm"
                : "text-slate-600 border-transparent hover:bg-rose-50/70 hover:text-rose-500"
            }`}
            title="Live Laser Pointer (Z)"
          >
            {tool === "laser" ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
              </span>
            ) : (
              <Crosshair className="h-4 w-4 text-rose-400" />
            )}
            <span className="hidden 2xl:inline">Laser</span>
          </button>
        </div>

        {/* Color Palette */}
        {!["eraser", "note", "move"].includes(tool) && (
          <div className="flex items-center gap-1.5 px-1.5 border-r border-slate-200">
            {colors.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                style={{ backgroundColor: c.value }}
                className={`h-5 w-5 rounded-full transition-transform hover:scale-110 ${
                  color === c.value
                    ? "ring-2 ring-indigo-500 ring-offset-2 scale-110 shadow-sm"
                    : "opacity-85 hover:opacity-100"
                }`}
                title={c.name}
              />
            ))}
          </div>
        )}

        {/* Brush / Font Size Selector (Fine, Medium, Thick) */}
        <div className="flex items-center gap-0.5 px-1 border-r border-slate-200">
          {brushSizes.map((b) => (
            <button
              key={b.size}
              type="button"
              onClick={() => setLineWidth(b.size)}
              className={`rounded-lg px-2 py-1 text-xs font-medium transition ${
                lineWidth === b.size
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
              title={b.title}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Files Upload (Images, PDF, Word .docx, Notes) & Grid Toggle */}
        <div className="flex items-center gap-1 px-1 border-r border-slate-200">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition"
            title="Upload Image, PDF, Word (.docx), or Notes (Drag-Drop or Ctrl+V)"
          >
            <ImageIcon className="h-4 w-4 text-indigo-600" />
            <span className="hidden xl:inline">Upload</span>
          </button>

          <button
            type="button"
            onClick={() => setShowGrid((prev) => !prev)}
            className={`flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold transition border ${
              showGrid
                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                : "text-slate-600 border-transparent hover:bg-slate-100"
            }`}
            title={showGrid ? "Hide Dot Grid (G)" : "Show Dot Grid (G)"}
            aria-pressed={showGrid}
          >
            <Grid3x3 className="h-4 w-4" />
            <span className="hidden 2xl:inline">{showGrid ? "Grid" : "Grid Off"}</span>
          </button>
        </div>

        {/* Undo & Redo */}
        <div className="flex items-center gap-0.5 px-1 border-r border-slate-200">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            className={`p-1.5 rounded-xl transition ${
              canUndo
                ? "text-slate-700 hover:bg-slate-100 active:scale-95"
                : "text-slate-300 cursor-not-allowed"
            }`}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            className={`p-1.5 rounded-xl transition ${
              canRedo
                ? "text-slate-700 hover:bg-slate-100 active:scale-95"
                : "text-slate-300 cursor-not-allowed"
            }`}
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>

        {/* Clear Strokes */}
        <button
          type="button"
          onClick={handleClear}
          className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"
          title="Clear Canvas Drawings"
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden xl:inline">Clear</span>
        </button>

        {/* Capture & Save Full Board Image as PNG */}
        <button
          type="button"
          onClick={handleExport}
          className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-white shadow-md transition active:scale-95 ${
            justSavedSnapshot
              ? "bg-emerald-600 hover:bg-emerald-700"
              : "bg-slate-900 hover:bg-slate-800"
          }`}
          title="Click & Save Complete White Board Photo (PNG)"
        >
          {justSavedSnapshot ? (
            <>
              <Check className="h-4 w-4" />
              <span>Saved!</span>
            </>
          ) : (
            <>
              <Camera className="h-4 w-4" />
              <span>Save PNG</span>
            </>
          )}
        </button>

      </div>
    </div>
  );
}
