import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";

@Injectable()
export class MailgunService {
  private logger = new Logger(MailgunService.name);

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {}

  async sendVerificationCode(email: string, code: string): Promise<void> {
    const apiKey = this.config.get<string>("MAILGUN_API_KEY");
    const domain = this.config.get<string>("MAILGUN_DOMAIN");
    const from =
      this.config.get<string>("MAILGUN_FROM") ||
      (domain ? `Afterlife <no-reply@${domain}>` : undefined);

    if (!apiKey || !domain || !from) {
      this.logger.warn("Mailgun config missing; skipping verification code email.");
      return;
    }

    const url = `https://api.mailgun.net/v3/${domain}/messages`;
    const form = new URLSearchParams();
    form.set("from", from);
    form.set("to", email);
    form.set("subject", "Your verification code");
    form.set("text", `Your verification code is: ${code}\n\nThis code will expire in 15 minutes.`);

    await firstValueFrom(
      this.http.post(url, form.toString(), {
        auth: {
          username: "api",
          password: apiKey,
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }),
    );
  }

    async sendWaitlistConfirmation(
      email: string,
      name: string,
      position: number,
      verificationLink: string,
    ): Promise<void> {
      const { url, form } = this.buildBaseForm(email);
      if (!url || !form) return;

      form.set("subject", "Confirm your spot on the waitlist");
      form.set(
        "text",
        `Hi ${name},\n\nYou're #${position} on the waitlist!\n\nClick the link below to confirm your email and secure your spot:\n${verificationLink}\n\nWelcome to the Afterlife.`,
      );

      await this.send(url, form);
    }

    async sendReferralMovedUp(
      email: string,
      name: string,
      newPosition: number,
    ): Promise<void> {
      const { url, form } = this.buildBaseForm(email);
      if (!url || !form) return;

      form.set("subject", "You moved up the waitlist!");
      form.set(
        "text",
        `Great news, ${name}!\n\nSomeone you referred just confirmed their email. You're now #${newPosition} on the waitlist.\n\nKeep sharing to move up even further.\n\nWelcome to the Afterlife.`,
      );

      await this.send(url, form);
    }

    async sendWaitlistApproval(email: string, name: string): Promise<void> {
      const { url, form } = this.buildBaseForm(email);
      if (!url || !form) return;

      form.set("subject", "You're in — Welcome to the Afterlife");
      form.set(
        "text",
        `Hi ${name},\n\nYour waitlist spot has been approved. You now have access.\n\nWelcome to the Afterlife.`,
      );

      await this.send(url, form);
    }

    private buildBaseForm(
      email: string,
    ): { url: string; form: URLSearchParams } | { url: null; form: null } {
      const apiKey = this.config.get<string>("MAILGUN_API_KEY");
      const domain = this.config.get<string>("MAILGUN_DOMAIN");
      const from =
        this.config.get<string>("MAILGUN_FROM") ||
        (domain ? `Afterlife <no-reply@${domain}>` : undefined);

      if (!apiKey || !domain || !from) {
        this.logger.warn("Mailgun config missing; skipping email.");
        return { url: null, form: null };
      }

      const form = new URLSearchParams();
      form.set("from", from);
      form.set("to", email);

      return { url: `https://api.mailgun.net/v3/${domain}/messages`, form };
    }

    private async send(url: string, form: URLSearchParams): Promise<void> {
      const apiKey = this.config.get<string>("MAILGUN_API_KEY")!;
      await firstValueFrom(
        this.http.post(url, form.toString(), {
          auth: { username: "api", password: apiKey },
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }),
      );
    }
}
