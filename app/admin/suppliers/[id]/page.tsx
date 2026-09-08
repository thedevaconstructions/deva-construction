import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient, getSessionAndRole } from "@/lib/supabase/server";
import { AdminPage, AdminPageHeader, AdminContent } from "@/components/admin/Page";
import { DeleteForeverButton, DeleteAdvanceButton } from "@/components/admin/RowActions";
import { CollapsibleForm } from "@/components/admin/CollapsibleForm";
import {
  archiveSupplier, deleteSupplier, unarchiveSupplier, archiveMaterial, archivePayment,
  deleteSupplierAdvance,
  giveSupplierAdvance,
} from "../../actions";
import { lineTotal } from "@/lib/money";
import { supplierMoney } from "@/lib/supplierAccount";
import { formatDateTime } from "@/lib/dateFormat";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MATERIAL_STATUS_STYLE: Record<string, string> = {
  ordered: "bg-amber-50 text-amber-700 border-amber-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  returned: "bg-red-50 text-red-700 border-red-200",
};

const PAYMENT_STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

function StatBox({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${className ?? "border-slate-200 bg-white"}`}>
      <div className="text-[10px] font-medium uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

export default async function ManageSupplierPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createSupabaseServerClient();
  const { isOwner } = await getSessionAndRole();

  const [{ data: supplier }, { data: materials }, { data: payments }, { data: advances }] = await Promise.all([
    supabase.from("suppliers").select("id, name, email, phone, profile_id, archived_at").eq("id", params.id).single(),
    supabase
      .from("materials")
      .select("id, name, unit, quantity, unit_cost, status, ordered_at, projects(name)")
      .eq("supplier_id", params.id)
      .is("archived_at", null)
      .order("ordered_at", { ascending: false }),
    supabase
      .from("payments")
      .select("id, amount, status, description, created_at")
      .eq("supplier_id", params.id)
      .eq("payee_type", "supplier")
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("supplier_advances")
      .select("id, amount, description, material_id, created_at")
      .eq("supplier_id", params.id)
      .order("created_at", { ascending: false }),
  ]);
  if (!supplier) notFound();

  const archived = supplier.archived_at != null;
  const deliveredCount = (materials ?? []).filter((m) => m.status === "delivered").length;
  // One shared derivation, so this page, the supplier list and the supplier's
  // own dashboard cannot disagree about what is owed. See lib/supplierAccount.
  const { advanceBalance, lifetimePayment, remaining } = supplierMoney({
    payments: payments ?? [],
    advances: advances ?? [],
  });

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ href: "/admin/suppliers", label: "Suppliers" }}
        title={supplier.name}
        subtitle={
          `${supplier.email ?? "No email"} · ${supplier.phone ?? "No phone"} · ${supplier.profile_id ? "linked to a login" : "no login"}`
        }
      />
      <AdminContent>

      {/* Fixed 2x2 rather than flex-wrap: with four boxes, wrapping left a
          3-and-1 orphan on most widths. The max-width keeps the pair from
          stretching across a wide screen. */}
      <div className="mb-6 grid max-w-md grid-cols-2 gap-2">
        <StatBox label="Deliveries" value={String(deliveredCount)} />
        <StatBox
          label="Remaining"
          value={`₹${remaining.toLocaleString()}`}
          className={
            remaining > 0
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-slate-200 bg-white"
          }
        />
        <StatBox label="Lifetime payment" value={`₹${lifetimePayment.toLocaleString()}`} className="border-emerald-200 bg-emerald-50 text-emerald-700" />
        <StatBox
          label="Advance balance"
          value={`₹${advanceBalance.toLocaleString()}`}
          className={advanceBalance > 0 ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white"}
        />
      </div>

      <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-6">
        {archived ? (
          <>
            <p className="mb-4 text-sm text-slate-500">
              Archived {supplier.archived_at ? new Date(supplier.archived_at).toLocaleDateString() : ""}. Hidden
              from lists and dropdowns. Their past materials and payments are kept.
            </p>
            <div className="flex items-center gap-2">
              <form action={unarchiveSupplier}>
                <input type="hidden" name="id" value={supplier.id} />
                <button
                  type="submit"
                  className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                >
                  Restore
                </button>
              </form>
              {isOwner && (
                <DeleteForeverButton
                  id={supplier.id}
                  name={supplier.name}
                  action={deleteSupplier}
                  // Names the real consequence before anything is submitted:
                  // the bills go too, and every money figure that counts them
                  // moves. Archiving is the option that keeps the history.
                  warning={
                    payments && payments.length > 0
                      ? `This also permanently deletes ${payments.length} bill${payments.length === 1 ? "" : "s"} ` +
                        `worth ₹${payments.reduce((a, p) => a + Number(p.amount), 0).toLocaleString()}. ` +
                        `Cash flow, Profit & Loss and cost ` +
                        `reports will all change. Archive instead if you only want this supplier out of your lists.`
                      : undefined
                  }
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/suppliers/${supplier.id}/edit`}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              Edit
            </Link>
            <form action={archiveSupplier}>
              <input type="hidden" name="id" value={supplier.id} />
              <button
                type="submit"
                title={`Hide ${supplier.name} from lists and dropdowns. Its past materials and payments are kept and it can be restored.`}
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
              >
                Archive
              </button>
            </form>
          </div>
        )}
      </div>

      <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Deliveries</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Project</th>
              <th className="px-4 py-2 font-medium">Material</th>
              <th className="px-4 py-2 font-medium">Total</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(materials ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No deliveries recorded yet.</td></tr>
            )}
            {materials?.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-600">{m.ordered_at ? new Date(m.ordered_at).toLocaleDateString() : "—"}</td>
                {/* @ts-expect-error relation */}
                <td className="px-4 py-2">{m.projects?.name ?? "—"}</td>
                <td className="px-4 py-2">{m.name} <span className="text-xs text-slate-500">({m.quantity} {m.unit})</span></td>
                <td className="px-4 py-2 font-medium">₹{lineTotal(m.quantity, m.unit_cost).toLocaleString()}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-md border px-2 py-0.5 text-xs ${MATERIAL_STATUS_STYLE[m.status] ?? ""}`}>{m.status}</span>
                </td>
                <td className="px-4 py-2">
                  <form action={archiveMaterial}>
                    <input type="hidden" name="id" value={m.id} />
                    <button
                      type="submit"
                      title={`Delete ${m.name}`}
                      className="rounded-md border border-red-200 bg-white px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 transition"
                    >
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Payments</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 font-medium">Amount</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(payments ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No payments recorded yet.</td></tr>
            )}
            {payments?.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-600">{formatDateTime(p.created_at)}</td>
                <td className="px-4 py-2 text-slate-600">{p.description ?? "—"}</td>
                <td className="px-4 py-2 font-medium">₹{Number(p.amount).toLocaleString()}</td>
                {/* Supplier bills settle themselves against the advance ledger
                    the moment the delivery is recorded, so there is no action
                    to offer here -- only the resulting status to report. */}
                <td className="px-4 py-2">
                  <span className={`rounded-md border px-2 py-0.5 text-xs ${PAYMENT_STATUS_STYLE[p.status] ?? ""}`}>{p.status}</span>
                </td>
                <td className="px-4 py-2">
                  <form action={archivePayment}>
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      type="submit"
                      title={`Delete payment of ₹${Number(p.amount).toLocaleString()}`}
                      className="rounded-md border border-red-200 bg-white px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 transition"
                    >
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Advance Account</h2>

      {!archived && (
        <CollapsibleForm label="Give advance" icon="money">
        <form
          action={giveSupplierAdvance}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
        >
          <input type="hidden" name="supplier_id" value={supplier.id} />
          <label className="block text-sm">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Amount</span>
            <input
              name="amount"
              type="number"
              min="1"
              step="1"
              required
              placeholder="₹"
              className="w-40 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>
          <label className="block text-sm flex-1 min-w-[160px]">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Note (optional)</span>
            <input
              name="description"
              type="text"
              placeholder="e.g. Advance for cement order"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
          >
            Give advance
          </button>
        </form>
        </CollapsibleForm>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 font-medium text-right">Amount</th>
              <th className="px-4 py-2 font-medium"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {(advances ?? []).length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No advance payments yet.</td></tr>
            )}
            {advances?.map((a) => {
              const amt = Number(a.amount);
              return (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-600">{formatDateTime(a.created_at)}</td>
                  <td className="px-4 py-2 text-slate-600">{a.description ?? "—"}</td>
                  <td className={`px-4 py-2 text-right font-medium ${amt >= 0 ? "text-blue-700" : "text-red-600"}`}>
                    {amt >= 0 ? "+" : ""}₹{Math.abs(amt).toLocaleString()}
                  </td>
                  {/* Only money handed over can be removed. The negative rows
                      are deliveries drawing the credit down -- deleting one
                      would claim credit that has already been spent. */}
                  <td className="px-4 py-2 text-right">
                    {amt > 0 && (
                      <DeleteAdvanceButton
                        id={a.id}
                        supplierId={params.id}
                        amount={amt}
                        action={deleteSupplierAdvance}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
            {(advances ?? []).length > 0 && (
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td colSpan={2} className="px-4 py-2 font-semibold text-slate-700">Balance</td>
                <td className={`px-4 py-2 text-right font-bold ${advanceBalance > 0 ? "text-blue-700" : advanceBalance < 0 ? "text-red-600" : "text-slate-700"}`}>
                  ₹{advanceBalance.toLocaleString()}
                </td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </AdminContent>
    </AdminPage>
  );
}
