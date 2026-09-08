import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPage, AdminPageHeader, AdminContent, CostBox, Field, Select, SubmitButton } from "@/components/admin/Page";
import { ArchivedToggle } from "@/components/admin/RowActions";
import { CategoryField } from "@/components/admin/CategoryField";
import { ResettableForm, FormError } from "@/components/ResettableForm";
import { createMaterial, type CreateMaterialState } from "../../actions";
import { lineTotal } from "@/lib/money";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ProjectMaterialsPage(
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

  let base = supabase
    .from("materials")
    .select("id, name, unit, quantity, unit_cost, status, work_category, ordered_at, archived_at, suppliers(name)")
    .order("ordered_at", { ascending: false });
  base = isUnassigned ? base.is("project_id", null) : base.eq("project_id", params.id);

  let archivedCountQuery = supabase.from("materials").select("id", { count: "exact", head: true }).not("archived_at", "is", null);
  archivedCountQuery = isUnassigned ? archivedCountQuery.is("project_id", null) : archivedCountQuery.eq("project_id", params.id);

  const [{ data: project }, { data: materials }, { data: suppliers }, { count: archivedCount }] = await Promise.all([
    isUnassigned
      ? Promise.resolve({ data: null as { id: string; name: string } | null })
      : supabase.from("projects").select("id, name").eq("id", params.id).single(),
    showArchived ? base.not("archived_at", "is", null) : base.is("archived_at", null),
    supabase.from("suppliers").select("id, name").is("archived_at", null).order("name"),
    archivedCountQuery,
  ]);

  if (!isUnassigned && !project) notFound();

  const title = isUnassigned ? "Materials with no project" : project!.name;
  const basePath = `/admin/materials/${params.id}`;

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ href: "/admin/materials", label: "All materials" }}
        title={showArchived ? `${title} (archived)` : title}
        subtitle={
          showArchived
            ? "Hidden from lists and excluded from cost totals."
            : "Track what's ordered, delivered, and how much it costs."
        }
      />
      <AdminContent>

      <div className="mb-6">
        <ArchivedToggle basePath={basePath} showArchived={showArchived} archivedCount={archivedCount ?? 0} label="materials" />
      </div>

      {!showArchived && !isUnassigned && (
        <ResettableForm<CreateMaterialState>
          action={createMaterial}
          initialState={{ error: null, success: false }}
          className="mb-8 grid gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          <input type="hidden" name="project_id" value={params.id} />
          <Field label="Material name" name="name" required />
          <Select label="Supplier" name="supplier_id" defaultValue="none">
            <option value="none">— none —</option>
            {suppliers?.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </Select>
          <Field label="Quantity" name="quantity" type="number" step="0.01" min="0" required />
          <Field label="Unit (kg, bag, m³…)" name="unit" defaultValue="unit" />
          <Field label="Unit cost (₹)" name="unit_cost" type="number" step="0.01" min="0" required />
          {/* See the note on the Materials list page: recording a material
              means it arrived, so there is no "Ordered" to choose. */}
          <Select label="Status" name="status" defaultValue="delivered">
            <option value="delivered">Delivered</option>
            <option value="returned">Returned</option>
          </Select>
          <CategoryField label="Work category" name="work_category" />
          <div className="sm:col-span-2 lg:col-span-3">
            <FormError />
            <SubmitButton>Add material</SubmitButton>
          </div>
        </ResettableForm>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(materials ?? []).length === 0 && (
          <p className="col-span-full rounded-xl border border-dashed border-[var(--line)] bg-white p-8 text-center text-sm text-slate-500">
            {showArchived ? "No archived materials for this project." : "No materials recorded for this project yet."}
          </p>
        )}
        {(materials ?? []).map((m) => (
          <Link key={m.id} href={`/admin/materials/${params.id}/${m.id}`}>
            <CostBox label={m.name} value={lineTotal(m.quantity, m.unit_cost)} />
          </Link>
        ))}
      </div>
      </AdminContent>
    </AdminPage>
  );
}
