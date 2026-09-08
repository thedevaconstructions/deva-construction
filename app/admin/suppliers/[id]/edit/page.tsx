import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPage, AdminPageHeader, AdminContent, Field, Select, SubmitButton } from "@/components/admin/Page";
import { updateSupplier } from "../../../actions";

export default async function EditSupplierPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createSupabaseServerClient();
  const [{ data: supplier }, { data: profiles }, { data: suppliers }] = await Promise.all([
    supabase.from("suppliers").select("id, name, email, phone, address, profile_id").eq("id", params.id).single(),
    supabase.from("profiles").select("id, full_name").eq("role", "supplier"),
    supabase.from("suppliers").select("id, profile_id"),
  ]);
  if (!supplier) notFound();

  const takenByOthers = new Set(
    (suppliers ?? []).filter((s) => s.id !== supplier.id).map((s) => s.profile_id).filter(Boolean),
  );
  const options = (profiles ?? []).filter((p) => !takenByOthers.has(p.id));

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ href: "/admin/suppliers", label: "Suppliers" }}
        title={`Edit ${supplier.name}`}
        subtitle="Update this supplier's details."
      />
      <AdminContent>
      <form action={updateSupplier} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:grid-cols-2 lg:grid-cols-3">
        <input type="hidden" name="id" value={supplier.id} />
        <Field label="Name" name="name" required defaultValue={supplier.name} />
        <Field label="Email" name="email" type="email" defaultValue={supplier.email ?? ""} />
        <Field label="Phone" name="phone" type="tel" maxLength={10} defaultValue={supplier.phone ?? ""} />
        <Field label="Address" name="address" defaultValue={supplier.address ?? ""} />
        <Select label="Link to login (optional)" name="profile_id" defaultValue={supplier.profile_id ?? "none"}>
          <option value="none">— none —</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name || p.id.slice(0, 8)}</option>
          ))}
        </Select>
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
          <SubmitButton>Save changes</SubmitButton>
          <Link href="/admin/suppliers" className="text-sm text-slate-600 hover:underline">Cancel</Link>
        </div>
      </form>
      </AdminContent>
    </AdminPage>
  );
}
