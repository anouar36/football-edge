"use client";
import { ErrorView, type ErrorProps } from "@/components/app/error-view";

/** A group layout failed, e.g. the dashboard shell could not read the session because the database is unreachable. */
export default function RootError(props: ErrorProps) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md items-center px-4">
      <ErrorView {...props} />
    </div>
  );
}
