/**
 * Composite Board Snapshot Utility
 * Merges white background + all movable BoardMediaLayer items (preserving aspect-locked zoom & scroll crop)
 * + foreground HTML5 drawing canvas strokes into a single crisp high-DPI PNG data URL.
 */

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

export async function buildCompositeBoardDataUrl(drawingCanvas, boardItems = []) {
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

        // Unified Fit-to-Width draw matching DOM viewport (covers <=100%, widened & >100% zoom cleanly)
        const contentScale = Math.max(1, zoom);
        const drawW = item.width * contentScale;
        const drawH = drawW * (img.height / Math.max(1, img.width));
        const sx = item.scrollX || 0;
        const sy = item.scrollY || 0;
        ctx.drawImage(img, item.x - sx, item.y - sy, drawW, drawH);

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
    }
  }

  ctx.restore();

  // 3. Foreground strokes, shapes, text & sticky notes
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(drawingCanvas, 0, 0);
  ctx.restore();

  return exportCanvas.toDataURL("image/png");
}
