import { createServer } from 'http';
import { Server } from 'socket.io';
import { Sequelize, DataTypes } from 'sequelize';
import bcrypt from 'bcrypt';

// --- 1. 数据库设置 ---
const DATABASE_URL = 'postgresql://maochat_db_user:rEAW4zVBmNXHrJuYzaSLHBll9XYlJNxc@dpg-d1te8ljipnbc73c89skg-a/maochat_db';

// 连接到数据库
const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: false
});

// 定义模型
const User = sequelize.define('User', {
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  online: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
});

const Friend = sequelize.define('Friend', {
  status: {
    type: DataTypes.ENUM('pending', 'accepted', 'rejected'),
    defaultValue: 'pending'
  }
});

const Message = sequelize.define('Message', {
  text: {
    type: DataTypes.STRING,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('sent', 'delivered', 'read'),
    defaultValue: 'sent'
  }
});

// 定义关联关系
User.belongsToMany(User, { 
  through: Friend, 
  as: 'Friends', 
  foreignKey: 'userId',
  otherKey: 'friendId'
});

Message.belongsTo(User, { as: 'Sender', foreignKey: 'senderId' });
Message.belongsTo(User, { as: 'Receiver', foreignKey: 'receiverId' });
User.hasMany(Message, { as: 'SentMessages', foreignKey: 'senderId' });
User.hasMany(Message, { as: 'ReceivedMessages', foreignKey: 'receiverId' });

// --- 2. 服务器设置 ---
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// 存储用户socket映射
const userSocketMap = new Map();

