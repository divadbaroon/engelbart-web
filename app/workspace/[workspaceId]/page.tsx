import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { AppShell } from "@/components/app-shell";
import { SAMPLE_PROJECTS } from "@/lib/projects";

type WorkspacePageProps = { params: Promise<{ project: string }> };

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { project: slug } = await params;
  const project = SAMPLE_PROJECTS.find((p) => p.slug === slug);
  if (!project) notFound();

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <AppHeader page={project.name} />
      <AppShell />
    </div>
  );
}
