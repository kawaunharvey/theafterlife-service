import { CacheModule } from "@nestjs/cache-manager"
import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { validateEnv } from "@/config/env"
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { PrismaModule } from "./prisma/prisma.module"
import { AuthModule } from "@/modules/auth/auth.module"
import { UsersModule } from "@/modules/users/users.module"
import { AppDataModule } from "./modules/app-data/app-data.module"
import { PlacesModule } from "./modules/places/places.module"
import { UploadsModule } from "./modules/uploads/uploads.module"
import { TaxonomyModule } from "./modules/taxonomy/taxonomy.module"
import { BlueprintsModule } from "./modules/blueprints/blueprints.module"
import { UnderworldModule } from "./modules/underworld/underworld.module"
import { AliasModule } from "./modules/alias/alias.module"
import { MemorialsModule } from "@/modules/memorials/memorials.module"
import { SubscriptionsModule } from "@/modules/subscriptions/subscriptions.module"
import { FeedsModule } from "@/modules/feeds/feeds.module"
import { ShareModule } from "./modules/share/share.module"
import { WaitlistModule } from "./modules/waitlist/waitlist.module"

const isWatchMode = process.argv.includes("--watch");
const isPrettyLogRequested = process.env.LOG_PRETTY === "true";
const isPrettyLoggingEnabled =
  process.env.NODE_ENV !== "production" || isWatchMode || isPrettyLogRequested;

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: isPrettyLoggingEnabled ? "debug" : "info",
        transport:
          isPrettyLoggingEnabled
            ? {
                target: "pino-pretty",
                options: {
                  singleLine: false,
                  colorize: true,
                  levelFirst: true,
                  translateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss.l'Z'",
                  ignore: "pid,hostname,req.headers,res.headers,req.remoteAddress,req.remotePort",
                  messageFormat: "{msg}",
                },
              }
            : undefined,
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url,
          }),
          res: (res) => ({
            statusCode: res.statusCode,
          }),
        },
      },
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        console.log("✅ Cache manager initialized (memory store)");
        return {};
      },
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 60, // 60 requests per TTL
      },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    AppDataModule,
    PlacesModule,
    UploadsModule,
    TaxonomyModule,
    BlueprintsModule,
    UnderworldModule,
    AliasModule,
    MemorialsModule,
    SubscriptionsModule,
    FeedsModule,
      ShareModule,
      WaitlistModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
