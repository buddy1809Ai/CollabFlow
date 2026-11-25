// ============================================================
// CollabFlow - Real-Time Collaborative Whiteboard Backend Server
// Phase 8-10: Shapes Synchronization & AI Multimodal Vision Integration
// Tech Stack: Node.js, Express.js, Socket.io, CORS, dotenv
// ============================================================

const fs = require("fs");
const path = require("path");
const ENV_PATH = path.join(__dirname, ".env");
if (fs.existsSync(ENV_PATH)) {
  require("dotenv").config({ path: ENV_PATH, override: true });
}
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

// 1. Initialize Express application
const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",")
      .map((s) => s.trim().replace(/\/+$/, ""))
      .filter(Boolean)
  : "*";

// 2. Middleware setup
app.use(cors({ origin: allowedOrigins }));
// Set JSON body limit to 10mb for full canvas snapshot state broadcasts and base64 exports
app.use(express.json({ limit: "10mb" }));

// 3. Create HTTP server wrapping Express app
const server = http.createServer(app);

// 4. Initialize Socket.io server with CORS configuration (supports both local dev and live frontend URLs)
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 1e7, // 10MB buffer for canvas snapshot payloads on undo/redo & image imports
});

// 5. Test API Endpoint (Health check)
app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "CollabFlow Backend Server is running smoothly!",
    port: PORT,
  });
});

// Helper: Broadcast updated user count for a specific room to all occupants in that room
function broadcastRoomUserCount(roomId) {
  if (!roomId) return;
  const room = io.sockets.adapter.rooms.get(roomId);
  const count = room ? room.size : 0;
  io.to(roomId).emit("user-count", count);
}

// 6. PHASE 10 & 11: Shared Gemini Vision & Diagram Generation Helper
const GEMINI_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-flash-latest",
  "gemini-3.7-flash",
  "gemini-3.8-flash",
];

function getGeminiApiKey() {
  if (fs.existsSync(ENV_PATH)) {
    require("dotenv").config({ path: ENV_PATH, override: true });
  }
  const key = process.env.GEMINI_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

async function callGeminiWithFallback(contents, generationConfig) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      error:
        "GEMINI_API_KEY is not configured on the backend server. Please add your free GEMINI_API_KEY to backend/.env and restart the server.",
    };
  }

  const payload = { contents };
  if (generationConfig) {
    payload.generationConfig = generationConfig;
  }
  const requestBody = JSON.stringify(payload);

  let lastStatus = 500;
  let lastErrorMsg = "Failed to get a response from Gemini API.";

  for (const model of GEMINI_MODELS) {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    });

    if (response.ok) {
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return { ok: true, text, modelUsed: model };
    }

    lastStatus = response.status;
    const errorBody = await response.json().catch(() => ({}));
    lastErrorMsg =
      errorBody.error?.message ||
      `Gemini API returned HTTP status ${response.status} (${response.statusText})`;

    if (![404, 429, 500, 503].includes(response.status)) {
      break;
    }

    // Brief jitter delay before falling back to next Gemini model
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return { ok: false, status: lastStatus, error: lastErrorMsg };
}

// Endpoint A: Analyze whiteboard image and explain diagram
app.post("/api/explain-board", async (req, res) => {
  try {
    const { image } = req.body;
    if (!image || typeof image !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid request. Base64 canvas image data is required.",
      });
    }

    const match = image.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    const mimeType = match ? match[1] : "image/png";
    const base64Data = match ? match[2] : image;

    const promptText = `You are an engineering mentor. Analyze this whiteboard drawing or diagram and provide a structured explanation:
1. What is drawn
2. Core concept summary
3. Two key engineering takeaways

Keep the explanation concise and use bullet points.`;

    const result = await callGeminiWithFallback([
      {
        parts: [
          { text: promptText },
          { inline_data: { mime_type: mimeType, data: base64Data } },
        ],
      },
    ]);

    if (!result.ok) {
      return res.status(result.status).json({ success: false, error: result.error });
    }

    return res.json({
      success: true,
      explanation: result.text || "No explanation could be generated for this board.",
      modelUsed: result.modelUsed,
    });
  } catch (err) {
    console.error("[Backend /api/explain-board Error]", err.message);
    return res.status(500).json({
      success: false,
      error: err.message || "Internal server error while processing image.",
    });
  }
});

