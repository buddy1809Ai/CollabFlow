import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import Canvas from "./components/Canvas";
import Header from "./components/Header";
import AiExplainer from "./components/AiExplainer";

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

  // Synchronously initialize Room ID from URL query (?room=xyz) or fallback to "room-101"
  const [roomId, setRoomId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = params.get("room");
    return initial && initial.trim() ? initial.trim() : "room-101";
  });

  const [userCount, setUserCount] = useState(1);

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

  // Generate a random, friendly user identity for this session
  const currentUser = useMemo(() => {
    const names = ["Designer", "Architect", "Maker", "Innovator", "Coder", "Artist"];
    const colors = ["#2563eb", "#e11d48", "#059669", "#7c3aed", "#d97706", "#0891b2"];
    const randomName = names[Math.floor(Math.random() * names.length)];
    const randomNum = Math.floor(10 + Math.random() * 90);
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    return {
      username: `${randomName}-${randomNum}`,
      color: randomColor,
    };
  }, []);

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
    });

    newSocket.on("connect_error", (error) => {
      console.warn(`[Socket Connection Error] ${error.message}`);
      setConnectionStatus("disconnected");
    });

    newSocket.on("user-count", (count) => {
      setUserCount(count);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // 3. Emit join-room event whenever socket connects or roomId changes
  useEffect(() => {
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

  // 7. Run Explain Board analysis against /api/explain-board
  const runExplainAnalysis = async () => {
    const controls = canvasControlsRef.current;
    if (!controls || !controls.getImage) return;

    setIsAiOpen(true);
    setIsAiLoading(true);
    setAiExplanation(null);
    setAiModelUsed(null);
    setAiError(null);

    try {
      const imageBase64 = await controls.getImage();

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
      });
    } catch (err) {
      console.error("[AI Diagram Generator Error]", err);
      setGenerateError(err.message || "Could not connect to AI diagram endpoint.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-100">
      {/* Top Header: Room Switcher, Connection Status, Replay, AI Studio, Share */}
      <Header
        roomId={roomId}
        onJoinRoom={handleJoinRoom}
        userCount={userCount}
        connectionStatus={connectionStatus}
        isConnected={connectionStatus === "connected"}
        currentUser={currentUser}
        onExplainBoard={handleOpenAiStudio}
        isAiLoading={isAiLoading}
        onReplay={handleReplay}
        isReplaying={isReplaying}
        canReplay={canReplay}
      />

      {/* Main Canvas Component with Text, Sticky Notes, 6 Shapes, Laser, Replay & Paste */}
      <Canvas
        socket={socket}
        isConnected={connectionStatus === "connected"}
        roomId={roomId}
        currentUser={currentUser}
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
    </main>
  );
}

export default App;
