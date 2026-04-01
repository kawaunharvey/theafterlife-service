import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";

@Injectable()
export class JwtTokenService {
  constructor(private config: ConfigService) {}

  async sign(payload: JwtPayload | Record<string, unknown>, expiresInSeconds: number) {
    const secret = this.config.get<string>("JWT_SECRET", "changeme");
    const options: SignOptions = {
      expiresIn: expiresInSeconds,
    };

    return jwt.sign(payload, secret, options);
  }
}
