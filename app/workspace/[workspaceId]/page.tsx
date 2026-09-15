import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { AppShell } from "@/components/app-shell";
import { SAMPLE_PROJECTS } from "@/lib/projects";

type WorkspacePageProps = { params: Promise<{ workspaceId: string }> };

// The projects are static sample data, so every workspace can be prerendered.
// Once they come from Supabase, replace this with a Suspense boundary.
export function generateStaticParams() {
  return SAMPLE_PROJECTS.map((p) => ({ workspaceId: p.slug }));
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { workspaceId: slug } = await params;
  const project = SAMPLE_PROJECTS.find((p) => p.slug === slug);
  if (!project) notFound();

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <AppHeader page={project.name} />
      <AppShell />
    </div>
  );
}
