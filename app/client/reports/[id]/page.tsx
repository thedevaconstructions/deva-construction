import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CostBox, DataTable } from "@/components/admin/Page";
import { DownloadSitePdfButton } from "@/components/admin/ReportPdf";
import { DownloadSiteCsvButton } from "@/components/admin/ReportCsv";
import { lineTotal } from "@/lib/money";
import { formatDateTime } from "@/lib/dateFormat";

const STATUS_STYLE: Record<string, string> = {
  planned: "border-slate-200 bg-slate-50 text-slate-700",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  on_hold: "border-amber-200 bg-amber-50 text-amber-700",
  completed: "border-brand/30 bg-brand/10 text-brand-700",
  cancelled: "border-red-200 bg-red-50 text-red-700",
};

function InfoBox({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${className ?? "border-[var(--line)] bg-white"}`}>
      <div className="text-[10px] font-medium uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

export default async function ClientSiteReportPage({ params }: { params: { id: string } }) {
  const { user } = await requireRole("client");
  const supabase = createSupabaseServerClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("profile_id", user.id)
    .single();
  if (!client) notFound();

  const [{ data: project }, { data: materials }, { data: payments }, { data: updates }, { data: wageTotals }] =
    await Promise.all([
      supabase
        .from("projects")
        .select(
          "id, name, status, completion_pct, total_cost, address, current_stage, end_date, original_end_date, extension_reason, client_id, agreement_image_url",
        )
        .eq("id", params.id)
        .eq("client_id", client.id)
        .single(),
      supabase
        .from("materials")
        .select("id, name, unit, quantity, unit_cost, status, ordered_at, delivered_at")
        .eq("project_id", params.id)
        .is("archived_at", null),
      supabase
        .from("payments")
        .select("id, amount, status, description, payee_type, created_at")
        .eq("project_id", params.id)
        .is("archived_at", null),
      supabase
        .from("project_updates")
        .select("id, stage, note, image_url, created_at")
        .eq("project_id", params.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
      // Attendance wages for this project (total only, no labourer detail) via a
      // security-definer RPC -- clients can't read the attendance table directly.
      supabase.rpc("my_project_wage_totals"),
    ]);
  if (!project) notFound();

  const wages = Number(
    ((wageTotals ?? []) as { project_id: string; wage_total: number }[]).find(
      (w) => w.project_id === params.id,
    )?.wage_total ?? 0,
  );

  const spent =
    (materials ?? [])
      .filter((m) => m.status !== "returned")
      .reduce((sum, m) => sum + lineTotal(m.quantity, m.unit_cost), 0) +
    (payments ?? [])
      // Labour only: supplier payments settle already-counted material costs.
      .filter((p) => (p.status === "paid" || p.status === "approved") && p.payee_type === "labour")
      .reduce((sum, p) => sum + Number(p.amount), 0) +
    wages;

  const budget = Number(project.total_cost);
  const completionPct = Number(project.completion_pct);

  const transactions = [
    ...(materials ?? []).map((m) => ({
      date: m.delivered_at ?? m.ordered_at ?? null,
      type: "Material",
      description: `${m.name} (${m.quantity} ${m.unit})`,
      amount: lineTotal(m.quantity, m.unit_cost),
      status: m.status,
    })),
    ...(payments ?? []).map((p) => ({
      date: p.created_at ?? null,
      type: p.payee_type === "labour" ? "Payment · labour" : "Payment · supplier",
      description: p.description || "—",
      amount: Number(p.amount),
      status: p.status,
    })),
    // One aggregate line, not per-labourer -- clients don't see individual
    // worker attendance, just the total labour-wage cost on their project.
    ...(wages > 0
      ? [{ date: null, type: "Labour wages", description: "Wages accrued from attendance", amount: wages, status: "" }]
      : []),
  ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const extended =
    project.original_end_date != null && project.end_date != null && project.end_date > project.original_end_date;

  const pdfSite = {
    name: project.name,
    status: project.status,
    completionPct,
    budget,
    spent,
    detail: {
      client: null,
      address: project.address,
      stage: project.current_stage,
      startDate: null,
      endDate: project.end_date,
      extended,
      originalEndDate: project.original_end_date,
      extensionReason: project.extension_reason,
    },
    transactions: transactions.map((t) => ({
      date: formatDateTime(t.date),
      type: t.type,
      description: t.description,
      amount: t.amount,
      status: t.status,
    })),
    updates: (updates ?? []).map((u) => ({
      stage: u.stage,
      note: u.note,
      date: formatDateTime(u.created_at),
      imageUrl: u.image_url,
    })),
  };

  const remaining = budget - spent;
  const overBudget = budget > 0 && spent > budget;

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <Link href="/client/reports" className="text-sm text-slate-600 hover:underline">← Reports</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Report</p>
          <h1 className="text-2xl font-bold">{project.name}</h1>
        </div>
        <div className="flex gap-2">
          <DownloadSiteCsvButton site={pdfSite} />
          <DownloadSitePdfButton site={pdfSite} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <InfoBox
          label="Status"
          value={project.status.replace("_", " ")}
          className={STATUS_STYLE[project.status] ?? "border-[var(--line)] bg-white"}
        />
        <InfoBox label="Stage" value={project.current_stage ?? "—"} />
        {project.address && <InfoBox label="Address" value={project.address} />}
        <InfoBox
          label="Expected finish"
          value={project.end_date ?? "Not set"}
          className={extended ? "border-red-200 bg-red-50 text-red-700" : undefined}
        />
      </div>
      {extended && (
        <p className="mt-2 text-xs font-medium text-red-600">
          Extended from {project.original_end_date}
          {project.extension_reason ? ` · ${project.extension_reason}` : ""}
        </p>
      )}

      <div className="mt-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full bg-brand"
            style={{ width: `${Math.max(0, Math.min(100, completionPct))}%` }}
          />
        </div>
        <div className="mt-1 text-xs text-slate-500">{completionPct.toFixed(1)}% complete</div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <CostBox label="Budget" value={budget} />
        <CostBox label="Spent" value={spent} />
        <CostBox label="Remaining" value={remaining} accent={!overBudget} />
      </div>
      {overBudget && (
        <p className="mt-2 text-xs font-medium text-red-600">
          Over budget by ₹{(spent - budget).toLocaleString()}
        </p>
      )}

      {project.agreement_image_url && (
        <div className="mt-6 max-w-xl rounded-xl border border-[var(--line)] bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Agreement</h2>
          <a href={project.agreement_image_url} target="_blank" rel="noreferrer">
            <Image
              src={project.agreement_image_url} alt="" width={640} height={480} loading="lazy"
              className="max-h-96 w-auto rounded-lg border border-slate-200 object-cover"
            />
          </a>
        </div>
      )}

      <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Transactions ({transactions.length})
      </h2>
      <DataTable
        columns={["Type", "Description", "Date", "Status", "Amount"]}
        rows={transactions.map((t) => [
          t.type,
          t.description,
          formatDateTime(t.date),
          t.status,
          `₹${t.amount.toLocaleString()}`,
        ])}
        empty="No materials or payments recorded for this project yet."
      />
    </main>
  );
}
