import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPage, AdminPageHeader, AdminContent } from "@/components/admin/Page";
import { EditPaymentForm } from "@/components/admin/PaymentForm";
import { computeWagesDue } from "@/lib/wages";
import { updatePayment } from "../../../actions";

export default async function EditPaymentPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createSupabaseServerClient();
  const [
    { data: payment }, { data: projects }, { data: suppliers }, { data: labourers },
    { data: materials }, { data: assignments }, { data: allLabourPayments }, { data: attendance },
  ] = await Promise.all([
      supabase
        .from("payments")
        .select("id, amount, status, payee_type, description, project_id, supplier_id, labourer_id, work_category")
        .eq("id", params.id)
        .single(),
      supabase.from("projects").select("id, name").is("archived_at", null).order("name"),
      supabase.from("suppliers").select("id, name").is("archived_at", null).order("name"),
      supabase.from("labourers").select("id, name, daily_wage, family_id, category").is("archived_at", null).order("name"),
      supabase
        .from("materials")
        .select("id, name, unit, quantity, unit_cost, work_category, supplier_id, project_id")
        .is("archived_at", null)
        .neq("status", "returned")
        .order("ordered_at", { ascending: false }),
      supabase.from("project_labourers").select("labourer_id, project_id").is("unassigned_at", null),
      supabase
        .from("payments")
        .select("id, project_id, payee_type, labourer_id, amount, status")
        .is("archived_at", null)
        .eq("payee_type", "labour"),
      supabase.from("attendance").select("project_id, labourer_id, status"),
    ]);
  if (!payment) notFound();
  const backPath = `/admin/payments/${payment.project_id ?? "unassigned"}`;

  const labourerWage = new Map((labourers ?? []).map((l) => [l.id, Number(l.daily_wage)]));
  // Exclude this payment itself from "already claimed" -- otherwise editing
  // it would subtract its own amount and always show 0 due.
  const wageDue = computeWagesDue(
    attendance ?? [],
    (allLabourPayments ?? []).filter((p) => p.id !== payment.id),
    labourerWage,
  );

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ href: backPath, label: "Payments" }}
        title="Edit payment"
        subtitle={`Currently ${payment.status}. Status is changed with the approve / pay buttons, not here.`}
      />
      <AdminContent>
      <EditPaymentForm
        action={updatePayment}
        projects={projects ?? []}
        suppliers={suppliers ?? []}
        labourers={(labourers ?? []).map((l) => ({ id: l.id, name: l.name, familyId: l.family_id, category: l.category }))}
        materials={materials ?? []}
        assignments={assignments ?? []}
        wageDue={wageDue}
        paymentId={payment.id}
        cancelHref={backPath}
        initial={{
          payeeType: payment.payee_type,
          projectId: payment.project_id ?? "none",
          amount: String(payment.amount ?? 0),
          supplierId: payment.supplier_id ?? "none",
          labourerId: payment.labourer_id ?? "none",
          description: payment.description ?? "",
          workCategory: payment.work_category ?? "",
        }}
      />
      <p className="mt-4 text-xs text-slate-500">
        Pick the payee that matches the payee type — the database requires exactly one, so the
        other is cleared automatically on save.
      </p>
      </AdminContent>
    </AdminPage>
  );
}
