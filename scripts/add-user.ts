import "./env";
import { getAuth } from "../src/lib/auth/server";
import { getDb } from "../src/lib/db";
import { authUsers, authAccounts } from "../src/lib/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

async function main() {
  const email = (process.argv[2] ?? "ndnd15237@gmail.com").toLowerCase().trim();
  const password = process.argv[3] ?? "EdgeXI#2026!";
  const name = email.split("@")[0];

  console.log(`Setting up account for: ${email}`);
  const auth = await getAuth();
  const ctx = await auth.$context;
  const db = getDb();

  // Hash password using Better Auth's password hasher (scrypt)
  const hashedPassword = await ctx.password.hash(password);

  const [existingUser] = await db.select().from(authUsers).where(eq(authUsers.email, email));

  if (existingUser) {
    console.log(`User already exists (ID: ${existingUser.id}). Updating password in auth_accounts...`);
    const [existingAccount] = await db
      .select()
      .from(authAccounts)
      .where(eq(authAccounts.userId, existingUser.id));

    if (existingAccount) {
      await db
        .update(authAccounts)
        .set({ password: hashedPassword, updatedAt: new Date() })
        .where(eq(authAccounts.id, existingAccount.id));
    } else {
      const accountId = randomBytes(16).toString("hex");
      await db.insert(authAccounts).values({
        id: accountId,
        accountId: existingUser.id,
        providerId: "credential",
        userId: existingUser.id,
        password: hashedPassword,
      });
    }
    console.log("Account password updated successfully!");
  } else {
    const userId = randomBytes(16).toString("hex");
    const accountId = randomBytes(16).toString("hex");

    await db.insert(authUsers).values({
      id: userId,
      name,
      email,
      emailVerified: false,
    });

    await db.insert(authAccounts).values({
      id: accountId,
      accountId: userId,
      providerId: "credential",
      userId,
      password: hashedPassword,
    });

    console.log("User and account created successfully!");
    console.log(`User ID: ${userId}`);
  }

  console.log("-----------------------------------------");
  console.log(`Email:    ${email}`);
  console.log(`Password: ${password}`);
  console.log("-----------------------------------------");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
