import { ProjectCard } from "@/components/project-card";
import { listProjects } from "@/lib/projects-server";
import { plural } from "@/lib/projects";

// The Projects home body: a heading with the count, then a card per project.
// Async so the page can stream it inside <Suspense>.
export async function ProjectList() {
  const projects = await listProjects();
  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-[26px] font-semibold tracking-tight">Projects</h1>
        <span className="pb-1 text-[13px] whitespace-nowrap text-muted-foreground">
          {plural(projects.length, "project")}
        </span>
      </div>
      <p className="mt-3 text-[15px] text-neutral-800">
        {projects.length ? "Choose a project to open its workspace." : "No projects yet. Set one up from the Engelbart CLI and it will appear here."}
      </p>
      <div className="mt-7 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-[22px]">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </>
  );
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