// --- 3. 核心逻辑 ---
io.on('connection', async (socket) => {
  console.log('A user connected:', socket.id);

  // 注册功能
  socket.on('register', async (userData) => {
    try {
      // 检查用户名是否已存在
      const existingUser = await User.findOne({ where: { username: userData.username } });
      if (existingUser) {
        return socket.emit('register response', { success: false, message: '用户名已存在' });
      }

      // 密码加密
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      // 创建新用户
      const newUser = await User.create({
        username: userData.username,
        password: hashedPassword
      });

      // 返回用户信息（不含密码）
      const userWithoutPassword = { ...newUser.toJSON() };
      delete userWithoutPassword.password;
      
      socket.emit('register response', { 
        success: true, 
        message: '注册成功',
        user: userWithoutPassword
      });
    } catch (error) {
      console.error('注册错误:', error);
      socket.emit('register response', { success: false, message: '注册失败' });
    }
  });

  // 登录功能
  socket.on('login', async (credentials) => {
    try {
      // 查找用户
      const user = await User.findOne({ where: { username: credentials.username } });
      if (!user) {
        return socket.emit('login response', { success: false, message: '用户名不存在' });
      }

      // 验证密码
      const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
      if (!isPasswordValid) {
        return socket.emit('login response', { success: false, message: '密码错误' });
      }

      // 更新在线状态
      await user.update({ online: true });
      
      // 存储用户与socket的映射
      userSocketMap.set(user.id, socket.id);
      socket.userId = user.id;

      // 返回用户信息（不含密码）
      const userWithoutPassword = { ...user.toJSON() };
      delete userWithoutPassword.password;
      
      socket.emit('login response', { 
        success: true, 
        message: '登录成功',
        user: userWithoutPassword
      });

      // 通知好友该用户上线
      const friends = await User.findAll({
        include: [{
          model: User,
          as: 'Friends',
          through: { where: { status: 'accepted' } },
          where: { id: user.id }
        }]
      });
      
      friends.forEach(friend => {
        const friendSocketId = userSocketMap.get(friend.id);
        if (friendSocketId) {
          io.to(friendSocketId).emit('user status change', {
            userId: user.id,
            username: user.username,
            online: true
          });
        }
      });
    } catch (error) {
      console.error('登录错误:', error);
      socket.emit('login response', { success: false, message: '登录失败' });
    }
  });

  // 添加好友功能
  socket.on('add friend', async (data) => {
    try {
      const { currentUserId, friendUsername } = data;
      
      // 查找好友用户
      const friendUser = await User.findOne({ where: { username: friendUsername } });
      if (!friendUser) {
        return socket.emit('add friend response', { success: false, message: '用户不存在' });
      }
      
      // 不能添加自己为好友
      if (friendUser.id === currentUserId) {
        return socket.emit('add friend response', { success: false, message: '不能添加自己为好友' });
      }
      
      // 检查是否已发送过请求
      const existingRequest = await Friend.findOne({
        where: {
          userId: currentUserId,
          friendId: friendUser.id
        }
      });
      
      if (existingRequest) {
        return socket.emit('add friend response', { 
          success: false, 
          message: '已发送过好友请求' 
        });
      }
      
      // 创建好友请求
      await Friend.create({
        userId: currentUserId,
        friendId: friendUser.id,
        status: 'pending'
      });
      
      // 通知被请求用户
      const friendSocketId = userSocketMap.get(friendUser.id);
      if (friendSocketId) {
        io.to(friendSocketId).emit('friend request', {
          fromUser: {
            id: (await User.findByPk(currentUserId)).id,
            username: (await User.findByPk(currentUserId)).username
          }
        });
      }
      
      socket.emit('add friend response', { 
        success: true, 
        message: '好友请求已发送' 
      });
    } catch (error) {
      console.error('添加好友错误:', error);
      socket.emit('add friend response', { success: false, message: '添加好友失败' });
    }
  });

  // 处理好友请求
  socket.on('respond to friend request', async (data) => {
    try {
      const { requestUserId, response, currentUserId } = data;
      
      // 更新好友请求状态
      await Friend.update(
        { status: response === 'accept' ? 'accepted' : 'rejected' },
        { where: { userId: requestUserId, friendId: currentUserId } }
      );
      
      // 如果接受请求，创建反向关系
      if (response === 'accept') {
        await Friend.create({
          userId: currentUserId,
          friendId: requestUserId,
          status: 'accepted'
        });
      }
      
      // 通知请求方
      const requestUserSocketId = userSocketMap.get(requestUserId);
      if (requestUserSocketId) {
        io.to(requestUserSocketId).emit('friend request response', {
          fromUser: {
            id: (await User.findByPk(currentUserId)).id,
            username: (await User.findByPk(currentUserId)).username
          },
          response
        });
      }
      
      socket.emit('respond to friend request response', { 
        success: true, 
        message: response === 'accept' ? '已接受好友请求' : '已拒绝好友请求'
      });
    } catch (error) {
      console.error('处理好友请求错误:', error);
      socket.emit('respond to friend request response', { success: false, message: '处理请求失败' });
    }
  });

  // 获取好友列表
  socket.on('get friends', async (userId) => {
    try {
      // 获取已接受的好友
      const friends = await User.findByPk(userId, {
        include: [{
          model: User,
          as: 'Friends',
          through: { where: { status: 'accepted' } },
          attributes: ['id', 'username', 'online']
        }]
      });
      
      socket.emit('friends list', {
        friends: friends.Friends.map(friend => ({
          id: friend.id,
          username: friend.username,
          online: friend.online
        }))
      });
    } catch (error) {
      console.error('获取好友列表错误:', error);
      socket.emit('friends list', { friends: [] });
    }
  });

  // 发送消息
  socket.on('private message', async (messageData) => {
    try {
      const { senderId, receiverId, text } = messageData;
      
      // 检查是否是好友
      const isFriend = await Friend.findOne({
        where: {
          userId: senderId,
          friendId: receiverId,
          status: 'accepted'
        }
      });
      
      if (!isFriend) {
        return socket.emit('message response', { 
          success: false, 
          message: '只能给好友发送消息' 
        });
      }
      
      // 保存消息
      const message = await Message.create({
        senderId,
        receiverId,
        text,
        status: 'sent'
      });
      
      // 完整消息信息
      const fullMessage = {
        id: message.id,
        text: message.text,
        status: message.status,
        createdAt: message.createdAt,
        sender: {
          id: (await User.findByPk(senderId)).id,
          username: (await User.findByPk(senderId)).username
        },
        receiver: {
          id: (await User.findByPk(receiverId)).id,
          username: (await User.findByPk(receiverId)).username
        }
      };
      
      // 发送给接收者
      const receiverSocketId = userSocketMap.get(receiverId);
      if (receiverSocketId) {
        // 更新消息状态为已送达
        message.status = 'delivered';
        await message.save();
        fullMessage.status = 'delivered';
        
        io.to(receiverSocketId).emit('new message', fullMessage);
      }
      
      // 发送给发送者
      socket.emit('message response', {
        success: true,
        message: fullMessage
      });
    } catch (error) {
      console.error('发送消息错误:', error);
      socket.emit('message response', { success: false, message: '发送消息失败' });
    }
  });

  // 标记消息为已读
  socket.on('message read', async (messageId) => {
    try {
      const message = await Message.findByPk(messageId);
      if (!message) return;
      
      // 更新消息状态
      message.status = 'read';
      await message.save();
      
      // 通知发送者消息已读
      const senderSocketId = userSocketMap.get(message.senderId);
      if (senderSocketId) {
        io.to(senderSocketId).emit('message status update', {
          messageId: message.id,
          status: 'read'
        });
      }
      
      socket.emit('read confirmation', { messageId, status: 'read' });
    } catch (error) {
      console.error('标记已读错误:', error);
    }
  });

  // 获取聊天历史
  socket.on('get chat history', async (data) => {
    try {
      const { userId, friendId } = data;
      
      // 获取两人之间的消息
      const messages = await Message.findAll({
        where: {
          [Sequelize.Op.or]: [
            { senderId: userId, receiverId: friendId },
            { senderId: friendId, receiverId: userId }
          ]
        },
        order: [['createdAt', 'ASC']],
        limit: 100
      });
      
      // 格式化消息
      const formattedMessages = await Promise.all(messages.map(async (msg) => ({
        id: msg.id,
        text: msg.text,
        status: msg.status,
        createdAt: msg.createdAt,
        sender: {
          id: (await User.findByPk(msg.senderId)).id,
          username: (await User.findByPk(msg.senderId)).username
        },
        receiver: {
          id: (await User.findByPk(msg.receiverId)).id,
          username: (await User.findByPk(msg.receiverId)).username
        }
      })));
      
      socket.emit('chat history', {
        messages: formattedMessages,
        friend: {
          id: (await User.findByPk(friendId)).id,
          username: (await User.findByPk(friendId)).username
        }
      });
      
      // 标记接收的消息为已读
      await Message.update(
        { status: 'read' },
        {
          where: {
            senderId: friendId,
            receiverId: userId,
            status: { [Sequelize.Op.in]: ['sent', 'delivered'] }
          }
        }
      );
      
      // 通知发送者消息已读
      const friendSocketId = userSocketMap.get(friendId);
      if (friendSocketId) {
        io.to(friendSocketId).emit('messages read', {
          receiverId: userId,
          status: 'read'
        });
      }
    } catch (error) {
      console.error('获取聊天历史错误:', error);
      socket.emit('chat history', { messages: [] });
    }
  });

  // 断开连接
  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    
    if (socket.userId) {
      // 更新用户在线状态
      const user = await User.findByPk(socket.userId);
      if (user) {
        user.online = false;
        await user.save();
        
        // 从映射中移除
        userSocketMap.delete(socket.userId);
        
        // 通知好友该用户下线
        const friends = await User.findAll({
          include: [{
            model: User,
            as: 'Friends',
            through: { where: { status: 'accepted' } },
            where: { id: socket.userId }
          }]
        });
        
        friends.forEach(friend => {
          const friendSocketId = userSocketMap.get(friend.id);
          if (friendSocketId) {
            io.to(friendSocketId).emit('user status change', {
              userId: user.id,
              username: user.username,
              online: false
            });
          }
        });
      }
    }
  });
});

