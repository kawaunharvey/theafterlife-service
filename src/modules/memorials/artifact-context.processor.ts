import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { ArtifactContextStatus } from "@prisma/client";
import { Job } from "bullmq";
import { PrismaService } from "@/prisma/prisma.service";

export interface ArtifactContextJobData {
  artifactId: string;
}

@Injectable()
@Processor("artifact-context")
export class ArtifactContextProcessor extends WorkerHost {
  private readonly logger = new Logger(ArtifactContextProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ArtifactContextJobData>): Promise<void> {
    const { artifactId } = job.data;
    this.logger.log(`Processing artifact context for artifactId=${artifactId}`);

    await this.prisma.artifact.update({
      where: { id: artifactId },
      data: { contextStatus: ArtifactContextStatus.PROCESSING },
    });

    // TODO: generate context via AI (vision model, article scraping, etc.)

    this.logger.log(`Artifact context job complete (stub) for artifactId=${artifactId}`);
  }
}
