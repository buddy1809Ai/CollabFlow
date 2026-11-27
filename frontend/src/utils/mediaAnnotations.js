/**
 * Shared Canvas 2D renderer for normalized [0..1] annotations pinned to PDF pages and Images.
 * Guarantees annotations zoom, scroll, resize, and move 1:1 with their underlying media content.
 */

export function renderMediaAnnotationOp(ctx, op, width, height) {
  if (!ctx || !op || !width || !height) return;

  if (op.kind === "stroke") {
    const pts = op.points;
    if (!Array.isArray(pts) || pts.length === 0) return;

    ctx.save();
    const isEraser = Boolean(op.isEraser);
    const isHighlighter = Boolean(op.isHighlighter);
    const strokePx = Math.max(1.5, (op.normWidth || 0.006) * width);

    ctx.globalCompositeOperation = isEraser ? "destination-out" : "source-over";
    ctx.globalAlpha = isEraser ? 1 : isHighlighter ? 0.28 : 1;
    ctx.strokeStyle = isEraser ? "rgba(0,0,0,1)" : op.color || "#1e293b";
    ctx.lineWidth = isEraser
      ? strokePx * 3
      : isHighlighter
      ? Math.max(12, strokePx * 4.5)
      : strokePx;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(pts[0][0] * width, pts[0][1] * height);
    if (pts.length === 1) {
      ctx.lineTo(pts[0][0] * width + 0.1, pts[0][1] * height + 0.1);
    } else {
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i][0] * width, pts[i][1] * height);
      }
    }
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (op.kind === "shape") {
    const x1 = (op.startX || 0) * width;
    const y1 = (op.startY || 0) * height;
    const x2 = (op.endX || 0) * width;
    const y2 = (op.endY || 0) * height;
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = op.color || "#1e293b";
    ctx.lineWidth = Math.max(1.5, (op.normWidth || 0.006) * width);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();

    if (op.type === "rect") {
      ctx.rect(minX, minY, w, h);
    } else if (op.type === "circle") {
      const rx = w / 2;
      const ry = h / 2;
      ctx.ellipse(minX + rx, minY + ry, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
    } else if (op.type === "diamond") {
      const cx = minX + w / 2;
      const cy = minY + h / 2;
      ctx.moveTo(cx, minY);
      ctx.lineTo(minX + w, cy);
      ctx.lineTo(cx, minY + h);
      ctx.lineTo(minX, cy);
      ctx.closePath();
    } else if (op.type === "triangle") {
      ctx.moveTo(minX + w / 2, minY);
      ctx.lineTo(minX + w, minY + h);
      ctx.lineTo(minX, minY + h);
      ctx.closePath();
    } else if (op.type === "line") {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    } else if (op.type === "arrow") {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = Math.max(10, ctx.lineWidth * 3.2);
      ctx.moveTo(x2, y2);
      ctx.lineTo(
        x2 - headLen * Math.cos(angle - Math.PI / 6),
        y2 - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(x2, y2);
      ctx.lineTo(
        x2 - headLen * Math.cos(angle + Math.PI / 6),
        y2 - headLen * Math.sin(angle + Math.PI / 6)
      );
    }

    ctx.stroke();
    ctx.restore();
    return;
  }

  if (op.kind === "text" && op.text) {
    const px = (op.nx || 0) * width;
    const py = (op.ny || 0) * height;
    const fontSize = Math.max(11, Math.round((op.normFontSize || 0.03) * width));
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = op.color || "#1e293b";
    ctx.font = `600 ${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    String(op.text)
      .split("\n")
      .forEach((line, idx) => {
        ctx.fillText(line, px, py + idx * fontSize * 1.3);
      });
    ctx.restore();
  }
}

export function renderAllMediaAnnotations(ctx, ops, width, height) {
  if (!ctx || !width || !height) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.restore();

  if (!Array.isArray(ops) || ops.length === 0) return;
  for (const op of ops) {
    renderMediaAnnotationOp(ctx, op, width, height);
  }
}
