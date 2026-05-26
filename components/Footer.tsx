export function Footer() {
  return (
    <footer className="border-t border-border py-8 mt-16">
      <div className="mx-auto max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Quizify. Study smarter, not harder.</p>
        <p>
          Built with Next.js, Supabase &amp; Gemini.
        </p>
      </div>
    </footer>
  );
}
