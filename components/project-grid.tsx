"use client";

import { useState } from "react";
import { ProjectCard } from "@/components/project-card";
import { NewProjectButton, NewProjectCard } from "@/components/new-project";
import { plural, type Project } from "@/lib/projects";

// The Projects home body once the projects are loaded: heading, count,
// the New project control, and a card per project. The new-project form
// is a card in the same grid.
export function ProjectGrid({ projects }: { projects: Project[] }) {
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-[26px] font-semibold tracking-tight">Projects</h1>
        <div className="flex items-center gap-4">
          <span className="text-[13px] whitespace-nowrap text-muted-foreground">{plural(projects.length, "project")}</span>
          <NewProjectButton open={creating} onOpen={() => setCreating(true)} />
        </div>
      </div>
      <p className="mt-3 text-[15px] text-neutral-800">
        {projects.length ? "Choose a project to open its workspace." : "No projects yet. Create one here, or set one up from the Engelbart CLI and it will appear here."}
      </p>
      <div className="mt-7 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-[22px]">
        {creating && <NewProjectCard onClose={() => setCreating(false)} />}
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </>
  );
}