// Endpoint B: Generate structured Canvas 2D flowchart/architecture JSON from text prompt
app.post("/api/generate-diagram", async (req, res) => {
  try {
    const { prompt, width = 1200, height = 700 } = req.body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: "Please enter a diagram description (e.g., 'Client -> Load Balancer -> API -> Database').",
      });
    }

    const minX = 110;
    const maxX = Math.max(760, Math.min(width - 110, 1300));
    const minY = 120;
    const maxY = Math.max(480, Math.min(height - 140, 760));

    const diagramPrompt = `Convert this software engineering or study concept into a clean, well-spaced whiteboard flowchart JSON:
"${prompt.trim()}"

Canvas safe coordinate box:
- X coordinates must stay strictly between ${minX} and ${maxX}
- Y coordinates must stay strictly between ${minY} and ${maxY}
- Leave at least 50px spacing between boxes so labels do not overlap.
- Keep box width ~140-180px and height ~60-80px.
- Connect boxes sequentially with "arrow" elements whose startX/startY touch the source box edge and endX/endY touch the target box edge.

Allowed shape types: "rect", "circle", "diamond", "triangle", "arrow", "line".
Allowed colors: "#1e293b", "#2563eb", "#16a34a", "#9333ea", "#d97706", "#dc2626".

Return STRICT JSON matching this schema:
{
  "title": "Short title",
  "elements": [
    {
      "type": "rect",
      "startX": 140,
      "startY": 240,
      "endX": 300,
      "endY": 310,
      "color": "#2563eb",
      "label": "Client"
    }
  ]
}
Keep labels short (1 to 3 words) and limit total elements to at most 15.`;

    const result = await callGeminiWithFallback(
      [{ parts: [{ text: diagramPrompt }] }],
      { responseMimeType: "application/json" }
    );

    if (!result.ok) {
      return res.status(result.status).json({ success: false, error: result.error });
    }

    let parsed;
    try {
      const cleaned = result.text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      return res.status(502).json({
        success: false,
        error: "AI returned an unexpected format. Please try rephrasing your prompt.",
      });
    }

    if (!parsed || !Array.isArray(parsed.elements) || parsed.elements.length === 0) {
      return res.status(502).json({
        success: false,
        error: "AI did not generate any diagram elements. Try a clearer flow prompt.",
      });
    }

    return res.json({
      success: true,
      diagram: parsed,
      modelUsed: result.modelUsed,
    });
  } catch (err) {
    console.error("[Backend /api/generate-diagram Error]", err.message);
    return res.status(500).json({
      success: false,
      error: err.message || "Internal server error while generating diagram.",
    });
  }
});

