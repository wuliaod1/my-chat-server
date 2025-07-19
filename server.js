require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require("socket.io");
const initializeSocket = require('./socket/socket');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

// 初始化 Socket.IO，并设定 CORS
const io = new Server(server, {
  cors: {
    origin: "*", // 在生产中，请务必将其更改为您的前端 URL
    methods: ["GET", "POST"]
  }
});

// 将 io 实例传递给 socket 初始化函数
initializeSocket(io);

// API 路由
app.use('/api/users', require('./routes/user.routes'));

// 根路由，用于 Render 的健康检查
app.get('/', (req, res) => {
  res.send('Backend is alive and running!');
});

// 从环境变量中获取 PORT，这是 Render 的标准做法
const PORT = process.env.PORT || 3001;

// 连接 MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Successfully connected to MongoDB.');
    server.listen(PORT, () => {
      console.log(`Server is listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1); // 如果无法连接数据库，则退出进程
  });