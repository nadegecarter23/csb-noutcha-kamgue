import { Prisma, type NotificationChannel } from '@prisma/client';
import type { Database } from '../../platform/db.js';
import type { Logger } from '../../platform/logger.js';
import type { SmsProvider } from '../../platform/sms.js';
import { errors } from '../../platform/errors.js';
import { withPlatformScope, withSchoolScope } from '../../platform/school-scope.js';

const CRITICAL_TYPES = new Set([
  'PAYMENT_CONFIRMED',
  'PAYMENT_FAILED',
  'EXTERNAL_PAYMENT_VALIDATED',
  'EXTERNAL_PAYMENT_REJECTED',
  'EXTERNAL_PAYMENT_CORRECTION',
  'PAYMENT_REVERSED',
]);
const PAYMENT_TYPES = new Set([...CRITICAL_TYPES, 'RECEIPT_AVAILABLE']);
const REMINDER_TYPES = new Set([
  'INSTALLMENT_DUE_SOON',
  'INSTALLMENT_DUE_TODAY',
  'INSTALLMENT_OVERDUE',
  'BALANCE_REMINDER',
]);
const DEFAULT_TEMPLATES: Record<string, { title: string; body: string }> = {
  PAYMENT_CONFIRMED: {
    title: 'Paiement confirmé',
    body: 'Votre paiement de {{amount}} FCFA pour {{student}} a été confirmé.',
  },
  PAYMENT_FAILED: {
    title: 'Paiement non abouti',
    body: 'Le paiement de {{amount}} FCFA n’a pas abouti. Vous pouvez réessayer.',
  },
  EXTERNAL_PAYMENT_VALIDATED: {
    title: 'Paiement externe validé',
    body: 'Votre déclaration {{reference}} a été validée pour {{amount}} FCFA.',
  },
  EXTERNAL_PAYMENT_REJECTED: {
    title: 'Justificatif refusé',
    body: 'Votre déclaration {{reference}} a été refusée : {{reason}}',
  },
  EXTERNAL_PAYMENT_CORRECTION: {
    title: 'Correction demandée',
    body: 'Une correction est demandée pour {{reference}} : {{reason}}',
  },
  INSTALLMENT_DUE_SOON: {
    title: 'Échéance à venir',
    body: '{{count}} échéance(s) arrivent bientôt pour votre famille.',
  },
  INSTALLMENT_DUE_TODAY: {
    title: 'Échéance aujourd’hui',
    body: '{{count}} échéance(s) sont dues aujourd’hui.',
  },
  INSTALLMENT_OVERDUE: {
    title: 'Échéance en retard',
    body: '{{count}} échéance(s) restent impayées.',
  },
  EXTERNAL_PAYMENT_PENDING_SLA: {
    title: 'Validation en retard',
    body: '{{count}} paiement(s) externe(s) dépassent le délai de validation.',
  },
  BROADCAST: { title: '{{title}}', body: '{{body}}' },
};

const render = (value: string, variables: Record<string, string | number>) =>
  value.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => String(variables[key] ?? ''));
