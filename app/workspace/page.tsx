import { Suspense } from "react";
import { Account } from "@/components/account";
import { AccountAvatar } from "@/components/account-menu";
import { AppHeader } from "@/components/app-header";
import { ProjectCard } from "@/components/project-card";
import { plural, SAMPLE_PROJECTS } from "@/lib/projects";

export default function ProjectsPage() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <AppHeader account={<Suspense fallback={<AccountAvatar />}><Account /></Suspense>} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1200px] px-10 pt-11 pb-14">
          <div className="flex items-end justify-between gap-4">
            <h1 className="text-[26px] font-semibold tracking-tight">Projects</h1>
            <span className="pb-1 text-[13px] whitespace-nowrap text-muted-foreground">
              {plural(SAMPLE_PROJECTS.length, "project")}
            </span>
          </div>
          <p className="mt-3 text-[15px] text-neutral-800">Choose a project to open its workspace.</p>
          <div className="mt-7 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-[22px]">
            {SAMPLE_PROJECTS.map((project) => (
              <ProjectCard key={project.slug} project={project} current={project.slug === "hi"} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
