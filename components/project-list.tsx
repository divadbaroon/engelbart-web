import { ProjectGrid } from "@/components/project-grid";
import { listProjects } from "@/lib/projects-server";

// The Projects home body. Async so the page can stream it inside
// <Suspense>; the grid itself is a client component so a project can be
// created in place.
export async function ProjectList() {
  const projects = await listProjects();
  return <ProjectGrid projects={projects} />;
}

export function ProjectListFallback() {
  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-[26px] font-semibold tracking-tight">Projects</h1>
      </div>
      <p className="mt-3 text-[15px] text-muted-foreground">Loading your projects…</p>
    </>
  );
}
