import DocsSidebar from "@/components/docs-sidebar";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row gap-8 max-w-5xl mx-auto px-6 py-12">
      <DocsSidebar />
      <article className="flex-1 min-w-0 prose prose-invert prose-emerald max-w-none">
        {children}
      </article>
    </div>
  );
}
