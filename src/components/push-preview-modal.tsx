// Layer 3: Non-skippable push preview modal.
// User must scroll through the full manifest before the confirm button enables.

import { useRef, useState, useEffect, useCallback } from "react";
import { AlertTriangle, Shield, X } from "lucide-react";
import type { ScannedFile } from "@/lib/tauri-commands";

interface PushPreviewModalProps {
  manifest: ScannedFile[];
  onConfirm: () => void;
  onCancel: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function PushPreviewModal({
  manifest,
  onConfirm,
  onCancel,
}: PushPreviewModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasScrolled, setHasScrolled] = useState(false);

  const allowedFiles = manifest.filter((f) => !f.blocked);
  const blockedFiles = manifest.filter((f) => f.blocked);
  const hasSensitive = allowedFiles.some((f) => f.has_sensitive_keys);

  // Auto-enable if content fits without scrolling
  const checkScrollable = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight) {
      setHasScrolled(true);
    }
  }, []);

  useEffect(() => {
    checkScrollable();
  }, [checkScrollable]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    // Enable confirm when scrolled to near bottom (within 20px)
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
      setHasScrolled(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            About to encrypt and push
          </h2>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {hasSensitive && (
          <div className="flex items-center gap-2 mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Some files contain sensitive keys (STRIPE, SECRET, API_KEY, etc.)</span>
          </div>
        )}

        {/* Scrollable manifest list */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="max-h-64 overflow-y-auto space-y-2 mb-4 pr-1"
        >
          {allowedFiles.map((file) => (
            <div
              key={file.filename}
              className="flex items-center justify-between p-3 rounded-md border border-border"
            >
              <div>
                <span className="font-mono text-sm">{file.filename}</span>
                {file.has_sensitive_keys && (
                  <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-destructive/20 text-destructive">
                    sensitive
                  </span>
                )}
                {file.warnings.length > 0 && (
                  <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                    warning
                  </span>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {file.var_count} vars &middot; {formatBytes(file.size_bytes)}
              </div>
            </div>
          ))}

          {blockedFiles.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">
                Blocked files (will not be synced):
              </p>
              {blockedFiles.map((file) => (
                <div
                  key={file.filename}
                  className="flex items-center justify-between p-2 rounded-md bg-destructive/5 text-sm"
                >
                  <span className="font-mono line-through text-muted-foreground">
                    {file.filename}
                  </span>
                  <span className="text-xs text-destructive">{file.block_reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-md border border-border text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!hasScrolled}
            className="flex-1 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Push Securely →
          </button>
        </div>
      </div>
    </div>
  );
}
