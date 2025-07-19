import { createServer } from 'http';
import { Server } from 'socket.io';
import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcrypt';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*", // 允许所有来源的连接
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// PostgreSQL 连接池
const pool = new Pool({
  connectionString: "postgresql://maochat_db_user:rEAW4zVBnNXHrJuYzaSLHBll9XYlJNxc@dpg-d1te8ljipnbc73c89skg-a/maochat_db"
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// 数据库初始化
async function initializeDb() {
  try {
    const client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS friendships (
        id SERIAL PRIMARY KEY,
        user_id_1 INTEGER NOT NULL REFERENCES users(id),
        user_id_2 INTEGER NOT NULL REFERENCES users(id),
        status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'accepted', 'blocked'
        CONSTRAINT unique_friendship UNIQUE (user_id_1, user_id_2)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL REFERENCES users(id),
        receiver_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'sent' -- 'sent', 'delivered', 'read'
      );
    `);
    console.log('Database tables ensured.');
    client.release();
  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1);
  }
}

// 存储在线用户及其 Socket ID 的映射 (用于实时消息)
const connectedUsers = new Map(); // userId -> socketId

io.on('connection', (socket) => {
  console.log('A user connected with socket id:', socket.id);

  // 用户注册
  socket.on('register', async ({ username, password }, callback) => {
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const res = await pool.query(
        'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id',
        [username, hashedPassword]
      );
      callback({ success: true, userId: res.rows[0].id, message: 'Registration successful' });
    } catch (err) {
      if (err.code === '23505') { // 唯一约束冲突
        callback({ success: false, message: 'Username already exists' });
      } else {
        console.error('Registration error:', err);
        callback({ success: false, message: 'Registration failed' });
      }
    }
  });

  // 用户登录
  socket.on('login', async ({ username, password }, callback) => {
    try {
      const res = await pool.query('SELECT id, password_hash FROM users WHERE username = $1', [username]);
      if (res.rows.length > 0) {
        const user = res.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (match) {
          connectedUsers.set(user.id, socket.id); // 存储用户的 socket ID
          callback({ success: true, userId: user.id, username: username, message: 'Login successful' });
          // 可选：向好友发送上线状态
        } else {
          callback({ success: false, message: 'Invalid credentials' });
        }
      } else {
        callback({ success: false, message: 'Invalid credentials' });
      }
    } catch (err) {
      console.error('Login error:', err);
      callback({ success: false, message: 'Login failed' });
    }
  });

  // 添加好友
  socket.on('add_friend', async ({ userId, friendUsername }, callback) => {
    try {
      // 查找好友 ID
      const friendRes = await pool.query('SELECT id FROM users WHERE username = $1', [friendUsername]);
      if (friendRes.rows.length === 0) {
        callback({ success: false, message: 'Friend username not found' });
        return;
      }
      const friendId = friendRes.rows[0].id;

      if (userId === friendId) {
        callback({ success: false, message: 'Cannot add yourself as a friend' });
        return;
      }

      // 检查好友关系是否已存在 (双向)
      const existingFriendship = await pool.query(
        'SELECT * FROM friendships WHERE (user_id_1 = $1 AND user_id_2 = $2) OR (user_id_1 = $2 AND user_id_2 = $1)',
        [userId, friendId]
      );

      if (existingFriendship.rows.length > 0) {
        if (existingFriendship.rows[0].status === 'accepted') {
          callback({ success: false, message: 'Already friends' });
        } else if (existingFriendship.rows[0].status === 'pending') {
            if (existingFriendship.rows[0].user_id_1 === userId) {
                callback({ success: false, message: 'Friend request already sent' });
            } else {
                callback({ success: false, message: 'Friend request already received, please accept it' });
            }
        } else {
            callback({ success: false, message: 'Friendship status is ' + existingFriendship.rows[0].status });
        }
        return;
      }

      // 创建待处理的好友请求
      await pool.query(
        'INSERT INTO friendships (user_id_1, user_id_2, status) VALUES ($1, $2, $3)',
        [userId, friendId, 'pending']
      );

      // 如果好友在线，通知他们有新的好友请求
      const friendSocketId = connectedUsers.get(friendId);
      if (friendSocketId) {
        io.to(friendSocketId).emit('friend_request', { senderId: userId, senderUsername: (await pool.query('SELECT username FROM users WHERE id = $1', [userId])).rows[0].username });
      }

      callback({ success: true, message: 'Friend request sent' });
    } catch (err) {
      console.error('Add friend error:', err);
      callback({ success: false, message: 'Failed to send friend request' });
    }
  });

  // 接受好友请求
  socket.on('accept_friend_request', async ({ userId, requesterId }, callback) => {
    try {
      const res = await pool.query(
        'UPDATE friendships SET status = $1 WHERE user_id_1 = $2 AND user_id_2 = $3 AND status = $4 RETURNING *',
        ['accepted', requesterId, userId, 'pending']
      );

      if (res.rows.length > 0) {
        // 通知双方已成为好友
        const requesterUsername = (await pool.query('SELECT username FROM users WHERE id = $1', [requesterId])).rows[0].username;
        const currentUserUsername = (await pool.query('SELECT username FROM users WHERE id = $1', [userId])).rows[0].username;

        const requesterSocketId = connectedUsers.get(requesterId);
        if (requesterSocketId) {
          io.to(requesterSocketId).emit('friend_accepted', { friendId: userId, friendUsername: currentUserUsername });
        }
        socket.emit('friend_accepted', { friendId: requesterId, friendUsername: requesterUsername });

        callback({ success: true, message: 'Friend request accepted' });
      } else {
        callback({ success: false, message: 'Friend request not found or already accepted/rejected' });
      }
    } catch (err) {
      console.error('Accept friend request error:', err);
      callback({ success: false, message: 'Failed to accept friend request' });
    }
  });

  // 拒绝好友请求
  socket.on('reject_friend_request', async ({ userId, requesterId }, callback) => {
    try {
      const res = await pool.query(
        'DELETE FROM friendships WHERE user_id_1 = $1 AND user_id_2 = $2 AND status = $3 RETURNING *',
        [requesterId, userId, 'pending']
      );

      if (res.rows.length > 0) {
        // 可选：通知请求者他们的请求被拒绝了
        const requesterSocketId = connectedUsers.get(requesterId);
        if (requesterSocketId) {
          const currentUserUsername = (await pool.query('SELECT username FROM users WHERE id = $1', [userId])).rows[0].username;
          io.to(requ requesterSocketId).emit('friend_request_rejected', { byUserId: userId, byUsername: currentUserUsername });
        }
        callback({ success: true, message: 'Friend request rejected' });
      } else {
        callback({ success: false, message: 'Friend request not found or already processed' });
      }
    } catch (err) {
      console.error('Reject friend request error:', err);
      callback({ success: false, message: 'Failed to reject friend request' });
    }
  });

  // 获取用户的好友列表和待处理请求
  socket.on('get_friends_and_requests', async (userId, callback) => {
    try {
      const friendsRes = await pool.query(
        `SELECT
           CASE
             WHEN f.user_id_1 = $1 THEN u2.id
             ELSE u1.id
           END AS friend_id,
           CASE
             WHEN f.user_id_1 = $1 THEN u2.username
             ELSE u1.username
           END AS friend_username,
           f.status
         FROM friendships f
         JOIN users u1 ON f.user_id_1 = u1.id
         JOIN users u2 ON f.user_id_2 = u2.id
         WHERE (f.user_id_1 = $1 OR f.user_id_2 = $1) AND f.status = 'accepted'`,
        [userId]
      );

      const sentRequestsRes = await pool.query(
        `SELECT u2.id AS receiver_id, u2.username AS receiver_username
         FROM friendships f
         JOIN users u2 ON f.user_id_2 = u2.id
         WHERE f.user_id_1 = $1 AND f.status = 'pending'`,
        [userId]
      );

      const receivedRequestsRes = await pool.query(
        `SELECT u1.id AS sender_id, u1.username AS sender_username
         FROM friendships f
         JOIN users u1 ON f.user_id_1 = u1.id
         WHERE f.user_id_2 = $1 AND f.status = 'pending'`,
        [userId]
      );

      const friends = friendsRes.rows.map(row => ({ id: row.friend_id, username: row.friend_username, status: 'accepted', isOnline: !!connectedUsers.get(row.friend_id) }));
      const sentRequests = sentRequestsRes.rows.map(row => ({ id: row.receiver_id, username: row.receiver_username, status: 'pending_sent' }));
      const receivedRequests = receivedRequestsRes.rows.map(row => ({ id: row.sender_id, username: row.sender_username, status: 'pending_received' }));


      callback({
        success: true,
        friends: friends,
        sentRequests: sentRequests,
        receivedRequests: receivedRequests,
      });
    } catch (err) {
      console.error('Get friends and requests error:', err);
      callback({ success: false, message: 'Failed to retrieve friends and requests' });
    }
  });


  // 发送消息
  socket.on('send_message', async ({ senderId, receiverId, content }, callback) => {
    try {
      // 检查他们是否是好友
      const friendshipRes = await pool.query(
        'SELECT * FROM friendships WHERE ((user_id_1 = $1 AND user_id_2 = $2) OR (user_id_1 = $2 AND user_id_2 = $1)) AND status = $3',
        [senderId, receiverId, 'accepted']
      );

      if (friendshipRes.rows.length === 0) {
        callback({ success: false, message: 'You are not friends with this user.' });
        return;
      }

      const res = await pool.query(
        'INSERT INTO messages (sender_id, receiver_id, content, status) VALUES ($1, $2, $3, $4) RETURNING *',
        [senderId, receiverId, content, 'sent']
      );
      const message = res.rows[0];

      // 如果接收者在线，向其发送消息
      const receiverSocketId = connectedUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('new_message', {
          id: message.id,
          senderId: message.sender_id,
          receiverId: message.receiver_id,
          content: message.content,
          timestamp: message.timestamp,
          status: 'delivered'
        });
        // 更新数据库中消息状态为 'delivered'
        await pool.query('UPDATE messages SET status = $1 WHERE id = $2', ['delivered', message.id]);
        message.status = 'delivered'; // 更新本地对象的状态以供回调
      }
      callback({ success: true, message: message });
    } catch (err) {
      console.error('Send message error:', err);
      callback({ success: false, message: 'Failed to send message' });
    }
  });

  // 获取消息历史记录
  socket.on('get_message_history', async ({ userId, otherUserId }, callback) => {
    try {
      const res = await pool.query(
        `SELECT * FROM messages
         WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
         ORDER BY timestamp ASC`,
        [userId, otherUserId]
      );
      callback({ success: true, messages: res.rows });
    } catch (err) {
      console.error('Get message history error:', err);
      callback({ success: false, message: 'Failed to retrieve message history' });
    }
  });

  // 消息送达状态 (客户端会触发此事件)
  socket.on('message_delivered', async ({ messageId, receiverId }, callback) => {
    try {
      await pool.query('UPDATE messages SET status = $1 WHERE id = $2 AND receiver_id = $3', ['delivered', messageId, receiverId]);
      // 可选：通知发送者消息已送达
      const messageRes = await pool.query('SELECT sender_id FROM messages WHERE id = $1', [messageId]);
      if (messageRes.rows.length > 0) {
        const senderId = messageRes.rows[0].sender_id;
        const senderSocketId = connectedUsers.get(senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit('message_status_update', { messageId, status: 'delivered' });
        }
      }
      callback({ success: true });
    } catch (err) {
      console.error('Message delivered update error:', err);
      callback({ success: false });
    }
  });

  // 消息已读状态 (客户端会触发此事件)
  socket.on('message_read', async ({ messageId, receiverId }, callback) => {
    try {
      await pool.query('UPDATE messages SET status = $1 WHERE id = $2 AND receiver_id = $3', ['read', messageId, receiverId]);
      // 可选：通知发送者消息已读
      const messageRes = await pool.query('SELECT sender_id FROM messages WHERE id = $1', [messageId]);
      if (messageRes.rows.length > 0) {
        const senderId = messageRes.rows[0].sender_id;
        const senderSocketId = connectedUsers.get(senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit('message_status_update', { messageId, status: 'read' });
        }
      }
      callback({ success: true });
    } catch (err) {
      console.error('Message read update error:', err);
      callback({ success: false });
    }
  });

  // 处理断开连接
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // 从 connectedUsers 映射中移除用户
    for (let [userId, socketId] of connectedUsers.entries()) {
      if (socketId === socket.id) {
        connectedUsers.delete(userId);
        // 可选：通知好友此用户已离线
        break;
      }
    }
  });
});

initializeDb().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
  });
});