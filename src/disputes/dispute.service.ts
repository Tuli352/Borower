import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class DisputeService {
  private readonly logger = new Logger(DisputeService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private trackingGateway: TrackingGateway,
    private paymentsService: PaymentsService,
  ) {}

  // Create a new dispute
  async createDispute(data: {
    orderId: string;
    complainantId: string;
    complainantType: 'customer' | 'rider' | 'vendor';
    respondentId: string;
    respondentType: 'customer' | 'rider' | 'vendor' | 'admin';
    category: string;
    description: string;
    evidence?: {
      images?: string[];
      videos?: string[];
      audio?: string[];
      documents?: string[];
    };
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  }) {
    try {
      // Validate order exists
      const order = await this.prisma.order.findUnique({
        where: { id: data.orderId },
        include: { customer: true, rider: true }
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      // Check if dispute already exists for this order
      const existingDispute = await this.prisma.dispute.findFirst({
        where: {
          orderId: data.orderId,
          status: { notIn: ['Resolved', 'Dismissed'] }
        }
      });

      if (existingDispute) {
        throw new BadRequestException('A dispute is already open for this order');
      }

      // Auto-categorize and prioritize based on content
      const { category, priority, severity } = await this.analyzeDisputeContent(data.description, data.category);

      // Create dispute record
      const dispute = await this.prisma.dispute.create({
        data: {
          orderId: data.orderId,
          complainantId: data.complainantId,
          complainantType: data.complainantType,
          respondentId: data.respondentId,
          respondentType: data.respondentType,
          category,
          description: data.description,
          evidence: data.evidence ? JSON.stringify(data.evidence) : null,
          priority: priority || data.priority || 'medium',
          severity,
          status: 'Open',
          autoResolutionAttempted: false,
          createdAt: new Date(),
        }
      });

      // Try automated resolution first
      const autoResolution = await this.attemptAutomatedResolution(dispute.id, order);
      
      if (autoResolution.resolved) {
        await this.updateDisputeStatus(dispute.id, 'Resolved', autoResolution.resolution);
        this.logger.log(`Dispute ${dispute.id} resolved automatically: ${autoResolution.reason}`);
      } else {
        // Escalate to human review
        await this.escalateToHumanReview(dispute.id);
        await this.notifyParties(dispute.id, 'created');
      }

      return {
        success: true,
        dispute,
        autoResolved: autoResolution.resolved,
        resolution: autoResolution.resolved ? autoResolution.resolution : null
      };
    } catch (error) {
      this.logger.error(`Failed to create dispute: ${error.message}`);
      throw error;
    }
  }

  // Analyze dispute content for automatic categorization
  private async analyzeDisputeContent(description: string, providedCategory: string): Promise<{
    category: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    severity: number;
  }> {
    const lowerDesc = description.toLowerCase();
    
    // Keyword-based categorization
    let category = providedCategory;
    let priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium';
    let severity = 5;

    // Safety-related disputes are high priority
    if (lowerDesc.includes('accident') || lowerDesc.includes('danger') || 
        lowerDesc.includes('unsafe') || lowerDesc.includes('emergency') ||
        lowerDesc.includes('assault') || lowerDesc.includes('harassment')) {
      category = 'Safety';
      priority = 'urgent';
      severity = 9;
    }
    // Payment disputes
    else if (lowerDesc.includes('payment') || lowerDesc.includes('charge') || 
             lowerDesc.includes('refund') || lowerDesc.includes('fare')) {
      category = 'Payment';
      priority = 'high';
      severity = 7;
    }
    // Service quality
    else if (lowerDesc.includes('rude') || lowerDesc.includes('unprofessional') ||
             lowerDesc.includes('attitude') || lowerDesc.includes('service')) {
      category = 'Service Quality';
      priority = 'medium';
      severity = 5;
    }
    // Route/Navigation
    else if (lowerDesc.includes('route') || lowerDesc.includes('lost') ||
             lowerDesc.includes('wrong way') || lowerDesc.includes('navigation')) {
      category = 'Route';
      priority = 'medium';
      severity = 4;
    }
    // Vehicle condition
    else if (lowerDesc.includes('dirty') || lowerDesc.includes('smell') ||
             lowerDesc.includes('broken') || lowerDesc.includes('vehicle')) {
      category = 'Vehicle Condition';
      priority = 'medium';
      severity = 5;
    }
    // Cancellation issues
    else if (lowerDesc.includes('cancel') || lowerDesc.includes('no show')) {
      category = 'Cancellation';
      priority = 'medium';
      severity = 6;
    }

    return { category, priority, severity };
  }

  // Attempt automated resolution
  private async attemptAutomatedResolution(disputeId: string, order: any): Promise<{
    resolved: boolean;
    resolution?: string;
    action?: string;
    reason?: string;
  }> {
    try {
      const dispute = await this.prisma.dispute.findUnique({
        where: { id: disputeId }
      });

      if (!dispute) return { resolved: false };

      // Mark as attempted
      await this.prisma.dispute.update({
        where: { id: disputeId },
        data: { autoResolutionAttempted: true }
      });

      // Auto-resolution rules
      const resolution = await this.applyAutoResolutionRules(dispute, order);

      if (resolution.resolved) {
        // Execute the resolution action
        await this.executeResolutionAction(disputeId, resolution.action!, order);
      }

      return resolution;
    } catch (error) {
      this.logger.error(`Auto-resolution failed for dispute ${disputeId}: ${error.message}`);
      return { resolved: false };
    }
  }

  // Apply auto-resolution rules
  private async applyAutoResolutionRules(dispute: any, order: any): Promise<{
    resolved: boolean;
    resolution?: string;
    action?: string;
    reason?: string;
  }> {
    const description = dispute.description.toLowerCase();

    // Rule 1: Minor service issues - automatic apology and credit
    if (dispute.category === 'Service Quality' && dispute.severity <= 4) {
      if (description.includes('late') || description.includes('wait')) {
        return {
          resolved: true,
          resolution: 'Customer compensated for wait time',
          action: 'credit_customer',
          reason: 'Minor service quality issue - automatic compensation'
        };
      }
    }

    // Rule 2: Clear overcharge - automatic refund
    if (dispute.category === 'Payment' && description.includes('overcharge')) {
      return {
        resolved: true,
        resolution: 'Refund processed for overcharge',
        action: 'refund_overcharge',
        reason: 'Clear overcharge detected - automatic refund'
      };
    }

    // Rule 3: Route deviation with evidence - partial refund
    if (dispute.category === 'Route' && dispute.evidence?.images?.length > 0) {
      return {
        resolved: true,
        resolution: 'Partial refund for route deviation',
        action: 'partial_refund',
        reason: 'Route deviation with evidence - partial refund'
      };
    }

    // Rule 4: Cancellation by rider - automatic refund
    if (dispute.category === 'Cancellation' && 
        dispute.respondentType === 'rider' && 
        order.status !== 'Completed') {
      return {
        resolved: true,
        resolution: 'Full refund for rider cancellation',
        action: 'full_refund',
        reason: 'Rider cancelled trip - automatic refund'
      };
    }

    // No auto-resolution applicable
    return { resolved: false };
  }

  // Execute resolution action
  private async executeResolutionAction(disputeId: string, action: string, order: any) {
    try {
      switch (action) {
        case 'credit_customer':
          await this.prisma.customer.update({
            where: { id: order.customerId },
            data: { walletBalance: { increment: 200 } } // ₦200 credit
          });
          
          await this.prisma.transaction.create({
            data: {
              reference: `DISPUTE-CREDIT-${disputeId}`,
              user: order.customer.name || order.customer.email,
              customerId: order.customerId,
              type: 'Credit',
              amount: 200,
              status: 'Completed',
              method: 'Dispute Resolution',
              description: `Service quality compensation for dispute ${disputeId}`,
              date: new Date(),
            }
          });
          break;

        case 'refund_overcharge':
          // Refund 20% of fare
          const refundAmount = order.amount * 0.2;
          await this.prisma.customer.update({
            where: { id: order.customerId },
            data: { walletBalance: { increment: refundAmount } }
          });
          
          await this.prisma.transaction.create({
            data: {
              reference: `DISPUTE-REFUND-${disputeId}`,
              user: order.customer.name || order.customer.email,
              customerId: order.customerId,
              type: 'Refund',
              amount: refundAmount,
              status: 'Completed',
              method: 'Dispute Resolution',
              description: `Overcharge refund for dispute ${disputeId}`,
              date: new Date(),
            }
          });
          break;

        case 'partial_refund':
          const partialRefund = order.amount * 0.3;
          await this.prisma.customer.update({
            where: { id: order.customerId },
            data: { walletBalance: { increment: partialRefund } }
          });
          
          await this.prisma.transaction.create({
            data: {
              reference: `DISPUTE-PARTIAL-${disputeId}`,
              user: order.customer.name || order.customer.email,
              customerId: order.customerId,
              type: 'Refund',
              amount: partialRefund,
              status: 'Completed',
              method: 'Dispute Resolution',
              description: `Partial refund for dispute ${disputeId}`,
              date: new Date(),
            }
          });
          break;

        case 'full_refund':
          await this.prisma.customer.update({
            where: { id: order.customerId },
            data: { walletBalance: { increment: order.amount } }
          });
          
          await this.prisma.transaction.create({
            data: {
              reference: `DISPUTE-FULL-${disputeId}`,
              user: order.customer.name || order.customer.email,
              customerId: order.customerId,
              type: 'Refund',
              amount: order.amount,
              status: 'Completed',
              method: 'Dispute Resolution',
              description: `Full refund for dispute ${disputeId}`,
              date: new Date(),
            }
          });
          break;
      }

      this.logger.log(`Resolution action '${action}' executed for dispute ${disputeId}`);
    } catch (error) {
      this.logger.error(`Failed to execute resolution action for dispute ${disputeId}: ${error.message}`);
      throw error;
    }
  }

  // Escalate to human review
  private async escalateToHumanReview(disputeId: string) {
    // Notify admin team
    const adminNotification = await this.notificationsService.create({
      title: 'New Dispute Requires Review',
      message: `Dispute ${disputeId} requires human review`,
      type: 'DISPUTE_ESCALATION',
    });

    this.trackingGateway.server.emit('admin_new_dispute', {
      disputeId,
      notification: adminNotification,
      timestamp: new Date()
    });
  }

  // Notify parties about dispute
  private async notifyParties(disputeId: string, action: 'created' | 'updated' | 'resolved') {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { order: { include: { customer: true, rider: true } } }
    });

    if (!dispute) return;

    const messages = {
      created: {
        complainant: `Your dispute has been submitted and is being reviewed. Reference: ${disputeId}`,
        respondent: `A dispute has been filed against you regarding order ${dispute.orderId}. Please respond within 24 hours.`
      },
      updated: {
        complainant: `Your dispute status has been updated.`,
        respondent: `The dispute against you has been updated.`
      },
      resolved: {
        complainant: `Your dispute has been resolved. Resolution: ${dispute.resolution}`,
        respondent: `The dispute has been resolved. Resolution: ${dispute.resolution}`
      }
    };

    // Notify complainant
    const complainantNotification = await this.notificationsService.create({
      title: `Dispute ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      message: messages[action].complainant,
      type: 'DISPUTE_UPDATE',
    });

    // Notify respondent
    const respondentNotification = await this.notificationsService.create({
      title: `Dispute ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      message: messages[action].respondent,
      type: 'DISPUTE_UPDATE',
    });

    // Send notifications via WebSocket
    if (dispute.complainantType === 'customer') {
      this.trackingGateway.server.emit(`customer_notification_${dispute.complainantId}`, complainantNotification);
    } else if (dispute.complainantType === 'rider') {
      this.trackingGateway.server.emit(`rider_notification_${dispute.complainantId}`, complainantNotification);
    }

    if (dispute.respondentType === 'customer') {
      this.trackingGateway.server.emit(`customer_notification_${dispute.respondentId}`, respondentNotification);
    } else if (dispute.respondentType === 'rider') {
      this.trackingGateway.server.emit(`rider_notification_${dispute.respondentId}`, respondentNotification);
    }
  }

  // Update dispute status
  async updateDisputeStatus(disputeId: string, status: string, resolution?: string) {
    const dispute = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status,
        resolution,
        updatedAt: new Date(),
        resolvedAt: status === 'Resolved' ? new Date() : null
      }
    });

    await this.notifyParties(disputeId, 'updated');
    
    if (status === 'Resolved') {
      await this.notifyParties(disputeId, 'resolved');
    }

    return dispute;
  }

  // Add response to dispute
  async addResponse(disputeId: string, respondentId: string, response: {
    message: string;
    evidence?: {
      images?: string[];
      videos?: string[];
      audio?: string[];
      documents?: string[];
    };
  }) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId }
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    if (dispute.respondentId !== respondentId) {
      throw new BadRequestException('Only the respondent can add a response');
    }

    // Add response (would need to add DisputeResponse model to schema)
    // For now, update the dispute with response
    const updatedDispute = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        // Add response fields to schema
        respondentResponse: response.message,
        respondentEvidence: response.evidence ? JSON.stringify(response.evidence) : null,
        status: 'Under Review',
        updatedAt: new Date()
      }
    });

    await this.notifyParties(disputeId, 'updated');

    return updatedDispute;
  }

  // Get dispute details
  async getDispute(disputeId: string, userId: string, userRole: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        order: {
          include: { customer: true, rider: true }
        }
      }
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    // Check access permissions
    const hasAccess = 
      dispute.complainantId === userId ||
      dispute.respondentId === userId ||
      userRole.includes('admin');

    if (!hasAccess) {
      throw new BadRequestException('Access denied');
    }

    return dispute;
  }

  // Get user disputes
  async getUserDisputes(userId: string, userType: 'customer' | 'rider' | 'vendor') {
    return await this.prisma.dispute.findMany({
      where: {
        OR: [
          { complainantId: userId, complainantType: userType },
          { respondentId: userId, respondentType: userType }
        ]
      },
      include: {
        order: {
          select: { id: true, amount: true, date: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  // Get all disputes (admin only)
  async getAllDisputes(filters?: {
    status?: string;
    category?: string;
    priority?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {};
    
    if (filters?.status) where.status = filters.status;
    if (filters?.category) where.category = filters.category;
    if (filters?.priority) where.priority = filters.priority;

    return await this.prisma.dispute.findMany({
      where,
      include: {
        order: {
          include: { customer: true, rider: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 50,
      skip: filters?.offset || 0
    });
  }

  // Get dispute statistics
  async getDisputeStatistics() {
    const total = await this.prisma.dispute.count();
    const open = await this.prisma.dispute.count({ where: { status: 'Open' } });
    const resolved = await this.prisma.dispute.count({ where: { status: 'Resolved' } });
    const autoResolved = await this.prisma.dispute.count({ 
      where: { status: 'Resolved', autoResolutionAttempted: true } 
    });

    const byCategory = await this.prisma.dispute.groupBy({
      by: ['category'],
      _count: true
    });

    const byPriority = await this.prisma.dispute.groupBy({
      by: ['priority'],
      _count: true
    });

    return {
      total,
      open,
      resolved,
      autoResolved,
      autoResolutionRate: total > 0 ? (autoResolved / total * 100).toFixed(1) : '0',
      byCategory,
      byPriority
    };
  }
}
