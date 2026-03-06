import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Env Butler — Zero-Knowledge .env Sync",
  description:
    "Secure .env sync for developers. AES-256-GCM encryption, BIP39 recovery, self-hosted Supabase. Built with Rust.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark scroll-smooth" suppressHydrationWarning>
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
