import { Github } from "lucide-react";

export default function Footer() {
  return (
    <footer className="py-12 px-6 border-t border-zinc-800">
      <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/hieuphan94/env-butler"
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 transition"
          >
            <Github className="w-5 h-5" />
            GitHub
          </a>
          <span className="text-xs px-2 py-0.5 rounded border border-zinc-700 text-zinc-500">
            MIT License
          </span>
        </div>
        <p className="text-sm text-zinc-500">
          Built with Tauri + Rust + React. Zero-knowledge. Zero drama.
        </p>
      </div>
    </footer>
  );
}
