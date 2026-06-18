import { cn } from "@/lib/utils";

export default function WorkspacePanel({ children, className = "" }) {
  return (
    <section
      className={cn("w-full px-3 py-3 sm:px-4 sm:py-4 md:px-5 md:py-5 transition-all", className)}
    >
      {children}
    </section>
  );
}
