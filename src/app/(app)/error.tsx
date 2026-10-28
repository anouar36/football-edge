"use client";
import { ErrorView, type ErrorProps } from "@/components/app/error-view";

/** A dashboard page failed to render (e.g. the database is unreachable): shown inside the layout, next to the sidebar. */
export default function AppError(props: ErrorProps) {
  return <ErrorView {...props} />;
}
