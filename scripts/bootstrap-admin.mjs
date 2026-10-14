import { randomBytes, scrypt as nodeScrypt } from "node:crypto";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";

const nickname = process.argv[2];
if (!nickname || !/^[A-Za-z0-9_]{3,16}$/.test(nickname)) {
  console.error("Использование: npm run admin:bootstrap -- MinecraftNick"); process.exit(1);
}
const prisma = new PrismaClient(); const temporaryPassword = `Av1-${randomBytes(18).toString("base64url")}`;
const salt = randomBytes(16).toString("hex"); const key = await promisify(nodeScrypt)(temporaryPassword, salt, 64);
const passwordHash = `scrypt:${salt}:${Buffer.from(key).toString("hex")}`;
try {
  const user = await prisma.user.upsert({ where: { minecraftNickname: nickname }, update: { role: "ADMIN", isBlocked: false, passwordHash, mustChangePassword: true, sessionVersion: { increment: 1 } }, create: { minecraftNickname: nickname, role: "ADMIN", passwordHash } });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  console.log(`Администратор: ${nickname}\nВременный пароль: ${temporaryPassword}\nСохраните пароль сейчас.`);
} finally { await prisma.$disconnect(); }
