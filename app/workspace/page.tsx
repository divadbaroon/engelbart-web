import { Suspense } from "react";
import { Account } from "@/components/account";
import { AccountAvatar } from "@/components/account-menu";
import { AppHeader } from "@/components/app-header";
import { ProjectList, ProjectListFallback } from "@/components/project-list";

// Engelbart home: pick a project to open its workspace at /workspace/[workspaceId].
export default function ProjectsPage() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <AppHeader account={<Suspense fallback={<AccountAvatar />}><Account /></Suspense>} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1200px] px-10 pt-11 pb-14">
          <Suspense fallback={<ProjectListFallback />}>
            <ProjectList />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
