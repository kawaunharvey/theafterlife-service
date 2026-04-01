import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { TaxonomyService } from "./taxonomy.service";
import { TaxonomiesController } from "./taxonomy.controller";

@Module({
  imports: [PrismaModule],
  controllers: [TaxonomiesController],
  providers: [TaxonomyService],
  exports: [TaxonomyService],
})
export class TaxonomyModule {}
