import { randomBytes } from "node:crypto";
export const createId = () => randomBytes(12).toString("base64url");
