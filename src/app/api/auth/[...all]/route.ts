import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** Better Auth endpoints: /api/auth/sign-in/email, /api/auth/get-session, /api/auth/sign-out, ... */
export const { GET, POST } = toNextJsHandler(async (req: Request) => (await getAuth()).handler(req));
