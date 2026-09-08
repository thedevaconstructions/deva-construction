import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient, getSessionAndRole } from "@/lib/supabase/server";
import { AdminPage, BudgetAlert } from "@/components/admin/Page";
import { BackLink } from "@/components/admin/BackLink";
import { AutoSubmitFileInput } from "@/components/admin/AutoSubmitFileInput";
import { ArchivedToggle, DeleteForeverButton, RestoreAction } from "@/components/admin/RowActions";
import { CategoryField } from "@/components/admin/CategoryField";
import { wageForStatus } from "@/lib/wages";
import { lineTotal } from "@/lib/money";
import { formatDateOnly } from "@/lib/dateFormat";
import { DownloadInvoiceButton, type InvoiceData } from "@/components/admin/InvoicePdf";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import {
  archiveBudgetExtension,
  archiveChangeOrder,
  archiveClientPayment,
  archiveProject,
  createBudgetExtension,
  createChangeOrder,
  createClientPayment,
  deleteBudgetExtension,
  deleteChangeOrder,
  deleteClientPayment,
  deleteProject,
  extendProjectEndDate,
  removeProjectAgreement,
  setNextPaymentDate,
  unarchiveBudgetExtension,
  unarchiveChangeOrder,
  unarchiveClientPayment,
  unarchiveProject,
  uploadProjectAgreement,
} from "../../actions";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function StatCard({ label, value, sub, color = "text-ink" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-slate-400">{label}</span>
      <span className={`mt-0.5 text-lg font-semibold tabular-nums ${color}`}>{value}</span>
      {sub && <span className="text-[11px] text-slate-400">{sub}</span>}
    </div>
  );
}

function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">{title}</h3>
      {right}
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function ItemRow({
  primary,
  secondary,
  badge,
  actions,
}: {
  primary: string;
  secondary?: string;
  badge?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50/80 px-3.5 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink">{primary}</div>
        {secondary && <div className="mt-0.5 text-xs text-slate-500">{secondary}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {badge && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
            {badge}
          </span>
        )}
        {actions}
      </div>
    </div>
  );
}

