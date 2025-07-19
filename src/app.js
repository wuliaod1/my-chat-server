const express = require('express');
const http = require('http');
const config = require('./config');
const { connectDB } = require('./models');
const { initSocketIO } = require('./services/socketService');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const messageRoutes = require('./routes/messageRoutes');

const app = express();
const server = http.createServer(app);

// 初始化 WebSocket
initSocketIO(server);

// 中间件
app.use(express.json()); // 用于解析 JSON 请求体

// CORS 配置 (开发环境允许所有，生产环境请根据需求配置)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  next();
});

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);

// 健康检查路由
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// 连接数据库并启动服务器
connectDB().then(() => {
  server.listen(config.port, () => {
    console.log(`服务器运行在端口 ${config.port}`);
  });
}).catch(err => {
  console.error('启动服务器失败:', err);
  process.exit(1);
});

module.exports = app;
