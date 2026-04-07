import { randomBytes, randomUUID } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { MailgunService } from "@/common/mailgun/mailgun.service";
import { WaitlistWebhookService } from "./waitlist-webhook.service";
import type { JoinWaitlistDto } from "./dto/join-waitlist.dto";
import type { AdminListWaitlistDto } from "./dto/admin-list-waitlist.dto";

const SETTINGS_ID = "singleton";

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailgun: MailgunService,
    private readonly webhooks: WaitlistWebhookService,
    private readonly config: ConfigService,
  ) {}

  // ─── Public ────────────────────────────────────────────────────────

  async join(dto: JoinWaitlistDto) {
    const settings = await this.getOrCreateSettings();

    if (!settings.isOpen) {
      throw new ForbiddenException("Waitlist is currently closed.");
    }

    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.waitlistEntry.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException("This email is already on the waitlist.");
    }

    // Silently discard unknown referral codes — don't block signup
    let referredBy: string | null = null;
    if (dto.referralCode) {
      const referrer = await this.prisma.waitlistEntry.findUnique({
        where: { referralCode: dto.referralCode },
      });
      if (referrer) {
        referredBy = dto.referralCode;
      }
    }

    const count = await this.prisma.waitlistEntry.count();
    const position = count + 1;
    const referralCode = this.generateReferralCode();
    const verificationToken = randomUUID();

    const entry = await this.prisma.waitlistEntry.create({
      data: {
        email,
        name: dto.name.trim(),
        referralCode,
        referredBy,
        position,
        verificationToken,
          metadata: (dto.metadata as Prisma.InputJsonValue) ?? null,
      },
    });

    const verificationLink = this.buildVerificationLink(verificationToken);
    await this.mailgun
      .sendWaitlistConfirmation(email, entry.name, position, verificationLink)
      .catch((err) =>
        this.logger.error("Confirmation email failed", err),
      );

    this.webhooks
      .emit("waitlist.signup", {
        id: entry.id,
        email: entry.email,
        position,
      })
      .catch((err) => this.logger.error("Webhook emit failed", err));

    return { id: entry.id, position: entry.position, referralCode: entry.referralCode };
  }

  async verifyToken(token: string) {
    const entry = await this.prisma.waitlistEntry.findFirst({
      where: { verificationToken: token },
    });

    if (!entry) {
      throw new NotFoundException("Verification link is invalid or already used.");
    }

    await this.prisma.waitlistEntry.update({
      where: { id: entry.id },
      data: {
        verified: true,
        verificationToken: null,
        status: "VERIFIED",
      },
    });

    if (entry.referredBy) {
      await this.boostReferrer(entry.referredBy).catch((err) =>
        this.logger.error("Referrer position boost failed", err),
      );
    }

    const updated = await this.prisma.waitlistEntry.findUnique({
      where: { id: entry.id },
    });

    this.webhooks
      .emit("waitlist.verified", { id: entry.id, email: entry.email })
      .catch((err) => this.logger.error("Webhook emit failed", err));

    return { success: true, position: updated!.position };
  }

  async getPosition(id: string) {
    const entry = await this.prisma.waitlistEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException("Waitlist entry not found.");

    const totalVerified = await this.prisma.waitlistEntry.count({
      where: { verified: true },
    });

    return { position: entry.position, totalVerified, status: entry.status };
  }

  async getReferralLink(id: string) {
    const entry = await this.prisma.waitlistEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException("Waitlist entry not found.");

    const baseUrl = this.getAppBaseUrl();
    return {
      referralCode: entry.referralCode,
      referralLink: `${baseUrl}?ref=${entry.referralCode}`,
    };
  }

  getVerifySuccessRedirectUrl(): string {
    return (
      this.config.get<string>("WAITLIST_VERIFY_SUCCESS_REDIRECT_URL") ??
      this.getAppBaseUrl()
    );
  }

  getVerifyFailureRedirectUrl(): string {
    return (
      this.config.get<string>("WAITLIST_VERIFY_FAILURE_REDIRECT_URL") ??
      `${this.getAppBaseUrl()}?waitlist=verify_failed`
    );
  }

  async getStatus() {
    const settings = await this.getOrCreateSettings();

    const [totalCount, verifiedCount, approvedCount] = await Promise.all([
      this.prisma.waitlistEntry.count(),
      this.prisma.waitlistEntry.count({ where: { verified: true } }),
      this.prisma.waitlistEntry.count({ where: { approved: true } }),
    ]);

    return {
      isOpen: settings.isOpen,
      referralsEnabled: settings.referralsEnabled,
      headline: settings.headline,
      signupWindowStart: settings.signupWindowStart,
      signupWindowEnd: settings.signupWindowEnd,
      totalCount,
      verifiedCount,
      approvedCount,
    };
  }

  // ─── Admin ──────────────────────────────────────────────────────────

  async adminList(dto: AdminListWaitlistDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

      const where: Prisma.WaitlistEntryWhereInput = {};

      if (dto.status) {
        where.status = dto.status;
      }
      if (dto.search) {
        where.OR = [
          { email: { contains: dto.search, mode: "insensitive" } },
          { name: { contains: dto.search, mode: "insensitive" } },
        ];
      }

      const orderBy: Prisma.WaitlistEntryOrderByWithRelationInput = {
        [dto.sortBy ?? "position"]: dto.sortOrder ?? "asc",
      };

      const [data, total] = await Promise.all([
        this.prisma.waitlistEntry.findMany({ where, orderBy, skip, take: limit }),
        this.prisma.waitlistEntry.count({ where }),
      ]);

    return {
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async adminExportCsv(): Promise<string> {
    const entries = await this.prisma.waitlistEntry.findMany({
      orderBy: { position: "asc" },
    });

    const headers = [
      "id",
      "email",
      "name",
      "position",
      "status",
      "verified",
      "approved",
      "referralCode",
      "referredBy",
      "createdAt",
    ];

    const escape = (v: unknown) =>
      `"${String(v ?? "").replace(/"/g, '""')}"`;

    const rows = entries.map((e) =>
      [
        e.id,
        e.email,
        e.name,
        e.position,
        e.status,
        e.verified,
        e.approved,
        e.referralCode,
        e.referredBy ?? "",
        e.createdAt.toISOString(),
      ]
        .map(escape)
        .join(","),
    );

    return [headers.join(","), ...rows].join("\n");
  }

  async adminApprove(id: string) {
    const entry = await this.prisma.waitlistEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException("Waitlist entry not found.");

    const updated = await this.prisma.waitlistEntry.update({
      where: { id },
      data: { approved: true, status: "APPROVED" },
    });

    await this.mailgun
      .sendWaitlistApproval(updated.email, updated.name)
      .catch((err) => this.logger.error("Approval email failed", err));

    this.webhooks
      .emit("waitlist.approved", { id: updated.id, email: updated.email })
      .catch((err) => this.logger.error("Webhook emit failed", err));

    return { success: true, entry: updated };
  }

  async adminStats() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const recent = await this.prisma.waitlistEntry.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const signupsMap: Record<string, number> = {};
    for (const e of recent) {
      const date = e.createdAt.toISOString().slice(0, 10);
      signupsMap[date] = (signupsMap[date] ?? 0) + 1;
    }
    const signupsPerDay = Object.entries(signupsMap).map(([date, count]) => ({
      date,
      count,
    }));

    const [totalCount, verifiedCount, approvedCount, referredAndVerified] =
      await Promise.all([
        this.prisma.waitlistEntry.count(),
        this.prisma.waitlistEntry.count({ where: { verified: true } }),
        this.prisma.waitlistEntry.count({ where: { approved: true } }),
        this.prisma.waitlistEntry.count({
          where: { referredBy: { not: null }, verified: true },
        }),
      ]);

    const referralConversionRate =
      verifiedCount > 0
        ? Math.round((referredAndVerified / verifiedCount) * 100)
        : 0;

    return {
      signupsPerDay,
      totalCount,
      verifiedCount,
      approvedCount,
      referralConversionRate,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private async boostReferrer(referralCode: string): Promise<void> {
    const referrer = await this.prisma.waitlistEntry.findUnique({
      where: { referralCode },
    });
    if (!referrer || referrer.position <= 1) return;

    const newPosition = referrer.position - 1;

    // Swap: push whoever is at newPosition one slot back, then pull referrer forward
    const displaced = await this.prisma.waitlistEntry.findFirst({
      where: { position: newPosition, id: { not: referrer.id } },
    });

    if (displaced) {
      await this.prisma.waitlistEntry.update({
        where: { id: displaced.id },
        data: { position: referrer.position },
      });
    }

    await this.prisma.waitlistEntry.update({
      where: { id: referrer.id },
      data: { position: newPosition },
    });

    await this.mailgun
      .sendReferralMovedUp(referrer.email, referrer.name, newPosition)
      .catch((err) =>
        this.logger.error("Referral moved-up email failed", err),
      );
  }

  private async getOrCreateSettings() {
    return this.prisma.waitlistSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });
  }

  private generateReferralCode(): string {
    return randomBytes(4).toString("base64url").slice(0, 7);
  }

  private buildVerificationLink(token: string): string {
    return `${this.getApiBaseUrl()}/waitlist/verify/${token}`;
  }

  private getApiBaseUrl(): string {
    return (
      this.config.get<string>("WAITLIST_API_BASE_URL") ??
      this.config.get<string>("SERVICE_PUBLIC_BASE_URL") ??
      "http://localhost:4000"
    );
  }

  private getAppBaseUrl(): string {
    return (
      this.config.get<string>("WAITLIST_APP_BASE_URL") ??
      "https://welcometotheafterlife.app"
    );
  }
}
