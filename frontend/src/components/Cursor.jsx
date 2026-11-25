import React from "react";

/**
 * CollabFlow - Remote Cursor Component (Phase 5: Live Remote Cursors)
 * 
 * Renders a floating, colored pointer with a user badge for remote peers.
 * Uses pointer-events-none so remote cursors never block clicks on the canvas.
 */
export default function Cursor({ x, y, username, color }) {
  return (
    <div
      className="absolute pointer-events-none z-30 flex items-start gap-1 select-none transition-all duration-75 ease-out"
      style={{
        left: 0,
        top: 0,
        transform: `translate3d(${x}px, ${y}px, 0)`,
      }}
    >
      {/* Figma/Miro Style SVG Pointer Arrow */}
      <svg
        className="w-5 h-5 -rotate-45 drop-shadow-md"
        viewBox="0 0 24 24"
        fill={color || "#2563eb"}
        stroke="white"
        strokeWidth="1.5"
      >
        <path d="M3 3l7 18 3-7 7-3L3 3z" />
      </svg>

      {/* User Name Tag Badge */}
      <span
        className="text-[11px] font-semibold text-white px-2 py-0.5 rounded-full shadow-md whitespace-nowrap"
        style={{ backgroundColor: color || "#2563eb" }}
      >
        {username || "Guest"}
      </span>
    </div>
  );
}
