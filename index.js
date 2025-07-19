import { createServer } from 'http';
import { Server } from 'socket.io';
import { Sequelize, DataTypes } from 'sequelize';
import bcrypt from 'bcrypt';

// 数据库配置
const DATABASE_URL = 'postgresql://maochat_db_user:rEAW4zVBmNXHrJuYzaSLHBll9XYlJNxc@dpg-d1te8ljipnbc73c89skg-a/maochat_db';
const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: { require: true, rejectUnauthorized: false }
  },
  logging: false,
  pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
});

// 数据模型定义
// 用户模型
const User = sequelize.define('User', {
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: { len: [2, 20] }
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

// 好友关系模型
const Friend = sequelize.define('Friend', {
  status: {
    type: DataTypes.ENUM('pending', 'accepted', 'rejected'),
    defaultValue: 'pending'
  }
});

// 消息模型（增加状态字段）
const Message = sequelize.define('Message', {
  text: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { len: [1, 500] }
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
});

// 模型关系
User.hasMany(Message, { foreignKey: 'senderId' });
Message.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });
Message.belongsTo(User, { foreignKey: 'receiverId', as: 'receiver' });

User.belongsToMany(User, { 
  through: Friend,
  foreignKey: 'userId',
  as: 'friends'
});
User.belongsToMany(User, { 
  through: Friend,
  foreignKey: 'friendId',
  as: 'friendOf'
});

// 服务器配置
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*", // 生产环境需改为具体域名
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 10;

// 工具函数
const hashPassword = async (password) => bcrypt.hash(password, SALT_ROUNDS);
const verifyPassword = async (password, hash) => bcrypt.compare(password, hash);

// 核心逻辑
io.on('connection', async (socket) => {
  let currentUser = null;
  console.log('New connection:', socket.id);

  // 1. 注册功能
  socket.on('register', async (userData, callback) => {
    try {
      const { username, password } = userData;
      if (!username || !password) {
        return callback({ success: false, message: '用户名和密码不能为空' });
      }

      const existingUser = await User.findOne({ where: { username } });
      if (existingUser) {
        return callback({ success: false, message: '用户名已存在' });
      }

      const hashedPassword = await hashPassword(password);
      const user = await User.create({
        username,
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
