import React, { useState, useEffect, useRef } from "react";
import { UploadCloud, FileText, CheckCircle2, Clock, Trash2, Sparkles, BookOpen, AlertTriangle } from "lucide-react";
import { api } from "../services/api";
import { DocumentItem, DocumentSummary } from "../types";

export const DocumentHub: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeSummary, setActiveSummary] = useState<DocumentSummary | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = async () => {
    try {
      const docs = await api.getDocuments();
      setDocuments(docs);
    } catch {
      // Offline fallback
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadError("Only PDF documents (.pdf) are supported for syllabus extraction.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setUploadError("File size exceeds 25 MB limit.");
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    try {
      await api.uploadDocument(file);
      await loadDocuments();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Document upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      await api.deleteDocument(docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      if (activeSummary?.document_id === docId) {
        setActiveSummary(null);
      }
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleViewOrGenerateSummary = async (doc: DocumentItem) => {
    setIsSummarizing(true);
    try {
      if (doc.summary) {
        setActiveSummary({
          document_id: doc.id,
          title: doc.title,
          summary: doc.summary,
          status: doc.status,
        });
      } else {
        const summaryRes = await api.forceSummarizeDocument(doc.id);
        setActiveSummary(summaryRes);
        await loadDocuments();
      }
    } catch (err) {
      console.error("Summarization error:", err);
    } finally {
      setIsSummarizing(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Upload Zone & Documents List Column */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        {/* PDF Drag & Drop Bezel Card */}
        <div className="bezel-shell">
          <div className="bezel-core p-8">
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 ${
                dragActive
                  ? "border-emerald-400 bg-emerald-500/10 scale-[1.01]"
                  : "border-white/[0.1] hover:border-emerald-500/40 hover:bg-white/[0.02]"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4 text-emerald-400">
                <UploadCloud className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-white mb-1">
                Upload Anna University Notes or Textbooks
              </h4>
              <p className="text-xs text-zinc-400 max-w-sm mb-4 leading-relaxed">
                Drag and drop your engineering PDF here or click to browse. Extracted pages are
                indexed into 384-dimensional dense vectors for Socratic citation and NEURA-SUM.
              </p>
              <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                <span>PDF format only</span>
                <span>·</span>
                <span>Max 25 MB</span>
                <span>·</span>
                <span>Self-hosted storage</span>
              </div>
            </div>

            {isUploading && (
              <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-emerald-300 font-mono">
                  Extracting PDF pages & generating dense vector embeddings...
                </span>
              </div>
            )}

            {uploadError && (
              <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2 text-rose-300 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>
        </div>

        {/* Uploaded Documents List */}
        <div className="bezel-shell">
          <div className="bezel-core p-6">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Indexed Syllabus Repository</h3>
              </div>
              <span className="text-xs font-mono text-zinc-500">
                {documents.length} Documents
              </span>
            </div>

            {documents.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No documents uploaded yet. Upload a syllabus or question bank above.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white truncate max-w-xs">
                          {doc.title}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 mt-1">
                          <span>{formatFileSize(doc.file_size_bytes)}</span>
                          <span>·</span>
                          <span>{doc.chunk_count} Chunks</span>
                          <span>·</span>
                          <span className="flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" />
                            {doc.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => handleViewOrGenerateSummary(doc)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>{doc.summary ? "View NEURA-SUM" : "Summarize"}</span>
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Delete Document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* NEURA-SUM Executive Summary Panel */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        <div className="bezel-shell">
          <div className="bezel-core p-6 min-h-[500px] flex flex-col">
            <div className="flex items-center gap-2 pb-4 border-b border-white/[0.06] mb-4">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-white">NEURA-SUM Exam Dossier</h3>
            </div>

            {isSummarizing ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-sm font-semibold text-white mb-1">
                  Synthesizing Syllabus Content...
                </p>
                <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">
                  Map-reducing chunks into 2-mark key definitions and 16-mark university exam
                  breakdowns.
                </p>
              </div>
            ) : activeSummary ? (
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-mono text-emerald-400 uppercase tracking-widest mb-1">
                    Exam-Oriented Digest
                  </div>
                  <h4 className="text-base font-bold text-white mb-4">
                    {activeSummary.title}
                  </h4>
                  <div className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-[420px] overflow-y-auto pr-2 bg-black/30 p-4 rounded-xl border border-white/[0.05]">
                    {activeSummary.summary}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                  <span>Structured for Anna Univ Reg 2021</span>
                  <span>SuperMemo SM-2 Ready</span>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-500">
                <Clock className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm font-medium text-zinc-400 mb-1">No Active Summary Selected</p>
                <p className="text-xs max-w-xs">
                  Click "View NEURA-SUM" or "Summarize" on any uploaded syllabus document to inspect
                  its core concepts and university exam topics.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
