import React from "react";

/**
 * Shared floating cursor reaction pill (used both locally and on remote peer cursors).
 */
export function ReactionBubble({ text, isFading = false }) {
  if (!text) return null;
  return (
    <div
      className={`pointer-events-none px-2.5 py-1 rounded-2xl bg-slate-900/95 text-white text-[11px] font-semibold shadow-xl border border-slate-700/80 whitespace-nowrap transition-all duration-500 ${
        isFading ? "opacity-0 -translate-y-1" : "opacity-100 translate-y-0"
      }`}
    >
      {text}
    </div>
  );
}

/**
 * CollabFlow - Remote Cursor Component
 * Supports Explainer Mode glowing blue ring + floating Cursor Reaction Bubbles.
 */
export default function Cursor({ x, y, username, color, isExplaining = false, reaction = null }) {
  return (
    <div
      className="absolute pointer-events-none z-30 flex items-start gap-1 select-none transition-all duration-75 ease-out"
      style={{
        left: 0,
        top: 0,
        transform: `translate3d(${x}px, ${y}px, 0)`,
      }}
    >
      <div className="relative">
        {/* Glowing Blue Ring when this peer is in Explainer Mode */}
        {isExplaining && (
          <span className="absolute -left-2 -top-2 w-9 h-9 rounded-full border-2 border-blue-500 bg-blue-500/20 shadow-[0_0_18px_rgba(37,99,235,0.85)] animate-pulse" />
        )}

        {/* Figma/Miro Style SVG Pointer Arrow */}
        <svg
          className="relative w-5 h-5 -rotate-45 drop-shadow-md"
          viewBox="0 0 24 24"
          fill={isExplaining ? "#2563eb" : color || "#2563eb"}
          stroke="white"
          strokeWidth="1.5"
        >
          <path d="M3 3l7 18 3-7 7-3L3 3z" />
        </svg>
      </div>

      <div className="flex flex-col items-start gap-1">
        {/* User Name Tag Badge */}
        <span
          className={`text-[11px] font-semibold text-white px-2 py-0.5 rounded-full shadow-md whitespace-nowrap ${
            isExplaining ? "ring-2 ring-blue-300" : ""
          }`}
          style={{ backgroundColor: isExplaining ? "#2563eb" : color || "#2563eb" }}
        >
          {username || "Guest"}
        </span>

        {/* Ephemeral Cursor Reaction Bubble */}
        {reaction && <ReactionBubble text={reaction.text} isFading={reaction.isFading} />}
      </div>
    </div>
  );
}
