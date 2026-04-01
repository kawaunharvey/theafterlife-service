import {
  Injectable,
  OnModuleInit,
  BeforeApplicationShutdown,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, BeforeApplicationShutdown
{
  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URI,
        },
      },
    });
  }

  async onModuleInit() {
    await this.$runCommandRaw({
      createIndexes: "Location",
      indexes: [{ name: "point_2dsphere", key: { point: "2dsphere" } }],
    });
    await this.$runCommandRaw({
      createIndexes: "Post",
      indexes: [{ name: "point_2dsphere", key: { point: "2dsphere" } }],
    });
    await this.$connect();
  }

  async beforeApplicationShutdown() {
    await this.$disconnect();
  }
}
