const db = require('../db');
const { v4: uuidv4 } = require('uuid');

// 发送消息
exports.sendMessage = async (req, res) => {
  try {
    const { senderId, receiverId, content } = req.body;
    if (!senderId || !receiverId || !content) {
      return res.status(400).json({ message: '发送者、接收者和内容不能为空' });
    }

    // 检查是否为好友
    const isFriend = await db.query(
      'SELECT * FROM friends WHERE (user_id = $1 AND friend_id = $2 AND status = $3) OR (user_id = $2 AND friend_id = $1 AND status = $3)',
      [senderId, receiverId, 'accepted']
    );
    if (isFriend.rows.length === 0) {
      return res.status(403).json({ message: '只能给好友发送消息' });
    }

    // 创建消息
    const messageId = uuidv4();
    await db.query(
      'INSERT INTO messages (id, sender_id, receiver_id, content, status) VALUES ($1, $2, $3, $4, $5)',
      [messageId, senderId, receiverId, content, 'sent']
    );

    res.status(201).json({
      message: '消息发送成功',
      data: { id: messageId, senderId, receiverId, content, status: 'sent' }
    });
  } catch (err) {
    console.error('发送消息错误:', err);
    res.status(500).json({ message: '服务器错误' });
  }
};

// 获取消息列表
exports.getMessages = async (req, res) => {
  try {
    const { userId, friendId } = req.query;
    if (!userId || !friendId) {
      return res.status(400).json({ message: '用户ID和好友ID不能为空' });
    }

    // 获取消息
    const messages = await db.query(
      `SELECT * FROM messages 
       WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
       ORDER BY created_at ASC`,
      [userId, friendId]
    );

    // 更新接收消息为已送达
    const unreadMessages = messages.rows
      .filter(m => m.receiver_id === userId && m.status !== 'read')
      .map(m => m.id);

    if (unreadMessages.length > 0) {
      await db.query(
        `UPDATE messages SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($2)`,
        ['delivered', unreadMessages]
      );
    }

    res.json({ messages: messages.rows });
  } catch (err) {
    console.error('获取消息错误:', err);
    res.status(500).json({ message: '服务器错误' });
  }
};

// 标记消息为已读
exports.markAsRead = async (req, res) => {
  try {
    const { messageId, userId } = req.body;
    if (!messageId || !userId) {
      return res.status(400).json({ message: '消息ID和用户ID不能为空' });
    }

    await db.query(
      'UPDATE messages SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND receiver_id = $3',
      ['read', messageId, userId]
    );

    res.json({ message: '消息已标记为已读' });
  } catch (err) {
    console.error('标记已读错误:', err);
    res.status(500).json({ message: '服务器错误' });
  }
};