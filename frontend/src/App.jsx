import React, { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import { User, Lock, ArrowRight } from "lucide-react";
import Canvas from "./components/Canvas";
import Header from "./components/Header";
import AiExplainer from "./components/AiExplainer";
import { generatePrivateRoomId } from "./utils/roomId";

const USER_COLORS = ["#2563eb", "#e11d48", "#059669", "#7c3aed", "#d97706", "#0891b2"];
const FALLBACK_NAMES = ["Designer", "Architect", "Maker", "Innovator", "Coder", "Artist"];

function createFallbackIdentity() {
  const randomName = FALLBACK_NAMES[Math.floor(Math.random() * FALLBACK_NAMES.length)];
  const randomNum = Math.floor(10 + Math.random() * 90);
  const randomColor = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
  return { username: `${randomName}-${randomNum}`, color: randomColor };
}

// Backend Express & Socket.io server endpoint (uses VITE_SERVER_URL in production, localhost in dev)
const SERVER_URL = (
  import.meta.env.VITE_SERVER_URL || "http://localhost:5000"
).replace(/\/+$/, "");

/**
 * CollabFlow - Main Application Shell
 * Orchestrates Socket.io connection, synchronous URL Room Routing,
 * Time-Lapse Session Replay controls, and 2-Tab AI Studio Drawer.
 */
function App() {
  const [socket, setSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("connecting");

  // Initialize private Room ID from URL (?room=xyz) or auto-create a fresh isolated room per user
  const [roomId, setRoomId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = params.get("room");
    return initial && initial.trim() ? initial.trim() : generatePrivateRoomId();
  });

  const [userCount, setUserCount] = useState(1);
  const [roomExplainer, setRoomExplainer] = useState(null); // { userId, username }

  // Canvas imperative controls registered by Canvas.jsx
  const canvasControlsRef = useRef(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const [canReplay, setCanReplay] = useState(false);

  // AI Studio Drawer states (Explain Board + Generate Diagram)
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiExplanation, setAiExplanation] = useState(null);
  const [aiModelUsed, setAiModelUsed] = useState(null);
  const [aiError, setAiError] = useState(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [generatedInfo, setGeneratedInfo] = useState(null);

  // User identity (remembers entered name in localStorage; prompts new entrants cleanly)
  const [fallbackIdentity] = useState(() => createFallbackIdentity());
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const savedName = localStorage.getItem("collabflow_username")?.trim();
      const savedColor = localStorage.getItem("collabflow_color");
      if (savedName) {
        return {
          username: savedName.slice(0, 24),
          color: USER_COLORS.includes(savedColor) ? savedColor : fallbackIdentity.color,
        };
      }
    } catch {
      // Ignore storage access restrictions
    }
    return fallbackIdentity;
  });

  const [isNamePromptOpen, setIsNamePromptOpen] = useState(() => {
    try {
      return !localStorage.getItem("collabflow_username")?.trim();
    } catch {
      return true;
    }
  });
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState(() => currentUser.color);

  const handleSaveUserIdentity = useCallback(
    (rawName, nextColor = null) => {
      const cleanName = (rawName || "").trim().slice(0, 24) || fallbackIdentity.username;
      const resolvedColor = nextColor || currentUser.color || fallbackIdentity.color;
      setCurrentUser({ username: cleanName, color: resolvedColor });
      setIsNamePromptOpen(false);
      try {
        localStorage.setItem("collabflow_username", cleanName);
        localStorage.setItem("collabflow_color", resolvedColor);
      } catch {
        // Ignore storage errors
      }
      if (socket && socket.connected && roomExplainer?.userId === socket.id) {
        socket.emit("explainer-toggle", {
          roomId,
          username: cleanName,
          active: true,
        });
      }
    },
    [currentUser.color, fallbackIdentity.color, fallbackIdentity.username, roomExplainer?.userId, roomId, socket]
  );

  // 1. Synchronize browser URL query param (?room=xyz) immediately when roomId updates
  useEffect(() => {
    const currentUrl = new URL(window.location);
    if (currentUrl.searchParams.get("room") !== roomId) {
      currentUrl.searchParams.set("room", roomId);
      window.history.replaceState({}, "", currentUrl);
    }
  }, [roomId]);

  // 2. Establish persistent Socket.io connection on mount
  useEffect(() => {
    setConnectionStatus("connecting");

    const newSocket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log(`[Socket Connected] ID: ${newSocket.id}`);
      setConnectionStatus("connected");
    });

    newSocket.on("disconnect", (reason) => {
      console.log(`[Socket Disconnected] Reason: ${reason}`);
      setConnectionStatus("disconnected");
      setRoomExplainer(null);
    });

    newSocket.on("connect_error", (error) => {
      console.warn(`[Socket Connection Error] ${error.message}`);
      setConnectionStatus("disconnected");
    });

    newSocket.on("user-count", (count) => {
      setUserCount(count);
    });

    newSocket.on("explainer-updated", ({ explainer }) => {
      setRoomExplainer(explainer || null);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // 3. Emit join-room event whenever socket connects or roomId changes
  useEffect(() => {
    setRoomExplainer(null);
    if (!socket || connectionStatus !== "connected") return;
    socket.emit("join-room", roomId);
  }, [socket, connectionStatus, roomId]);

  // 4. Register Canvas controls cleanly
  const handleRegisterControls = useCallback((controls) => {
    canvasControlsRef.current = controls;
    setIsReplaying(Boolean(controls.isReplaying));
    setCanReplay(Boolean(controls.canReplay));
  }, []);

  // 5. Switch or create room
  const handleJoinRoom = (newRoomId) => {
    if (newRoomId && newRoomId !== roomId) {
      setRoomId(newRoomId);
    }
  };

  // 6. Trigger Time-Lapse Replay or Stop
  const handleReplay = () => {
    const controls = canvasControlsRef.current;
    if (!controls) return;
    if (controls.isReplaying) {
      controls.stopReplay();
    } else {
      controls.startReplay();
    }
  };

  // 7. Run Explain Board analysis against /api/explain-board (fast lightweight JPEG snapshot)
  const runExplainAnalysis = async () => {
    const controls = canvasControlsRef.current;
    const captureFn = controls?.getAiImage || controls?.getImage;
    if (!captureFn) return;

    setIsAiOpen(true);
    setIsAiLoading(true);
    setAiExplanation(null);
    setAiModelUsed(null);
    setAiError(null);

    try {
      const imageBase64 = await captureFn();

      const response = await fetch(`${SERVER_URL}/api/explain-board`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageBase64 }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to analyze board. Please check backend server.");
      }

      setAiExplanation(data.explanation);
      setAiModelUsed(data.modelUsed || "Gemini Flash");
    } catch (err) {
      console.error("[AI Explainer Error]", err);
      setAiError(err.message || "Could not connect to backend AI service.");
    } finally {
      setIsAiLoading(false);
    }
  };

  // Open AI Studio Drawer (Auto-analyzes if board has content, otherwise opens ready for prompt or manual analyze)
  const handleOpenAiStudio = () => {
    const hasContent = canvasControlsRef.current?.hasActions?.();
    if (hasContent) {
      runExplainAnalysis();
    } else {
      setIsAiOpen(true);
    }
  };

  // 8. Generate Diagram from Prompt -> Auto-Draw on Canvas
  const handleGenerateDiagram = async (prompt) => {
    setIsGenerating(true);
    setGenerateError(null);
    setGeneratedInfo(null);

    try {
      const response = await fetch(`${SERVER_URL}/api/generate-diagram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to generate diagram.");
      }

      const elements = data.diagram?.elements || [];
      canvasControlsRef.current?.drawAiDiagram?.(elements);
      setGeneratedInfo({
        title: data.diagram?.title || "Generated Flowchart",
        count: elements.length,
        modelUsed: data.modelUsed || "Gemini Flash",
        durationMs: data.durationMs,
      });
    } catch (err) {
      console.error("[AI Diagram Generator Error]", err);
      setGenerateError(err.message || "Could not connect to AI diagram endpoint.");
    } finally {
      setIsGenerating(false);
    }
  };

  // 9. Toggle Explainer Mode cleanly via Socket.io
  const handleToggleExplainMode = useCallback(() => {
    if (!socket || !socket.connected) return;
    const isSelfExplaining = roomExplainer?.userId === socket.id;
    socket.emit("explainer-toggle", {
      roomId,
      username: currentUser.username,
      active: !isSelfExplaining,
    });
  }, [socket, roomExplainer, roomId, currentUser.username]);

  return (
    <main className="relative w-screen h-dvh overflow-hidden bg-slate-100">
      {/* Top Header: Room Switcher, Connection Status, Explainer Badge, Replay, AI Studio, Share */}
      <Header
        roomId={roomId}
        onJoinRoom={handleJoinRoom}
        userCount={userCount}
        connectionStatus={connectionStatus}
        isConnected={connectionStatus === "connected"}
        currentUser={currentUser}
        onUpdateUsername={(name) => handleSaveUserIdentity(name)}
        roomExplainer={roomExplainer}
        mySocketId={socket?.id || null}
        onExplainBoard={handleOpenAiStudio}
        isAiLoading={isAiLoading}
        onReplay={handleReplay}
        isReplaying={isReplaying}
        canReplay={canReplay}
      />

      {/* Main Canvas Component with Touch, Highlighter, QR Share, Reactions & Explain Mode */}
      <Canvas
        socket={socket}
        isConnected={connectionStatus === "connected"}
        roomId={roomId}
        currentUser={currentUser}
        roomExplainer={roomExplainer}
        onToggleExplainMode={handleToggleExplainMode}
        onRegisterControls={handleRegisterControls}
      />

      {/* Slide-Over 2-Tab AI Studio Drawer */}
      <AiExplainer
        isOpen={isAiOpen}
        onClose={() => setIsAiOpen(false)}
        isLoading={isAiLoading}
        explanation={aiExplanation}
        modelUsed={aiModelUsed}
        error={aiError}
        onRetry={runExplainAnalysis}
        onGenerateDiagram={handleGenerateDiagram}
        isGenerating={isGenerating}
        generateError={generateError}
        generatedInfo={generatedInfo}
      />

      {/* Enter Your Name Modal on Room Entry (remembers name for subsequent visits) */}
      {isNamePromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveUserIdentity(draftName, draftColor);
            }}
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-slate-200"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <User className="h-5 w-5" />
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-1 text-[11px] font-mono font-semibold text-indigo-700">
                <Lock className="h-3 w-3 text-emerald-600" />
                {roomId}
              </span>
            </div>

            <h2 className="text-lg font-bold text-slate-900">Enter Your Name</h2>
            <p className="mt-1 text-xs text-slate-500">
              Peers in this room will see your name on your cursor, reactions &amp; Explain Mode.
            </p>

            <input
              type="text"
              autoFocus
              maxLength={24}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Your name (e.g. Rahul, Priya)..."
              className="mt-4 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />

            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">Cursor color:</span>
              <div className="flex items-center gap-1.5">
                {USER_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setDraftColor(hex)}
                    style={{ backgroundColor: hex }}
                    className={`h-5 w-5 rounded-full transition ${
                      draftColor === hex
                        ? "ring-2 ring-offset-2 ring-slate-800 scale-110"
                        : "opacity-75 hover:opacity-100"
                    }`}
                    title="Select cursor color"
                  />
                ))}
              </div>
            </div>

            <div className="mt-5 flex items-center gap-2">
              <button
                type="submit"
                disabled={!draftName.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <span>Join Whiteboard</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleSaveUserIdentity(fallbackIdentity.username, draftColor)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                title={`Continue as ${fallbackIdentity.username}`}
              >
                Guest
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

export default App;
