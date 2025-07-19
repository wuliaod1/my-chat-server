const db = require('../db');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

// 用户注册
exports.register = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: '用户名和密码不能为空' });
    }

    // 检查用户名是否存在
    const userExists = await db.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: '用户名已存在' });
    }

    // 密码加密
    const hashedPassword = bcrypt.hashSync(password, 10);
    const userId = uuidv4();

    // 创建用户
    await db.query(
      'INSERT INTO users (id, username, password) VALUES ($1, $2, $3)',
      [userId, username, hashedPassword]
    );

    res.status(201).json({
      message: '注册成功',
      user: { id: userId, username }
    });
  } catch (err) {
    console.error('注册错误:', err);
    res.status(500).json({ message: '服务器错误' });
  }
};

// 用户登录
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: '用户名和密码不能为空' });
    }

    // 查询用户
    const result = await db.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    // 验证密码
    const user = result.rows[0];
    const isPasswordValid = bcrypt.compareSync(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    // 返回用户信息（不含密码）
    const { password: _, ...userData } = user;
    res.json({ message: '登录成功', user: userData });
  } catch (err) {
    console.error('登录错误:', err);
    res.status(500).json({ message: '服务器错误' });
  }
};
    // 返回用户信息（不含密码）
    const { password: _, ...userData } = user;
    res.json({ message: '登录成功', user: userData });
  } catch (err) {
    console.error('登录错误:', err);
    res.status(500).json({ message: '服务器错误' });
  }
};const db = require('../db');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

// 用户注册
exports.register = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: '用户名和密码不能为空' });
    }

    // 检查用户名是否存在
    const userExists = await db.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: '用户名已存在' });
    }

    // 密码加密
    const hashedPassword = bcrypt.hashSync(password, 10);
    const userId = uuidv4();

    // 创建用户
    await db.query(
      'INSERT INTO users (id, username, password) VALUES ($1, $2, $3)',
      [userId, username, hashedPassword]
    );

    res.status(201).json({
      message: '注册成功',
      user: { id: userId, username }
    });
  } catch (err) {
    console.error('注册错误:', err);
    res.status(500).json({ message: '服务器错误' });
  }
};

// 用户登录
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: '用户名和密码不能为空' });
    }

    // 查询用户
    const result = await db.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    // 验证密码
    const user = result.rows[0];
    const isPasswordValid = bcrypt.compareSync(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    // 返回用户信息（不含密码）
    const { password: _, ...userData } = user;
    res.json({ message: '登录成功', user: userData });
  } catch (err) {
    console.error('登录错误:', err);
    res.status(500).json({ message: '服务器错误' });
  }
};
