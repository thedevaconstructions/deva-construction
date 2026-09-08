import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPage, AdminPageHeader, AdminContent } from "@/components/admin/Page";
import { AttendanceMarkForm } from "@/components/admin/AttendanceMarkForm";
import { AttendanceDateNav } from "@/components/admin/AttendanceDateNav";

export default async function ProjectAttendancePage(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ date?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const supabase = await createSupabaseServerClient();
  const date = searchParams.date ?? new Date().toISOString().slice(0, 10);

  const [
    { data: project }, { data: labourers }, { data: assignments },
    { data: projectRows }, { data: otherRows }, { data: allProjects },
  ] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", params.id).single(),
    supabase.from("labourers").select("id, name, daily_wage, category").is("archived_at", null).eq("active", true).order("name"),
    supabase.from("project_labourers").select("labourer_id, project_id").is("unassigned_at", null),
    supabase.from("attendance").select("labourer_id, status").eq("project_id", params.id).eq("date", date),
    // Everything else this labourer has recorded the same date elsewhere,
    // so admin can see split-day entries while working in this project's
    // view instead of them being invisible here.
    supabase.from("attendance").select("labourer_id, status, projects(name)").eq("date", date).neq("project_id", params.id),
    supabase.from("projects").select("id, name").is("archived_at", null),
  ]);

  if (!project) notFound();

  const projectName = new Map((allProjects ?? []).map((p) => [p.id, p.name]));
  const currentSite = new Map((assignments ?? []).map((a) => [a.labourer_id, a.project_id]));
  const todayHere = new Map((projectRows ?? []).map((r) => [r.labourer_id, r.status]));

  const elsewhereByLabourer = new Map<string, { status: string; siteName: string }[]>();
  for (const r of otherRows ?? []) {
    const list = elsewhereByLabourer.get(r.labourer_id) ?? [];
    list.push({
      status: r.status,
      // @ts-expect-error relation
      siteName: r.projects?.name ?? "another site",
    });
    elsewhereByLabourer.set(r.labourer_id, list);
  }

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ href: "/admin/attendance", label: "All sites" }}
        title={project.name}
        subtitle="Mark attendance for this site."
      />
      <AdminContent>

      <AttendanceDateNav projectId={params.id} date={date} />

      {(!labourers || labourers.length === 0) && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          No active labourers. Add one in <Link className="underline" href="/admin/labourers">Labourers</Link>.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Labourer</th>
              <th className="px-4 py-2 font-medium">Current site</th>
              <th className="px-4 py-2 font-medium">Daily wage</th>
              <th className="px-4 py-2 font-medium">Status here</th>
              <th className="px-4 py-2 font-medium">Mark</th>
            </tr>
          </thead>
          <tbody>
            {labourers?.map((l) => {
              const siteId = currentSite.get(l.id);
              const status = todayHere.get(l.id);
              const elsewhere = elsewhereByLabourer.get(l.id);
              return (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    {l.name}
                    {elsewhere && elsewhere.length > 0 && (
                      <div className="mt-0.5 text-xs text-amber-700">
                        Also {elsewhere.map((e) => `${e.status.replace("_", " ")} at ${e.siteName}`).join(", ")} today
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{siteId ? projectName.get(siteId) ?? "—" : "—"}</td>
                  <td className="px-4 py-2 text-slate-600">₹{Number(l.daily_wage).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        status === "present"
                          ? "text-emerald-700"
                          : status === "overtime"
                          ? "text-blue-700 font-medium"
                          : status === "half_day"
                          ? "text-amber-700"
                          : status === "absent"
                          ? "text-red-700"
                          : "text-slate-400"
                      }
                    >
                      {status === "overtime" ? "overtime 1.5×" : (status ?? "not marked")}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <AttendanceMarkForm
                      labourerId={l.id}
                      projectId={project.id}
                      date={date}
                      currentStatus={status}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </AdminContent>
    </AdminPage>
  );
}
