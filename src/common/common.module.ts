import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { ContentServiceClient } from "./http-client/content-service.client";

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [
    ContentServiceClient,
  ],
  exports: [
    ContentServiceClient,
  ],
})
export class CommonModule {}
