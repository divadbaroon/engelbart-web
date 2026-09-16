import Link from "next/link";
import { cn } from "@/lib/utils";
import { plural, type Project } from "@/lib/projects";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

type ProjectCardProps = { project: Project; current?: boolean };

export function ProjectCard({ project, current }: ProjectCardProps) {
  return (
    <Link href={`/workspace/${project.id}`} className="group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className={cn("h-full min-h-[240px] gap-0 rounded-lg p-6 shadow-none transition-colors group-hover:border-neutral-300")}>
        <CardHeader className="p-0">
          <CardTitle className="text-[17px] leading-snug font-medium break-words">{project.name}</CardTitle>
          {project.description && (
            <CardDescription className="mt-4 line-clamp-3 text-[15px] leading-normal text-neutral-800">
              {project.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="mt-auto p-0 pt-6">
          {project.path && <p className="text-xs leading-normal break-all text-muted-foreground">{project.path}</p>}
        </CardContent>
        <CardFooter className="mt-3.5 gap-4 p-0 text-[13px] font-semibold">
          <span>{plural(project.goals, "goal")}</span>
          <span>{plural(project.chats, "chat")}</span>
          {current && <span className="text-[#1a73e8]">This workspace</span>}
        </CardFooter>
      </Card>
    </Link>
  );
}
