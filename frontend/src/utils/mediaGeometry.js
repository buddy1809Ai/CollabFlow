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
  if (item.kind === "doc") {
    const maxW = Math.max(240, viewportW - 24);
    const maxH = Math.max(180, viewportH - 140);
    const width = Math.max(200, Math.min(item.width || 400, maxW));
    const height = Math.max(140, Math.min(item.height || 340, maxH));
    const x = Math.max(8, Math.min(item.x ?? 20, Math.max(8, viewportW - width - 8)));
    const y = Math.max(64, Math.min(item.y ?? 120, Math.max(64, viewportH - height - 76)));
    return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
  }

  const zoom = item.contentZoom || 1;
  const pdfRatio =
    item.aspectRatio || (item.width && item.height ? item.width / item.height : 0.7727);
  const rawBaseW =
    item.baseWidth || (zoom < 1 ? item.width / Math.max(0.25, zoom) : item.width) || 360;
  const rawBaseH = item.baseHeight || Math.round(rawBaseW / pdfRatio);

  const availW = Math.max(220, viewportW - 24);
  const availH = Math.max(160, viewportH - 150);

  let baseW = rawBaseW;
  let baseH = rawBaseH;
  if (baseW > availW || baseH > availH) {
    const downScale = Math.min(availW / baseW, availH / baseH);
    baseW = Math.max(160, Math.round(baseW * downScale));
    baseH = Math.max(120, Math.round(baseH * downScale));
  }

  // Ensure frame never becomes narrower horizontally than content height allows (prevents bottom white gaps)
  const minWForHeight = Math.round(baseH * pdfRatio);
  if (baseW < minWForHeight) {
    baseH = Math.max(110, Math.round(baseW / pdfRatio));
  }

  const frameScale = Math.min(1, zoom);
  const width = Math.max(140, Math.round(baseW * frameScale));
  const height = Math.max(110, Math.round(baseH * frameScale));

  const x = Math.max(8, Math.min(item.x ?? 20, Math.max(8, viewportW - width - 8)));
  const y = Math.max(64, Math.min(item.y ?? 120, Math.max(64, viewportH - height - 76)));

  return {
    x: Math.round(x),
    y: Math.round(y),
    width,
    height,
    baseWidth: Math.round(baseW),
    baseHeight: Math.round(baseH),
    aspectRatio: pdfRatio,
  };
}

/**
 * Compute zoom update for PDF/Image (preserving widened or portrait frame ratio) or font-zoom for Docs.
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

  if (item.kind === "doc") {
    return { contentZoom: nextZoom };
  }

  const pdfRatio =
    item.aspectRatio || (item.width && item.height ? item.width / item.height : 0.7727);
  const baseW =
    item.baseWidth || (oldZoom < 1 ? Math.round(item.width / Math.max(0.25, oldZoom)) : item.width);
  const baseH = item.baseHeight || Math.round(baseW / pdfRatio);

  const nextFrameScale = Math.min(1, nextZoom);
  const availW = Math.max(200, viewportW - 24);
  const availH = Math.max(160, viewportH - 150);

  let nextW = Math.max(140, Math.round(baseW * nextFrameScale));
  let nextH = Math.max(110, Math.round(baseH * nextFrameScale));
  if (nextW > availW || nextH > availH) {
    const down = Math.min(availW / nextW, availH / nextH);
    nextW = Math.max(140, Math.round(nextW * down));
    nextH = Math.max(110, Math.round(nextH * down));
  }

  const centerX = item.x + item.width / 2;
  const centerY = item.y + item.height / 2;
  const nextX = Math.max(
    8,
    Math.min(Math.round(centerX - nextW / 2), Math.max(8, viewportW - nextW - 8))
  );
  const nextY = Math.max(
    64,
    Math.min(Math.round(centerY - nextH / 2), Math.max(64, viewportH - nextH - 76))
  );

  const contentScale = Math.max(1, nextZoom);
  const maxScrollX = Math.max(0, Math.round(nextW * contentScale - nextW));
  const maxScrollY = Math.max(0, Math.round((nextW * contentScale) / pdfRatio - nextH));

  const patch = {
    contentZoom: nextZoom,
    baseWidth: Math.round(baseW),
    baseHeight: Math.round(baseH),
    aspectRatio: pdfRatio,
    x: nextX,
    y: nextY,
    width: nextW,
    height: nextH,
  };

  if (maxScrollX === 0 && maxScrollY === 0) {
    patch.scrollX = 0;
    patch.scrollY = 0;
  } else {
    const relX = focusPoint
      ? Math.max(0, Math.min(nextW, focusPoint.clientX - nextX))
      : nextW / 2;
    const relY = focusPoint
      ? Math.max(0, Math.min(nextH, focusPoint.clientY - nextY))
      : nextH / 2;
    const oldContentScale = Math.max(1, oldZoom);
    const scaleFactor = contentScale / oldContentScale;

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
