import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPage, AdminPageHeader, AdminContent, Field, SubmitButton } from "@/components/admin/Page";
import { updateProjectUpdate } from "../../../actions";

export default async function EditUpdatePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createSupabaseServerClient();
  const { data: update } = await supabase
    .from("project_updates")
    .select("id, stage, note, image_url, created_at, projects(name)")
    .eq("id", params.id)
    .single();
  if (!update) notFound();

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ href: "/admin/updates", label: "Updates" }}
        // @ts-expect-error relation
        title={`Edit update — ${update.projects?.name ?? "—"}`}
        subtitle={`Posted ${new Date(update.created_at).toLocaleString()}`}
      />
      <AdminContent>
      <form action={updateProjectUpdate} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6">
        <input type="hidden" name="id" value={update.id} />
        <Field label="Stage" name="stage" defaultValue={update.stage ?? ""} />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Note</span>
          <textarea
            name="note"
            rows={4}
            defaultValue={update.note ?? ""}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          />
        </label>
        {update.image_url && (
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Photo</span>
            <Image
              src={update.image_url} alt="Site update" width={480} height={360}
              className="max-h-60 w-auto rounded-lg border border-slate-200 object-cover"
            />
            <p className="mt-1 text-xs text-slate-500">
              The photo can&apos;t be changed here. Archive this update and post a new one to replace it.
            </p>
          </div>
        )}
        <div className="flex items-center gap-3">
          <SubmitButton>Save changes</SubmitButton>
          <Link href="/admin/updates" className="text-sm text-slate-600 hover:underline">Cancel</Link>
        </div>
      </form>
      <p className="mt-4 text-xs text-slate-500">
        Editing the stage here does not change the project&apos;s current stage or completion —
        post a new update for that.
      </p>
      </AdminContent>
    </AdminPage>
  );
}
