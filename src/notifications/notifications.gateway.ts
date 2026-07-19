import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: [
      'https://tolongin.co',
      'https://frontend-tolongin.vercel.app',
      'http://localhost:3000',
    ],
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private logger = new Logger(NotificationsGateway.name);
  private userSockets: Map<string, string[]> = new Map(); // userId -> socketIds

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(' ')[1];
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });

      const userId = payload.sub;
      client.data.userId = userId;

      const existingSockets = this.userSockets.get(userId) || [];
      this.userSockets.set(userId, [...existingSockets, client.id]);

      client.join(`user_${userId}`);
      this.logger.log(`User ${userId} connected with socket ${client.id}`);
    } catch (err) {
      this.logger.warn(`Koneksi WebSocket ditolak: Token tidak valid`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      const existingSockets = this.userSockets.get(userId) || [];
      const updatedSockets = existingSockets.filter((id) => id !== client.id);

      if (updatedSockets.length > 0) {
        this.userSockets.set(userId, updatedSockets);
      } else {
        this.userSockets.delete(userId);
      }

      this.logger.log(`User ${userId} disconnected from socket ${client.id}`);
    }
  }

  // Method to push notification to a specific user
  sendNotificationToUser(userId: string, payload: any) {
    this.server.to(`user_${userId}`).emit('new_notification', payload);
  }
}
