import { PrismaService } from "@/prisma/prisma.service"
import { Injectable } from "@nestjs/common"


enum TrackableTarget {
    POST = "POST",
    MEMORIAL = "MEMORIAL",
    BUSINESS = "BUSINESS",
    COMMENT = "COMMENT",
    DTE = "DTE",
}

enum Interactions {
    FOLLOW = "FOLLOW",
    UNFOLLOW = "UNFOLLOW",
    LIKE = "LIKE",
    UNLIKE = "UNLIKE",
    COMMENT = "COMMENT",
    SHARE = "SHARE",
    REPORT = "REPORT"
}

@Injectable()
export class AnalyticsService {
    constructor(
        private readonly prisma: PrismaService,
    ) {}

    async recordImpression(userId: string, payload: {
        targetId: string
        targetType: TrackableTarget
        sessionId: string
    }) {
        await this.prisma.interaction.create({
            data: {
                type: 'IMPRESSION',
                targetId: payload.targetId,
                targetType: payload.targetType,
                userId,
                sessionId: payload.sessionId,
            }
        })
    }

    async recordInteraction(userId: string, payload: {
        type: Interactions
        targetId: string
        targetType: TrackableTarget
        sessionId: string
    } ) {
        await this.prisma.interaction.create({
            data: {
                type: payload.type,
                targetId: payload.targetId,
                targetType: payload.targetType,
                userId,
                sessionId: payload.sessionId,
            }
        })
    }

    async trackLike(userId: string, targetId: string, targetType: TrackableTarget.POST | TrackableTarget.COMMENT, sessionId: string) {
        await this.recordInteraction(userId, {
            type: Interactions.LIKE,
            targetId,
            targetType,
            sessionId,
        })
    }

    async trackFollow(userId: string, targetId: string, targetType: TrackableTarget.MEMORIAL, sessionId: string) {
        await this.recordInteraction(userId, {
            type: Interactions.FOLLOW,
            targetId,
            targetType,
            sessionId,
        })
    }

    async trackComment(userId: string, targetId: string, targetType: TrackableTarget.POST | TrackableTarget.COMMENT, sessionId: string) {
        await this.recordInteraction(userId, {
            type: Interactions.COMMENT,
            targetId,
            targetType,
            sessionId,
        })
    }

    async trackShare(userId: string, targetId: string, targetType: TrackableTarget.POST | TrackableTarget.MEMORIAL, sessionId: string) {
        await this.recordInteraction(userId, {
            type: Interactions.SHARE,
            targetId,
            targetType,
            sessionId,
        })
    }

    async trackReport(userId: string, targetId: string, targetType: TrackableTarget.POST | TrackableTarget.COMMENT | TrackableTarget.MEMORIAL | TrackableTarget.BUSINESS, sessionId: string) {
        await this.recordInteraction(userId, {
            type: Interactions.REPORT,
            targetId,
            targetType,
            sessionId,
        })
    }
}
