import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPage, AdminPageHeader, AdminContent, Field, Select, SubmitButton } from "@/components/admin/Page";
import {
  archiveShowcaseProject,
  deleteShowcasePhoto,
  deleteShowcaseProject,
  moveShowcasePhoto,
  setShowcasePublished,
  updateShowcaseProject,
} from "../actions";
import { ShowcasePhotoUpload } from "@/components/admin/ShowcasePhotoUpload";

const SITE = "https://devaconstructions.in";

export default async function EditShowcasePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createSupabaseServerClient();

  const [{ data: project }, { data: photos }] = await Promise.all([
    supabase
      .from("showcase_projects")
      .select("id, slug, name, location, year, kind, area, summary, featured, published, sort_order, archived_at")
      .eq("id", id)
      .single(),
    supabase
      .from("showcase_photos")
      .select("id, url, sort_order")
      .eq("showcase_id", id)
      .order("sort_order", { ascending: true }),
  ]);

  if (!project) notFound();

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ href: "/admin/website", label: "Website" }}
        title={project.name}
        subtitle={
          project.published ? (
            <>
              Live at{" "}
              <a
                href={`${SITE}/projects/${project.slug}`}
                target="_blank"
                rel="noreferrer"
                className="text-brand-600 hover:underline"
              >
                {SITE.replace("https://", "")}/projects/{project.slug}
              </a>
            </>
          ) : (
            <>Draft — not on the website yet. It will appear at /projects/{project.slug} once published.</>
          )
        }
      />
      <AdminContent>

      {project.archived_at && (
        <p className="mb-8 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">
          This project is archived, so it is not on the website even if it is marked published.
          Restore it from the Archived list on the{" "}
          <Link href="/admin/website" className="underline">
            Website page
          </Link>
          .
        </p>
      )}

      {/* Photos first: this is the thing people come to this page to do. */}
      <section className="mb-8 rounded-xl border border-[var(--line)] bg-white p-6">
        <h2 className="text-base font-semibold text-ink">Photos</h2>
        <p className="mt-1 text-sm text-slate-500">
          The first photo is the cover — it appears on the project&apos;s card and across the top of
          its page. Use the arrows to reorder. JPG, PNG, WebP or AVIF.
        </p>

        <ShowcasePhotoUpload showcaseId={project.id} />

        {photos?.length ? (
          <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo, i) => (
              <li key={photo.id} className="overflow-hidden rounded-lg border border-[var(--line)]">
                <div className="relative aspect-[4/3] bg-slate-100">
                  {/* Plain <img>: these are Supabase URLs displayed in an
                      internal admin list, where next/image optimisation would
                      add remote-pattern config for no user-visible benefit. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt="" className="h-full w-full object-cover" />
                  {i === 0 && (
                    <span className="absolute left-2 top-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                      COVER
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-1 px-2 py-2">
                  <div className="flex gap-1">
                    <form action={moveShowcasePhoto}>
                      <input type="hidden" name="id" value={photo.id} />
                      <input type="hidden" name="showcase_id" value={project.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button
                        type="submit"
                        disabled={i === 0}
                        aria-label="Move earlier"
                        className="rounded border border-[var(--line)] px-2 py-1 text-xs disabled:opacity-40"
                      >
                        ←
                      </button>
                    </form>
                    <form action={moveShowcasePhoto}>
                      <input type="hidden" name="id" value={photo.id} />
                      <input type="hidden" name="showcase_id" value={project.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button
                        type="submit"
                        disabled={i === photos.length - 1}
                        aria-label="Move later"
                        className="rounded border border-[var(--line)] px-2 py-1 text-xs disabled:opacity-40"
                      >
                        →
                      </button>
                    </form>
                  </div>
                  <form action={deleteShowcasePhoto}>
                    <input type="hidden" name="id" value={photo.id} />
                    <input type="hidden" name="showcase_id" value={project.id} />
                    <button
                      type="submit"
                      className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            No photos yet. The website shows an animated placeholder with the project&apos;s initials
            until you add one — nothing looks broken, but a real photo is far stronger.
          </p>
        )}
      </section>

      <form
        action={updateShowcaseProject}
        className="mb-8 grid gap-4 rounded-xl border border-[var(--line)] bg-white p-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        <input type="hidden" name="id" value={project.id} />
        <div className="sm:col-span-2 lg:col-span-3">
          <h2 className="text-base font-semibold text-ink">Details</h2>
        </div>
        <Field label="Project name" name="name" required defaultValue={project.name} />
        <Field label="Location" name="location" required defaultValue={project.location} />
        <Field label="Year" name="year" required maxLength={4} defaultValue={project.year} />
        <Select label="Category" name="kind" defaultValue={project.kind}>
          <option value="Residential">Residential</option>
          <option value="Commercial">Commercial / industrial</option>
          <option value="Renovation">Renovation / interiors</option>
        </Select>
        <Field label="Area" name="area" required defaultValue={project.area} />
        <Field
          label="Order (lower shows first)"
          name="sort_order"
          type="number"
          defaultValue={project.sort_order}
        />

        <label className="block text-sm sm:col-span-2 lg:col-span-3">
          <span className="mb-1 block font-medium text-slate-700">
            Description (optional, shown on the project&apos;s page)
          </span>
          <textarea
            name="summary"
            rows={4}
            defaultValue={project.summary ?? ""}
            className="w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>

        <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3">
          <input type="checkbox" name="featured" defaultChecked={project.featured} className="h-4 w-4" />
          <span className="text-slate-700">
            Show on the website home page (the first three featured projects appear there)
          </span>
        </label>

        <div className="sm:col-span-2 lg:col-span-3">
          <SubmitButton>Save details</SubmitButton>
        </div>
      </form>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--line)] bg-white p-6">
        <div>
          <h2 className="text-base font-semibold text-ink">
            {project.published ? "This project is live" : "This project is a draft"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {project.published
              ? "Anyone visiting the website can see it. Unpublishing removes it within a minute."
              : "Nobody outside the office can see it. Publishing puts it on the website."}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            <strong className="font-medium text-slate-700">Archive</strong> is for work you are
            finished with: it comes off the website and out of the list, but keeps its photos and
            description and can be restored any time.{" "}
            <strong className="font-medium text-slate-700">Delete permanently</strong> cannot be
            undone.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <form action={setShowcasePublished}>
            <input type="hidden" name="id" value={project.id} />
            <input type="hidden" name="published" value={project.published ? "false" : "true"} />
            <SubmitButton>{project.published ? "Unpublish" : "Publish to website"}</SubmitButton>
          </form>
          {/* Archive sits before Delete, and is styled as the ordinary
              action, because it is almost always the one that was meant.
              Delete is kept deliberately plain and last. */}
          <form action={archiveShowcaseProject}>
            <input type="hidden" name="id" value={project.id} />
            <button
              type="submit"
              className="rounded-md border border-[var(--line)] px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Archive
            </button>
          </form>
          <form action={deleteShowcaseProject}>
            <input type="hidden" name="id" value={project.id} />
            <button
              type="submit"
              className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Delete permanently
            </button>
          </form>
        </div>
      </section>
      </AdminContent>
    </AdminPage>
  );
}