const dto = (row: {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Prisma.JsonValue;
  readAt: Date | null;
  createdAt: Date;
}) => ({
  id: row.id,
  type: row.type,
  title: row.title,
  body: row.body,
  data: row.data as Record<string, unknown>,
  readAt: row.readAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

export function createNotificationsService(db: Database, sms: SmsProvider, logger: Logger) {
  async function resolveTemplate(
    tx: Prisma.TransactionClient,
    schoolId: string | null,
    type: string,
    channel: NotificationChannel,
    variables: Record<string, string | number>,
    override?: { title?: string | undefined; body?: string | undefined },
  ) {
    const custom = schoolId
      ? await tx.notificationTemplate.findUnique({
          where: { schoolId_type_channel: { schoolId, type, channel } },
        })
      : null;
    const fallback = DEFAULT_TEMPLATES[type] ?? { title: type.replaceAll('_', ' '), body: '' };
    return {
      title: render(override?.title ?? custom?.title ?? fallback.title, variables),
      body: render(override?.body ?? custom?.body ?? fallback.body, variables),
      active: custom?.isActive ?? true,
    };
  }

  async function emit(input: {
    schoolId: string | null;
    userIds: string[];
    type: string;
    variables?: Record<string, string | number> | undefined;
    data?: Record<string, unknown> | undefined;
    channels?: NotificationChannel[] | undefined;
    critical?: boolean | undefined;
    dedupKey?: string | undefined;
    title?: string | undefined;
    body?: string | undefined;
  }) {
    const uniqueIds = [...new Set(input.userIds)];
    if (!uniqueIds.length) return [];
    return withPlatformScope(db, async (tx) => {
      const users = await tx.user.findMany({
        where: { id: { in: uniqueIds }, status: 'ACTIVE' },
        include: { notificationPreference: true, devices: { where: { status: 'ACTIVE' } } },
      });
      const schoolSettings = input.schoolId
        ? await tx.schoolSettings.findUnique({ where: { schoolId: input.schoolId } })
        : null;
      const critical = input.critical ?? CRITICAL_TYPES.has(input.type);
      const created = [];
      for (const user of users) {
        const preference = user.notificationPreference;
        if (!critical && PAYMENT_TYPES.has(input.type) && preference?.paymentEnabled === false)
          continue;
        if (!critical && REMINDER_TYPES.has(input.type) && preference?.reminderEnabled === false)
          continue;
        if (!critical && input.type === 'BROADCAST' && preference?.newsEnabled !== true) continue;
        const since = new Date();
        since.setUTCHours(0, 0, 0, 0);
        if (
          !critical &&
          !PAYMENT_TYPES.has(input.type) &&
          (await tx.notification.count({
            where: { userId: user.id, createdAt: { gte: since }, isCritical: false },
          })) >= 5
        )
          continue;
        const inApp = await resolveTemplate(
          tx,
          input.schoolId,
          input.type,
          'IN_APP',
          input.variables ?? {},
          { title: input.title, body: input.body },
        );
        let notification;
        try {
          notification = await tx.notification.create({
            data: {
              userId: user.id,
              schoolId: input.schoolId,
              type: input.type,
              title: inApp.title,
              body: inApp.body,
              data: (input.data ?? {}) as Prisma.InputJsonValue,
              dedupKey: input.dedupKey ? `${input.dedupKey}:${user.id}` : null,
              isCritical: critical,
            },
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
            continue;
          throw error;
        }
        const requested = new Set<NotificationChannel>(
          input.channels ?? ['IN_APP', 'PUSH', 'SMS', 'EMAIL'],
        );
        requested.add('IN_APP');
        const channels: NotificationChannel[] = ['IN_APP'];
        if (
          requested.has('PUSH') &&
          (critical || preference?.pushEnabled !== false) &&
          user.devices.length
        )
          channels.push('PUSH');
        if (
          requested.has('SMS') &&
          (critical || preference?.smsEnabled !== false) &&
          schoolSettings?.smsEnabled &&
          schoolSettings.smsAllowedTypes.includes(input.type)
        )
          channels.push('SMS');
        if (
          requested.has('EMAIL') &&
          (critical || preference?.emailEnabled !== false) &&
          user.email
        )
          channels.push('EMAIL');
        if (
          critical &&
          !user.devices.length &&
          !channels.includes('SMS') &&
          schoolSettings?.smsEnabled
        )
          channels.push('SMS');
        await tx.notificationDelivery.createMany({
          data: channels.map((channel) => ({
            notificationId: notification.id,
            schoolId: input.schoolId,
            channel,
            status: channel === 'IN_APP' ? 'DELIVERED' : 'PENDING',
            ...(channel === 'IN_APP' ? { sentAt: new Date(), deliveredAt: new Date() } : {}),
          })),
        });
        created.push(dto(notification));
      }
      return created;
    });
  }

  async function paymentRecipients(paymentId: string) {
    return withPlatformScope(db, async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { targets: true },
      });
      if (!payment) return { schoolId: null, userIds: [] as string[] };
      const guardians = await tx.studentGuardian.findMany({
        where: {
          studentId: { in: payment.targets.map((item) => item.studentId) },
          status: 'ACCEPTED',
          canViewFinances: true,
          canReceiveNotifications: true,
          guardian: { userId: { not: null }, status: 'ACTIVE', user: { status: 'ACTIVE' } },
        },
        select: { guardian: { select: { userId: true } } },
      });
      return {
        schoolId: payment.schoolId,
        userIds: [
          ...new Set(
            [payment.payerUserId, ...guardians.map((item) => item.guardian.userId)].filter(
              (id): id is string => Boolean(id),
            ),
          ),
        ],
      };
    });
  }

  async function emitForPayment(
    paymentId: string,
    type: string,
    variables: Record<string, string | number>,
    data: Record<string, unknown>,
    options?: { critical?: boolean },
  ) {
    const recipients = await paymentRecipients(paymentId);
    return emit({
      schoolId: recipients.schoolId,
      userIds: recipients.userIds,
      type,
      variables,
      data,
      critical: options?.critical,
    });
  }

  async function processPending(limit = 50) {
    const rows = await withPlatformScope(db, (tx) =>
      tx.notificationDelivery.findMany({
        where: { status: { in: ['PENDING', 'FAILED'] }, nextAttemptAt: { lte: new Date() } },
        include: {
          notification: {
            include: { user: { include: { devices: { where: { status: 'ACTIVE' } } } } },
          },
        },
        orderBy: { nextAttemptAt: 'asc' },
        take: limit,
      }),
    );
    let delivered = 0;
    for (const row of rows) {
      const claimed = await withPlatformScope(db, (tx) =>
        tx.notificationDelivery.updateMany({
          where: { id: row.id, status: { in: ['PENDING', 'FAILED'] } },
          data: { status: 'SENDING', attempts: { increment: 1 }, sentAt: new Date() },
        }),
      );
      if (!claimed.count) continue;
      try {
        let providerMessageId: string | undefined;
        let cost = 0;
        if (row.channel === 'PUSH') {
          const tokens = row.notification.user.devices.map((device) => device.pushToken);
          if (!tokens.length) throw new Error('Aucun appareil actif.');
          if (process.env.NODE_ENV !== 'test' && process.env.PUSH_PROVIDER === 'expo') {
            const response = await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(
                tokens.map((to) => ({
                  to,
                  title: row.notification.title,
                  body: row.notification.body,
                  data: row.notification.data,
                })),
              ),
            });
            if (!response.ok) throw new Error(`Expo Push HTTP ${response.status}`);
            const payload = (await response.json()) as {
              data?: Array<{ status?: string; details?: { error?: string } }>;
            };
            const invalidTokens = tokens.filter(
              (_token, index) => payload.data?.[index]?.details?.error === 'DeviceNotRegistered',
            );
            if (invalidTokens.length)
              await withPlatformScope(db, (tx) =>
                tx.device.updateMany({
                  where: { pushToken: { in: invalidTokens } },
                  data: { status: 'REVOKED' },
                }),
              );
            providerMessageId = `expo-${Date.now()}`;
          } else providerMessageId = `mock-push-${Date.now()}`;
        } else if (row.channel === 'SMS') {
          if (row.schoolId) {
            const schoolId = row.schoolId;
            const settings = await withPlatformScope(db, (tx) =>
              tx.schoolSettings.findUnique({ where: { schoolId } }),
            );
            const from = new Date();
            from.setUTCDate(1);
            from.setUTCHours(0, 0, 0, 0);
            const spent = await withPlatformScope(db, (tx) =>
              tx.notificationDelivery.aggregate({
                where: {
                  schoolId: row.schoolId,
                  channel: 'SMS',
                  status: 'DELIVERED',
                  createdAt: { gte: from },
                },
                _sum: { cost: true },
              }),
            );
            if (settings && (spent._sum.cost ?? 0n) >= settings.smsMonthlyLimit)
              throw new Error('Plafond SMS mensuel atteint.');
          }
          const result = await sms.send({
            to: row.notification.user.phone,
            body: row.notification.body
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .slice(0, 160),
            kind: row.notification.type,
          });
          providerMessageId = result.providerMessageId;
          cost = result.cost ?? 0;
        } else if (row.channel === 'EMAIL') providerMessageId = `mock-email-${Date.now()}`;
        await withPlatformScope(db, (tx) =>
          tx.notificationDelivery.update({
            where: { id: row.id },
            data: {
              status: 'DELIVERED',
              providerMessageId: providerMessageId ?? null,
              cost,
              deliveredAt: new Date(),
              error: null,
            },
          }),
        );
        delivered += 1;
      } catch (error) {
        const attempt = row.attempts + 1;
        const terminal = attempt >= row.maxAttempts;
        await withPlatformScope(db, (tx) =>
          tx.notificationDelivery.update({
            where: { id: row.id },
            data: {
              status: terminal ? 'DEAD_LETTER' : 'FAILED',
              error: error instanceof Error ? error.message.slice(0, 1000) : 'Erreur inconnue',
              nextAttemptAt: new Date(Date.now() + 2 ** attempt * 60_000),
            },
          }),
        );
        logger.warn(
          { deliveryId: row.id, channel: row.channel, err: error },
          terminal ? 'notification en dead-letter' : 'notification à réessayer',
        );
      }
    }
    return { processed: rows.length, delivered };
  }

  async function runScheduledReminders(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Douala',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    const localDate = `${pick('year')}-${pick('month')}-${pick('day')}`;
    const hour = Number(pick('hour'));
    const schools = await withPlatformScope(db, (tx) =>
      tx.school.findMany({ where: { status: 'ACTIVE' }, include: { settings: true } }),
    );
    let queued = 0;
    for (const school of schools) {
      const settings = school.settings;
      const start = settings?.notificationStartHour ?? 8;
      const end = settings?.notificationEndHour ?? 19;
      if (hour < start || hour >= end) continue;
      const before: number[] = settings?.reminderDaysBefore ?? [7, 1];
      const after: number[] = settings?.reminderDaysAfter ?? [7, 15, 30];
      const max = Math.max(0, ...before, ...after);
      const from = new Date(`${localDate}T00:00:00.000Z`);
      from.setUTCDate(from.getUTCDate() - max);
      const to = new Date(`${localDate}T00:00:00.000Z`);
      to.setUTCDate(to.getUTCDate() + max);
      const installments = await withSchoolScope(db, school.id, (tx) =>
        tx.studentFeeInstallment.findMany({
          where: {
            dueDate: { gte: from, lte: to },
            amount: { gt: 0 },
            assignment: { schoolId: school.id, status: { notIn: ['CANCELLED', 'WAIVED', 'PAID'] } },
          },
          include: {
            assignment: {
              include: {
                enrollment: {
                  include: {
                    student: {
                      include: {
                        guardianLinks: {
                          where: {
                            status: 'ACCEPTED',
                            canViewFinances: true,
                            canReceiveNotifications: true,
                          },
                          include: { guardian: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      );
      const groups = new Map<string, { userId: string; type: string; ids: string[] }>();
      const todayMs = Date.parse(`${localDate}T00:00:00.000Z`);
      for (const item of installments) {
        if (item.paidAmount >= item.amount) continue;
        const delta = Math.round((item.dueDate.getTime() - todayMs) / 86_400_000);
        const type =
          delta === 0
            ? 'INSTALLMENT_DUE_TODAY'
            : before.includes(delta)
              ? 'INSTALLMENT_DUE_SOON'
              : after.includes(-delta)
                ? 'INSTALLMENT_OVERDUE'
                : null;
        if (!type) continue;
        for (const link of item.assignment.enrollment.student.guardianLinks) {
          if (!link.guardian.userId) continue;
          const key = `${link.guardian.userId}:${type}`;
          const group = groups.get(key) ?? { userId: link.guardian.userId, type, ids: [] };
          group.ids.push(item.id);
          groups.set(key, group);
        }
      }
      for (const group of groups.values()) {
        queued += (
          await emit({
            schoolId: school.id,
            userIds: [group.userId],
            type: group.type,
            variables: { count: group.ids.length },
            data: { screen: 'family-balance' },
            channels: ['IN_APP', 'PUSH', 'SMS'],
            dedupKey: `reminder:${group.type}:${localDate}:${group.ids.sort().join(',')}`,
          })
        ).length;
      }
    }
    return { queued };
  }

  return {
    emit,
    emitForPayment,
    processPending,
    runScheduledReminders,
    async list(
      userId: string,
      query: { unread_only?: boolean | undefined; page?: number | undefined },
    ) {
      return withPlatformScope(db, async (tx) => {
        const page = query.page ?? 1;
        const size = 25;
        const where = { userId, ...(query.unread_only ? { readAt: null } : {}) };
        const [rows, total] = await Promise.all([
          tx.notification.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * size,
            take: size,
          }),
          tx.notification.count({ where }),
        ]);
        return {
          data: rows.map(dto),
          meta: { page, page_size: size, total, total_pages: Math.ceil(total / size) },
        };
      });
    },
    async read(userId: string, id: string) {
      return withPlatformScope(db, async (tx) => {
        const result = await tx.notification.updateMany({
          where: { id, userId },
          data: { readAt: new Date() },
        });
        if (!result.count) throw errors.notFound('Notification introuvable.');
      });
    },
    async readAll(userId: string) {
      return withPlatformScope(db, (tx) =>
        tx.notification.updateMany({
          where: { userId, readAt: null },
          data: { readAt: new Date() },
        }),
      );
    },
    async preferences(userId: string) {
      return withPlatformScope(db, (tx) =>
        tx.notificationPreference.upsert({ where: { userId }, create: { userId }, update: {} }),
      );
    },
    async updatePreferences(
      userId: string,
      input: {
        pushEnabled?: boolean | undefined;
        smsEnabled?: boolean | undefined;
        emailEnabled?: boolean | undefined;
        paymentEnabled?: boolean | undefined;
        reminderEnabled?: boolean | undefined;
        newsEnabled?: boolean | undefined;
      },
    ) {
      const data = {
        ...(input.pushEnabled !== undefined ? { pushEnabled: input.pushEnabled } : {}),
        ...(input.smsEnabled !== undefined ? { smsEnabled: input.smsEnabled } : {}),
        ...(input.emailEnabled !== undefined ? { emailEnabled: input.emailEnabled } : {}),
        ...(input.paymentEnabled !== undefined ? { paymentEnabled: input.paymentEnabled } : {}),
        ...(input.reminderEnabled !== undefined ? { reminderEnabled: input.reminderEnabled } : {}),
        ...(input.newsEnabled !== undefined ? { newsEnabled: input.newsEnabled } : {}),
      };
      return withPlatformScope(db, (tx) =>
        tx.notificationPreference.upsert({
          where: { userId },
          create: { userId, ...data },
          update: data,
        }),
      );
    },
    async registerDevice(
      userId: string,
      input: {
        token: string;
        platform: 'ANDROID' | 'IOS' | 'WEB';
        app_version?: string | undefined;
      },
    ) {
      return withPlatformScope(db, (tx) =>
        tx.device.upsert({
          where: { pushToken: input.token },
          create: {
            userId,
            pushToken: input.token,
            platform: input.platform,
            appVersion: input.app_version ?? null,
          },
          update: {
            userId,
            platform: input.platform,
            appVersion: input.app_version ?? null,
            status: 'ACTIVE',
            lastSeenAt: new Date(),
          },
        }),
      );
    },
    async deleteDevice(userId: string, token: string) {
      return withPlatformScope(db, async (tx) => {
        const result = await tx.device.updateMany({
          where: { userId, pushToken: token },
          data: { status: 'REVOKED' },
        });
        if (!result.count) throw errors.notFound('Appareil introuvable.');
      });
    },
    async devices(userId: string) {
      return withPlatformScope(db, (tx) =>
        tx.device.findMany({ where: { userId }, orderBy: { lastSeenAt: 'desc' } }),
      );
    },
    async revokeDevice(userId: string, id: string) {
      return withPlatformScope(db, async (tx) => {
        const result = await tx.device.updateMany({
          where: { id, userId },
          data: { status: 'REVOKED' },
        });
        if (!result.count) throw errors.notFound('Appareil introuvable.');
      });
    },
    async templates(schoolId: string) {
      return withSchoolScope(db, schoolId, (tx) =>
        tx.notificationTemplate.findMany({
          where: { schoolId },
          orderBy: [{ type: 'asc' }, { channel: 'asc' }],
        }),
      );
    },
    async updateTemplate(
      schoolId: string,
      input: {
        type: string;
        channel: NotificationChannel;
        title?: string | null | undefined;
        body: string;
        isActive?: boolean | undefined;
      },
    ) {
      if (input.channel === 'SMS' && (input.body.length > 160 || /[^\x20-\x7E]/.test(input.body)))
        throw errors.validation(
          'Un modèle SMS doit contenir au plus 160 caractères GSM-7, sans accents.',
        );
      return withSchoolScope(db, schoolId, (tx) =>
        tx.notificationTemplate.upsert({
          where: { schoolId_type_channel: { schoolId, type: input.type, channel: input.channel } },
          create: {
            schoolId,
            type: input.type,
            channel: input.channel,
            title: input.title ?? null,
            body: input.body,
            isActive: input.isActive ?? true,
          },
          update: {
            title: input.title ?? null,
            body: input.body,
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          },
        }),
      );
    },
    async preview(
      schoolId: string,
      input: {
        type: string;
        channel: NotificationChannel;
        title?: string | null | undefined;
        body: string;
        variables: Record<string, string>;
      },
    ) {
      void schoolId;
      return {
        title: render(input.title ?? '', input.variables),
        body: render(input.body, input.variables),
      };
    },
    async stats(schoolId: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const grouped = await tx.notificationDelivery.groupBy({
          by: ['channel', 'status'],
          where: { schoolId },
          _count: true,
          _sum: { cost: true },
        });
        const total = grouped.reduce((s, r) => s + r._count, 0);
        return {
          total,
          delivered: grouped
            .filter((r) => r.status === 'DELIVERED')
            .reduce((s, r) => s + r._count, 0),
          failed: grouped.filter((r) => r.status === 'FAILED').reduce((s, r) => s + r._count, 0),
          deadLetter: grouped
            .filter((r) => r.status === 'DEAD_LETTER')
            .reduce((s, r) => s + r._count, 0),
          smsCost: Number(
            grouped.reduce((s, r) => s + (r.channel === 'SMS' ? (r._sum.cost ?? 0n) : 0n), 0n),
          ),
          byChannel: Object.fromEntries(
            grouped.map((r) => [
              r.channel,
              grouped.filter((x) => x.channel === r.channel).reduce((s, x) => s + x._count, 0),
            ]),
          ),
        };
      });
    },
    async broadcast(
      schoolId: string,
      input: {
        title: string;
        body: string;
        channels: NotificationChannel[];
        data: Record<string, unknown>;
      },
    ) {
      const users = await withSchoolScope(db, schoolId, async (tx) =>
        (
          await tx.studentGuardian.findMany({
            where: {
              status: 'ACCEPTED',
              canReceiveNotifications: true,
              student: { schoolId },
              guardian: { userId: { not: null }, status: 'ACTIVE', user: { status: 'ACTIVE' } },
            },
            select: { guardian: { select: { userId: true } } },
          })
        )
          .map((row) => row.guardian.userId)
          .filter((id): id is string => Boolean(id)),
      );
      return emit({
        schoolId,
        userIds: users,
        type: 'BROADCAST',
        title: input.title,
        body: input.body,
        channels: input.channels,
        data: input.data,
      });
    },
  };
}

export type NotificationsService = ReturnType<typeof createNotificationsService>;
