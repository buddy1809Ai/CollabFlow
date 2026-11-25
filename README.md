# CollabFlow 🎨⚡
**Real-Time Collaborative Whiteboard, Flowchart Studio & Multimodal AI Canvas**

CollabFlow is a production-grade, room-based collaborative whiteboard built from scratch using **React 18, Native HTML5 Canvas 2D API, Node.js, Express, and Socket.io**. It enables distributed software engineers and students to sketch system architectures, add typed labels & sticky notes, paste screenshots live, point with a synchronized laser trail, replay drawing history, and use Google Gemini AI both to **explain boards** and **auto-generate flowcharts from prompts**.

---

## 🚀 Key Features

### 1. Canvas 2D Engine & Visual Polish (Phases 1, 2, 8)
- **Native HTML5 Canvas 2D:** Built without heavy external libraries (zero Fabric.js or Konva.js) for raw, hardware-accelerated 60+ FPS rendering.
- **Dot-Grid Background Toggle (Notion / Excalidraw Aesthetic):** Subtle CSS `radial-gradient` pattern with zero CPU/GPU canvas rendering overhead, toggleable On/Off from the toolbar or by pressing `G`.
- **Retina / High-DPI Crispness:** Scaled dynamically via `window.devicePixelRatio` to prevent blurry strokes on high-resolution MacBook or 4K displays.
- **Resize Preservation:** Automatically backs up drawing buffers to offscreen memory during browser window resize events, preventing the browser from wiping user artwork.

### 2. Flowchart Geometric Shapes Engine (Phase 8)
- **Single-Line Toolbar + Floating Shapes Popover:** Compact Figma/Miro-style `Shapes` picker menu containing 6 shapes: **Rectangle (`R`), Circle (`C`), Line (`L`), Arrow (`A`), Diamond (`D`), and Triangle (`V`)**.
- **Live Shape Drag Preview (Ghosting Prevention):** Uses native canvas snapshot restoration (`ctx.putImageData`) on mouse move to preview shapes during drag without leaving ghosting trails.
- **Bi-directional Shape Sync:** Emits and listens for `draw-shape` socket events to sync completed shapes across all room occupants.

### 3. Live Collaboration, Text, Sticky Notes & Assets (Phases 9 & 11)
- **Canvas Text Tool (`T`):** Click anywhere on the board to type crisp, scalable labels (`ctx.fillText()`) with instant room synchronization (`draw-text`).
- **Live Sticky Notes (`N`):** Click to write multi-line sticky notes rendered directly as styled pastel cards onto Canvas 2D (`draw-note`), supporting Undo/Redo, Export PNG, and AI analysis.
- **Live Laser Pointer (`Z`):** Dedicated transparent overlay canvas (`pointer-events-none`) renders glowing fading pointer trails synchronized across room peers via `laser-move` without polluting undo history.
- **Time-Lapse Session Replay (`Replay`):** Re-animates the room's recorded stroke/shape/text/note sequence chronologically from start to finish in the header.
- **Movable, Zoomable & Removable Media Layer (`Move` Mode `M` — `BoardMediaLayer.jsx`):**
  - **PDF Slides (`.pdf`):** Renders PDF pages cleanly onto an independent movable layer via Mozilla `pdfjs-dist` with **`◀ Page X / Y ▶`**, **`- / +` Zoom / Size % controls**, corner drag-to-resize, and 1-click **Remove** — without overwriting existing board drawings!
  - **Word Documents (`.docx`):** Extracts and displays Microsoft Word documents via `mammoth` inside a movable, scrollable, zoomable, and exportable document card.
  - **Images & Clipboard Paste (`PNG/JPG/WebP/SVG` + `Ctrl+V`):** Drop or paste screenshots anywhere, drag them to reposition, resize corners, zoom in/out, or remove individually.
  - **Student Text & Code Files (`.txt`, `.md`, `.csv`, `.json`, `.py`, `.js`, `.java`, `.cpp`, `.html`, `.css`):** Opened cleanly as movable reference cards on the board.
- **Global Keyboard Shortcuts:**
  - `Ctrl + Z` / `Cmd + Z` → Undo | `Ctrl + Y` / `Cmd + Shift + Z` → Redo
  - `M` → Move / Resize Objects | `P` → Pen | `E` → Eraser | `T` → Text | `N` → Sticky Note | `Z` → Laser Pointer
  - `R` → Rectangle | `C` → Circle | `L` → Line | `A` → Arrow | `D` → Diamond | `V` → Triangle
  - `ArrowLeft` / `ArrowRight` → Navigate active PDF pages | `Delete` → Remove selected item (in Move mode)
  - `G` → Toggle Dot-Grid On/Off | `Esc` → Cancel active input/preview/replay

