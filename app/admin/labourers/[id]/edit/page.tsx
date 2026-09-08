import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPage, AdminPageHeader, AdminContent, Field, SubmitButton } from "@/components/admin/Page";
import { CategoryField } from "@/components/admin/CategoryField";
import { updateLabourer } from "../../../actions";

export default async function EditLabourerPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createSupabaseServerClient();
  const { data: labourer } = await supabase
    .from("labourers")
    .select("id, name, phone, daily_wage, active, category")
    .eq("id", params.id)
    .single();
  if (!labourer) notFound();

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ href: "/admin/labourers", label: "Labourers" }}
        title={`Edit ${labourer.name}`}
        subtitle="Update this labourer's details."
      />
      <AdminContent>
      <form action={updateLabourer} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:grid-cols-2 lg:grid-cols-3">
        <input type="hidden" name="id" value={labourer.id} />
        <Field label="Name" name="name" required defaultValue={labourer.name} />
        <CategoryField label="Category" name="category" defaultValue={labourer.category ?? ""} />
        <Field label="Phone" name="phone" type="tel" maxLength={10} defaultValue={labourer.phone ?? ""} />
        <Field label="Daily wage (₹)" name="daily_wage" type="number" step="0.01" min="0" defaultValue={labourer.daily_wage ?? 0} />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="active" defaultChecked={labourer.active} />
          Active
        </label>
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
          <SubmitButton>Save changes</SubmitButton>
          <Link href="/admin/labourers" className="text-sm text-slate-600 hover:underline">Cancel</Link>
        </div>
      </form>
      <p className="mt-4 text-xs text-slate-500">
        Unticking “Active” keeps them in lists but excludes them from attendance and assignment.
        Archiving hides them entirely — their attendance history is kept either way.
      </p>
      </AdminContent>
    </AdminPage>
  );
}
