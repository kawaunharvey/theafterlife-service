import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../prisma/prisma.module";
import { ShareController } from "./share.controller";
import { ShareService } from "./share.service";
import { ApiKeyService } from "../auth/api-key.service";
import { PlacesModule } from "../places/places.module";
import { MemorialsModule } from "../memorials/memorials.module";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [HttpModule, ConfigModule, PrismaModule, PlacesModule, MemorialsModule, UsersModule],
  controllers: [ShareController],
  providers: [ShareService, ApiKeyService],
  exports: [ShareService],
})
export class ShareModule {}
