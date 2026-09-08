import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPage, AdminPageHeader, AdminContent, Field, Select, SubmitButton } from "@/components/admin/Page";
import { updateClient } from "../../../actions";

export default async function EditClientPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createSupabaseServerClient();
  const [{ data: client }, { data: profiles }, { data: clients }] = await Promise.all([
    supabase.from("clients").select("id, name, email, phone, address, profile_id").eq("id", params.id).single(),
    supabase.from("profiles").select("id, full_name").eq("role", "client"),
    supabase.from("clients").select("id, profile_id"),
  ]);
  if (!client) notFound();

  // Offer profiles that are unlinked, plus whichever one this client already uses.
  const takenByOthers = new Set(
    (clients ?? []).filter((c) => c.id !== client.id).map((c) => c.profile_id).filter(Boolean),
  );
  const options = (profiles ?? []).filter((p) => !takenByOthers.has(p.id));

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ href: "/admin/clients", label: "Clients" }}
        title={`Edit ${client.name}`}
        subtitle="Update this client's details."
      />
      <AdminContent>
      <form action={updateClient} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:grid-cols-2 lg:grid-cols-3">
        <input type="hidden" name="id" value={client.id} />
        <Field label="Name" name="name" required defaultValue={client.name} />
        <Field label="Email" name="email" type="email" defaultValue={client.email ?? ""} />
        <Field label="Phone" name="phone" type="tel" maxLength={10} defaultValue={client.phone ?? ""} />
        <Field label="Address" name="address" defaultValue={client.address ?? ""} />
        <Select label="Link to login (optional)" name="profile_id" defaultValue={client.profile_id ?? "none"}>
          <option value="none">— none —</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name || p.id.slice(0, 8)}</option>
          ))}
        </Select>
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
          <SubmitButton>Save changes</SubmitButton>
          <Link href="/admin/clients" className="text-sm text-slate-600 hover:underline">Cancel</Link>
        </div>
      </form>
      </AdminContent>
    </AdminPage>
  );
}
