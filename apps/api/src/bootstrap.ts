import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, ROLES, permissionsForRole } from '@cplan/contracts';
import { requirePhone } from '@cplan/domain';
import { z } from 'zod';
import { hashPassword } from './platform/crypto.js';

const bootstrapSchema = z.object({
  DATABASE_MIGRATION_URL: z.string().url().optional(),
  DATABASE_URL: z.string().url(),
  BOOTSTRAP_SCHOOL_CODE: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .transform((value) => value.toUpperCase()),
  BOOTSTRAP_SCHOOL_NAME: z.string().trim().min(2).max(160),
  BOOTSTRAP_ADMIN_FIRST_NAME: z.string().trim().min(2).max(80),
  BOOTSTRAP_ADMIN_LAST_NAME: z.string().trim().min(2).max(80),
  BOOTSTRAP_ADMIN_EMAIL: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  BOOTSTRAP_ADMIN_PHONE: z.string().trim().min(8),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(16),
});

const parsed = bootstrapSchema.safeParse(process.env);
if (!parsed.success) {
  process.stderr.write(
    `Configuration du bootstrap invalide :\n${parsed.error.issues
      .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')}\n`,
  );
  process.exit(1);
}

const env = parsed.data;
const prisma = new PrismaClient({
  datasources: { db: { url: env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL } },
});

async function bootstrap(): Promise<void> {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: { description: permission.description, group: permission.group },
      create: {
        code: permission.code,
        description: permission.description,
        group: permission.group,
      },
    });
  }
  const permissionIds = new Map(
    (await prisma.permission.findMany({ select: { id: true, code: true } })).map((permission) => [
      permission.code,
      permission.id,
    ]),
  );
  for (const definition of ROLES) {
    const existing = await prisma.role.findFirst({
      where: { code: definition.code, schoolId: null },
    });
    const role = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: {
            name: definition.name,
            description: definition.description,
            isSystem: true,
          },
        })
      : await prisma.role.create({
          data: {
            code: definition.code,
            name: definition.name,
            description: definition.description,
            isSystem: true,
          },
        });
    const codes = permissionsForRole(definition);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: codes.flatMap((code) => {
        const permissionId = permissionIds.get(code);
        return permissionId ? [{ roleId: role.id, permissionId }] : [];
      }),
      skipDuplicates: true,
    });
  }

  const school = await prisma.school.upsert({
    where: { code: env.BOOTSTRAP_SCHOOL_CODE },
    update: { name: env.BOOTSTRAP_SCHOOL_NAME, status: 'ACTIVE' },
    create: {
      code: env.BOOTSTRAP_SCHOOL_CODE,
      name: env.BOOTSTRAP_SCHOOL_NAME,
      status: 'ACTIVE',
    },
  });
  await prisma.schoolSettings.upsert({
    where: { schoolId: school.id },
    update: {},
    create: { schoolId: school.id },
  });

  const phone = requirePhone(env.BOOTSTRAP_ADMIN_PHONE).e164;
  let admin = await prisma.user.findUnique({ where: { phone } });
  if (!admin) {
    const emailOwner = await prisma.user.findUnique({
      where: { email: env.BOOTSTRAP_ADMIN_EMAIL },
    });
    if (emailOwner)
      throw new Error('L’adresse e-mail du bootstrap appartient déjà à un autre compte.');
    admin = await prisma.user.create({
      data: {
        firstName: env.BOOTSTRAP_ADMIN_FIRST_NAME,
        lastName: env.BOOTSTRAP_ADMIN_LAST_NAME,
        email: env.BOOTSTRAP_ADMIN_EMAIL,
        phone,
        passwordHash: await hashPassword(env.BOOTSTRAP_ADMIN_PASSWORD),
        mustChangePassword: true,
        status: 'ACTIVE',
        phoneVerifiedAt: new Date(),
        emailVerifiedAt: new Date(),
      },
    });
  } else {
    admin = await prisma.user.update({
      where: { id: admin.id },
      data: {
        firstName: env.BOOTSTRAP_ADMIN_FIRST_NAME,
        lastName: env.BOOTSTRAP_ADMIN_LAST_NAME,
        email: env.BOOTSTRAP_ADMIN_EMAIL,
        status: 'ACTIVE',
      },
    });
  }

  const role = await prisma.role.findFirstOrThrow({
    where: { code: 'SCHOOL_ADMIN', schoolId: null },
  });
  const roleLink = await prisma.userRole.findFirst({
    where: { userId: admin.id, roleId: role.id, schoolId: school.id },
  });
  if (!roleLink) {
    await prisma.userRole.create({
      data: { userId: admin.id, roleId: role.id, schoolId: school.id },
    });
  }
  await prisma.staffProfile.upsert({
    where: { userId_schoolId: { userId: admin.id, schoolId: school.id } },
    update: { jobTitle: 'Administrateur' },
    create: { userId: admin.id, schoolId: school.id, jobTitle: 'Administrateur' },
  });

  process.stdout.write(
    `Bootstrap terminé : ${school.name} · administrateur ${admin.email ?? admin.phone}.\n`,
  );
}

bootstrap()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
