import { createServer } from 'http';
import { Server } from 'socket.io';
import { Sequelize, DataTypes } from 'sequelize';

// --- 1. 数据库设置 ---
const DATABASE_URL = 'postgresql://maochat_db_user:rEAW4zVBmNXHrJuYzaSLHBll9XYlJNxc@dpg-d1te8ljipnbc73c89skg-a/maochat_db';

// 连接到你的 Render PostgreSQL 数据库
const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false // Render 数据库需要这个设置
    }
  },
  logging: false // 关闭日志打印，保持控制台干净
});

// 定义一个 "Message" 模型，它对应数据库里的 "messages" 表
const Message = sequelize.define('Message', {
  username: {
    type: DataTypes.STRING,
    allowNull: false
  },
  text: {
    type: DataTypes.STRING,
    allowNull: false
  }
});

// --- 2. 服务器设置 ---
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// --- 3. 核心逻辑 ---
io.on('connection', async (socket) => {
  console.log('A user connected:', socket.id);

  // 当有新用户连接时，立即发送历史消息
  try {
    const history = await Message.findAll({
      order: [['createdAt', 'ASC']], // 按时间顺序
      limit: 50 // 只发送最近的50条
    });
    // 只把历史记录发给这个刚刚连接的用户
    socket.emit('chat history', history);
  } catch (error) {
    console.error('Error fetching history:', error);
  }

  // 监听新的聊天消息
  socket.on('chat message', async (msg) => {
    // msg 现在应该是一个对象，比如 { username: '张三', text: '你好' }
    if (msg && msg.username && msg.text) {
      console.log(`Message from ${msg.username}: ${msg.text}`);
      
      try {
        // 将消息存入数据库
        const savedMessage = await Message.create({
          username: msg.username,
          text: msg.text
        });
        // 将保存后的、包含所有信息（如ID和时间戳）的消息广播给所有人
        io.emit('chat message', savedMessage);
      } catch (error) {
        console.error('Error saving message:', error);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// --- 4. 启动服务器 ---
async function startServer() {
  try {
    // 同步数据库模型，如果 "messages" 表不存在，就创建它
    await sequelize.sync(); 
    console.log('Database synced successfully.');
    
    httpServer.listen(PORT, () => {
      console.log(`Server is listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('Unable to connect to the database or start server:', error);
  }
}

startServer();
