import { requireRole } from "@/lib/guard";
import { ProfileMenu } from "@/components/ProfileMenu";
import { readFlashError } from "@/lib/flash";
import { BackLink } from "./BackLink";

export async function AdminPageHeader({
  title,
  subtitle,
  back,
}: {
  title: string;
  subtitle?: React.ReactNode;
  // Rendered inside the gradient, above the title, so the back control reads
  // as part of this page's header instead of floating on the strip above it.
  back?: { href: string; label: string };
}) {
  const { user, role } = await requireRole(["superadmin", "admin", "manager"]);
  const displayRole = role === "manager" ? "Manager" : role === "superadmin" ? "Super Admin" : "Admin";
  const error = await readFlashError();
  return (
    <div className="bg-gradient-to-br from-[var(--brand)] via-[var(--brand-deep)] to-slate-900 px-4 pb-16 pt-14 sm:px-6 lg:px-8 lg:pt-6">
      <div className="mx-auto max-w-6xl flex items-start justify-between">
        <div>
          {back && <BackLink href={back.href} label={back.label} className="mb-3" />}
          <h1 className="text-xl font-bold text-white sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-white/60">{subtitle}</p>}
        </div>
        <ProfileMenu name={displayRole} email={user.email ?? ""} role={displayRole} />
      </div>
      {error && (
        // Shown once, on the render after a failed action. Without this the
        // real message is redacted in production and the user sees only
        // "Something went wrong". See lib/flash.ts.
        <div
          role="alert"
          className="mx-auto mt-4 max-w-6xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}
    </div>
  );
}

export function AdminPage({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[var(--bg)]">{children}</div>;
}

export function AdminContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 -mt-10 pb-8">
      {children}
    </div>
  );
}

export { Field, Select } from "./FormFields";

export { SubmitButton } from "./SubmitButton";

export function CostBox({ label, value, accent, warn, danger }: { label: string; value: number; accent?: boolean; warn?: boolean; danger?: boolean }) {
  const color = danger ? "text-red-600" : warn ? "text-amber-600" : accent ? "text-brand-700" : "text-slate-800";
  const bg = danger ? "bg-red-50" : warn ? "bg-amber-50" : accent ? "bg-white" : "bg-white";
  const border = danger ? "border-red-200" : warn ? "border-amber-200" : accent ? "border-brand/20" : "border-slate-200";
  return (
    <div className={`rounded-xl border ${border} ${bg} p-4 shadow-sm transition hover:shadow-md`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-1.5 text-lg font-bold tabular-nums ${color}`}>
        ₹{value.toLocaleString()}
      </div>
    </div>
  );
}

export function BudgetAlert({ budget, spent }: { budget: number; spent: number }) {
  if (budget <= 0) return null;
  const pct = (spent / budget) * 100;
  if (pct < 80) return null;
  const over = pct >= 100;
  return (
    <div className={`mb-4 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
      over
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-amber-200 bg-amber-50 text-amber-800"
    }`}>
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z" />
        <path d="M12 15.75h.007v.008H12v-.008Z" />
      </svg>
      <span>
        <span className="font-semibold">
          {over ? "Over budget" : "Approaching budget"}
        </span>
        {" — "}
        {pct.toFixed(1)}% of ₹{budget.toLocaleString()} spent
        {over && ` (₹${(spent - budget).toLocaleString()} over)`}
      </span>
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  empty = "No rows yet.",
}: {
  columns: string[];
  rows: (string | number | null | React.ReactNode)[][];
  empty?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
        {empty}
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80">
              {columns.map((c) => (
                <th key={c} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`transition-colors hover:bg-slate-50 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}>
                {r.map((cell, j) => (
                  <td key={j} className="whitespace-nowrap px-5 py-3 text-slate-700">{cell ?? "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
