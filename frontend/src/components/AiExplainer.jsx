import React, { useState, useEffect } from "react";
import {
  Sparkles,
  X,
  AlertCircle,
  RefreshCw,
  Bot,
  CheckCircle2,
  Wand2,
  Eye,
} from "lucide-react";

const DIAGRAM_PRESETS = [
  "Client -> Load Balancer -> 2 API Servers -> Redis Cache -> Database",
  "User Login Flow: Enter Credentials -> Validate JWT -> Decision Auth OK -> Dashboard or Error",
  "React Frontend -> Express REST API -> Gemini Vision AI -> Response Panel",
];

/**
 * CollabFlow - AI Studio Slide-Over Panel
 * Tab 1: Explain Board (Drawing -> Structured Engineering Summary)
 * Tab 2: Generate Diagram (Prompt -> Auto-Drawn Flowchart on Live Canvas)
 */
export default function AiExplainer({
  isOpen,
  onClose,
  isLoading,
  explanation,
  modelUsed,
  error,
  onRetry,
  onGenerateDiagram,
  isGenerating = false,
  generateError = null,
  generatedInfo = null,
}) {
  const [activeTab, setActiveTab] = useState("explain"); // 'explain' | 'generate'
  const [diagramPrompt, setDiagramPrompt] = useState("");

  useEffect(() => {
    if (isLoading) setActiveTab("explain");
  }, [isLoading]);

  if (!isOpen) return null;

  const handlePromptSubmit = (e) => {
    e.preventDefault();
    if (!diagramPrompt.trim() || isGenerating || !onGenerateDiagram) return;
    onGenerateDiagram(diagramPrompt.trim());
  };

  // Format raw response text into clean visual paragraphs and bullet points
  const formatExplanation = (text) => {
    if (!text) return null;
    const lines = text.split("\n");

    return lines.map((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={idx} className="h-2" />;

      if (trimmed.startsWith("###") || trimmed.startsWith("##") || /^\d+\.\s+\*\*/.test(trimmed)) {
        return (
          <h4 key={idx} className="font-bold text-slate-900 mt-3 mb-1 text-sm flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />
            <span>{trimmed.replace(/^#+\s*/, "").replace(/\*\*/g, "")}</span>
          </h4>
        );
      }

      if (trimmed.startsWith("* ") || trimmed.startsWith("- ") || /^\d+\.\s+/.test(trimmed)) {
        const bulletText = trimmed.replace(/^[\*\-]\s+/, "").replace(/^\d+\.\s+/, "");
        return (
          <li key={idx} className="ml-4 list-disc text-xs text-slate-700 leading-relaxed py-0.5">
            {bulletText.split(/(\*\*.*?\*\*)/).map((segment, sIdx) => {
              if (segment.startsWith("**") && segment.endsWith("**")) {
                return (
                  <strong key={sIdx} className="font-semibold text-slate-900">
                    {segment.slice(2, -2)}
                  </strong>
                );
              }
              return segment;
            })}
          </li>
        );
      }

      return (
        <p key={idx} className="text-xs text-slate-600 leading-relaxed mb-2">
          {trimmed.split(/(\*\*.*?\*\*)/).map((segment, sIdx) => {
            if (segment.startsWith("**") && segment.endsWith("**")) {
              return (
                <strong key={sIdx} className="font-semibold text-slate-900">
                  {segment.slice(2, -2)}
                </strong>
              );
            }
            return segment;
          })}
        </p>
      );
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-sm transition-opacity">
      <div className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
        
        {/* Panel Header */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50/60 via-purple-50/60 to-pink-50/60">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  CollabFlow AI Studio
                  <span className="text-[10px] font-semibold uppercase tracking-wider bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
                    {modelUsed || generatedInfo?.modelUsed || "Gemini Flash"}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500">Explain drawings or generate flowcharts</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              title="Close Panel"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* 2-Tab Mode Switcher */}
          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-200/60 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("explain")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                activeTab === "explain"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Explain Board</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("generate")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                activeTab === "generate"
                  ? "bg-white text-purple-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Wand2 className="h-3.5 w-3.5" />
              <span>Generate Diagram</span>
            </button>
          </div>
        </div>

        {/* Panel Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === "explain" ? (
            <>
              {/* Loading Skeleton */}
              {isLoading && (
                <div className="space-y-4 py-6">
                  <div className="flex items-center gap-2 text-indigo-600 text-xs font-semibold animate-pulse">
                    <Bot className="h-4 w-4 animate-bounce" />
                    <span>Analyzing whiteboard diagram with Gemini Vision...</span>
                  </div>
                  <div className="space-y-2.5">
                    <div className="h-4 bg-slate-200 rounded-md animate-pulse w-3/4"></div>
                    <div className="h-4 bg-slate-200 rounded-md animate-pulse w-full"></div>
                    <div className="h-4 bg-slate-200 rounded-md animate-pulse w-5/6"></div>
                    <div className="h-20 bg-slate-100 rounded-xl animate-pulse mt-4"></div>
                    <div className="h-4 bg-slate-200 rounded-md animate-pulse w-2/3"></div>
                  </div>
                </div>
              )}

              {/* Error State */}
              {!isLoading && error && (
                <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-xs">
                  <div className="flex items-start gap-2.5 text-rose-800">
                    <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold">Analysis Failed</p>
                      <p className="text-rose-700 leading-relaxed">{error}</p>
                      {error.includes("GEMINI_API_KEY") && (
                        <div className="mt-2 text-[11px] bg-white/80 p-2 rounded-lg border border-rose-200 text-slate-700">
                          <strong>How to fix:</strong>
                          <ol className="list-decimal ml-4 mt-1 space-y-0.5">
                            <li>
                              Get a free key from{" "}
                              <a
                                href="https://aistudio.google.com/"
                                target="_blank"
                                rel="noreferrer"
                                className="text-indigo-600 underline"
                              >
                                aistudio.google.com
                              </a>
                            </li>
                            <li>
                              Paste it into <code className="bg-slate-100 px-1 rounded">backend/.env</code> as{" "}
                              <code className="bg-slate-100 px-1 rounded">GEMINI_API_KEY=your_key</code>
                            </li>
                          </ol>
                        </div>
                      )}
                    </div>
                  </div>
                  {onRetry && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white font-medium hover:bg-rose-700 transition"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Retry Analysis
                    </button>
                  )}
                </div>
              )}

              {/* Successful Explanation */}
              {!isLoading && !error && explanation && (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 shadow-sm">
                    <div className="prose prose-xs max-w-none">{formatExplanation(explanation)}</div>
                  </div>
                  {onRetry && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >
                      <RefreshCw className="h-3.5 w-3.5 text-indigo-600" />
                      <span>Re-analyze Updated Board</span>
                    </button>
                  )}
                </div>
              )}

              {/* Empty State */}
              {!isLoading && !error && !explanation && (
                <div className="text-center py-10 space-y-3">
                  <Bot className="h-9 w-9 mx-auto text-indigo-300" />
                  <p className="text-xs text-slate-500">
                    Draw a diagram, flowchart, or math equation on the canvas and click below to analyze it.
                  </p>
                  {onRetry && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition"
                    >
                      <Eye className="h-3.5 w-3.5" /> Analyze Current Board
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Tab 2: Text Prompt -> Auto-Drawn Diagram on Canvas */
            <div className="space-y-4">
              <div className="rounded-2xl bg-purple-50/70 border border-purple-100 p-3.5 text-xs text-purple-900">
                <p className="font-semibold mb-1">Prompt → Live Canvas Diagram</p>
                <p className="text-[11px] text-purple-700 leading-relaxed">
                  Describe any system architecture or flowchart. AI outputs structured JSON coordinates and
                  CollabFlow draws the boxes, arrows, and labels directly onto your shared canvas!
                </p>
              </div>

              <form onSubmit={handlePromptSubmit} className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Describe your diagram
                </label>
                <textarea
                  rows={4}
                  value={diagramPrompt}
                  onChange={(e) => setDiagramPrompt(e.target.value)}
                  placeholder="e.g., Draw Client -> API Gateway -> Auth Service & Redis -> MongoDB"
                  className="w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-800 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 resize-none"
                />
                <button
                  type="submit"
                  disabled={isGenerating || !diagramPrompt.trim()}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-2.5 text-xs font-semibold text-white shadow-md shadow-purple-500/20 hover:opacity-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Wand2 className={`h-4 w-4 ${isGenerating ? "animate-spin" : ""}`} />
                  <span>{isGenerating ? "Drawing Diagram on Canvas..." : "Generate on Canvas"}</span>
                </button>
              </form>

              {generateError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                  <span>{generateError}</span>
                </div>
              )}

              {generatedInfo && !isGenerating && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      Drew &ldquo;{generatedInfo.title}&rdquo; ({generatedInfo.count} elements)
                    </p>
                    <p className="text-[11px] text-emerald-700 mt-0.5">
                      Synced with everyone in the room! Use Ctrl+Z anytime to undo.
                    </p>
                  </div>
                </div>
              )}

              {/* Quick Example Prompts */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Quick Prompts
                </p>
                <div className="space-y-1.5">
                  {DIAGRAM_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setDiagramPrompt(preset)}
                      className="w-full text-left rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-700 hover:bg-purple-50 hover:border-purple-200 transition"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Panel Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500">
          <span>Multimodal Vision & JSON Flow Engine</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-white border border-slate-200 font-semibold text-slate-700 hover:bg-slate-100 transition shadow-sm"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
