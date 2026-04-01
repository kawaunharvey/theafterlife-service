import { Controller, Get, Patch, Query, Body, UnauthorizedException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { UsersService } from "./users.service";
import { CurrentUser } from "@/modules/auth/decorators/current-user.decorator";
import { UseJwtAuth } from "@/modules/auth/decorators/use-jwt-auth.decorator";
import { HandleAvailabilityDto } from "./dto/handle-availability.dto";
import { ReverseLocationDto } from "./dto/reverse-location.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { MutualsQueryDto } from "./dto/mutuals-query.dto";

@ApiTags("users")
@Controller("users")
export class UsersController {
	constructor(private users: UsersService) {}

	@Get("me")
	@UseJwtAuth()
	async me(@CurrentUser() user: { sub?: string } | undefined) {
		if (!user?.sub) {
			throw new UnauthorizedException();
		}

		return this.users.findById(user.sub);
	}

	@Patch("me")
	@UseJwtAuth()
	async updateMe(
		@CurrentUser() user: { sub?: string } | undefined,
		@Body() dto: UpdateUserDto,
	) {
		if (!user?.sub) {
			throw new UnauthorizedException();
		}

		return this.users.updateUser(user.sub, dto);
	}

	@Get("mutuals")
	@UseJwtAuth()
	async getMutuals(
		@CurrentUser() user: { sub?: string } | undefined,
		@Query() query: MutualsQueryDto,
	) {
		if (!user?.sub) throw new UnauthorizedException();
		return this.users.getMutuals(user.sub, query);
	}

	@Get("handle-availability")
	async handleAvailability(@Query() query: HandleAvailabilityDto) {
		const handle = query.handle.trim();
		const available = await this.users.isHandleAvailable(handle);
		return { available };
	}

	@Get("locations/reverse")
	async reverseLocation(@Query() query: ReverseLocationDto) {
		return this.users.reverseLocation(query.lat, query.lng);
	}
}
