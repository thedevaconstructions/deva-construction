import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient, getSessionAndRole } from "@/lib/supabase/server";
import { AdminPage, AdminPageHeader, AdminContent } from "@/components/admin/Page";
import { DeleteForeverButton } from "@/components/admin/RowActions";
import { archiveMaterial, deleteMaterial, markMaterialDelivered, unarchiveMaterial } from "../../../actions";
import { lineTotal } from "@/lib/money";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MATERIAL_STATUS_STYLE: Record<string, string> = {
  ordered: "bg-amber-50 text-amber-700 border-amber-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  returned: "bg-red-50 text-red-700 border-red-200",
};

function InfoBox({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${className ?? "border-slate-200 bg-white"}`}>
      <div className="text-[10px] font-medium uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

export default async function ManageMaterialPage(
  props: {
    params: Promise<{ id: string; materialId: string }>;
  }
) {
  const params = await props.params;
  const supabase = await createSupabaseServerClient();
  const { isOwner } = await getSessionAndRole();

  const { data: material } = await supabase
    .from("materials")
    .select("id, name, unit, quantity, unit_cost, status, work_category, image_url, archived_at, suppliers(name)")
    .eq("id", params.materialId)
    .single();
  if (!material) notFound();

  const archived = material.archived_at != null;
  const backLabel = params.id === "unassigned" ? "Materials with no project" : "Project materials";

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ href: `/admin/materials/${params.id}`, label: backLabel }}
        title={material.name}
      />
      <AdminContent>

      <div className="mb-6 flex flex-wrap gap-2">
        <InfoBox
          label="Supplier"
          // @ts-expect-error relation
          value={material.suppliers?.name ?? "No supplier"}
        />
        <InfoBox label="Quantity" value={`${Number(material.quantity)} ${material.unit}`} />
        <InfoBox label="Unit cost" value={`₹${Number(material.unit_cost).toLocaleString()} each`} />
        <InfoBox
          label="Total"
          value={`₹${lineTotal(material.quantity, material.unit_cost).toLocaleString()}`}
          className="border-brand/25 bg-brand-50"
        />
        <InfoBox
          label="Status"
          value={material.status}
          className={MATERIAL_STATUS_STYLE[material.status] ?? "border-slate-200 bg-slate-50"}
        />
        {material.work_category && <InfoBox label="Work category" value={material.work_category} />}
      </div>

      {material.image_url && (
        <div className="mb-6 max-w-xl">
          <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">Delivery photo</div>
          <Image
            src={material.image_url} alt="" width={640} height={480} loading="lazy"
            className="max-h-96 w-auto rounded-xl border border-slate-200 object-cover"
          />
        </div>
      )}

      <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-6">
        {archived ? (
          <>
            <p className="mb-4 text-sm text-slate-500">
              Archived {material.archived_at ? new Date(material.archived_at).toLocaleDateString() : ""}. Hidden from
              lists and excluded from cost totals.
            </p>
            <div className="flex items-center gap-2">
              <form action={unarchiveMaterial}>
                <input type="hidden" name="id" value={material.id} />
                <button
                  type="submit"
                  className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                >
                  Restore
                </button>
              </form>
              {isOwner && <DeleteForeverButton id={material.id} name={material.name} action={deleteMaterial} />}
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/materials/${material.id}/edit`}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              Edit
            </Link>
            {material.status === "ordered" && (
              <form action={markMaterialDelivered}>
                <input type="hidden" name="id" value={material.id} />
                <button
                  type="submit"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
                >
                  Mark delivered
                </button>
              </form>
            )}
            <form action={archiveMaterial}>
              <input type="hidden" name="id" value={material.id} />
              <button
                type="submit"
                title={`Hide ${material.name} from lists. Nothing is deleted and it can be restored.`}
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
