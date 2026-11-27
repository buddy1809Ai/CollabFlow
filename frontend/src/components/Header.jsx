import React, { useState } from "react";
import {
  Users,
  Share2,
  Check,
  Plus,
  DoorOpen,
  Wifi,
  WifiOff,
  Sparkles,
  Play,
  Square,
  Lock,
  Pencil,
} from "lucide-react";
import { generatePrivateRoomId } from "../utils/roomId";

/**
 * CollabFlow - Header Component
 * Handles Room Switching, Multi-user Count, Real-Time Connection Indicator, Time-Lapse Replay & AI Studio.
 */
export default function Header({
  roomId,
  onJoinRoom,
  userCount,
  connectionStatus = "connecting", // 'connecting' | 'connected' | 'disconnected'
  currentUser,
  onUpdateUsername,
  roomExplainer = null, // { userId, username } when Explain Mode is active
  mySocketId = null,
  onExplainBoard,
  isAiLoading = false,
  onReplay,
  isReplaying = false,
  canReplay = false,
}) {
  const [copied, setCopied] = useState(false);
  const [isEditingRoom, setIsEditingRoom] = useState(false);
  const [inputRoomId, setInputRoomId] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [inputUserName, setInputUserName] = useState("");

  const handleNameSubmit = (e) => {
    e.preventDefault();
    const trimmed = inputUserName.trim();
    if (trimmed && onUpdateUsername) {
      onUpdateUsername(trimmed);
    }
    setIsEditingName(false);
    setInputUserName("");
  };

  // Copy shareable private room invite link to clipboard
  const handleCopyLink = () => {
    const shareUrl = `${window.location.origin}/?room=${encodeURIComponent(roomId)}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Submit manual room change
  const handleRoomSubmit = (e) => {
    e.preventDefault();
    const trimmed = inputRoomId.trim();
    if (trimmed && trimmed !== roomId) {
      onJoinRoom(trimmed);
    }
    setIsEditingRoom(false);
    setInputRoomId("");
  };

  // Generate a fresh private unguessable room ID (e.g. cf-8k4m2p9x)
  const handleCreateRandomRoom = () => {
    const privateId = generatePrivateRoomId();
    onJoinRoom(privateId);
    setIsEditingRoom(false);
  };

  return (
    <header className="absolute top-4 left-4 right-4 z-30 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
      {/* Left: Branding & Connection Status */}
      <div className="flex items-center gap-2 rounded-2xl bg-white/95 px-3 py-2 shadow-lg backdrop-blur-md border border-slate-200 pointer-events-auto">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-600"></span>
          <span className="font-bold text-slate-900 tracking-tight text-sm">
            CollabFlow
          </span>
        </div>

        <span className="text-slate-300">|</span>

        {/* Live WebSocket Status Pill */}
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {connectionStatus === "connected" && (
            <span className="flex items-center gap-1 text-emerald-600 font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <Wifi className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">
                {window.location.hostname === "localhost" ? "Live: Port 5000" : "Live Sync"}
              </span>
              <span className="xl:hidden">Live</span>
            </span>
          )}

          {connectionStatus === "connecting" && (
            <span className="flex items-center gap-1 text-amber-600 font-semibold">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping"></span>
              <WifiOff className="h-3.5 w-3.5" />
              <span>Connecting...</span>
            </span>
          )}

          {connectionStatus === "disconnected" && (
            <span className="flex items-center gap-1 text-rose-600 font-semibold">
              <span className="h-2 w-2 rounded-full bg-rose-500"></span>
              <WifiOff className="h-3.5 w-3.5" />
              <span>Disconnected</span>
            </span>
          )}
        </div>
      </div>

      {/* Center/Right Controls: User Identity, Room Info, User Count, Replay, AI Studio & Share */}
      <div className="flex flex-wrap items-center gap-1.5 max-w-full pointer-events-auto">
        {/* Editable Current User Identity Badge (Visible on mobile & desktop) */}
        {currentUser && (
          <div className="flex items-center gap-1.5 rounded-2xl bg-white/95 px-2.5 py-1.5 shadow-lg backdrop-blur-md border border-slate-200 text-xs font-semibold text-slate-700">
            {isEditingName ? (
              <form onSubmit={handleNameSubmit} className="flex items-center gap-1">
                <input
                  type="text"
                  maxLength={24}
                  value={inputUserName}
                  onChange={(e) => setInputUserName(e.target.value)}
                  placeholder="Your name..."
                  className="w-24 rounded-lg border border-slate-300 px-2 py-0.5 text-xs text-slate-800 outline-none focus:border-indigo-500"
                  autoFocus
                />
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-indigo-700 transition"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingName(false)}
                  className="rounded-lg bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setInputUserName(currentUser.username || "");
                  setIsEditingName(true);
                }}
                className="flex items-center gap-1.5 hover:text-indigo-600 transition cursor-pointer"
                title="Click to edit your display name"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: currentUser.color }}
                ></span>
                <span className="hidden sm:inline text-slate-400 font-medium">You:</span>
                <span className="max-w-[110px] truncate">{currentUser.username}</span>
                <Pencil className="h-3 w-3 text-slate-400 shrink-0" />
              </button>
            )}
          </div>
        )}

        {/* Active Room Badge / Switcher */}
        <div className="flex items-center gap-2 rounded-2xl bg-white/95 px-3 py-1.5 shadow-lg backdrop-blur-md border border-slate-200 text-xs">
          {isEditingRoom ? (
            <form onSubmit={handleRoomSubmit} className="flex items-center gap-1.5">
              <input
                type="text"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value)}
                placeholder="Enter Room ID..."
                className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-800 outline-none focus:border-indigo-500"
                autoFocus
              />
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-2 py-1 font-semibold text-white hover:bg-indigo-700 transition"
              >
                Join
              </button>
              <button
                type="button"
                onClick={() => setIsEditingRoom(false)}
                className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600 hover:bg-slate-200 transition"
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <span
                className="flex items-center gap-1 text-slate-400 font-medium"
                title="Private room — invite only via link or QR code"
              >
                <Lock className="h-3 w-3 text-emerald-600" />
                <span className="hidden sm:inline">Room:</span>
              </span>
              <span
                className="font-bold font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100"
                title={`Private room ID: ${roomId}`}
              >
                {roomId}
              </span>
              <button
                type="button"
                onClick={() => {
                  setInputRoomId(roomId);
                  setIsEditingRoom(true);
                }}
                className="text-slate-500 hover:text-indigo-600 p-1 rounded-md hover:bg-slate-100 transition"
                title="Join another room by code"
              >
                <DoorOpen className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleCreateRandomRoom}
                className="flex items-center gap-1 text-xs text-slate-600 hover:text-indigo-600 px-1.5 py-0.5 rounded-md hover:bg-slate-100 transition font-medium"
                title="Create a brand-new private room"
              >
                <Plus className="h-3 w-3" /> New
              </button>
            </div>
          )}
        </div>

        {/* Room Occupants User Count Badge */}
        <div className="flex items-center gap-1.5 rounded-2xl bg-white/95 px-2.5 py-2 shadow-lg backdrop-blur-md border border-slate-200 text-xs font-semibold text-slate-700 whitespace-nowrap">
          <Users className="h-4 w-4 text-indigo-600" />
          <span>
            {userCount} {userCount === 1 ? "user" : "users"}
          </span>
        </div>

        {/* Explainer Mode Active Badge ("Rahul is explaining" + Watch Mode pill for peers) */}
        {roomExplainer && (
          <div className="flex items-center gap-1.5 rounded-2xl bg-blue-600 px-3 py-1.5 shadow-lg shadow-blue-500/25 text-xs font-semibold text-white">
            <span className="h-2 w-2 rounded-full bg-white animate-pulse"></span>
            <span>{roomExplainer.username} is explaining</span>
            {mySocketId && roomExplainer.userId !== mySocketId && (
              <span className="rounded-full bg-blue-500/90 border border-blue-300/60 px-1.5 py-0.5 text-[10px]">
                Watch Mode
              </span>
            )}
          </div>
        )}

        {/* Time-Lapse Session Replay Button */}
        {onReplay && (
          <button
            type="button"
            onClick={onReplay}
            disabled={!canReplay && !isReplaying}
            className={`flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur-md transition border ${
              isReplaying
                ? "bg-rose-600 text-white border-rose-600 shadow-rose-500/20"
                : canReplay
                ? "bg-white/95 text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-indigo-600 active:scale-95"
                : "bg-white/70 text-slate-400 border-slate-200 cursor-not-allowed"
            }`}
            title={
              isReplaying
                ? "Stop Session Replay"
                : canReplay
                ? "Replay drawing timeline from start to finish"
                : "Draw something first to replay session"
            }
          >
            {isReplaying ? (
              <>
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 text-indigo-600 fill-indigo-600" />
                <span>Replay</span>
              </>
            )}
          </button>
        )}

        {/* Phase 10-11: "AI Studio" Button (Explain Board & Generate Diagram) */}
        {onExplainBoard && (
          <button
            type="button"
            onClick={onExplainBoard}
            disabled={isAiLoading}
            className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-purple-500/20 backdrop-blur-md transition hover:opacity-95 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            title="Open AI Studio: Explain Board or Generate Flowchart Diagram"
          >
            <Sparkles className={`h-4 w-4 ${isAiLoading ? "animate-spin" : ""}`} />
            <span>{isAiLoading ? "Analyzing..." : "AI Studio"}</span>
          </button>
        )}

        {/* 1-Click Private Invite Link Button */}
        <button
          type="button"
          onClick={handleCopyLink}
          className={`flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur-md transition border ${
            copied
              ? "bg-emerald-600 text-white border-emerald-600 shadow-emerald-500/20"
              : "bg-white/95 text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-indigo-600"
          }`}
          title="Copy private room invite link"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-white" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Share2 className="h-4 w-4 text-indigo-600" />
              <span className="hidden xl:inline">Invite</span>
              <span className="xl:hidden">Invite</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
