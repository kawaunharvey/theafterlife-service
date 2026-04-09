import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import type { Cache } from "cache-manager";
import { PrismaService } from "@/prisma/prisma.service";
import { Env } from "@/config/env";
import { GooglePlacesClient } from "../places/google-places.client";
import { UsersService } from "../users/users.service";
import { MemoryService } from "../memorials/memory.service";
import { SubmitShareMemoryDto } from "./share.dto";

@Injectable()
export class ShareService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService<Env, true>,
        private readonly googlePlaces: GooglePlacesClient,
        private readonly usersService: UsersService,
        private readonly memoryService: MemoryService,
        @Inject(CACHE_MANAGER) private readonly cache: Cache,
    ) {}

    private readonly defaultMemorialSelect = {
        id: true,
        displayName: true,
        slug: true,
        theme: true,
        salutation: true,
        yearOfBirth: true,
        yearOfPassing: true,
        coverAssetUrl: true,
        liveObituaries: true,
        shareUrl: true,
        iosAppUrl: true,
        androidAppUrl: true,
    };

    async getMemorialBySlug(slug: string) {
        const memorial = await this.prisma.memorial.findUnique({
            where: { slug },
            select: { ...this.defaultMemorialSelect }
        });

        return memorial;
    }

    async getMemorialById(id: string) {
        const memorial = await this.prisma.memorial.findUnique({
            where: { id },
            select: { ...this.defaultMemorialSelect }
        });

        return memorial;
    }

    async getPromptList() {
        const prompts = await this.prisma.decorator.findMany({
            where: { type: "PROMPT" },
            select: {
                id: true,
                label: true,
            }
        });

        return prompts
            .sort(() => Math.random() - 0.5)
            .slice(0, 6);
    }

    async getLocationFromCoordinates(lat: number, lng: number) {
        const cacheKey = `share:location:${lat.toFixed(2)}:${lng.toFixed(2)}`;
        const cached = await this.cache.get<{ city?: string; state?: string }>(cacheKey);
        if (cached) return cached;
        console.log(`Cache miss for location ${lat}, ${lng}. Fetching from Google Places API...`);

        const result = await this.googlePlaces.reverseGeocode(lat, lng);
        const location = { city: result.city, state: result.state };
        await this.cache.set(cacheKey, location, 604800); // 7 days
        return location;
    }

    async getPromptById(id: string) {
        const prompt = await this.prisma.decorator.findUnique({
            where: { id },
            select: {
                id: true,
                label: true,
            }
        })

        return prompt;
    }

    async submitMemory(memorialId: string, dto: SubmitShareMemoryDto) {
        const memorial = await this.prisma.memorial.findUnique({
            where: { id: memorialId },
            select: { id: true, status: true },
        });

        if (!memorial) throw new NotFoundException("Memorial not found");
        if (memorial.status !== "ACTIVE") throw new ForbiddenException("Memorial is not active");

        const user = await this.usersService.findOrCreateByEmail(dto.email);

        await this.prisma.memorialRelationship.upsert({
            where: { memorialId_userId: { memorialId, userId: user.id } },
            update: {},
            create: {
                memorialId,
                userId: user.id,
                relationship: dto.relationship,
                qualifier: dto.qualifiers ?? [],
            },
        });

        return this.memoryService.createMemory(user.id, memorialId, {
            body: dto.body,
            lat: dto.lat,
            lng: dto.lng,
            assetIds: dto.media,
            prompt: dto.prompt,
            visibility: dto.visibility,
        });
    }


    async getRelationships() {
        return {
            relationships: await this.prisma.decorator.findMany({
                where: { type: "RELATIONSHIP" },
            })
        }
    }
}
