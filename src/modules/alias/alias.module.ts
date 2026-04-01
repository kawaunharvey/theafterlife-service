import { Module } from "@nestjs/common";
import { AliasController } from "./alias.controller";
import { AliasService } from "./alias.service";
import { PrismaModule } from "../../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [AliasController],
  providers: [AliasService],
  exports: [AliasService],
})
export class AliasModule {}
