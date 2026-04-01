import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiKeyService } from "../api-key.service";

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private apiKeys: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const rawHeader = request.headers["x-api-key"] || request.headers["X-API-KEY"];
    const authHeader = request.headers["authorization"];    
    const rawKey =
      typeof rawHeader === "string"
        ? rawHeader
        : Array.isArray(rawHeader)
          ? rawHeader[0]
          : undefined;

    const headerKey = this.parseAuthorizationHeader(authHeader);
    const apiKey = rawKey || headerKey;

    if (!apiKey) {
      throw new UnauthorizedException("Missing API key.");
    }

    const record = await this.apiKeys.validateApiKey(apiKey);
    if (!record) {
      throw new UnauthorizedException("Invalid API key.");
    }

    request.apiKey = record;
    return true;
  }

  private parseAuthorizationHeader(header: unknown): string | undefined {
    if (typeof header !== "string") {
      return undefined;
    }
    const [scheme, token] = header.split(" ");
    if (!scheme || !token) {
      return undefined;
    }
    if (scheme.toLowerCase() !== "apikey") {
      return undefined;
    }
    return token;
  }
}
