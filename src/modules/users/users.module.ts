import { Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { PlacesModule } from "@/modules/places/places.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
	imports: [PrismaModule, PlacesModule],
	controllers: [UsersController],
	providers: [UsersService],
	exports: [UsersService],
})
export class UsersModule {}
