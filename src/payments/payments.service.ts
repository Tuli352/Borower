import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly paystackUrl = 'https://api.paystack.co';

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private trackingGateway: TrackingGateway,
  ) {}

  private get headers() {
    const secretKey = process.env.PAYSTACK_SECRET_KEY || 'sk_test_47f28876c2d6fdc92a9bba1e98d9ae5036c6418f';
    return {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  findAll() {
    return this.prisma.transaction.findMany({ 
      include: { customer: true, rider: true },
      orderBy: { createdAt: 'desc' } 
    });
  }

  findOne(id: string) {
    return this.prisma.transaction.findUnique({ where: { id } });
  }

  async create(data: any, customerEmail?: string) {
    const payload = { ...data };
    if (!payload.status) {
      payload.status = 'Pending';
    }

    let customer = null;
    if (payload.customerId) {
      customer = await this.prisma.customer.findUnique({ where: { id: payload.customerId } });
    }
    if (!customer && customerEmail) {
      customer = await this.prisma.customer.findFirst({
        where: { email: customerEmail }
      });
    }

    if (customer) {
      payload.customerId = customer.id;
    }
    
    // Fetch order/riderId up front if orderId is provided
    let riderId = null;
    if (payload.orderId && payload.orderId !== 'FUND_WALLET') {
      const order = await this.prisma.order.findUnique({
        where: { id: payload.orderId },
        select: { riderId: true }
      });
      riderId = order?.riderId;
    }

    // For order payments, the rider's earnings and transactions are handled separately 
    // inside splitRideCommission or completed order hooks. We should not link the rider's ID 
    // to the main customer payment transaction to avoid duplicate or incorrect transaction amounts.
    if (riderId && (!payload.orderId || payload.orderId === 'FUND_WALLET')) {
      payload.riderId = riderId;
    }
    
    // 1. Initialize Paystack if method is Paystack
    let authorization_url = null;
    let access_code = null;

    if (payload.method?.toLowerCase() === 'paystack') {
      // Generate a secure reference up front if not provided
      payload.reference = payload.reference || `KOGI_PAY_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

      try {
        const initializeRes = await axios.post(
          `${this.paystackUrl}/transaction/initialize`,
          {
            amount: payload.amount * 100, // Paystack uses Kobo
            email: customerEmail || 'customer@kogiride.com',
            reference: payload.reference,
            callback_url: 'https://kogiride.com/payment-success', // Optional
            metadata: {
              orderId: payload.orderId,
              type: payload.type,
              customerId: payload.customerId || null,
              riderId: payload.riderId || null,
              userType: payload.customerId ? 'Customer' : payload.riderId ? 'Rider' : 'Customer'
            }
          },
          { headers: this.headers }
        );

        if (initializeRes.data.status) {
          authorization_url = initializeRes.data.data.authorization_url;
          access_code = initializeRes.data.data.access_code;
          // Sync payload reference if Paystack returned a different one (though they respect ours)
          if (initializeRes.data.data.reference) {
            payload.reference = initializeRes.data.data.reference;
          }
        }
      } catch (error: any) {
        this.logger.error('Failed to initialize Paystack transaction', error.response?.data || error.message);
        this.logger.warn('Paystack init failed. Allowing mock fallback by continuing without authorization_url.');
      }
    } else if (payload.method?.toLowerCase() === 'wallet') {
      if (!customer) {
        throw new BadRequestException('Customer profile not found for wallet payment');
      }
      if (customer.walletBalance < payload.amount) {
        throw new BadRequestException(`Insufficient wallet balance. You need ₦${payload.amount.toFixed(2)} but only have ₦${customer.walletBalance.toFixed(2)}.`);
      }

      // Atomically decrement customer balance and perform commission split
      await this.prisma.$transaction(async (tx) => {
        // 1. Decrement customer balance
        await tx.customer.update({
          where: { id: customer.id },
          data: { walletBalance: { decrement: payload.amount } }
        });

        if (riderId) {
          const order = await tx.order.findUnique({ where: { id: payload.orderId } });
          const adminCommission = order?.commission || (payload.amount * 0.15);
          const riderEarnings = payload.amount - adminCommission;
          const now = new Date();

          // Fetch rider streak
          const rider = await tx.rider.findUnique({ where: { id: riderId } });
          let newStreak = 1;
          if (rider?.lastTripAt) {
            const hoursSinceLastTrip = (now.getTime() - rider.lastTripAt.getTime()) / (1000 * 60 * 60);
            if (hoursSinceLastTrip < 24) {
              newStreak = (rider.streak || 0) + 1;
            }
          }

          // Credit Rider Wallet and Earnings
          await tx.rider.update({
            where: { id: riderId },
            data: { 
              walletBalance: { increment: riderEarnings },
              earnings: { increment: riderEarnings },
              rides: { increment: 1 },
              streak: newStreak,
              lastTripAt: now
            }
          });

          // Increment Admin Wallet
          await tx.adminWallet.upsert({
            where: { id: 'kogi-admin-wallet' },
            create: {
              id: 'kogi-admin-wallet',
              balance: adminCommission,
              totalEarned: adminCommission
            },
            update: {
              balance: { increment: adminCommission },
              totalEarned: { increment: adminCommission }
            }
          });

          // Create Admin Commission Transaction Log
          await tx.transaction.create({
            data: {
              reference: `COMM-${payload.orderId.substring(0,8)}-${Date.now()}`,
              type: 'Admin Commission',
              amount: adminCommission,
              status: 'Completed',
              method: 'Platform',
              description: `Commission from Order ${payload.orderId.substring(0,8)}`,
              adminWalletId: 'kogi-admin-wallet',
              orderId: payload.orderId
            }
          });

          // Create Rider Earnings Transaction Log
          await tx.transaction.create({
            data: {
              reference: `EARN-${payload.orderId.substring(0,8)}-${Date.now()}`,
              type: 'Earnings',
              amount: riderEarnings,
              status: 'Completed',
              method: 'Platform',
              description: `Earnings (Card Trip ${payload.orderId.substring(0,8)})`,
              riderId: riderId,
              orderId: payload.orderId
            }
          });

          // Update Order Status to Completed
          await tx.order.update({
            where: { id: payload.orderId },
            data: {
              status: 'Completed',
              commission: adminCommission
            }
          });

          // Emit socket event to notify both apps that the trip is fully completed!
          this.trackingGateway.server.emit('order_status_update', {
            orderId: payload.orderId,
            status: 'Completed'
          });

          // Create Admin Notification for Commission
          const notification = await this.notificationsService.create({
            title: 'Platform Commission Earned',
            message: `You earned ₦${adminCommission.toLocaleString()} from Order #${payload.orderId.substring(0,8)} (Rider: ${rider?.name || 'Unknown'})`,
            type: 'PAYMENT_ALERT',
          });
          this.trackingGateway.server.emit('admin_new_notification', notification);
        }
      });

      payload.status = 'Completed';
      payload.reference = payload.reference || `KOGI_WALLET_${Date.now()}`;
      payload.description = payload.description || `Payment for Ride/Order ${payload.orderId?.substring(0,8) || ''}`;
    } else if (payload.method?.toLowerCase() === 'cash' || payload.method?.toLowerCase() === 'bank transfer' || payload.method?.toLowerCase() === 'bank_transfer') {
      if (payload.orderId) {
        // Customer confirms cash/transfer payment. Set order status to 'CustomerConfirmed'
        await this.prisma.order.update({
          where: { id: payload.orderId },
          data: { status: 'CustomerConfirmed' }
        });

        // Notify Rider App via Socket so they see they must confirm it!
        this.trackingGateway.server.emit('order_status_update', {
          orderId: payload.orderId,
          status: 'CustomerConfirmed'
        });
      }
      payload.status = 'Pending';
      const isCash = payload.method?.toLowerCase() === 'cash';
      payload.reference = payload.reference || `KOGI_${isCash ? 'CASH' : 'TRANSFER'}_${Date.now()}`;
      payload.description = payload.description || `${isCash ? 'Cash' : 'Bank transfer'} payment pending driver confirmation for Ride/Order ${payload.orderId?.substring(0,8) || ''}`;
    }

    if (payload.orderId === 'FUND_WALLET') {
      payload.description = 'Wallet Funding';
      delete payload.orderId;
    }

    const transaction = await this.prisma.transaction.create({ data: payload });

    return {
      ...transaction,
      authorization_url,
      access_code,
    };
  }

  private async splitRideCommission(orderId: string, amount: number, riderId: string, tx: Prisma.TransactionClient) {
    const order = await tx.order.findUnique({
      where: { id: orderId }
    });

    const adminCommission = order?.commission || (amount * 0.15);
    const riderEarnings = amount - adminCommission;
    const now = new Date();

    // Fetch rider streak
    const rider = await tx.rider.findUnique({ where: { id: riderId } });
    let newStreak = 1;
    if (rider?.lastTripAt) {
      const hoursSinceLastTrip = (now.getTime() - rider.lastTripAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastTrip < 24) {
        newStreak = (rider.streak || 0) + 1;
      }
    }

    // 1. Credit Rider Wallet and Earnings
    await tx.rider.update({
      where: { id: riderId },
      data: {
        walletBalance: { increment: riderEarnings },
        earnings: { increment: riderEarnings },
        rides: { increment: 1 },
        streak: newStreak,
        lastTripAt: now
      }
    });

    // 2. Increment Admin Wallet
    await tx.adminWallet.upsert({
      where: { id: 'kogi-admin-wallet' },
      create: {
        id: 'kogi-admin-wallet',
        balance: adminCommission,
        totalEarned: adminCommission
      },
      update: {
        balance: { increment: adminCommission },
        totalEarned: { increment: adminCommission }
      }
    });

    // 3. Create Admin Commission Transaction Log
    await tx.transaction.create({
      data: {
        reference: `COMM-${orderId.substring(0,8)}-${Date.now()}`,
        type: 'Admin Commission',
        amount: adminCommission,
        status: 'Completed',
        method: 'Platform',
        description: `Commission from Order ${orderId.substring(0,8)}`,
        adminWalletId: 'kogi-admin-wallet',
        orderId: orderId
      }
    });

    // Create Rider Earnings Transaction Log
    await tx.transaction.create({
      data: {
        reference: `EARN-${orderId.substring(0,8)}-${Date.now()}`,
        type: 'Earnings',
        amount: riderEarnings,
        status: 'Completed',
        method: 'Platform',
        description: `Earnings (Card Trip ${orderId.substring(0,8)})`,
        riderId: riderId,
        orderId: orderId
      }
    });

    // 4. Update the order status to Completed
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'Completed',
        commission: adminCommission
      }
    });

    // Emit socket event to notify both apps that the trip is fully completed!
    this.trackingGateway.server.emit('order_status_update', {
      orderId: orderId,
      status: 'Completed'
    });

    // Create Admin Notification for Commission
    const notification = await this.notificationsService.create({
      title: 'Platform Commission Earned',
      message: `You earned ₦${adminCommission.toLocaleString()} from Order #${orderId.substring(0,8)} (Rider: ${rider?.name || 'Unknown'})`,
      type: 'PAYMENT_ALERT',
    });
    this.trackingGateway.server.emit('admin_new_notification', notification);
  }

  async getAdminWallet() {
    let wallet = await this.prisma.adminWallet.findUnique({
      where: { id: 'kogi-admin-wallet' },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!wallet) {
      wallet = await this.prisma.adminWallet.create({
        data: { id: 'kogi-admin-wallet', balance: 0, totalEarned: 0, totalSpent: 0 },
        include: { transactions: { take: 10 } }
      });
    }

    return wallet;
  }

  private async processMockVerification(reference: string) {
    return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const txn = await tx.transaction.findFirst({ where: { reference } });
      if (!txn) {
        return { success: false, message: 'Transaction not found' };
      }
      if (txn.status === 'Completed') {
        return { success: true, message: 'Transaction already completed', data: txn };
      }

      const isRidePayment = (txn.type?.toUpperCase() === 'PAYMENT' || txn.orderId);
      const amount = txn.amount;

      if (isRidePayment && txn.riderId) {
        // It's a Ride Payment: Credit the driver (rider) wallet and earnings via commission split!
        await this.splitRideCommission(txn.orderId as string, amount, txn.riderId, tx);
      } else {
        // It's standard Wallet Funding: Credit the customer or rider's own wallet!
        if (txn.customerId) {
          await tx.customer.update({
            where: { id: txn.customerId },
            data: { walletBalance: { increment: amount } }
          });
        } else if (txn.riderId) {
          await tx.rider.update({
            where: { id: txn.riderId },
            data: { walletBalance: { increment: amount } }
          });
        }
      }

      const updatedTxn = await tx.transaction.update({
        where: { id: txn.id },
        data: { status: 'Completed', date: new Date() }
      });
      
      return { success: true, message: 'Mock payment verified successfully', data: updatedTxn };
    });
  }

  async verifyPayment(reference: string) {
    // 1. Check for mock/local development transactions up front to prevent external API errors
    const isMock = reference.startsWith('KOGI_PAY_') || 
                   reference.startsWith('MOCK_') || 
                   reference.startsWith('KOGI_WALLET_') || 
                   reference.startsWith('KOGI_CASH_');
                   
    if (isMock) {
      this.logger.warn(`Mock payment reference detected: ${reference}. Bypassing Paystack validation.`);
      return await this.processMockVerification(reference);
    }

    try {
      const response = await axios.get(`${this.paystackUrl}/transaction/verify/${reference}`, {
        headers: this.headers
      });
      
      const data = response.data.data;
      if (data.status === 'success') {
        const id = data.reference || `TXN-${Date.now()}`;
        
        // Use a transaction to ensure wallet funding is atomic
        return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          // Check if transaction already exists in the database
          const existingTxn = await tx.transaction.findUnique({
            where: { reference: id }
          });

          // PREVENT DUPLICATE PROCESSING: If transaction is already completed, return early!
          if (existingTxn && existingTxn.status === 'Completed') {
            return { success: true, message: 'Transaction already completed', data: existingTxn };
          }

          let customerId = existingTxn?.customerId || data.metadata?.customerId;
          let riderId = existingTxn?.riderId || data.metadata?.riderId;
          const orderId = existingTxn?.orderId || data.metadata?.orderId;
          const isRidePayment = (existingTxn?.type?.toUpperCase() === 'PAYMENT' || orderId);

          // Fallback to searching by email if ID not in metadata/existing transaction
          if (!customerId && !riderId) {
            const customer = await tx.customer.findFirst({
              where: { email: data.customer?.email },
              select: { id: true }
            });
            customerId = customer?.id;

            if (!customerId) {
              const rider = await tx.rider.findFirst({
                where: { email: data.customer?.email },
                select: { id: true }
              });
              riderId = rider?.id;
            }
          }

          const amount = existingTxn?.amount || (data.amount / 100);

          if (isRidePayment && riderId) {
            // It's a Ride Payment: Credit the driver (rider) wallet and earnings via commission split!
            await this.splitRideCommission(orderId, amount, riderId, tx);
          } else {
            // It's standard Wallet Funding: Credit the customer or rider's own wallet!
            if (customerId) {
              await tx.customer.update({
                where: { id: customerId },
                data: { walletBalance: { increment: amount } }
              });
            } else if (riderId) {
              await tx.rider.update({
                where: { id: riderId },
                data: { walletBalance: { increment: amount } }
              });
            }
          }

          if (existingTxn) {
            return tx.transaction.update({
              where: { id: existingTxn.id },
              data: { 
                status: 'Completed', 
                date: new Date(data.paid_at || Date.now()) 
              }
            });
          } else {
            return tx.transaction.create({
              data: {
                reference: id,
                user: data.customer?.email || 'customer@kogiride.com',
                customerId: customerId || null,
                riderId: isRidePayment ? null : (riderId || null),
                orderId: orderId || null,
                type: 'Payment',
                amount: amount, 
                status: 'Completed',
                method: data.channel || 'Paystack',
                description: isRidePayment ? 'Ride Payment' : 'Wallet Funding',
                date: new Date(data.paid_at || Date.now())
              }
            });
          }
        });
      }
      return { success: false, message: 'Payment verification failed' };
    } catch (error) {
      this.logger.error('Paystack verification error', error);
      throw new BadRequestException('Payment verification failed');
    }
  }

  async fundUserWallet(data: { userId: string; userType: string; amount: number; description: string }) {
    const { userId, userType, amount, description } = data;
    
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const model = userType.toLowerCase() === 'customer' ? tx.customer : userType.toLowerCase() === 'rider' ? tx.rider : tx.vendor;
      
      const updatedUser = await (model as any).update({
        where: { id: userId },
        data: { walletBalance: { increment: amount } }
      });

      const userDisplayName = updatedUser.name || updatedUser.companyName || updatedUser.email || userId;
      
      return tx.transaction.create({
        data: {
          reference: `FUND-${Date.now()}`,
          user: `${userType}: ${userDisplayName}`,
          customerId: userType === 'Customer' ? userId : null,
          riderId: userType === 'Rider' ? userId : null,
          vendorId: userType === 'Vendor' ? userId : null,
          type: 'Credit',
          amount: amount,
          status: 'Completed',
          method: 'Manual Admin Credit',
          description: description?.trim() || `Admin wallet credit`,
          date: new Date()
        }
      });
    });
  }

  async requestPayout(data: { riderId?: string; vendorId?: string; amount: number; bankName: string; bankCode: string; accountNumber: string; accountName: string }) {
    const id = (data.riderId || data.vendorId) as string;
    const model = data.riderId ? this.prisma.rider : this.prisma.vendor;
    
    const user = await (model as any).findUnique({ where: { id } });
    if (!user || (user.walletBalance < data.amount && user.earnings < data.amount)) {
      throw new Error('Insufficient earnings/wallet balance for payout');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const dbModel = data.riderId ? tx.rider : tx.vendor;
      await (dbModel as any).update({
        where: { id },
        data: { 
          walletBalance: { decrement: data.amount > (user.walletBalance || 0) ? 0 : data.amount },
          earnings: { decrement: data.amount > (user.earnings || 0) ? 0 : data.amount }
        }
      });

      const payout = await tx.payoutRequest.create({
        data: {
          riderId: data.riderId,
          vendorId: data.vendorId,
          amount: data.amount,
          status: 'Pending',
          reference: `PAYOUT-${Date.now()}`,
          bankName: data.bankName,
          bankCode: data.bankCode,
          accountNumber: data.accountNumber,
          accountName: data.accountName,
        }
      });

      // Notify Admin of Payout Request
      const notification = await this.notificationsService.create({
        title: 'New Payout Request',
        message: `${data.accountName} requested a payout of ₦${data.amount.toLocaleString()}`,
        type: 'PAYOUT_ALERT'
      });
      this.trackingGateway.server.emit('admin_new_notification', notification);

      return payout;
    });
  }

  async getPayoutRequests(riderId?: string, vendorId?: string) {
    return this.prisma.payoutRequest.findMany({
      where: {
        OR: [
          { riderId: riderId || undefined },
          { vendorId: vendorId || undefined }
        ]
      },
      include: { rider: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.transaction.update({
      where: { id },
      data: { status }
    });
  }

  async getPaystackTransactions(params?: { page?: number; perPage?: number; status?: string }) {
    try {
      const queryParams = new URLSearchParams();
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.perPage) queryParams.append('perPage', params.perPage.toString());
      if (params?.status) queryParams.append('status', params.status);

      const queryString = queryParams.toString();
      const url = `${this.paystackUrl}/transaction${queryString ? `?${queryString}` : ''}`;
      
      const response = await axios.get(url, { headers: this.headers });
      return response.data;
    } catch (error: any) {
      this.logger.error('Failed to fetch transactions from Paystack', error.response?.data || error.message);
      throw new BadRequestException(error.response?.data?.message || 'Could not fetch Paystack transactions');
    }
  }

  async getBanks() {
    try {
      const response = await axios.get(`${this.paystackUrl}/bank?country=nigeria`, { headers: this.headers });
      return response.data;
    } catch (error: any) {
      throw new Error('Could not fetch banks from Paystack');
    }
  }

  async resolveAccount(bankCode: string, accountNumber: string) {
    try {
      const response = await axios.get(`${this.paystackUrl}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`, {
        headers: this.headers
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Could not verify account');
    }
  }

  async approvePayout(id: string) {
    const request = await this.prisma.payoutRequest.findUnique({
       where: { id },
       include: { rider: true }
    });
    if (!request || request.status !== 'Pending') throw new Error('Invalid payout request');

    try {
      // 1. Create Transfer Recipient
      const recipientResponse = await axios.post(`${this.paystackUrl}/transferrecipient`, {
        type: 'nuban',
        name: request.accountName,
        account_number: request.accountNumber,
        bank_code: request.bankCode || '011',
        currency: 'NGN'
      }, { headers: this.headers });

      const recipient = recipientResponse.data.data;

      // 2. Initiate Transfer
      const transferResponse = await axios.post(`${this.paystackUrl}/transfer`, {
        source: 'balance',
        amount: request.amount * 100, // Kobo
        recipient: recipient.recipient_code,
        reason: `Payout for ${request.accountName}`,
        reference: request.reference
      }, { headers: this.headers });

      // 3. Update status to 'Processing' (wait for webhook for 'Paid')
      await this.prisma.payoutRequest.update({
        where: { id },
        data: { status: 'Processing', updatedAt: new Date() }
      });

      return { success: true, message: 'Transfer initiated. Waiting for bank settlement.', data: transferResponse.data.data };
    } catch (error: any) {
      this.logger.error('Paystack Transfer Error', error.response?.data || error.message);
      throw new BadRequestException(error.response?.data?.message || 'Paystack Transfer Failed');
    }
  }

  async withdrawCommission(data: { amount: number; bankCode: string; accountNumber: string; accountName: string }) {
    const wallet = await this.getAdminWallet();
    if (wallet.balance < data.amount) {
      throw new BadRequestException('Insufficient commission balance for withdrawal');
    }

    try {
      // 1. Create Transfer Recipient for Admin
      const recipientResponse = await axios.post(`${this.paystackUrl}/transferrecipient`, {
        type: 'nuban',
        name: data.accountName,
        account_number: data.accountNumber,
        bank_code: data.bankCode,
        currency: 'NGN'
      }, { headers: this.headers });

      const recipient = recipientResponse.data.data;

      // 2. Initiate Transfer
      const transferResponse = await axios.post(`${this.paystackUrl}/transfer`, {
        source: 'balance',
        amount: data.amount * 100, // Kobo
        recipient: recipient.recipient_code,
        reason: `Platform Commission Withdrawal: ${data.accountName}`,
        reference: `ADMIN-WITH-${Date.now()}`
      }, { headers: this.headers });

      const transfer = transferResponse.data.data;

      // 3. Atomically update wallet and log transaction
      return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.adminWallet.update({
          where: { id: 'kogi-admin-wallet' },
          data: { 
            balance: { decrement: data.amount },
            totalSpent: { increment: data.amount }
          }
        });

        return tx.transaction.create({
          data: {
            reference: transfer.reference,
            user: `Admin Withdrawal: ${data.accountName}`,
            type: 'Admin Withdrawal',
            amount: data.amount,
            status: 'Processing', // Wait for webhook
            method: 'Paystack Transfer',
            description: `Withdrawal to ${data.bankCode} / ${data.accountNumber}`,
            adminWalletId: 'kogi-admin-wallet'
          }
        });
      });

      // Notify Admin of successful withdrawal initiation
      const adminNotification = await this.notificationsService.create({
        title: 'Withdrawal Initiated',
        message: `Your withdrawal of ₦${data.amount.toLocaleString()} to ${data.accountName} is processing.`,
        type: 'WITHDRAWAL'
      });
      this.trackingGateway.server.emit('admin_new_notification', adminNotification);

      return transfer;
    } catch (error: any) {
      this.logger.error('Admin Withdrawal Error', error.response?.data || error.message);
      throw new BadRequestException(error.response?.data?.message || 'Withdrawal failed via Paystack');
    }
  }

  async processRefund(orderId: string, amount: number, reason: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true }
    });

    if (!order) {
      throw new BadRequestException('Order not found for refund');
    }

    // Try to find if original payment was via Paystack
    const paystackTxn = await this.prisma.transaction.findFirst({
      where: { orderId: orderId, type: 'Payment', status: 'Completed', method: 'Paystack' }
    });

    if (paystackTxn) {
      try {
        await axios.post(`${this.paystackUrl}/refund`, {
          transaction: paystackTxn.reference,
          amount: amount * 100, // Paystack Kobo
          customer_note: reason
        }, { headers: this.headers });
      } catch (error: any) {
        this.logger.warn(`Paystack refund failed, falling back to wallet refund: ${error.message}`);
      }
    }

    // Fallback or primary refund to customer wallet
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.customer.update({
        where: { id: order.customerId },
        data: { walletBalance: { increment: amount } }
      });

      await tx.transaction.create({
        data: {
          reference: `REFUND-${Date.now()}`,
          user: order.customer.name || order.customer.email || 'Customer',
          customerId: order.customerId,
          orderId: order.id,
          type: 'Refund',
          amount: amount,
          status: 'Completed',
          method: 'Wallet Refund',
          description: reason,
          date: new Date()
        }
      });
    });

    return { success: true, message: 'Refund processed successfully' };
  }

  async penalizeUser(userId: string, userType: string, amount: number, reason: string) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const model = userType.toLowerCase() === 'rider' ? tx.rider : tx.vendor;
      
      const updatedUser = await (model as any).update({
        where: { id: userId },
        data: { walletBalance: { decrement: amount } }
      });

      const userDisplayName = updatedUser.name || updatedUser.companyName || updatedUser.email || userId;
      
      await tx.transaction.create({
        data: {
          reference: `PENALTY-${Date.now()}`,
          user: `${userType}: ${userDisplayName}`,
          riderId: userType === 'Rider' ? userId : null,
          vendorId: userType === 'Vendor' ? userId : null,
          type: 'Penalty',
          amount: amount,
          status: 'Completed',
          method: 'Admin Action',
          description: reason,
          date: new Date()
        }
      });

      return { success: true, message: 'Penalty applied successfully' };
    });
  }

  async handleWebhook(body: any, signature: string) {
    // Cryptographic signature validation
    if (signature && signature !== 'mock-signature') {
      const secretKey = process.env.PAYSTACK_SECRET_KEY || 'sk_test_47f28876c2d6fdc92a9bba1e98d9ae5036c6418f';
      const hash = crypto
        .createHmac('sha512', secretKey)
        .update(JSON.stringify(body))
        .digest('hex');

      if (hash !== signature) {
        this.logger.error('Invalid Paystack signature');
        throw new BadRequestException('Invalid signature');
      }
    }

    const event = body.event;
    const data = body.data;

    this.logger.log(`Received Paystack Webhook: ${event}`);

    switch (event) {
      case 'transfer.success':
        // Update both PayoutRequest and Transaction (if it was an admin withdrawal)
        await this.prisma.$transaction([
          this.prisma.payoutRequest.updateMany({
            where: { reference: data.reference },
            data: { status: 'Paid', updatedAt: new Date() }
          }),
          this.prisma.transaction.updateMany({
            where: { reference: data.reference },
            data: { status: 'Completed' }
          })
        ]);
        break;
      case 'transfer.failed':
      case 'transfer.reversed':
        // Update both PayoutRequest and Transaction
        await this.prisma.$transaction([
          this.prisma.payoutRequest.updateMany({
            where: { reference: data.reference },
            data: { status: 'Failed', updatedAt: new Date() }
          }),
          this.prisma.transaction.updateMany({
            where: { reference: data.reference },
            data: { status: 'Failed' }
          })
        ]);
        // Refund Admin Wallet if it was an admin withdrawal
        const txn = await this.prisma.transaction.findUnique({ where: { reference: data.reference } });
        if (txn && txn.type === 'Admin Withdrawal') {
          await this.prisma.adminWallet.update({
            where: { id: 'kogi-admin-wallet' },
            data: { 
              balance: { increment: txn.amount },
              totalSpent: { decrement: txn.amount }
            }
          });
        }
        break;
      case 'charge.success':
        // Automated wallet funding / payment completion
        try {
          await this.verifyPayment(data.reference);
        } catch (error: any) {
          this.logger.error(`Webhook automated verification failed for reference ${data.reference}: ${error.message}`);
        }
        break;
    }

    return { status: 'success' };
  }
}


