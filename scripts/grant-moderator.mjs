const args = process.argv.slice(2);
const nickname = args[0];

if (args.length !== 1 || !/^[A-Za-z0-9_]{3,16}$/.test(nickname ?? "")) {
  console.error("Использование: npm run admin:grant-moderator -- MinecraftNick");
  process.exitCode = 1;
} else {
  const normalizedNickname = nickname.toLowerCase();
  let prisma;

  try {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { normalizedNickname } });

      if (!user) return { status: "missing" };
      if (user.role === "ADMIN") return { status: "admin", nickname: user.minecraftNickname };
      if (user.role === "MODERATOR") return { status: "already", nickname: user.minecraftNickname };

      await tx.user.update({
        where: { id: user.id },
        data: { role: "MODERATOR", sessionVersion: { increment: 1 } },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.auditLog.create({
        data: {
          action: "USER_ROLE_CHANGED",
          entityType: "User",
          entityId: user.id,
          metadata: {
            source: "admin:grant-moderator",
            fromRole: "PLAYER",
            toRole: "MODERATOR",
          },
        },
      });

      return { status: "promoted", nickname: user.minecraftNickname };
    });

    if (result.status === "missing") {
      console.error(`Аккаунт ${nickname} не найден. Сначала создайте PLAYER через панель /admin.`);
      process.exitCode = 1;
    } else if (result.status === "admin") {
      console.error(`Аккаунт ${result.nickname} уже ADMIN; понижение роли запрещено.`);
      process.exitCode = 1;
    } else if (result.status === "already") {
      console.log(`Аккаунт ${result.nickname} уже MODERATOR; изменений не требуется.`);
    } else {
      console.log(`Готово: ${result.nickname} теперь MODERATOR. Сессии отозваны, запись добавлена в AuditLog.`);
    }
  } catch {
    console.error("Не удалось изменить роль. Проверьте DATABASE_URL, миграции и доступ к PostgreSQL.");
    process.exitCode = 1;
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}
