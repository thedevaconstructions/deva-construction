import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient, getSessionAndRole } from "@/lib/supabase/server";
import { AdminPage, AdminPageHeader, AdminContent, Field, SubmitButton } from "@/components/admin/Page";
import { ArchivedToggle, DeleteForeverButton, RestoreAction } from "@/components/admin/RowActions";
import { CollapsibleForm } from "@/components/admin/CollapsibleForm";
import { CreatePaymentForm } from "@/components/admin/PaymentForm";
import { CashFlowBarChart } from "@/components/admin/CashFlowBarChart";
import { byCategoryTotals } from "@/lib/paymentsChart";
import { computeWagesDueFromAccrued } from "@/lib/wages";
import { formatDateTime } from "@/lib/dateFormat";
import {
  createPayment, unarchivePayment, deletePayment,
  createClientPayment, archiveClientPayment, unarchiveClientPayment, deleteClientPayment,
} from "../../actions";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

export default async function ProjectPaymentsPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ archived?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const showArchived = searchParams.archived === "1";
  const isUnassigned = params.id === "unassigned";
  const supabase = await createSupabaseServerClient();
  const { isOwner } = await getSessionAndRole();

  let base = supabase
    .from("payments")
    .select("id, amount, status, payee_type, description, work_category, created_at, archived_at, collected_by, suppliers(name), labourers!payments_labourer_id_fkey(name)")
    .order("created_at", { ascending: false });
  base = isUnassigned ? base.is("project_id", null) : base.eq("project_id", params.id);

  let archivedCountQuery = supabase.from("payments").select("id", { count: "exact", head: true }).not("archived_at", "is", null);
  archivedCountQuery = isUnassigned ? archivedCountQuery.is("project_id", null) : archivedCountQuery.eq("project_id", params.id);

  let clientPaymentsBase = supabase
    .from("client_payments")
    .select("id, amount, description, paid_on, archived_at")
    .eq("project_id", params.id)
    .order("paid_on", { ascending: false });

  const [
    { data: project }, { data: payments }, { data: projects }, { data: suppliers }, { data: labourers },
    { data: materials }, { data: assignments }, { data: allLabourPayments }, { data: wageAccrued },
    { count: archivedCount }, { data: clientPayments },
  ] = await Promise.all([
    isUnassigned
      ? Promise.resolve({ data: null as { id: string; name: string } | null })
      : supabase.from("projects").select("id, name").eq("id", params.id).single(),
    showArchived ? base.not("archived_at", "is", null) : base.is("archived_at", null),
    supabase.from("projects").select("id, name").is("archived_at", null).order("name"),
    supabase.from("suppliers").select("id, name").is("archived_at", null).order("name"),
    supabase.from("labourers").select("id, name, family_id, category").is("archived_at", null).order("name"),
    supabase
      .from("materials")
      .select("id, name, unit, quantity, unit_cost, work_category, supplier_id, project_id")
      .is("archived_at", null)
      .neq("status", "returned")
      .eq("billed", false)
      .order("ordered_at", { ascending: false }),
    supabase.from("project_labourers").select("labourer_id, project_id").is("unassigned_at", null),
    supabase
      .from("payments")
      .select("project_id, payee_type, labourer_id, amount, status")
      .is("archived_at", null)
      .eq("payee_type", "labour"),
    // Pre-summed per (project, labourer) in Postgres instead of fetching the
    // entire attendance table just to add it up client-side -- see
    // supabase/29_staff_wage_accrued.sql.
    supabase.rpc("staff_labourer_wage_accrued"),
    archivedCountQuery,
    isUnassigned
      ? Promise.resolve({ data: [] as { id: string; amount: number; description: string | null; paid_on: string; archived_at: string | null }[] })
      : showArchived
        ? clientPaymentsBase.not("archived_at", "is", null)
        : clientPaymentsBase.is("archived_at", null),
  ]);

  if (!isUnassigned && !project) notFound();

  const title = isUnassigned ? "Payments with no project" : project!.name;
  const basePath = `/admin/payments/${params.id}`;

  const wageDue = computeWagesDueFromAccrued(wageAccrued ?? [], allLabourPayments ?? []);

  const labourerName = new Map((labourers ?? []).map((l) => [l.id, l.name]));

  const categoryTotals = byCategoryTotals(payments ?? []);
  const categoryBars = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, color: "#635bff" }));

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ href: "/admin/payments", label: "All payments" }}
        title={showArchived ? `${title} (archived)` : title}
        subtitle={
          showArchived
            ? "Hidden from lists and excluded from cost totals."
            : "Bills and wages. Pending → approved → paid."
        }
      />
      <AdminContent>

      <div className="mb-6">
        <ArchivedToggle basePath={basePath} showArchived={showArchived} archivedCount={archivedCount ?? 0} label="payments" />
      </div>

      {!showArchived && !isUnassigned && (
        <CreatePaymentForm
          action={createPayment}
          projects={projects ?? []}
          suppliers={suppliers ?? []}
          labourers={(labourers ?? []).map((l) => ({ id: l.id, name: l.name, familyId: l.family_id, category: l.category }))}
          materials={materials ?? []}
          assignments={assignments ?? []}
          wageDue={wageDue}
          fixedProject={{ id: project!.id, name: project!.name }}
        />
      )}

      {!showArchived && categoryBars.length > 0 && (
        <div className="mb-8 rounded-xl border border-[var(--line)] bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Spend by category</h2>
          <CashFlowBarChart bars={categoryBars} />
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Payee</th>
              <th className="px-4 py-2 font-medium">Amount</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {(payments ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                {showArchived ? "No archived payments." : "No payments recorded for this project yet."}
              </td></tr>
            )}
            {payments?.map((p) => {
              const payeeName =
                // @ts-expect-error relation
                p.payee_type === "supplier" ? p.suppliers?.name : p.labourers?.name;
              return (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-600">{formatDateTime(p.created_at)}</td>
                  <td className="px-4 py-2">
                    {payeeName ?? "—"} <span className="text-xs text-slate-500">({p.payee_type})</span>
                  </td>
                  <td className="px-4 py-2 font-medium">₹{Number(p.amount).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-md border px-2 py-0.5 text-xs ${STATUS_STYLE[p.status] ?? ""}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {p.description ?? "—"}
                    {p.collected_by && (
                      <span className="ml-1 rounded bg-violet-50 px-1 py-0.5 text-[10px] text-violet-700">
                        collected by {labourerName.get(p.collected_by) ?? "family"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {showArchived ? (
                        <>
                          <RestoreAction id={p.id} action={unarchivePayment} />
                          {isOwner && (
                            <DeleteForeverButton
                              id={p.id}
                              name={`this ${p.payee_type} payment`}
                              action={deletePayment}
                            />
                          )}
                        </>
                      ) : (
                        <>
                          <Link
                            href={`/admin/payments/${p.id}/edit`}
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                          >
                            Edit
                          </Link>
                          <DeleteForeverButton
                            id={p.id}
                            name={`this ${p.payee_type} payment`}
                            action={deletePayment}
                          />
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!isUnassigned && (
        <>
          <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Client payments received
          </h2>

          {!showArchived && (
            <CollapsibleForm label="Record client payment" icon="money">
            <form action={createClientPayment} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="project_id" value={project!.id} />
              <Field label="Date" name="paid_on" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              <Field label="Amount" name="amount" type="number" step="0.01" min={0} required />
              <Field label="Description" name="description" />
              <div className="flex items-end">
                <SubmitButton>Record payment</SubmitButton>
              </div>
            </form>
            </CollapsibleForm>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Description</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {(clientPayments ?? []).length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    {showArchived ? "No archived client payments." : "No client payments recorded for this project yet."}
                  </td></tr>
                )}
                {clientPayments?.map((cp) => (
                  <tr key={cp.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-600">{cp.paid_on}</td>
                    <td className="px-4 py-2 font-medium">₹{Number(cp.amount).toLocaleString()}</td>
                    <td className="px-4 py-2 text-slate-600">{cp.description ?? "—"}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {showArchived ? (
                          <>
                            <RestoreAction id={cp.id} action={unarchiveClientPayment} />
                            {isOwner && (
                              <DeleteForeverButton id={cp.id} name="this client payment" action={deleteClientPayment} />
                            )}
                          </>
                        ) : (
                          <ActionButton id={cp.id} action={archiveClientPayment} label="Archive" variant="ghost" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      </AdminContent>
    </AdminPage>
  );
}

function ActionButton({
  id,
  action,
  label,
  variant = "primary",
}: {
  id: string;
  action: (fd: FormData) => Promise<void>;
  label: string;
  variant?: "primary" | "ghost";
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button
        className={
          "rounded-md border px-2 py-1 text-xs " +
          (variant === "primary"
            ? "border-slate-800 bg-slate-900 text-white hover:bg-slate-800"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100")
        }
      >
        {label}
      </button>
    </form>
  );
}
