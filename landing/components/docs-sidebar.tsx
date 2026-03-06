"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  Rocket,
  Shield,
  Layers,
  HelpCircle,
  ArrowLeft,
} from "lucide-react";

const navItems = [
  { href: "/docs/", label: "Overview", icon: BookOpen },
  { href: "/docs/getting-started/", label: "Getting Started", icon: Rocket },
  { href: "/docs/architecture/", label: "Architecture", icon: Layers },
  { href: "/docs/security/", label: "Security", icon: Shield },
  { href: "/docs/faq/", label: "FAQ", icon: HelpCircle },
];

export default function DocsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-full md:w-64 shrink-0 md:sticky md:top-8 md:self-start">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-100 transition mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to home
      </Link>

      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                active
                  ? "bg-emerald-500/10 text-emerald-400 font-medium"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
