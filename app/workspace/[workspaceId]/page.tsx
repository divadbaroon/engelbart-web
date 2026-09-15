import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Account } from "@/components/account";
import { AccountAvatar } from "@/components/account-menu";
import { AppHeader } from "@/components/app-header";
import { AppShell } from "@/components/app-shell";
import { isUuid } from "@/lib/projects";
import { getProject } from "@/lib/projects-server";

type WorkspacePageProps = { params: Promise<{ workspaceId: string }> };

// Project workspace: rail, sidebar, center panel, Bart. The project comes
// from the database as the signed-in user, so it streams in under Suspense.
export default function WorkspacePage({ params }: WorkspacePageProps) {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Suspense fallback={<AppHeader account={<AccountAvatar />} />}>
        <Workspace params={params} />
      </Suspense>
    </div>
  );
}

async function Workspace({ params }: WorkspacePageProps) {
  const { workspaceId } = await params;
  if (!isUuid(workspaceId)) notFound();
  const project = await getProject(workspaceId);
  if (!project) notFound();

  return (
    <>
      <AppHeader page={project.name} account={<Suspense fallback={<AccountAvatar />}><Account /></Suspense>} />
      <AppShell />
    </>
  );
}
