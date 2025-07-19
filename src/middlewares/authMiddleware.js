const { verifyToken } = require('../utils/jwt');
const User = require('../models/user');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: '授权失败：缺少令牌' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ message: '授权失败：无效令牌' });
  }

  try {
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(404).json({ message: '用户未找到' });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('认证中间件错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
};

module.exports = authMiddleware;
