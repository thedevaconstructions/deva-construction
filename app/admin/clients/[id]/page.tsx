import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient, getSessionAndRole } from "@/lib/supabase/server";
import { AdminPage, AdminPageHeader, AdminContent } from "@/components/admin/Page";
import { DeleteForeverButton } from "@/components/admin/RowActions";
import { archiveClient, deleteClient, unarchiveClient } from "../../actions";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ManageClientPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createSupabaseServerClient();
  const { isOwner } = await getSessionAndRole();

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, email, phone, profile_id, archived_at")
    .eq("id", params.id)
    .single();
  if (!client) notFound();

  const archived = client.archived_at != null;

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ href: "/admin/clients", label: "Clients" }}
        title={client.name}
        subtitle={
          `${client.email ?? "No email"} · ${client.phone ?? "No phone"} · ${client.profile_id ? "linked to a login" : "no login"}`
        }
      />
      <AdminContent>

      <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-6">
        {archived ? (
          <>
            <p className="mb-4 text-sm text-slate-500">
              Archived {client.archived_at ? new Date(client.archived_at).toLocaleDateString() : ""}. Hidden from
              lists. Their projects are unaffected.
            </p>
            <div className="flex items-center gap-2">
              <form action={unarchiveClient}>
                <input type="hidden" name="id" value={client.id} />
                <button
                  type="submit"
                  className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                >
                  Restore
                </button>
              </form>
              {isOwner && <DeleteForeverButton id={client.id} name={client.name} action={deleteClient} />}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/clients/${client.id}/edit`}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              Edit
            </Link>
            <form action={archiveClient}>
              <input type="hidden" name="id" value={client.id} />
              <button
                type="submit"
                title={`Hide ${client.name} from lists. Its projects are unaffected and it can be restored.`}
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
              >
                Archive
              </button>
            </form>
          </div>
        )}
      </div>
      </AdminContent>
    </AdminPage>
  );
}