// --- 4. 启动服务器 ---
async function startServer() {
  try {
    // 同步数据库模型
    await sequelize.sync({ alter: true }); // 使用alter: true来自动更新表结构
    console.log('Database synced successfully.');
    
    httpServer.listen(PORT, () => {
      console.log(`Server is listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('Unable to connect to the database or start server:', error);
  }
}

startServer();
        password: hashedPassword
      });

      callback({ 
        success: true, 
        user: { id: user.id, username: user.username } 
      });
    } catch (error) {
      console.error('注册错误:', error);
      callback({ success: false, message: '注册失败' });
    }
  });

  // 2. 登录功能（基础验证）
  socket.on('login', async (credentials, callback) => {
    try {
      const { username, password } = credentials;
      const user = await User.findOne({ where: { username } });
      
      if (!user || !(await verifyPassword(password, user.password))) {
        return callback({ success: false, message: '用户名或密码错误' });
      }

      // 更新在线状态
      await user.update({ online: true });
      currentUser = user;
      socket.userId = user.id;
      socket.join(`user:${user.id}`); // 加入个人房间

      // 返回用户信息和好友列表
      const friends = await user.getFriends({
        through: { attributes: ['status'] },
        attributes: ['id', 'username', 'online']
      });

      callback({
        success: true,
        user: { id: user.id, username: user.username },
        friends
      });

      // 通知好友当前用户上线
      io.to(friends.map(f => `user:${f.id}`)).emit('friend online', user.id);
    } catch (error) {
      console.error('登录错误:', error);
      callback({ success: false, message: '登录失败' });
    }
  });

  // 3. 添加好友功能
  socket.on('add friend', async (friendUsername, callback) => {
    if (!currentUser) return callback({ success: false, message: '请先登录' });

    try {
      const friend = await User.findOne({ where: { username: friendUsername } });
      if (!friend) {
        return callback({ success: false, message: '用户不存在' });
      }
      if (friend.id === currentUser.id) {
        return callback({ success: false, message: '不能添加自己为好友' });
      }

      // 检查是否已存在好友关系
      const existing = await Friend.findOne({
        where: {
          userId: currentUser.id,
          friendId: friend.id
        }
      });
      if (existing) {
        return callback({ success: false, message: '已发送过好友请求' });
      }

      // 创建好友请求
      await Friend.create({
        userId: currentUser.id,
        friendId: friend.id
      });

      // 通知被添加方
      io.to(`user:${friend.id}`).emit('friend request', {
        from: { id: currentUser.id, username: currentUser.username }
      });

      callback({ success: true, message: '好友请求已发送' });
    } catch (error) {
      console.error('添加好友错误:', error);
      callback({ success: false, message: '添加失败' });
    }
  });

  // 4. 处理好友请求（接受/拒绝）
  socket.on('handle friend request', async (data, callback) => {
    if (!currentUser) return callback({ success: false, message: '请先登录' });

    try {
      const { friendId, accept } = data;
      const friendRequest = await Friend.findOne({
        where: { userId: friendId, friendId: currentUser.id }
      });

      if (!friendRequest) {
        return callback({ success: false, message: '好友请求不存在' });
      }

      // 更新状态
      await friendRequest.update({
        status: accept ? 'accepted' : 'rejected'
      });

      // 如果接受，创建反向关系
      if (accept) {
        await Friend.create({
          userId: currentUser.id,
          friendId,
          status: 'accepted'
        });

        // 通知双方好友已添加
        const [user1, user2] = await Promise.all([
          User.findByPk(currentUser.id, { attributes: ['id', 'username'] }),
          User.findByPk(friendId, { attributes: ['id', 'username'] })
        ]);

        io.to(`user:${friendId}`).emit('friend added', {
          friend: { id: user1.id, username: user1.username, status: 'accepted' }
        });
        io.to(`user:${currentUser.id}`).emit('friend added', {
          friend: { id: user2.id, username: user2.username, status: 'accepted' }
        });
      }

      callback({ success: true });
    } catch (error) {
      console.error('处理好友请求错误:', error);
      callback({ success: false, message: '处理失败' });
    }
  });

  // 5. 发送消息（支持单聊）
  socket.on('private message', async (data, callback) => {
    if (!currentUser) return callback({ success: false, message: '请先登录' });

    try {
      const { receiverId, text } = data;
      const receiver = await User.findByPk(receiverId);
      
      if (!receiver) {
        return callback({ success: false, message: '接收用户不存在' });
      }

      // 检查是否是好友
      const isFriend = await Friend.findOne({
        where: {
          userId: currentUser.id,
          friendId: receiverId,
          status: 'accepted'
        }
      });

      if (!isFriend) {
        return callback({ success: false, message: '仅好友可发送消息' });
      }

      // 保存消息
      const message = await Message.create({
        text,
        senderId: currentUser.id,
        receiverId,
        isRead: false
      });

      // 关联发送者信息
      const fullMessage = await Message.findByPk(message.id, {
        include: [{ model: User, as: 'sender', attributes: ['id', 'username'] }]
      });

      // 发送给接收者
      io.to(`user:${receiverId}`).emit('private message', fullMessage);
      // 确认发送者
      callback({ success: true, message: fullMessage });
    } catch (error) {
      console.error('发送消息错误:', error);
      callback({ success: false, message: '发送失败' });
    }
  });

  // 6. 消息已读状态更新
  socket.on('message read', async (messageId, callback) => {
    if (!currentUser) return callback({ success: false, message: '请先登录' });

    try {
      const message = await Message.findOne({
        where: { id: messageId, receiverId: currentUser.id }
      });

      if (!message) {
        return callback({ success: false, message: '消息不存在' });
      }

      // 更新已读状态
      await message.update({ isRead: true });

      // 通知发送者消息已读
      io.to(`user:${message.senderId}`).emit('message status', {
        messageId: message.id,
        isRead: true
      });

      callback({ success: true });
    } catch (error) {
      console.error('更新已读状态错误:', error);
      callback({ success: false, message: '更新失败' });
    }
  });

  // 7. 获取历史消息
  socket.on('get history', async (friendId, callback) => {
    if (!currentUser) return callback({ success: false, message: '请先登录' });

    try {
      const messages = await Message.findAll({
        where: {
          [Sequelize.Op.or]: [
            { senderId: currentUser.id, receiverId: friendId },
            { senderId: friendId, receiverId: currentUser.id }
          ]
        },
        order: [['createdAt', 'ASC']],
        include: [{ model: User, as: 'sender', attributes: ['id', 'username'] }],
        limit: 100
      });

      callback({ success: true, messages });
    } catch (error) {
      console.error('获取历史消息错误:', error);
      callback({ success: false, message: '获取失败' });
    }
  });

  // 断开连接处理
  socket.on('disconnect', async () => {
    if (currentUser) {
      await currentUser.update({ online: false });
      // 通知好友当前用户下线
      const friends = await currentUser.getFriends();
      io.to(friends.map(f => `user:${f.id}`)).emit('friend offline', currentUser.id);
      console.log(`User ${currentUser.username} disconnected`);
    }
    console.log('Connection closed:', socket.id);
  });
});

// 启动服务器
async function startServer() {
  try {
    await sequelize.sync({ alter: true }); // 自动更新表结构
    console.log('Database synced successfully');
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Server start error:', error);
  }
}

startServer();
