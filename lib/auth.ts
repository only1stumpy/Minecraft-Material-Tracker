import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "antville_session";
const SESSION_DAYS = 30;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string, version: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, version, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    expires: expiresAt, path: "/",
  });
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) }, include: { user: true },
  });
  if (!session || session.expiresAt <= new Date() || session.user.isBlocked || session.version !== session.user.sessionVersion) {
    return null;
  }
  if (session.lastSeenAt.getTime() < Date.now() - 5 * 60_000) {
    const now = new Date();
    await prisma.$transaction([
      prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } }),
      prisma.user.update({ where: { id: session.userId }, data: { lastActiveAt: now } }),
    ]);
  }
  return session.user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireReadyUser() {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/profile?password=required");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

export function isAdmin(user: { role: string }) { return user.role === "ADMIN"; }
