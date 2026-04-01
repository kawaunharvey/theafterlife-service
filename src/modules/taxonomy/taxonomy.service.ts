import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";


/**
 * TaxonomyService
 * Manages taxonomy nodes and aliases with webhook event emission
 */
@Injectable()
export class TaxonomyService {
  private readonly logger = new Logger(TaxonomyService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Create a new taxonomy node
   */
  async createTaxonomyNode(data: any) {
    const node = await this.prisma.taxonomyNode.create({
      data: {
        key: data.key,
        kind: data.kind,
        name: data.name,
        description: data.description,
        group: data.group,
        parentId: data.parentId,
        metadata: data.metadata,
        isActive: true,
      },
    });

    return node;
  }

  /**
   * Update a taxonomy node
   */
  async updateTaxonomyNode(id: string, data: any) {
    const previous = await this.prisma.taxonomyNode.findUnique({
      where: { id },
    });

    const node = await this.prisma.taxonomyNode.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && {
          description: data.description,
        }),
        ...(data.group !== undefined && { group: data.group }),
        ...(data.parentId !== undefined && { parentId: data.parentId }),
        ...(data.metadata !== undefined && { metadata: data.metadata }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        updatedAt: new Date(),
      },
    });

    return node;
  }

  /**
   * Delete a taxonomy node (soft delete)
   */
  async deleteTaxonomyNode(id: string) {
    const previous = await this.prisma.taxonomyNode.findUnique({
      where: { id },
    });

    const node = await this.prisma.taxonomyNode.update({
      where: { id },
      data: { isActive: false },
    });

    return node;
  }

  /**
   * Create a new taxonomy alias
   */
  async createTaxonomyAlias(data: { taxonomyId: string; label: string }) {
    const alias = await this.prisma.taxonomyAlias.create({
      data: {
        taxonomyId: data.taxonomyId,
        label: data.label,
      },
      include: {
        taxonomy: true,
      }
    });

    return alias;
  }

  /**
   * Update a taxonomy alias
   */
  async updateTaxonomyAlias(id: string, data: any) {
    const previous = await this.prisma.taxonomyAlias.findUnique({
      where: { id },
    });

    const alias = await this.prisma.taxonomyAlias.update({
      where: { id },
      data: {
        ...(data.label && { label: data.label }),
      },
    });

    return alias;
  }

  /**
   * Delete a taxonomy alias
   */
  async deleteTaxonomyAlias(id: string) {
    const previous = await this.prisma.taxonomyAlias.findUnique({
      where: { id },
    });

    await this.prisma.taxonomyAlias.delete({
      where: { id },
    });

  }

  /**
   * Get taxonomy node by ID
   */
  async getTaxonomyNode(id: string) {
    return this.prisma.taxonomyNode.findUnique({
      where: { id },
      include: {
        aliases: true,
        parent: true,
        children: true,
      },
    });
  }

  /**
   * Get taxonomy node by key
   */
  async getTaxonomyNodeByKey(key: string) {
    return this.prisma.taxonomyNode.findUnique({
      where: { key },
      include: {
        aliases: true,
        parent: true,
        children: true,
      },
    });
  }

  /**
   * List taxonomy nodes with pagination
   */
  async listTaxonomyNodes(kind?: string, skip: number = 0, take: number = 50) {
    return this.prisma.taxonomyNode.findMany({
      where: {
        ...(kind && { kind: kind as any }),
        isActive: true,
      },
      include: {
        aliases: true,
      },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Count taxonomy nodes with optional filtering
   */
  async countTaxonomyNodes(kind?: string) {
    return this.prisma.taxonomyNode.count({
      where: {
        ...(kind && { kind: kind as any }),
        isActive: true,
      },
    });
  }

  async resolveTaxonomyNodesByKeys(keys: string[]): Promise<Record<string, string>> {
    if (keys.length === 0) {
      return {};
    }

    const nodes = await this.prisma.taxonomyNode.findMany({
      where: {
        key: { in: keys },
        isActive: true,
      },
      select: {
        key: true,
        name: true,
      },
    });

    return Object.fromEntries(nodes.map((node) => [node.key, node.name]));
  }

  /**
   * Get taxonomy alias by ID
   */
  async getTaxonomyAlias(id: string) {
    return this.prisma.taxonomyAlias.findUnique({
      where: { id },
      include: {
        taxonomy: true,
      },
    });
  }
}
