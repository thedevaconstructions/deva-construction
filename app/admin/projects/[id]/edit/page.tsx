import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient, getSessionAndRole } from "@/lib/supabase/server";
import { AdminPage, AdminPageHeader, AdminContent, Field, Select, SubmitButton } from "@/components/admin/Page";
import { updateProject } from "../../../actions";

export default async function EditProjectPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createSupabaseServerClient();
  const { role } = await getSessionAndRole();
  const isManager = role === "manager";
  const [{ data: project }, { data: clients }] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, name, client_id, address, status, current_stage, completion_pct, total_cost, start_date, end_date",
      )
      .eq("id", params.id)
      .single(),
    supabase.from("clients").select("id, name").is("archived_at", null).order("name"),
  ]);
  if (!project) notFound();

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ href: "/admin/projects", label: "Projects" }}
        title={`Edit ${project.name}`}
        subtitle="Update this project's details."
      />
      <AdminContent>

      <form
        action={updateProject}
        className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        <input type="hidden" name="id" value={project.id} />
        <Field label="Name" name="name" required defaultValue={project.name} />
        <Select label="Client" name="client_id" defaultValue={project.client_id ?? "none"}>
          <option value="none">— none —</option>
          {clients?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Field label="Address" name="address" defaultValue={project.address ?? ""} />
        <Select label="Status" name="status" defaultValue={project.status}>
          <option value="planned">Planned</option>
          <option value="active">Active</option>
          <option value="on_hold">On hold</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <Field label="Current stage" name="current_stage" defaultValue={project.current_stage ?? ""} />
        {/* Omitted for managers. updateProject only writes total_cost when
            the form actually submits the field, so saving an edit from here
            leaves the existing budget untouched rather than zeroing it. */}
        {!isManager && (
          <Field
            label="Total cost (₹)" name="total_cost" type="number" step="0.01" min="0"
            defaultValue={project.total_cost ?? 0}
          />
        )}
        <Field label="Start date" name="start_date" type="date" defaultValue={project.start_date ?? ""} />
        <Field label="End date" name="end_date" type="date" defaultValue={project.end_date ?? ""} />
        <Field
          label="Completion %" name="completion_pct" type="number" step="0.1" min="0" max="100"
          defaultValue={project.completion_pct ?? 0}
        />
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
          <SubmitButton>Save changes</SubmitButton>
          <Link href="/admin/projects" className="text-sm text-slate-600 hover:underline">
            Cancel
          </Link>
        </div>
      </form>

      <p className="mt-4 text-xs text-slate-500">
        Changing the end date here does not record an extension. Use “Extend finish date” on the
        Projects page so the client sees what changed and why.
      </p>
      </AdminContent>
    </AdminPage>
  );
}
