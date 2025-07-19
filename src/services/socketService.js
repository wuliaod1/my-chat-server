const { Server } = require('socket.io');
const { User, Message } = require('../models');
const { updateMessageStatus } = require('./messageService');
const { verifyToken } = require('../utils/jwt');

let io;
const connectedUsers = new Map(); // userId -> socketId

const initSocketIO = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*", // 允许所有来源，生产环境请修改为您的前端域名
      methods: ["GET", "POST"]
    }
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return next(new Error('Authentication error: Invalid token'));
    }
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }
    socket.user = user;
    next();
  });

  io.on('connection', async (socket) => {
    const userId = socket.user.id;
    console.log(`用户 ${socket.user.username} (ID: ${userId}) 已连接 WebSocket`);

    connectedUsers.set(userId, socket.id);
    await User.update({ status: 'online', lastOnline: new Date() }, { where: { id: userId } });
    io.emit('userStatusChange', { userId, status: 'online' }); // 通知所有在线用户

    // 加入以自己用户ID命名的房间，方便后续点对点消息发送
    socket.join(userId);

    socket.on('sendMessage', async (data, callback) => {
      try {
        const { receiverId, content } = data;
        const senderId = socket.user.id;

        // 调用消息服务创建消息，这里会进行好友关系校验
        const message = await Message.create({ senderId, receiverId, content, status: 'sent' });

        const receiverSocketId = connectedUsers.get(receiverId);

        // 如果接收方在线，则发送消息并更新状态为 delivered
        if (receiverSocketId) {
          const deliveredMessage = await updateMessageStatus(message.id, 'delivered', receiverId);
          io.to(receiverSocketId).emit('receiveMessage', deliveredMessage);
          // 通知发送方消息已送达
          socket.emit('messageStatusUpdate', { messageId: deliveredMessage.id, status: 'delivered' });
        }

        if (callback) {
          callback({ success: true, message });
        }
      } catch (error) {
const { Server } = require('socket.io');
const { User, Message } = require('../models');
const { updateMessageStatus } = require('./messageService');
const { verifyToken } = require('../utils/jwt');

let io;
const connectedUsers = new Map(); // userId -> socketId

const initSocketIO = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*", // 允许所有来源，生产环境请修改为您的前端域名
      methods: ["GET", "POST"]
    }
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return next(new Error('Authentication error: Invalid token'));
    }
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }
    socket.user = user;
    next();
  });

  io.on('connection', async (socket) => {
    const userId = socket.user.id;
    console.log(`用户 ${socket.user.username} (ID: ${userId}) 已连接 WebSocket`);

    connectedUsers.set(userId, socket.id);
    await User.update({ status: 'online', lastOnline: new Date() }, { where: { id: userId } });
    io.emit('userStatusChange', { userId, status: 'online' }); // 通知所有在线用户

    // 加入以自己用户ID命名的房间，方便后续点对点消息发送
    socket.join(userId);

    socket.on('sendMessage', async (data, callback) => {
      try {
        const { receiverId, content } = data;
        const senderId = socket.user.id;

        // 调用消息服务创建消息，这里会进行好友关系校验
        const message = await Message.create({ senderId, receiverId, content, status: 'sent' });

        const receiverSocketId = connectedUsers.get(receiverId);

        // 如果接收方在线，则发送消息并更新状态为 delivered
        if (receiverSocketId) {
          const deliveredMessage = await updateMessageStatus(message.id, 'delivered', receiverId);
          io.to(receiverSocketId).emit('receiveMessage', deliveredMessage);
          // 通知发送方消息已送达
          socket.emit('messageStatusUpdate', { messageId: deliveredMessage.id, status: 'delivered' });
        }

        if (callback) {
          callback({ success: true, message });
        }
      } catch (error) {
        console.error('发送消息失败:', error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    socket.on('markMessageAsRead', async (messageId, callback) => {
      try {
        const userId = socket.user.id;
        const message = await updateMessageStatus(messageId, 'read', userId);
        // 通知发送方消息已读
        const senderSocketId = connectedUsers.get(message.senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit('messageStatusUpdate', { messageId: message.id, status: 'read' });
        }
        if (callback) {
          callback({ success: true, message });
        }
      } catch (error) {
        console.error('标记消息为已读失败:', error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    socket.on('disconnect', async () => {
      console.log(`用户 ${socket.user.username} (ID: ${userId}) 已断开 WebSocket`);
      connectedUsers.delete(userId);
      await User.update({ status: 'offline', lastOnline: new Date() }, { where: { id: userId } });
      io.emit('userStatusChange', { userId, status: 'offline' }); // 通知所有在线用户
    });
  });

  return io;
};

const getIo = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized!');
  }
  return io;
};

module.exports = {
  initSocketIO,
  getIo,
  connectedUsers
};        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    socket.on('disconnect', async () => {
      console.log(`用户 ${socket.user.username} (ID: ${userId}) 已断开 WebSocket`);
      connectedUsers.delete(userId);
      await User.update({ status: 'offline', lastOnline: new Date() }, { where: { id: userId } });
      io.emit('userStatusChange', { userId, status: 'offline' }); // 通知所有在线用户
    });
  });

  return io;
};

const getIo = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized!');
  }
  return io;
};

module.exports = {
  initSocketIO,
  getIo,
  connectedUsers
};
