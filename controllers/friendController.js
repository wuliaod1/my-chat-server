const db = require('../db');
const { v4: uuidv4 } = require('uuid');

// 添加好友（发送请求）
exports.addFriend = async (req, res) => {
  try {
    const { userId, friendUsername } = req.body;
    if (!userId || !friendUsername) {
      return res.status(400).json({ message: '用户ID和好友用户名不能为空' });
    }

    // 查找好友
    const friendResult = await db.query(
      'SELECT id FROM users WHERE username = $1',
      [friendUsername]
    );
    if (friendResult.rows.length === 0) {
      return res.status(404).json({ message: '好友不存在' });
    }
    const friendId = friendResult.rows[0].id;

    // 不能添加自己
    if (userId === friendId) {
      return res.status(400).json({ message: '不能添加自己为好友' });
    }

    // 检查是否已发送请求
    const existing = await db.query(
      'SELECT * FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)',
      [userId, friendId]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: '好友关系已存在' });
    }

    // 创建好友请求
    await db.query(
      'INSERT INTO friends (id, user_id, friend_id, status) VALUES ($1, $2, $3, $4)',
      [uuidv4(), userId, friendId, 'pending']
    );

    res.status(201).json({ message: '好友请求已发送' });
  } catch (err) {
    console.error('添加好友错误:', err);
    res.status(500).json({ message: '服务器错误' });
  }
};

// 接受好友请求
exports.acceptFriend = async (req, res) => {
  try {
    const { userId, friendId } = req.body;
    if (!userId || !friendId) {
      return res.status(400).json({ message: '用户ID和好友ID不能为空' });
    }

    // 更新请求状态
    await db.query(
      'UPDATE friends SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND friend_id = $3 AND status = $4',
      ['accepted', friendId, userId, 'pending']
    );

    // 创建反向关系
    await db.query(
      'INSERT INTO friends (id, user_id, friend_id, status) VALUES ($1, $2, $3, $4)',
      [uuidv4(), userId, friendId, 'accepted']
    );

    res.json({ message: '已接受好友请求' });
  } catch (err) {
    console.error('接受好友错误:', err);
    res.status(500).json({ message: '服务器错误' });
  }
};

// 获取好友列表
exports.getFriends = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ message: '用户ID不能为空' });
    }

    const friends = await db.query(
      `SELECT u.id, u.username, f.created_at 
       FROM friends f
       JOIN users u ON f.friend_id = u.id
       WHERE f.user_id = $1 AND f.status = $2`,
      [userId, 'accepted']
    );

    res.json({ friends: friends.rows });
  } catch (err) {
    console.error('获取好友列表错误:', err);
    res.status(500).json({ message: '服务器错误' });
  }
};