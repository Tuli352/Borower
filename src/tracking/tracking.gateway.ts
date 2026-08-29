import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Inject, forwardRef } from '@nestjs/common';
import { RidersService } from '../riders/riders.service';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    @Inject(forwardRef(() => RidersService))
    private ridersService: RidersService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: any) {
    console.log(`Client connected: ${client.id}`);
    
    // Send initial locations of all online riders
    const onlineRiders = await this.ridersService.findAllOnline();
    const formattedRiders = onlineRiders.map(rider => ({
      riderId: rider.id,
      latitude: rider.latitude,
      longitude: rider.longitude,
      timestamp: new Date().toISOString(),
    }));
    client.emit('initialLocations', formattedRiders);
  }

  handleDisconnect(client: any) {
    console.log(`Client disconnected: ${client.id}`);
  }

  broadcastLocation(riderId: string, latitude: number, longitude: number) {
    this.server.emit('locationUpdate', {
      riderId,
      latitude,
      longitude,
      timestamp: new Date(),
    });
  }

  // --- NEW: Order-Specific Live Tracking ---

  @SubscribeMessage('trackOrder')
  handleTrackOrder(client: any, payload: { orderId: string }) {
    if (payload?.orderId) {
      const room = `order_${payload.orderId}`;
      client.join(room);
      console.log(`Client ${client.id} joined ${room}`);
      return { event: 'joinedRoom', data: room };
    }
    return { event: 'error', data: 'No orderId provided' };
  }

  @SubscribeMessage('join_rider')
  handleJoinRider(client: any, payload: { riderId: string }) {
    if (payload?.riderId) {
      const room = `rider_${payload.riderId}`;
      client.join(room);
      console.log(`Client ${client.id} joined rider room ${room}`);
      return { event: 'joinedRiderRoom', data: room };
    }
    return { event: 'error', data: 'No riderId provided' };
  }

  @SubscribeMessage('untrackOrder')
  handleUntrackOrder(client: any, payload: { orderId: string }) {
    if (payload?.orderId) {
      const room = `order_${payload.orderId}`;
      client.leave(room);
      console.log(`Client ${client.id} left ${room}`);
      return { event: 'leftRoom', data: room };
    }
  }

  broadcastOrderLocation(orderId: string, latitude: number, longitude: number, riderId: string) {
    this.server.to(`order_${orderId}`).emit('orderLocationUpdate', {
      orderId,
      riderId,
      latitude,
      longitude,
      timestamp: new Date(),
    });
  }

  @SubscribeMessage('getHeatmap')
  async handleGetHeatmap() {
    // 1. Fetch online riders
    const onlineRiders = await this.ridersService.findAllOnline();
    
    const heatPoints: Record<string, number> = onlineRiders.reduce((acc: Record<string, number>, rider) => {
      if (rider.latitude && rider.longitude) {
        const key = `${rider.latitude.toFixed(2)},${rider.longitude.toFixed(2)}`;
        acc[key] = (acc[key] || 0) + 1;
      }
      return acc;
    }, {});

    const formattedHeatmap = Object.entries(heatPoints).map(([coords, density]) => {
      const [lat, lng] = coords.split(',').map(Number);
      return { lat, lng, density };
    });

    return { event: 'heatmapData', data: formattedHeatmap };
  }

  @SubscribeMessage('ping')
  handlePing() {
    return 'pong';
  }

  // --- Order Chat ---
  @SubscribeMessage('join_order_chat')
  handleJoinOrderChat(client: any, payload: { orderId: string }) {
    if (payload?.orderId) {
      const room = `chat_${payload.orderId}`;
      client.join(room);
      console.log(`Client ${client.id} joined chat ${room}`);
      return { event: 'joined_chat', data: room };
    }
  }

  @SubscribeMessage('send_order_message')
  async handleSendOrderMessage(client: any, payload: { orderId: string; message: string; senderId: string; isDriver: boolean }) {
    if (payload?.orderId && payload?.message) {
      const room = `chat_${payload.orderId}`;
      
      // Save durable message to database chatMessage table
      const chatMsg = await this.prisma.chatMessage.create({
        data: {
          orderId: payload.orderId,
          senderId: payload.senderId,
          senderRole: payload.isDriver ? 'RIDER' : 'CUSTOMER',
          text: payload.message,
        },
      });

      const messageData = {
        id: chatMsg.id,
        orderId: payload.orderId,
        message: payload.message,
        senderId: payload.senderId,
        isDriver: payload.isDriver,
        createdAt: chatMsg.createdAt.toISOString(),
      };

      // Broadcast to everyone in the chat room (including sender)
      this.server.to(room).emit('new_order_message', messageData);
      
      return { event: 'message_sent', data: messageData };
    }
  }

  // --- Notifications ---
  
  notifyOrderStatus(orderId: string, status: string, details?: any) {
    this.server.to(`order_${orderId}`).emit('order_status_update', {
      orderId,
      status,
      ...details,
      timestamp: new Date(),
    });
  }
}