### 4. Real-Time Networking & Performance (Phases 3, 4, 5, 7)
- **Multi-Tenant Room Isolation:** Virtual rooms (`socket.join(roomId)`) ensure drawing strokes, shapes, notes, and cursors remain strictly scoped to room participants.
- **Synchronous URL Routing:** Immediate query param routing (`?room=xyz`) with 3-state connection badge (`Connecting...`, `Live: Port 5000`, `Disconnected`).
- **Live Remote Cursors (Miro/Figma Style):** Tracks peer mouse positions with custom name tags and colors using hardware-accelerated CSS `translate3d`.
- **25ms Performance Throttling:** Custom trailing throttle utility limits high-frequency cursor and laser emissions to ~40 FPS while local drawing stays at native 60+ FPS.

### 5. Canvas History & Export (Phase 6)
- **In-Memory Undo/Redo:** Memory-safe undo and redo snapshot stacks (`ctx.getImageData`/`putImageData`, capped at 25 states) synchronized across room peers.
- **1-Click High-Res Composite `Save PNG` Export (`exportBoard.js`):** Merges white background + all positioned PDF slides, Images, and Word/Text Docs + all foreground Canvas 2D strokes into one crisp PNG download (`collabflow-<room>.png`).

### 6. Two-Way AI Studio (Phases 10 & 11)
- **Explain Board (`POST /api/explain-board`):** Captures the canvas snapshot as Base64 PNG and calls Google Gemini Vision REST API (with automatic model fallback across `gemini-flash-lite-latest`, `gemini-3.5-flash-lite`, `gemini-flash-latest`, `gemini-3.8-flash`) to generate concise engineering takeaways.
- **Prompt → Live Flowchart Generator (`POST /api/generate-diagram`):** Converts plain-English descriptions (e.g., `"Client -> Load Balancer -> API -> DB"`) into structured JSON bounding boxes, arrows, and labels via Gemini, programmatically drawing and syncing them onto the live shared board.

---

## 🛠️ Tech Stack

| Layer | Technologies Used |
|---|---|
| **Frontend** | React 18, Vite, Tailwind CSS, Lucide React, Socket.io-client, PDF.js (`pdfjs-dist`), Mammoth (`mammoth`) |
| **Graphics Engine** | Native HTML5 Canvas 2D API (`useRef`, `devicePixelRatio`, `getImageData`, `putImageData`) |
| **Backend** | Node.js, Express.js, Socket.io, CORS, dotenv |
| **Networking** | WebSockets (Full-Duplex TCP persistent connection) |
| **Multimodal AI** | Google Gemini Flash Vision REST API |

---

## 📐 System Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                  REACT FRONTEND (Vite)                                  │
│                                                                                         │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐  │
│  │     Native Canvas 2D    │  │     Floating Toolbar    │  │    Slide-Over Drawer    │  │
│  │  (Dot Grid, 60 FPS Pen, │  │   (Pen, Eraser, Shapes, │  │   (AI Board Explainer   │  │
│  │   Rect, Circle, Image)  │  │    Image, Grid, Undo)   │  │   Gemini Vision UI)     │  │
│  └────────────┬────────────┘  └─────────────────────────┘  └────────────▲────────────┘  │
│               │                                                         │               │
│               ▼                                                         │ HTTP REST     │
│  ┌───────────────────────────────────────────────────────┐              │ (Base64 PNG)  │
│  │   Performance Throttling Layer (throttle.js @ 25ms)   │              │               │
│  └────────────────────────────┬──────────────────────────┘              │               │
└───────────────────────────────┼─────────────────────────────────────────┼───────────────┘
                                │                                         │
                                │ WebSockets (Socket.io)                  │
                                ▼                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                NODE.JS & EXPRESS BACKEND                                │
│                                                                                         │
│  ┌───────────────────────────────────────────────────┐  ┌────────────────────────────┐  │
│  │          Socket.io In-Memory Room Adapter         │  │  POST /api/explain-board    │  │
│  │                                                   │  │  (Node Fetch Multimodal)   │  │
│  │   [ Room: "room-101" ]     [ Room: "design-team" ]│  └──────────────┬─────────────┘  │
│  │   ├── Socket A (User 1)    ├── Socket C (User 3)  │                 │                │
│  │   └── Socket B (User 2)    └── Socket D (User 4)  │                 │ HTTPS REST     │
│  └───────────────────────────────────────────────────┘                 ▼                │
└───────────────────────────────────────────────────────────────[ Google Gemini Vision ]──┘
```

---

## 📂 Project Structure

```text
CollabFlow/
├── backend/
│   ├── .env                 # GEMINI_API_KEY environment configuration
│   ├── package.json         # Express, Socket.io, CORS, dotenv
│   └── server.js            # Express server (Sockets + /api/explain-board route)
│
└── frontend/
    ├── index.html           # HTML shell
    ├── package.json         # React, Vite, Tailwind, Lucide React, Socket.io-client
    ├── vite.config.js       # Vite configuration on port 5173
    ├── tailwind.config.js   # Tailwind theme configurations
    └── src/
        ├── App.jsx          # Synchronous URL room routing, connection status, AI drawer
        ├── main.jsx         # React root mounting
        ├── index.css        # Base styles & Tailwind directives
        ├── components/
        │   ├── Canvas.jsx   # 2D Canvas engine, dot-grid, shapes, shortcuts, image import
        │   ├── Header.jsx   # Room switcher, user counter, "Explain with AI" trigger
        │   ├── Cursor.jsx   # Floating pointer with dynamic username badge
        │   └── AiExplainer.jsx # Slide-over panel for Gemini Vision analysis
        └── utils/
            └── throttle.js  # 25ms trailing throttle function
