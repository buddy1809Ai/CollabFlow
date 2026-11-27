/**
 * Composite Board Snapshot Utility
 * Merges white background + all movable BoardMediaLayer items (preserving aspect-locked zoom, scroll crop & pinned PDF/Image ink)
 * + foreground HTML5 drawing canvas strokes into a single crisp high-DPI PNG data URL.
 */
import { renderAllMediaAnnotations } from "./mediaAnnotations";

function loadImageAsync(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function renderCompositeCanvas(drawingCanvas, boardItems = []) {
  if (!drawingCanvas) return null;

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = drawingCanvas.width;
  exportCanvas.height = drawingCanvas.height;
  const ctx = exportCanvas.getContext("2d");

  const dpr = window.devicePixelRatio || 1;

  // 1. Solid crisp white background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

  // 2. Render each media object in CSS coordinate scale
  ctx.save();
  ctx.scale(dpr, dpr);

  for (const item of boardItems) {
    const zoom = item.contentZoom || 1;

    if ((item.kind === "image" || item.kind === "pdf") && item.src) {
      try {
        const img = await loadImageAsync(item.src);
        ctx.save();
        ctx.shadowColor = "rgba(15, 23, 42, 0.1)";
        ctx.shadowBlur = 10;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(item.x, item.y, item.width, item.height);
        ctx.shadowColor = "transparent";

        // Clip cleanly to the item card box so zoomed/scrolled content stays inside frame
        ctx.beginPath();
        ctx.rect(item.x, item.y, item.width, item.height);
        ctx.clip();

        // Zoom inside fixed card box: center smoothly when zoomed out (<100%), apply scroll crop when zoomed in
        const drawW = item.width * zoom;
        const drawH = drawW * (img.height / Math.max(1, img.width));
        const sx = item.scrollX || 0;
        const sy = item.scrollY || 0;
        const offsetX = drawW < item.width ? (item.width - drawW) / 2 : -sx;
        const offsetY = drawH < item.height ? (item.height - drawH) / 2 : -sy;
        ctx.drawImage(img, item.x + offsetX, item.y + offsetY, drawW, drawH);

        // Composite PDF/Image page-pinned ink/highlighter/shape/text annotations cleanly via offscreen layer (eraser-safe)
        const pageKey = String(item.currentPage || 1);
        const pageOps = item.annotationsByPage?.[pageKey];
        if (Array.isArray(pageOps) && pageOps.length > 0 && drawW > 0 && drawH > 0) {
          const annCanvas = document.createElement("canvas");
          const annScale = 2;
          annCanvas.width = Math.max(1, Math.round(drawW * annScale));
          annCanvas.height = Math.max(1, Math.round(drawH * annScale));
          const annCtx = annCanvas.getContext("2d");
          if (annCtx) {
            renderAllMediaAnnotations(annCtx, pageOps, annCanvas.width, annCanvas.height);
            ctx.drawImage(annCanvas, item.x + offsetX, item.y + offsetY, drawW, drawH);
          }
        }

        ctx.restore();

        // Draw crisp outer frame border
        ctx.save();
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 1;
        ctx.strokeRect(item.x, item.y, item.width, item.height);
        ctx.restore();
      } catch (err) {
        console.warn("[Export] Skipped unloading media item:", item.title);
      }
    } else if (item.kind === "doc") {
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1;
      ctx.fillRect(item.x, item.y, item.width, item.height);
      ctx.strokeRect(item.x, item.y, item.width, item.height);

      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(item.x, item.y, item.width, 32);
      ctx.strokeStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.moveTo(item.x, item.y + 32);
      ctx.lineTo(item.x + item.width, item.y + 32);
      ctx.stroke();

      ctx.fillStyle = "#1e293b";
      ctx.font = "700 12px Inter, system-ui, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(item.title || "Document", item.x + 12, item.y + 16, item.width - 24);

      ctx.beginPath();
      ctx.rect(item.x + 8, item.y + 36, item.width - 16, item.height - 44);
      ctx.clip();

      const fontSize = Math.round(13 * (item.contentZoom || item.fontScale || 1));
      ctx.font = `400 ${fontSize}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = "#334155";
      ctx.textBaseline = "top";

      const lineHeight = fontSize * 1.45;
      let cursorY = item.y + 42 - (item.scrollY || 0);
      const paragraphs = (item.plainText || "").split("\n");
      for (const para of paragraphs) {
        if (!para.trim()) {
          cursorY += lineHeight * 0.6;
          continue;
        }
        const wrapped = wrapLines(ctx, para, Math.max(60, item.width - 28));
        for (const line of wrapped) {
          if (cursorY > item.y + item.height - 12) break;
          if (cursorY + lineHeight >= item.y + 34) {
            ctx.fillText(line, item.x + 14, cursorY);
          }
          cursorY += lineHeight;
        }
        if (cursorY > item.y + item.height - 12) break;
      }

      ctx.restore();
    } else if (item.kind === "note") {
      ctx.save();
      ctx.shadowColor = "rgba(15, 23, 42, 0.14)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 5;

      ctx.fillStyle = item.bgColor || "#fef08a";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(item.x, item.y, item.width, item.height, 12);
      else ctx.rect(item.x, item.y, item.width, item.height);
      ctx.fill();

      ctx.shadowColor = "transparent";
      ctx.strokeStyle = item.borderColor || "#eab308";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Top darker tape strip
      ctx.save();
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(item.x + 1, item.y + 1, item.width - 2, item.height - 2, 11);
      else ctx.rect(item.x + 1, item.y + 1, item.width - 2, item.height - 2);
      ctx.clip();
      ctx.fillStyle = item.headerColor || "rgba(234, 179, 8, 0.35)";
      ctx.fillRect(item.x, item.y, item.width, 20);
      ctx.restore();

      const noteText = item.plainText ?? item.text ?? "";
      const fontSize = Math.round(13 * (item.contentZoom || 1));
      ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = item.textColor || "#422006";
      ctx.textBaseline = "top";
      ctx.textAlign = "left";

      ctx.beginPath();
      ctx.rect(item.x + 8, item.y + 24, Math.max(20, item.width - 16), Math.max(20, item.height - 32));
      ctx.clip();

      const lineHeight = fontSize * 1.4;
      let cursorY = item.y + 28;
      for (const para of noteText.split("\n")) {
        if (!para.trim()) {
          cursorY += lineHeight * 0.65;
          continue;
        }
        for (const line of wrapLines(ctx, para, Math.max(40, item.width - 28))) {
          if (cursorY > item.y + item.height - 10) break;
          ctx.fillText(line, item.x + 14, cursorY);
          cursorY += lineHeight;
        }
        if (cursorY > item.y + item.height - 10) break;
      }

      ctx.restore();
    }
  }

  ctx.restore();

  // 3. Foreground strokes, shapes, text & sticky notes
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(drawingCanvas, 0, 0);
  ctx.restore();

  return exportCanvas;
}

export async function buildCompositeBoardDataUrl(drawingCanvas, boardItems = []) {
  const exportCanvas = await renderCompositeCanvas(drawingCanvas, boardItems);
  return exportCanvas ? exportCanvas.toDataURL("image/png") : null;
}

/**
 * Fast lightweight JPEG snapshot (~70KB) for rapid Gemini Vision uploads.
 */
export async function buildAiCompositeDataUrl(drawingCanvas, boardItems = []) {
  const exportCanvas = await renderCompositeCanvas(drawingCanvas, boardItems);
  if (!exportCanvas) return null;

  const maxDim = 1200;
  const longest = Math.max(exportCanvas.width, exportCanvas.height);
  if (longest <= maxDim) {
    return exportCanvas.toDataURL("image/jpeg", 0.82);
  }

  const scale = maxDim / longest;
  const thumb = document.createElement("canvas");
  thumb.width = Math.max(1, Math.round(exportCanvas.width * scale));
  thumb.height = Math.max(1, Math.round(exportCanvas.height * scale));
  const tCtx = thumb.getContext("2d", { alpha: false });
  tCtx.fillStyle = "#ffffff";
  tCtx.fillRect(0, 0, thumb.width, thumb.height);
  tCtx.drawImage(exportCanvas, 0, 0, thumb.width, thumb.height);
  return thumb.toDataURL("image/jpeg", 0.82);
}
