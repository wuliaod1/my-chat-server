const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./db');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 路由
app.use('/api', routes);

// 启动服务器
async function startServer() {
  await db.initializeTables();
  app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
  });
}

startServer();
