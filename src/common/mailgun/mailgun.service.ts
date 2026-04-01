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
}
