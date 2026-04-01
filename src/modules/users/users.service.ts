import { Injectable } from "@nestjs/common";
import { FollowTargetType } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { GooglePlacesClient } from "@/modules/places/google-places.client";
import { UpdateUserDto } from "./dto/update-user.dto";
import { MutualsQueryDto } from "./dto/mutuals-query.dto";

@Injectable()
export class UsersService {
	constructor(
		private prisma: PrismaService,
		private googlePlaces: GooglePlacesClient,
	) {}

	async findById(id: string) {
		return this.prisma.user.findUnique({ where: { id } });
	}

	async findOrCreateByEmail(email: string) {
		return this.prisma.user.upsert({
			where: { email },
			update: {},
			create: {
				email,
				roles: [],
			},
		});
	}

	async isHandleAvailable(handle: string): Promise<boolean> {
		const existing = await this.prisma.user.findUnique({
			where: { handle },
			select: { id: true },
		});
		return !existing;
	}

	async reverseLocation(lat: number, lng: number) {
		const result = await this.googlePlaces.reverseGeocode(lat, lng);
		console.log("[UsersService] Reverse geocode result:", { lat, lng, result });
		return {
			lat,
			lng,
			...result,
		};
	}

	async getMutuals(userId: string, dto: MutualsQueryDto) {
		const myFollows = await this.prisma.follow.findMany({
			where: { userId, targetType: FollowTargetType.MEMORIAL },
			select: { targetId: true },
		});

		const memorialIds = myFollows.map((f) => f.targetId);
		if (memorialIds.length === 0) return { users: [], nextCursor: undefined };

		const coFollows = await this.prisma.follow.findMany({
			where: {
				targetType: FollowTargetType.MEMORIAL,
				targetId: { in: memorialIds },
				userId: { not: userId },
			},
			select: { userId: true },
		});

		const mutualUserIds = [...new Set(coFollows.map((f) => f.userId))];
		if (mutualUserIds.length === 0) return { users: [], nextCursor: undefined };

		const cursorId = dto.cursor
			? JSON.parse(Buffer.from(dto.cursor, "base64url").toString()).id as string
			: undefined;

		const users = await this.prisma.user.findMany({
			where: {
				id: { in: mutualUserIds },
				...(dto.q && {
					OR: [
						{ name: { contains: dto.q, mode: "insensitive" } },
						{ handle: { contains: dto.q, mode: "insensitive" } },
					],
				}),
			},
			select: { id: true, name: true, handle: true, imageUrl: true },
			orderBy: { name: "asc" },
			take: 21,
			...(cursorId && { cursor: { id: cursorId }, skip: 1 }),
		});

		const hasMore = users.length > 20;
		const results = hasMore ? users.slice(0, 20) : users;
		const nextCursor = hasMore
			? Buffer.from(JSON.stringify({ id: results[results.length - 1].id })).toString("base64url")
			: undefined;

		return { users: results, nextCursor };
	}

	async updateUser(id: string, dto: UpdateUserDto) {
		return this.prisma.user.update({
			where: { id },
			data: {
				...(dto.name && { name: dto.name }),
				...(dto.handle && { handle: dto.handle }),
				...(dto.dateOfBirth && { dateOfBirth: new Date(dto.dateOfBirth) }),
				...(dto.imageUrl && { imageUrl: dto.imageUrl }),
			},
		});
	}
}
