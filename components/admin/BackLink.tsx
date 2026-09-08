import Link from "next/link";

/**
 * The "go up one level" control for detail and edit pages.
 *
 * It used to be a bare "← Suppliers" text link sitting on the white strip
 * above the gradient header, which read as an orphan — floating in its own
 * empty band, unrelated to the page it belonged to. Rendered as a pill it
 * sits *inside* the header instead, on the brand gradient, so the page starts
 * at the header and the back control is visibly part of it.
 *
 * The arrow lives in its own circle and slides left on hover, which is the
 * whole gesture the button stands for.
 */
export function BackLink({
  href,
  label,
  tone = "brand",
  className = "",
}: {
  href: string;
  label: string;
  /** "brand" sits on the gradient header; "muted" on a light background. */
  tone?: "brand" | "muted";
  className?: string;
}) {
  const skin =
    tone === "brand"
      ? "border-white/20 bg-white/10 text-white/80 hover:border-white/35 hover:bg-white/20 hover:text-white focus-visible:outline-white/70"
      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800 focus-visible:outline-slate-400";
  const dot =
    tone === "brand"
      ? "bg-white/15 group-hover:bg-white/25"
      : "bg-slate-100 group-hover:bg-slate-200";

  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-xs font-medium shadow-sm backdrop-blur-sm transition-all duration-200 hover:gap-2.5 hover:shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${skin} ${className}`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full transition-all duration-200 group-hover:-translate-x-0.5 ${dot}`}
        aria-hidden="true"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </Link>
  );
}