```

---

## 💻 Getting Started

### 1. Prerequisites
- **Node.js:** v18.0.0 or higher
- **npm:** v9.0.0 or higher

### 2. Configure Environment (Optional for AI Feature)
Inside `backend/.env`:
```env
PORT=5000
# Optional: Add free Google Gemini API key from https://aistudio.google.com/
GEMINI_API_KEY=your_gemini_api_key_here
```
*(Note: If no API key is provided, the whiteboard works completely for drawing, shapes, and collaboration; clicking "Explain with AI" will prompt instructions.)*

### 3. Run Backend Server
```bash
cd backend
npm install
npm run dev
```
*Backend runs on `http://localhost:5000`.*

### 4. Run Frontend Client
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
*Open `http://localhost:5173` in your browser. Open a second tab or incognito window with the same room URL to collaborate in real-time!*

---

## 🎯 SDE-1 Interview Preparation Guide

### 1. "Did you train an ML model for the AI Board Explainer?"
> *"No, sir. I did not train a machine learning model. As a full-stack engineer, I integrated Google's Gemini Flash Vision model via a REST API pipeline with automatic model fallback for reliability. My architecture captures the canvas pixel buffer as a Base64 PNG, securely transmits it to an Express backend endpoint, constructs a multimodal prompt payload for Gemini Vision, and renders structured engineering takeaways in a responsive frontend slide-over panel."*

### 2. "How do you preview shapes during mouse drag without leaving ghost lines?"
> *"When a user presses the mouse down on a shape tool, I capture a canvas pixel snapshot using `ctx.getImageData()`. On every `mousemove` event, before drawing the updated candidate shape, I restore that original snapshot using `ctx.putImageData(dragSnapshot, 0, 0)` and paint the current shape from the start coordinate to the current cursor position. This completely erases previous drag frames and eliminates ghosting. On `mouseup`, the final shape is committed to the undo stack and broadcast to peers."*

### 3. "Why did you implement network throttling at 25ms, but kept local drawing unthrottled?"
> *"Mousemove events fire up to 120-240 times per second on high-refresh mice. Emitting a WebSocket packet on every tick floods the network interface and overloads the Node.js event loop. Throttling network transmissions to 25ms limits network emissions to a sustainable ~40 FPS. However, local drawing remains unthrottled so the user experiences zero input lag and native 60+ FPS responsiveness."*

### 4. "How does `devicePixelRatio` fix blurry canvas rendering?"
> *"By default, HTML5 canvas coordinates map 1:1 to CSS pixels. On modern Retina or 4K screens where `devicePixelRatio` is 2 or 3, a 1000px CSS canvas is stretched over 2000 or 3000 physical display pixels, causing blurry or pixelated strokes. We multiply the canvas internal buffer dimensions (`canvas.width` and `canvas.height`) by `devicePixelRatio`, keep the display styling (`canvas.style.width`) in CSS pixels, and execute `ctx.scale(dpr, dpr)` so drawing math stays in standard screen coordinates while rendering pixel-crisp."*

### 5. "How does CollabFlow preserve drawings during browser window resizing?"
> *"In standard HTML5 Canvas, resizing `canvas.width` or `canvas.height` automatically clears the buffer to blank. In CollabFlow, our `handleResize` listener copies the active drawing onto an offscreen in-memory canvas (`tempCanvas`) before recalculating dimensions. After the canvas buffer is resized and scaled for DPR, we immediately paint the offscreen image back onto the resized canvas context using `drawImage()`."*

### 6. "How does room isolation work under the hood?"
> *"We use Socket.io's in-memory room adapter. When a client joins a room via URL (`?room=room-101`), the client emits `join-room`. The server calls `socket.join(roomId)`. Subsequent events (`draw-line`, `draw-shape`, `cursor-move`) use `socket.to(roomId).emit(...)`, which performs an O(1) room lookup in the server's adapter set, broadcasting packets exclusively to sockets sharing that room ID."*

### 7. "How would you scale CollabFlow horizontally across multiple backend servers?"
> *"Currently, Socket.io manages room socket connections in single-process server memory. To scale across multiple Node.js instances behind a load balancer (such as Nginx), we would introduce the `@socket.io/redis-adapter`. Sockets connected to Server 1 would publish room events to a Redis Pub/Sub channel; Server 2 would subscribe to that channel and relay the events to its connected clients in the same room."*
