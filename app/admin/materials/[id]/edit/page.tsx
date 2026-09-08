import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPage, AdminPageHeader, AdminContent, Field, Select, SubmitButton } from "@/components/admin/Page";
import { CategoryField } from "@/components/admin/CategoryField";
import { updateMaterial } from "../../../actions";

export default async function EditMaterialPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createSupabaseServerClient();
  const [{ data: material }, { data: projects }, { data: suppliers }] = await Promise.all([
    supabase
      .from("materials")
      .select("id, name, unit, quantity, unit_cost, status, project_id, supplier_id, work_category")
      .eq("id", params.id)
      .single(),
    supabase.from("projects").select("id, name").is("archived_at", null).order("name"),
    supabase.from("suppliers").select("id, name").is("archived_at", null).order("name"),
  ]);
  if (!material) notFound();

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ href: "/admin/materials", label: "Materials" }}
        title={`Edit ${material.name}`}
        subtitle="Update this material entry."
      />
      <AdminContent>
      <form action={updateMaterial} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:grid-cols-2 lg:grid-cols-3">
        <input type="hidden" name="id" value={material.id} />
        <Field label="Material name" name="name" required defaultValue={material.name} />
        <Select label="Project" name="project_id" defaultValue={material.project_id ?? "none"}>
          <option value="none">— none —</option>
          {projects?.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
        </Select>
        <Select label="Supplier" name="supplier_id" defaultValue={material.supplier_id ?? "none"}>
          <option value="none">— none —</option>
          {suppliers?.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
        </Select>
        <Field label="Quantity" name="quantity" type="number" step="0.01" min="0" required defaultValue={material.quantity ?? 0} />
        <Field label="Unit (kg, bag, m³…)" name="unit" defaultValue={material.unit ?? "unit"} />
        <Field label="Unit cost (₹)" name="unit_cost" type="number" step="0.01" min="0" required defaultValue={material.unit_cost ?? 0} />
        {/* "Ordered" is no longer offered for new materials, but this select
            defaults to the row's own status -- so drop the option only when
            this material is not already ordered. Without that guard, opening
            one of the few remaining ordered rows would silently reselect the
            first option and change its status on save. */}
        <Select label="Status" name="status" defaultValue={material.status}>
          {material.status === "ordered" && <option value="ordered">Ordered</option>}
          <option value="delivered">Delivered</option>
          <option value="returned">Returned</option>
        </Select>
        <CategoryField label="Work category" name="work_category" defaultValue={material.work_category ?? ""} />
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
          <SubmitButton>Save changes</SubmitButton>
          <Link href="/admin/materials" className="text-sm text-slate-600 hover:underline">Cancel</Link>
        </div>
      </form>
      <p className="mt-4 text-xs text-slate-500">
        Materials marked <strong>returned</strong> are already excluded from cost totals.
        Archive instead if the entry was created by mistake.
      </p>
      </AdminContent>
    </AdminPage>
  );
}
