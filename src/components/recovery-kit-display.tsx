// BIP39 24-word mnemonic recovery kit display.
// Printable 4-column grid with confirmation checkbox.

import { useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

interface RecoveryKitDisplayProps {
  mnemonic: string;
  onConfirm: () => void;
}

export default function RecoveryKitDisplay({
  mnemonic,
  onConfirm,
}: RecoveryKitDisplayProps) {
  const [saved, setSaved] = useState(false);
  const words = mnemonic.split(" ");

  const handleSave = async () => {
    const content = words.map((w, i) => `${String(i + 1).padStart(2)}. ${w}`).join("\n");
    const text = `ENV BUTLER — RECOVERY KIT\n${"=".repeat(30)}\n\n${content}\n\nKeep this file safe and offline.\nIf you lose both your Master Key and this Recovery Kit, your data cannot be recovered.\n`;

    const filePath = await save({
      title: "Save Recovery Kit",
      defaultPath: "env-butler-recovery-kit.txt",
      filters: [{ name: "Text", extensions: ["txt"] }],
    });
    if (filePath) {
      await writeTextFile(filePath, text);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-primary" />
        <h2 className="text-xl font-bold">Recovery Kit</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Secured by the same recovery standard as Bitcoin wallets
        </p>
      </div>

      {/* 4-column grid of numbered words */}
      <div className="grid grid-cols-4 gap-2 p-4 rounded-lg border border-border bg-muted/30 print:bg-white print:text-black">
        {words.map((word, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-2 py-1.5 rounded bg-background border border-border text-sm"
          >
            <span className="text-xs text-muted-foreground w-5 text-right">
              {i + 1}.
            </span>
            <span className="font-mono font-medium">{word}</span>
          </div>
        ))}
      </div>

      <div className="flex justify-center">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 rounded-md border border-border text-sm hover:bg-muted"
        >
          <Download className="w-4 h-4" />
          Save Recovery Kit
        </button>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            className="mt-0.5 rounded border-input"
          />
          <span className="text-sm">
            I have saved my Recovery Kit in a safe place. I understand that if I
            lose both my Master Key and this Recovery Kit, my encrypted data
            cannot be recovered.
          </span>
        </label>

        <button
          onClick={onConfirm}
          disabled={!saved}
          className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
