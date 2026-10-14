import { randomBytes, scrypt as nodeScrypt } from "node:crypto";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const nickname = args[0];
if (args.length !== 1 || !nickname || !/^[A-Za-z0-9_]{3,16}$/.test(nickname)) {
  console.error("Использование: npm run admin:bootstrap -- MinecraftNick");
  process.exit(1);
}

const prisma = new PrismaClient();
const temporaryPassword = "Av1-" + randomBytes(18).toString("base64url");
const salt = randomBytes(16).toString("hex");
const key = await promisify(nodeScrypt)(temporaryPassword, salt, 64);
const passwordHash = "scrypt:" + salt + ":" + Buffer.from(key).toString("hex");

try {
  const normalizedNickname = nickname.toLowerCase();
  const user = await prisma.$transaction(async (tx) => {
    const existingAdmin = await tx.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
    if (existingAdmin) throw new Error("ADMIN_ALREADY_EXISTS");

    const existingUser = await tx.user.findUnique({ where: { normalizedNickname }, select: { id: true } });
    const admin = existingUser
      ? await tx.user.update({
          where: { id: existingUser.id },
          data: {
            minecraftNickname: nickname,
            role: "ADMIN",
            isBlocked: false,
            passwordHash,
            mustChangePassword: true,
            sessionVersion: { increment: 1 },
          },
        })
      : await tx.user.create({
          data: {
            minecraftNickname: nickname,
            normalizedNickname,
            role: "ADMIN",
            passwordHash,
          },
        });

    if (existingUser) await tx.session.deleteMany({ where: { userId: existingUser.id } });
    await tx.auditLog.create({
      data: {
        action: "ADMIN_BOOTSTRAPPED",
        entityType: "User",
        entityId: admin.id,
        metadata: { nickname: admin.minecraftNickname },
      },
    });
    return admin;
  }, { isolationLevel: "Serializable" });
  console.log("Администратор: " + user.minecraftNickname + "\nВременный пароль: " + temporaryPassword + "\nСохраните пароль сейчас.");
} catch (error) {
  if (error instanceof Error && error.message === "ADMIN_ALREADY_EXISTS") {
    console.error("Администратор уже существует. Bootstrap разрешён только до создания первой роли ADMIN.");
  } else if (typeof error === "object" && error !== null && "code" in error && String(error.code) === "P2034") {
    console.error("Параллельно выполнена другая первичная настройка. Проверьте список ADMIN и повторите только если администраторов нет.");
  } else {
    console.error("Не удалось создать первого администратора. Проверьте DATABASE_URL и доступ к PostgreSQL.");
  }
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