export default async function ManageProjectPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ archived?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const supabase = await createSupabaseServerClient();
  const { isOwner, role } = await getSessionAndRole();
  const isManager = role === "manager";
  const showArchivedChangeOrders = searchParams.archived === "1";

  const [
    { data: project }, { data: materials }, { data: payments }, { data: attendance }, { data: labourers },
    { data: changeOrders }, { count: archivedChangeOrderCount },
    { data: materialDetails }, { data: paymentDetails }, { data: clientPayments },
    { data: budgetExtensions },
  ] =
    await Promise.all([
      supabase
        .from("projects")
        .select(
          "id, name, status, current_stage, completion_pct, total_cost, end_date, original_end_date, extension_reason, next_payment_date, next_payment_amount, agreement_image_url, archived_at, address, clients(id, name, email, phone)",
        )
        .eq("id", params.id)
        .single(),
      supabase.from("materials").select("quantity, unit_cost, status").eq("project_id", params.id).is("archived_at", null),
      supabase.from("payments").select("amount, status, payee_type").eq("project_id", params.id).is("archived_at", null),
      supabase.from("attendance").select("status, labourer_id").eq("project_id", params.id),
      supabase.from("labourers").select("id, daily_wage"),
      showArchivedChangeOrders
        ? supabase.from("project_change_orders").select("id, description, work_category, extra_cost, created_at").eq("project_id", params.id).not("archived_at", "is", null).order("created_at", { ascending: false })
        : supabase.from("project_change_orders").select("id, description, work_category, extra_cost, created_at").eq("project_id", params.id).is("archived_at", null).order("created_at", { ascending: false }),
      supabase.from("project_change_orders").select("id", { count: "exact", head: true }).eq("project_id", params.id).not("archived_at", "is", null),
      supabase.from("materials").select("name, quantity, unit, unit_cost, status").eq("project_id", params.id).is("archived_at", null).neq("status", "returned"),
      supabase.from("payments").select("amount, status, payee_type, description").eq("project_id", params.id).is("archived_at", null).eq("payee_type", "labour").in("status", ["paid", "approved"]),
      supabase.from("client_payments").select("id, amount, description, paid_on").eq("project_id", params.id).is("archived_at", null).order("paid_on", { ascending: false }),
      supabase.from("budget_extensions").select("id, amount, reason, created_at").eq("project_id", params.id).is("archived_at", null).order("created_at", { ascending: false }),
    ]);
  if (!project) notFound();

  const archived = project.archived_at != null;
  const extended =
    project.original_end_date != null && project.end_date != null && project.end_date > project.original_end_date;

  const labourerWage = new Map((labourers ?? []).map((l) => [l.id, Number(l.daily_wage)]));
  const materialsCost = (materials ?? [])
    .filter((m) => m.status !== "returned")
    .reduce((sum, m) => sum + lineTotal(m.quantity, m.unit_cost), 0);
  const wages = (attendance ?? []).reduce(
    (sum, a) => sum + wageForStatus(a.status, labourerWage.get(a.labourer_id) ?? 0),
    0,
  );
  const spent = materialsCost + wages;
  const budget = Number(project.total_cost);
  const remaining = budget - spent;
  const completionPct = Number(project.completion_pct);
  const budgetPct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;

  const amountPaid = (clientPayments ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const gstRate = 18;
  const subtotal = spent;
  const gstAmount = Math.round(subtotal * gstRate / 100);
  const grandTotal = subtotal + gstAmount;
  const invoiceData: InvoiceData = {
    invoiceNo: `DC-${project.id.slice(0, 8).toUpperCase()}`,
    date: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    project: { name: project.name, address: project.address ?? null },
    // @ts-expect-error relation
    client: project.clients ? { name: project.clients.name, email: project.clients.email, phone: project.clients.phone } : null,
    materials: (materialDetails ?? []).map((m) => ({
      name: m.name, qty: Number(m.quantity), unit: m.unit ?? "unit",
      unitCost: Number(m.unit_cost), total: lineTotal(m.quantity, m.unit_cost),
    })),
    labourPayments: (paymentDetails ?? []).map((p) => ({
      description: p.description ?? "Labour payment", amount: Number(p.amount),
    })),
    changeOrders: (changeOrders ?? []).map((c) => ({
      description: c.description, amount: Number(c.extra_cost),
    })),
    subtotal,
    gstRate,
    gstAmount,
    grandTotal,
    amountPaid,
    amountDue: grandTotal - amountPaid,
  };

  const STATUS_COLOR: Record<string, string> = {
    planned: "bg-slate-100 text-slate-600",
    active: "bg-emerald-100 text-emerald-700",
    on_hold: "bg-amber-100 text-amber-700",
    completed: "bg-blue-100 text-blue-700",
    cancelled: "bg-red-100 text-red-600",
  };

  return (
    <AdminPage>
      <div className="px-4 pt-14 pb-6 sm:px-6 sm:pb-8 lg:px-8 lg:pt-6 lg:pb-10 mx-auto max-w-6xl">
      {/* ── Top bar ── */}
      <div className="mb-6 flex items-center justify-between">
        <BackLink href="/admin/projects" label="Back to projects" tone="muted" />
        <div className="flex items-center gap-2">
          {!isManager && <DownloadInvoiceButton data={invoiceData} />}
        </div>
      </div>

      {/* ── Hero header ── */}
      <div className="mb-8 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-ink">{project.name}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_COLOR[project.status] ?? "bg-slate-100 text-slate-600"}`}>
                {project.status.replace("_", " ")}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {project.current_stage ?? "No stage set"}
              {project.address ? ` · ${project.address}` : ""}
            </p>
          </div>
          {!archived && (
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/projects/${project.id}/edit`}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
              >
                Edit project
              </Link>
              <form action={archiveProject}>
                <input type="hidden" name="id" value={project.id} />
                <button
                  type="submit"
                  title={`Archive ${project.name}`}
                  className="rounded-lg border border-red-200 bg-white px-3.5 py-1.5 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50 transition"
                >
                  Archive
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-500">Completion</span>
            <span className="font-semibold text-ink">{completionPct.toFixed(1)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand transition-all duration-500"
              style={{ width: `${Math.min(completionPct, 100)}%` }}
            />
          </div>
        </div>

        {/* Quick stats row */}
        {!isManager && (
          <div className="mt-5 flex flex-wrap gap-6 border-t border-slate-100 pt-4">
            <StatCard label="Budget" value={`₹${budget.toLocaleString()}`} />
            <StatCard
              label="Spent"
              value={`₹${spent.toLocaleString()}`}
              sub={budget > 0 ? `${budgetPct.toFixed(0)}% of budget` : undefined}
              color={budgetPct >= 100 ? "text-red-600" : budgetPct >= 80 ? "text-amber-600" : "text-ink"}
            />
            <StatCard
              label="Remaining"
              value={`₹${remaining.toLocaleString()}`}
              color={remaining < 0 ? "text-red-600" : "text-emerald-600"}
            />
            <StatCard
              label="Client paid"
              value={`₹${amountPaid.toLocaleString()}`}
              sub={budget > 0 ? `${((amountPaid / budget) * 100).toFixed(0)}% of budget` : undefined}
              color="text-emerald-600"
            />
          </div>
        )}
      </div>

      {!isManager && <BudgetAlert budget={budget} spent={spent} />}

      {archived && (
        <Card className="mb-6">
          <p className="mb-4 text-sm text-slate-500">
            Archived {project.archived_at ? new Date(project.archived_at).toLocaleDateString() : ""}. Hidden from
            all other views. Its materials, payments and updates are retained.
          </p>
          <div className="flex items-center gap-2">
            <form action={unarchiveProject}>
              <input type="hidden" name="id" value={project.id} />
              <button type="submit" className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
                Restore
              </button>
            </form>
            {isOwner && (
              <DeleteForeverButton
                id={project.id}
                name={project.name}
                action={deleteProject}
                warning="All its materials, payments and progress updates will be deleted too."
              />
            )}
          </div>
        </Card>
      )}

      {/* ── Two-column grid ── */}
      <div className="grid gap-5 lg:grid-cols-2">

        {/* ── Left column ── */}
        <div className="space-y-5">

          {/* Client card */}
          <Card>
            <SectionHeader title="Client" />
            {project.clients ? (
              <div className="flex items-center justify-between">
                <div>
                  {/* @ts-expect-error relation */}
                  <div className="font-semibold text-ink">{project.clients.name}</div>
                  <div className="mt-0.5 text-sm text-slate-500">
                    {/* @ts-expect-error relation */}
                    {project.clients.phone ?? "No phone"} · {project.clients.email ?? "No email"}
                  </div>
                </div>
                <Link
                  // @ts-expect-error relation
                  href={`/admin/clients/${project.clients.id}`}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
                >
                  View →
                </Link>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No client assigned.</p>
            )}
          </Card>

          {/* Client payments */}
          {!isManager && (
            <Card>
              <SectionHeader title="Client payments received" />

              <div className="mb-4 flex gap-3">
                <div className="flex-1 rounded-xl bg-emerald-50 px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Received</div>
                  <div className="mt-0.5 text-lg font-bold tabular-nums text-emerald-700">₹{amountPaid.toLocaleString()}</div>
                </div>
                <div className="flex-1 rounded-xl bg-slate-50 px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Due</div>
                  <div className="mt-0.5 text-lg font-bold tabular-nums text-ink">₹{(budget - amountPaid > 0 ? budget - amountPaid : 0).toLocaleString()}</div>
                </div>
              </div>

              {!archived && (
                <form action={createClientPayment} className="mb-4 space-y-3 border-b border-slate-100 pb-4">
                  <input type="hidden" name="project_id" value={project.id} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="text-sm">
                      <span className="mb-1 block text-xs font-medium text-slate-500">Date</span>
                      <input type="date" name="paid_on" defaultValue={new Date().toISOString().slice(0, 10)} required className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand/20" />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-xs font-medium text-slate-500">Amount (₹)</span>
                      <input type="number" step="0.01" min="0" name="amount" required className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand/20" />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-xs font-medium text-slate-500">Note</span>
                      <input type="text" name="description" placeholder="e.g. Second installment" className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand/20" />
                    </label>
                  </div>
                  <FormSubmitButton className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition">
                    Record payment
                  </FormSubmitButton>
                </form>
              )}

              {(clientPayments ?? []).length === 0 ? (
                <p className="text-sm text-slate-400">No payments recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {clientPayments?.map((cp) => (
                    <ItemRow
                      key={cp.id}
                      primary={`₹${Number(cp.amount).toLocaleString()}`}
                      secondary={[cp.paid_on, cp.description].filter(Boolean).join(" · ")}
                      actions={
                        !archived ? (
                          <form action={archiveClientPayment}>
                            <input type="hidden" name="id" value={cp.id} />
                            <button type="submit" className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 transition">
                              Remove
                            </button>
                          </form>
                        ) : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Change orders */}
          <Card>
            <SectionHeader
              title="Change orders"
              right={
                <ArchivedToggle
                  basePath={`/admin/projects/${project.id}`}
                  showArchived={showArchivedChangeOrders}
                  archivedCount={archivedChangeOrderCount ?? 0}
                  label="change orders"
                />
              }
            />

            {!isManager && !archived && !showArchivedChangeOrders && (
              <form action={createChangeOrder} className="mb-4 space-y-3 border-b border-slate-100 pb-4">
                <input type="hidden" name="project_id" value={project.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="mb-1 block text-xs font-medium text-slate-500">Description</span>
                    <input type="text" name="description" required placeholder="e.g. Add a balcony" className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand/20" />
                  </label>
                  <CategoryField label="Work category (optional)" name="work_category" />
                  <label className="text-sm">
                    <span className="mb-1 block text-xs font-medium text-slate-500">Extra cost (₹)</span>
                    <input type="number" step="0.01" min="0" name="extra_cost" className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand/20" />
                  </label>
                  <div className="flex items-end">
                    <FormSubmitButton className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition">
                      Add change order
                    </FormSubmitButton>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">Extra cost is added to the budget immediately.</p>
              </form>
            )}

            {(changeOrders ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">
                {showArchivedChangeOrders ? "No archived change orders." : "No change orders yet."}
              </p>
            ) : (
              <div className="space-y-2">
                {changeOrders?.map((co) => (
                  <ItemRow
                    key={co.id}
                    primary={co.description}
                    secondary={
                      [
                        formatDateOnly(co.created_at),
                        co.work_category,
                        !isManager && Number(co.extra_cost) > 0 ? `+₹${Number(co.extra_cost).toLocaleString()}` : null,
                      ].filter(Boolean).join(" · ")
                    }
                    actions={
                      showArchivedChangeOrders ? (
                        <div className="flex items-center gap-1">
                          <RestoreAction id={co.id} action={unarchiveChangeOrder} />
                          {isOwner && <DeleteForeverButton id={co.id} name="this change order" action={deleteChangeOrder} />}
                        </div>
                      ) : (
                        <form action={archiveChangeOrder}>
                          <input type="hidden" name="id" value={co.id} />
                          <button type="submit" className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 transition">
                            Archive
                          </button>
                        </form>
                      )
                    }
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-5">

          {/* Budget extensions */}
          {!isManager && (
            <Card>
              <SectionHeader title="Budget extensions" />

              {!archived && (
                <form action={createBudgetExtension} className="mb-4 space-y-3 border-b border-slate-100 pb-4">
                  <input type="hidden" name="project_id" value={project.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      <span className="mb-1 block text-xs font-medium text-slate-500">Amount (₹)</span>
                      <input type="number" step="0.01" min="0.01" name="amount" required placeholder="e.g. 200000" className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand/20" />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-xs font-medium text-slate-500">Reason</span>
                      <input type="text" name="reason" placeholder="e.g. Additional funds approved" className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand/20" />
                    </label>
                  </div>
                  <FormSubmitButton className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition">
                    Extend budget
                  </FormSubmitButton>
                  <p className="text-[11px] text-slate-400">Added to the budget immediately.</p>
                </form>
              )}

              {(budgetExtensions ?? []).length === 0 ? (
                <p className="text-sm text-slate-400">No extensions yet.</p>
              ) : (
                <div className="space-y-2">
                  {budgetExtensions?.map((ext) => (
                    <ItemRow
                      key={ext.id}
                      primary={`+₹${Number(ext.amount).toLocaleString()}`}
                      secondary={[formatDateOnly(ext.created_at), ext.reason].filter(Boolean).join(" · ")}
                      actions={
                        !archived ? (
                          <form action={archiveBudgetExtension}>
                            <input type="hidden" name="id" value={ext.id} />
                            <button type="submit" className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 transition">
                              Remove
                            </button>
                          </form>
                        ) : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Timeline & dates */}
          {!archived && (
            <Card>
              <SectionHeader title="Timeline" />
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-slate-50/80 px-4 py-3">
                  <div>
                    <div className="text-xs font-medium text-slate-500">Finish date</div>
                    <div className="text-sm font-semibold text-ink">{project.end_date ?? "Not set"}</div>
                  </div>
                  {project.original_end_date && (
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Originally</div>
                      <div className="text-sm text-slate-500">{project.original_end_date}</div>
                    </div>
                  )}
                </div>
                {extended && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
                    Extended{project.extension_reason ? `: ${project.extension_reason}` : ""}
                  </div>
                )}

                <form action={extendProjectEndDate} className="border-t border-slate-100 pt-3">
                  <input type="hidden" name="id" value={project.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      <span className="mb-1 block text-xs font-medium text-slate-500">New finish date</span>
                      <input type="date" name="end_date" defaultValue={project.end_date ?? ""} required className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand/20" />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-xs font-medium text-slate-500">Reason</span>
                      <input type="text" name="reason" className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand/20" />
                    </label>
                  </div>
                  <button type="submit" className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition">
                    Update date
                  </button>
                </form>
              </div>
            </Card>
          )}

          {/* Next payment reminder */}
          {!archived && (
            <Card>
              <SectionHeader title="Payment reminder" />
              <form action={setNextPaymentDate}>
                <input type="hidden" name="id" value={project.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="mb-1 block text-xs font-medium text-slate-500">Next payment date</span>
                    <input type="date" name="next_payment_date" defaultValue={project.next_payment_date ?? ""} className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand/20" />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-xs font-medium text-slate-500">Amount due</span>
                    <input type="number" step="0.01" min="0" name="next_payment_amount" defaultValue={project.next_payment_amount ?? ""} className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand/20" />
                  </label>
                </div>
                <button type="submit" className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition">
                  Save reminder
                </button>
                <p className="mt-2 text-[11px] text-slate-400">
                  A client payment clears this once the full amount is paid. Left blank, any payment clears it.
                </p>
              </form>
            </Card>
          )}

          {/* Agreement */}
          <Card>
            <SectionHeader title="Agreement" />
            {project.agreement_image_url ? (
              <>
                <a href={project.agreement_image_url} target="_blank" rel="noreferrer">
                  <Image
                    src={project.agreement_image_url} alt="" width={640} height={480} loading="lazy"
                    className="max-h-80 w-auto rounded-xl border border-slate-200 object-cover"
                  />
                </a>
                {!archived && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <form action={uploadProjectAgreement}>
                      <input type="hidden" name="project_id" value={project.id} />
                      <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm hover:bg-slate-50 transition">
                        Replace
                        <AutoSubmitFileInput name="image_file" className="hidden" />
                      </label>
                    </form>
                    <form action={removeProjectAgreement}>
                      <input type="hidden" name="project_id" value={project.id} />
                      <button type="submit" className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-600 shadow-sm hover:bg-red-50 transition">
                        Remove
                      </button>
                    </form>
                  </div>
                )}
              </>
            ) : archived ? (
              <p className="text-sm text-slate-400">No agreement on file.</p>
            ) : (
              <form action={uploadProjectAgreement} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="project_id" value={project.id} />
                <input
                  type="file" accept="image/*" name="image_file" required
                  className="text-sm text-slate-500 file:mr-2 file:rounded-lg file:border file:border-slate-200 file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-slate-600 file:shadow-sm hover:file:bg-slate-50"
                />
                <FormSubmitButton className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition">
                  Upload
                </FormSubmitButton>
              </form>
            )}
          </Card>
        </div>
      </div>
      </div>
    </AdminPage>
  );
}
