import { Download, Terminal } from "lucide-react";

export default function DownloadSection() {
  return (
    <section className="py-20 px-6 border-t border-zinc-800">
      <div className="max-w-3xl mx-auto text-center space-y-8">
        <h2 className="text-3xl font-bold">Download Env Butler</h2>
        <p className="text-zinc-400">
          Free and open-source. Verify every build on GitHub Actions.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="https://github.com/hieuspaceos/env-butler/releases/latest"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-emerald-500 text-zinc-950 font-semibold hover:bg-emerald-400 transition"
          >
            <Download className="w-5 h-5" />
            macOS (Universal)
          </a>
          <a
            href="https://github.com/hieuspaceos/env-butler/releases/latest"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-zinc-700 font-semibold hover:bg-zinc-800 transition"
          >
            <Download className="w-5 h-5" />
            Windows (x64)
          </a>
        </div>

        <div className="text-left max-w-lg mx-auto p-4 rounded-lg bg-zinc-900 border border-zinc-800 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Terminal className="w-4 h-4 text-emerald-400" />
            Verify your download
          </div>
          <div className="space-y-2 text-xs font-mono text-zinc-400">
            <p className="text-zinc-500"># macOS</p>
            <p>shasum -a 256 Env-Butler_*.dmg</p>
            <p className="text-zinc-500 mt-2"># Windows (PowerShell)</p>
            <p>Get-FileHash Env-Butler_*.exe -Algorithm SHA256</p>
          </div>
          <p className="text-xs text-zinc-500">
            Compare with checksums.txt on the{" "}
            <a
              href="https://github.com/hieuspaceos/env-butler/releases"
              className="text-emerald-400 hover:underline"
            >
              release page
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
