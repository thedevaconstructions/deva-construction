import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPage, AdminPageHeader, AdminContent, DataTable } from "@/components/admin/Page";
import { PieChart, PieLegend } from "@/components/admin/PieChart";
import { DownloadSitePdfButton } from "@/components/admin/ReportPdf";
import { DownloadSiteCsvButton } from "@/components/admin/ReportCsv";
import { CashFlowBarChart } from "@/components/admin/CashFlowBarChart";
import { CashFlowTrendChart } from "@/components/admin/CashFlowTrendChart";
import { computeCashFlow, defaultCashFlowRange } from "@/lib/cashflow";
import { wageForStatus } from "@/lib/wages";
import { lineTotal } from "@/lib/money";
import { formatDateOnly, formatDateTime } from "@/lib/dateFormat";

const BRAND = "#635bff";
const SPEND = "#F59E0B";
const TRACK = "#E2E8F0";
const OVER_BUDGET = "#DC2626";
const MATERIALS_COLOR = "#635bff";
const WAGES_COLOR = "#A855F7";

export const revalidate = 60;

export default async function SiteReportPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ from?: string; to?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const supabase = await createSupabaseServerClient();
  const { fromStr, toStr } = defaultCashFlowRange();
  const from = searchParams.from || fromStr;
  const to = searchParams.to || toStr;

  const [{ data: project }, { data: materials }, { data: payments }, { data: updates }, { data: attendance }, cashFlow] =
    await Promise.all([
      supabase
        .from("projects")
        .select(
          "id, name, status, completion_pct, total_cost, address, current_stage, start_date, end_date, original_end_date, extension_reason, clients(name)",
        )
        .eq("id", params.id)
        .single(),
      supabase
        .from("materials")
        .select("id, name, unit, quantity, unit_cost, status, ordered_at, delivered_at, work_category")
        .eq("project_id", params.id)
        .is("archived_at", null),
      supabase
        .from("payments")
        .select("id, amount, status, description, payee_type, created_at, work_category")
        .eq("project_id", params.id)
        .is("archived_at", null),
      supabase
        .from("project_updates")
        .select("id, stage, note, image_url, created_at")
        .eq("project_id", params.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("attendance")
        .select("date, status, labourer_id, labourers(name, daily_wage)")
        .eq("project_id", params.id),
      computeCashFlow(supabase, from, to, params.id),
    ]);
  if (!project) notFound();

  const wageRows = (attendance ?? []).map((a) => ({
    date: a.date,
    status: a.status,
    // @ts-expect-error relation
    labourerName: a.labourers?.name ?? "—",
    // @ts-expect-error relation
    amount: wageForStatus(a.status, Number(a.labourers?.daily_wage ?? 0)),
  }));
  const totalWages = wageRows.reduce((sum, w) => sum + w.amount, 0);

  const spent =
    (materials ?? [])
      .filter((m) => m.status !== "returned")
      .reduce((sum, m) => sum + lineTotal(m.quantity, m.unit_cost), 0) +
    totalWages;

  const budget = Number(project.total_cost);
  const completionPct = Number(project.completion_pct);
  const spendPct = budget > 0 ? (spent / budget) * 100 : spent > 0 ? 999 : 0;
  const overBudget = budget > 0 && spent > budget;

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
    ...wageRows
      .filter((w) => w.amount > 0)
      .map((w) => ({
        date: w.date,
        type: "Wage · attendance",
        description: `${w.labourerName} (${w.status.replace("_", " ")})`,
        amount: w.amount,
        status: w.status,
      })),
  ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const categoryTotals = new Map<string, number>();
  for (const m of materials ?? []) {
    if (m.status === "returned") continue;
    const cat = m.work_category || "Uncategorized";
    categoryTotals.set(cat, (categoryTotals.get(cat) ?? 0) + lineTotal(m.quantity, m.unit_cost));
  }
  for (const p of payments ?? []) {
    if (p.status !== "paid" && p.status !== "approved") continue;
    const cat = p.work_category || "Uncategorized";
    categoryTotals.set(cat, (categoryTotals.get(cat) ?? 0) + Number(p.amount));
  }
  if (totalWages > 0) {
    categoryTotals.set("Wages", (categoryTotals.get("Wages") ?? 0) + totalWages);
  }
  const categoryRows = Array.from(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([category, total]) => [category, `₹${total.toLocaleString()}`]);

  const extended =
    project.original_end_date != null && project.end_date != null && project.end_date > project.original_end_date;

  // Attendance is a plain date column with no time of day, so its "Wage ·
  // attendance" rows stay date-only; materials/payments have a real
  // timestamp and show it.
  const formatTxDate = (t: { date: string | null; type: string }) =>
    t.type === "Wage · attendance" ? formatDateOnly(t.date) : formatDateTime(t.date);

  const pdfSite = {
    name: project.name,
    status: project.status,
    completionPct,
    budget,
    spent,
    detail: {
      // @ts-expect-error supabase relation
      client: project.clients?.name ?? null,
      address: project.address,
      stage: project.current_stage,
      startDate: project.start_date,
      endDate: project.end_date,
      extended,
      originalEndDate: project.original_end_date,
      extensionReason: project.extension_reason,
    },
    transactions: transactions.map((t) => ({
      date: formatTxDate(t),
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

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ href: "/admin/reports", label: "Reports" }}
        title={project.name}
        subtitle={`Status: ${project.status}`}
      />
      <AdminContent>

      <div className="mb-6 flex justify-end gap-2">
        <DownloadSiteCsvButton site={pdfSite} />
        <DownloadSitePdfButton site={pdfSite} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--line)] bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Completion vs money spent
          </h2>
          <PieLegend
            items={[
              { label: "Complete", color: BRAND },
              { label: "Remaining work", color: TRACK },
              { label: "Spend", color: overBudget ? OVER_BUDGET : SPEND },
              { label: "Remaining budget", color: TRACK },
            ]}
          />
          <div className="mt-4 flex gap-8">
            <div className="flex flex-col items-center gap-2">
              <PieChart
                slices={[
                  { fraction: completionPct / 100, color: BRAND },
                  { fraction: 1 - completionPct / 100, color: TRACK },
                ]}
              />
              <span className="text-xs text-slate-600">Completion {completionPct.toFixed(0)}%</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              {spendPct > 100 ? (
                <PieChart slices={[{ fraction: 1, color: OVER_BUDGET }]} />
              ) : (
                <PieChart
                  slices={[
                    { fraction: spendPct / 100, color: SPEND },
                    { fraction: 1 - spendPct / 100, color: TRACK },
                  ]}
                />
              )}
              <span className="text-xs text-slate-600">
                {spendPct > 100 ? "Spend over budget" : `Spend ${spendPct.toFixed(0)}%`}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Budget vs spent vs remaining
          </h2>
          <div className="flex items-center gap-6">
            {overBudget ? (
              <PieChart slices={[{ fraction: 1, color: OVER_BUDGET }]} />
            ) : (
              <PieChart
                slices={[
                  { fraction: budget > 0 ? spent / budget : spent > 0 ? 1 : 0, color: BRAND },
                  { fraction: budget > 0 ? 1 - spent / budget : 0, color: TRACK },
                ]}
              />
            )}
            <div>
              {!overBudget && <PieLegend items={[{ label: "Spent", color: BRAND }, { label: "Remaining", color: TRACK }]} />}
              <p className={`mt-2 text-sm ${overBudget ? "text-red-600 font-medium" : "text-slate-600"}`}>
                {overBudget
                  ? `Over budget by ₹${(spent - budget).toLocaleString()}`
                  : `₹${spent.toLocaleString()} of ₹${budget.toLocaleString()} spent · ₹${Math.max(budget - spent, 0).toLocaleString()} remaining`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Transactions ({transactions.length})
      </h2>
      <DataTable
        columns={["Type", "Description", "Date", "Status", "Amount"]}
        rows={transactions.map((t) => [
          t.type,
          t.description,
          formatTxDate(t),
          t.status,
          `₹${t.amount.toLocaleString()}`,
        ])}
        empty="No materials or payments recorded for this site yet."
      />

      <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Spend by work category
      </h2>
      <DataTable
        columns={["Category", "Total"]}
        rows={categoryRows}
        empty="No categorized materials or payments for this site yet."
      />

      <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Cash flow</h2>
      <form
        method="get"
        className="mb-4 flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4"
      >
        <label className="text-xs">
          <span className="mb-1 block text-slate-600">From</span>
          <input
            type="date" name="from" defaultValue={from}
            className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-slate-600">To</span>
          <input
            type="date" name="to" defaultValue={to}
            className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
        >
          Apply
        </button>
        <Link href={`/admin/reports/${project.id}`} className="text-sm font-medium text-brand-700 hover:underline">
          Clear filter
        </Link>
      </form>
      <div className="mb-4 rounded-xl border border-[var(--line)] bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Cumulative outflow, {from} to {to}
        </h3>
        <CashFlowTrendChart daily={cashFlow.daily} />
      </div>
      <div className="rounded-xl border border-[var(--line)] bg-white p-5">
        <CashFlowBarChart
          bars={[
            { label: "Materials", value: cashFlow.materialsCost, color: MATERIALS_COLOR },
            { label: "Wages", value: cashFlow.wages, color: WAGES_COLOR },
          ]}
        />
        <p className="mt-3 text-sm text-slate-600">
          Total outflow {from} to {to}: ₹{cashFlow.total.toLocaleString()}
        </p>
      </div>
      </AdminContent>
    </AdminPage>
  );
}
