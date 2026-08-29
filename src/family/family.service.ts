import { Injectable, Logger, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FamilyService {
  private readonly logger = new Logger(FamilyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a family account. The creating customer becomes the owner.
   */
  async createFamilyAccount(ownerId: string, name: string) {
    const existing = await this.prisma.familyAccount.findUnique({ where: { ownerId } });
    if (existing) throw new ConflictException('You already own a family account.');

    const account = await this.prisma.familyAccount.create({
      data: {
        name,
        ownerId,
        members: {
          create: { customerId: ownerId, role: 'OWNER', status: 'ACTIVE' },
        },
      },
      include: { members: { include: { customer: true } } },
    });

    this.logger.log(`👪 Family account "${name}" created by customer ${ownerId}`);
    return account;
  }

  /**
   * Invite a customer to the family account by their phone number or customer ID.
   */
  async addMember(familyAccountId: string, requesterId: string, targetCustomerId: string) {
    const account = await this.prisma.familyAccount.findUnique({ where: { id: familyAccountId } });
    if (!account) throw new NotFoundException('Family account not found');
    if (account.ownerId !== requesterId) throw new BadRequestException('Only the owner can add members');

    // Check not already a member
    const existing = await this.prisma.familyMember.findUnique({
      where: { familyAccountId_customerId: { familyAccountId, customerId: targetCustomerId } },
    });
    if (existing) throw new ConflictException('This customer is already a member.');

    const member = await this.prisma.familyMember.create({
      data: { familyAccountId, customerId: targetCustomerId, role: 'MEMBER', status: 'PENDING' },
      include: { customer: true },
    });

    return member;
  }

  /**
   * Accept a family invitation.
   */
  async acceptInvitation(familyAccountId: string, customerId: string) {
    const member = await this.prisma.familyMember.findUnique({
      where: { familyAccountId_customerId: { familyAccountId, customerId } },
    });
    if (!member) throw new NotFoundException('Invitation not found');
    if (member.status === 'ACTIVE') throw new BadRequestException('Already active');

    return this.prisma.familyMember.update({
      where: { id: member.id },
      data: { status: 'ACTIVE' },
    });
  }

  /**
   * Remove a member from the family account.
   */
  async removeMember(familyAccountId: string, requesterId: string, targetCustomerId: string) {
    const account = await this.prisma.familyAccount.findUnique({ where: { id: familyAccountId } });
    if (!account) throw new NotFoundException('Family account not found');
    if (account.ownerId !== requesterId) throw new BadRequestException('Only the owner can remove members');
    if (targetCustomerId === requesterId) throw new BadRequestException('Cannot remove yourself. Delete the account instead.');

    return this.prisma.familyMember.delete({
      where: { familyAccountId_customerId: { familyAccountId, customerId: targetCustomerId } },
    });
  }

  /**
   * Get family account details with all members.
   */
  async getFamilyAccount(customerId: string) {
    // Check if they own one
    let account = await this.prisma.familyAccount.findUnique({
      where: { ownerId: customerId },
      include: { members: { include: { customer: true } } },
    });

    if (!account) {
      // Check if they're a member of one
      const membership = await this.prisma.familyMember.findFirst({
        where: { customerId, status: 'ACTIVE' },
        include: { familyAccount: { include: { members: { include: { customer: true } } } } },
      });
      account = membership?.familyAccount || null;
    }

    if (!account) return null;

    return {
      id: account.id,
      name: account.name,
      ownerId: account.ownerId,
      members: account.members.map((m: any) => ({
        id: m.id,
        customerId: m.customerId,
        name: m.customer.name,
        role: m.role,
        status: m.status,
      })),
    };
  }

  /**
   * Get all family accounts for admin dashboard.
   */
  async findAllFamilyAccounts() {
    const accounts = await this.prisma.familyAccount.findMany({
      include: {
        owner: true,
        members: {
          include: { customer: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return accounts.map(acc => {
      // Calculate trips from members (dummy logic for now since we don't track trips per family directly here, but we can sum customer rides)
      const mappedMembers = acc.members.map(m => ({
        name: m.customer?.name || 'Unknown',
        role: m.role,
        trips: m.customer?.totalRides || 0,
        status: m.status
      }));

      return {
        id: acc.id,
        ownerName: acc.owner?.name || 'Unknown Owner',
        ownerPhone: acc.owner?.phone || '—',
        plan: 'Premium', // Currently fixed
        members: mappedMembers,
        monthlyBudget: 50000, // Hardcoded for MVP dashboard
        spent: 0,
        status: 'active',
        safetyFeatures: ['Live Tracking', 'Trip Alerts'],
        joinDate: acc.createdAt.toISOString()
      };
    });
  }
}