// 7. Socket.io Connection & Event Handling
io.on("connection", (socket) => {
  console.log(`[Socket Connected] Client ID: ${socket.id}`);

  // Track which room this client is currently occupying
  let currentRoomId = null;

  // EVENT 1: User joins a specific whiteboard room
  socket.on("join-room", (roomId) => {
    // If client was previously in a different room, clean up old room presence
    if (currentRoomId && currentRoomId !== roomId) {
      socket.leave(currentRoomId);
      // Notify old room to remove this client's remote cursor
      socket.to(currentRoomId).emit("cursor-leave", { userId: socket.id });
      broadcastRoomUserCount(currentRoomId);
      console.log(`Client ${socket.id} left room: ${currentRoomId}`);
    }

    currentRoomId = roomId;
    socket.join(roomId);
    console.log(`Client ${socket.id} joined room: ${roomId}`);

    // Broadcast updated occupant count to everyone inside this room
    broadcastRoomUserCount(roomId);
  });

  // EVENT 2: Live cursor movement (broadcast to other users in the SAME room)
  socket.on("cursor-move", (data) => {
    const targetRoom = data.roomId || currentRoomId;
    if (targetRoom) {
      socket.to(targetRoom).emit("cursor-move", {
        userId: socket.id,
        x: data.x,
        y: data.y,
        username: data.username,
        color: data.color,
      });
    }
  });

  // EVENT 3: Mouse leaves canvas surface
  socket.on("cursor-leave", (data) => {
    const targetRoom = (data && data.roomId) || currentRoomId;
    if (targetRoom) {
      socket.to(targetRoom).emit("cursor-leave", { userId: socket.id });
    }
  });

  // EVENT 4: Drawing line event (Scoped strictly to the current room)
  socket.on("draw-line", (data) => {
    const targetRoom = data.roomId || currentRoomId;
    if (targetRoom) {
      socket.to(targetRoom).emit("draw-line", data);
    }
  });

  // EVENT 5: Drawing geometric shape event (Phase 8: Scoped strictly to current room)
  socket.on("draw-shape", (data) => {
    const targetRoom = data.roomId || currentRoomId;
    if (targetRoom) {
      socket.to(targetRoom).emit("draw-shape", data);
    }
  });

  // EVENT 5B: Drawing typed text on canvas (Scoped strictly to current room)
  socket.on("draw-text", (data) => {
    const targetRoom = data.roomId || currentRoomId;
    if (targetRoom) {
      socket.to(targetRoom).emit("draw-text", data);
    }
  });

  // EVENT 5C: Pinning a live sticky note on canvas (Scoped strictly to current room)
  socket.on("draw-note", (data) => {
    const targetRoom = data.roomId || currentRoomId;
    if (targetRoom) {
      socket.to(targetRoom).emit("draw-note", data);
    }
  });

  // EVENT 5D: Live ephemeral laser pointer trail (Scoped strictly to current room)
  socket.on("laser-move", (data) => {
    const targetRoom = data.roomId || currentRoomId;
    if (targetRoom) {
      socket.to(targetRoom).emit("laser-move", {
        ...data,
        userId: socket.id,
      });
    }
  });

  // EVENT 6: Full canvas state sync on Undo / Redo & Image Import
  // Transmits the restored board snapshot to peers in the same room
  socket.on("sync-canvas-state", (data) => {
    const targetRoom = data.roomId || currentRoomId;
    if (targetRoom) {
      socket.to(targetRoom).emit("sync-canvas-state", data);
    }
  });

  // EVENT 6B: Sync movable/resizable/deletable board media items (PDF slides, Images, Word/Code Docs)
  socket.on("sync-board-items", (data) => {
    const targetRoom = data.roomId || currentRoomId;
    if (targetRoom) {
      socket.to(targetRoom).emit("sync-board-items", { items: data.items || [] });
    }
  });

  // EVENT 7: Clear canvas event (Scoped strictly to the current room)
  socket.on("clear-canvas", (data) => {
    const targetRoom = (data && data.roomId) || currentRoomId;
    if (targetRoom) {
      socket.to(targetRoom).emit("clear-canvas");
    }
  });

  // EVENT 8: Disconnect handler
  socket.on("disconnect", () => {
    console.log(`[Socket Disconnected] Client ID: ${socket.id}`);
    if (currentRoomId) {
      socket.to(currentRoomId).emit("cursor-leave", { userId: socket.id });
      // Clean up room occupant count
      setTimeout(() => {
        broadcastRoomUserCount(currentRoomId);
      }, 100);
    }
  });
});

// 8. Start server listener
server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 CollabFlow Backend running at http://localhost:${PORT}`);
  console.log(`📡 Socket.io ready for multi-tenant collaboration`);
  console.log(`✨ AI Board Explainer route active at /api/explain-board`);
  console.log(`===============================================`);
});
