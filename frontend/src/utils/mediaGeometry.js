/**
 * Shared geometry & zoom helpers for movable PDFs, Images, and Document cards.
 * Supports free horizontal expansion for both portrait & landscape PDFs (Fit-to-Width)
 * while maintaining zero blank letterboxing margins and natural content aspect ratio.
 */

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3.0;

/**
 * Clamp and normalize a board media card cleanly inside current browser bounds
 * while preserving the user's current frame proportions (>= natural PDF aspect ratio).
 */
export function fitItemToViewport(item, viewportW = window.innerWidth, viewportH = window.innerHeight) {
  if (!item) return null;
  if (item.kind === "doc" || item.kind === "note") {
    const isNote = item.kind === "note";
    const minW = isNote ? 150 : 200;
    const minH = isNote ? 110 : 140;
    const maxW = Math.max(minW + 20, viewportW - 24);
    const maxH = Math.max(minH + 20, viewportH - 140);
    const width = Math.max(minW, Math.min(item.width || (isNote ? 210 : 400), maxW));
    const height = Math.max(minH, Math.min(item.height || (isNote ? 145 : 340), maxH));
    const x = Math.max(8, Math.min(item.x ?? 20, Math.max(8, viewportW - width - 8)));
    const y = Math.max(64, Math.min(item.y ?? 120, Math.max(64, viewportH - height - 76)));
    return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
  }

  const pdfRatio =
    item.aspectRatio || (item.width && item.height ? item.width / item.height : 0.7727);
  let width = Math.max(140, Math.round(item.width || item.baseWidth || 360));
  let height = Math.max(110, Math.round(item.height || item.baseHeight || Math.round(width / pdfRatio)));

  const availW = Math.max(220, viewportW - 24);
  const availH = Math.max(160, viewportH - 150);

  if (width > availW || height > availH) {
    const downScale = Math.min(availW / width, availH / height);
    width = Math.max(140, Math.round(width * downScale));
    height = Math.max(110, Math.round(height * downScale));
  }

  // Ensure frame never becomes narrower horizontally than content height allows (prevents bottom white gaps)
  const minWForHeight = Math.round(height * pdfRatio);
  if (width < minWForHeight) {
    height = Math.max(110, Math.round(width / pdfRatio));
  }

  const x = Math.max(8, Math.min(item.x ?? 20, Math.max(8, viewportW - width - 8)));
  const y = Math.max(64, Math.min(item.y ?? 120, Math.max(64, viewportH - height - 76)));

  return {
    x: Math.round(x),
    y: Math.round(y),
    width,
    height,
    baseWidth: width,
    baseHeight: height,
    aspectRatio: pdfRatio,
  };
}

/**
 * Compute zoom update INSIDE the fixed media frame without altering outer x, y, width, height.
 */
export function computeZoomPatch(
  item,
  targetZoom,
  viewportW = window.innerWidth,
  viewportH = window.innerHeight,
  focusPoint = null
) {
  if (!item) return null;
  const oldZoom = item.contentZoom || 1;
  const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(targetZoom.toFixed(3))));
  if (nextZoom === oldZoom) return null;

  if (item.kind === "doc" || item.kind === "note") {
    return { contentZoom: nextZoom };
  }

  const pdfRatio =
    item.aspectRatio || (item.width && item.height ? item.width / item.height : 0.7727);
  const frameW = Math.max(140, item.width || 360);
  const frameH = Math.max(110, item.height || Math.round(frameW / pdfRatio));

  const contentW = Math.round(frameW * nextZoom);
  const contentH = Math.round(contentW / pdfRatio);
  const maxScrollX = Math.max(0, contentW - frameW);
  const maxScrollY = Math.max(0, contentH - frameH);

  const patch = {
    contentZoom: nextZoom,
  };

  if (maxScrollX === 0 && maxScrollY === 0) {
    patch.scrollX = 0;
    patch.scrollY = 0;
  } else {
    const relX = focusPoint
      ? Math.max(0, Math.min(frameW, focusPoint.clientX - item.x))
      : frameW / 2;
    const relY = focusPoint
      ? Math.max(0, Math.min(frameH, focusPoint.clientY - item.y))
      : frameH / 2;
    const scaleFactor = nextZoom / oldZoom;

    patch.scrollX = Math.max(
      0,
      Math.min(maxScrollX, Math.round(((item.scrollX || 0) + relX) * scaleFactor - relX))
    );
    patch.scrollY = Math.max(
      0,
      Math.min(maxScrollY, Math.round(((item.scrollY || 0) + relY) * scaleFactor - relY))
    );
  }

  return patch;
}

/**
 * Find the topmost media item under pointer coordinates (optionally preferring selectedId or specific kinds).
 */
export function findMediaItemAtPoint(items, x, y, preferredId = null, allowedKinds = null) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const matches = (it) =>
    (!allowedKinds || allowedKinds.has(it.kind)) &&
    x >= it.x &&
    x <= it.x + it.width &&
    y >= it.y &&
    y <= it.y + it.height;

  if (preferredId) {
    const preferred = items.find((it) => it.id === preferredId && matches(it));
    if (preferred) return preferred;
  }

  for (let i = items.length - 1; i >= 0; i--) {
    if (matches(items[i])) return items[i];
  }
  return null;
}
