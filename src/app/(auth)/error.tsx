"use client";
import { ErrorView, type ErrorProps } from "@/components/app/error-view";

/** The login page failed (e.g. the database is unreachable): shown inside the (auth) layout, without the sidebar. */
export default function AuthError(props: ErrorProps) {
  return (
    <div className="w-full max-w-md">
      <ErrorView {...props} />
    </div>
  );
}
