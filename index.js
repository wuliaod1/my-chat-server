import { createServer } from 'http';
import { Server } from 'socket.io';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*", // 允许所有来源的连接，方便我们本地开发和测试
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

io.on('connection', (socket) => {
  console.log('A user connected with socket id:', socket.id);

  // 监听客户端发来的'chat message'事件
  socket.on('chat message', (msg) => {
    console.log('message: ' + msg);
    // 将收到的消息广播给所有人，包括发送者自己
    io.emit('chat message', msg);
  });

  // 监听断开连接事件
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});