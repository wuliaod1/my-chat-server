const jwt = require('jsonwebtoken');
const User = require('../models/user.model.js');

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id).select('-password');
            if (!req.user) {
                return res.status(401).json({ message: '认证失败，未找到用户' });
            }
            next();
        } catch (error) {
            return res.status(401).json({ message: '认证失败，令牌无效' });
        }
    }

    if (!token) {
        return res.status(401).json({ message: '认证失败，没有提供令牌' });
    }
};

module.exports = { protect };
