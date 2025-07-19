// /routes/user.routes.js

const express = require('express');
const router = express.Router();
const User = require('../models/user.model.js');
const Message = require('../models/message.model.js');
const jwt = require('jsonwebtoken');
const { protect } = require('../middleware/auth.js');
// 新增: 引入 web-push 库
const webPush = require('web-push');

// 辅助函数：生成 JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// --- (原有的 注册、登录、搜索、好友请求、好友列表、历史记录 等路由保持不变) ---
// 1. 注册功能
router.post('/register', async (req, res) => { /* ... 此处代码不变 ... */
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: '请输入所有字段' });
    const userExists = await User.findOne({ username });
    if (userExists) return res.status(400).json({ message: '用户名已存在' });
    try {
        const user = await User.create({ username, password });
        res.status(201).json({ _id: user._id, username: user.username, token: generateToken(user._id) });
    } catch (error) {
        res.status(400).json({ message: '用户数据无效', error: error.message });
    }
});

// 登录功能
router.post('/login', async (req, res) => { /* ... 此处代码不变 ... */
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (user && (await user.matchPassword(password))) {
        res.json({ _id: user._id, username: user.username, token: generateToken(user._id) });
    } else {
        res.status(401).json({ message: '无效的用户名或密码' });
    }
});

// 2. 添加好友功能
router.get('/search', protect, async (req, res) => { /* ... 此处代码不变 ... */
    const users = await User.find({
        username: { $regex: req.query.q || '', $options: 'i' },
        _id: { $ne: req.user._id }
    }).select('username _id');
    res.json(users);
});

router.post('/friend-request', protect, async (req, res) => { /* ... 此处代码不变 ... */
    const { recipientId } = req.body;
    const sender = req.user;
    const recipient = await User.findById(recipientId);
    if (!recipient) return res.status(404).json({ message: '未找到该用户' });
    if (recipient.friends.includes(sender._id) || sender.friends.includes(recipient._id)) return res.status(400).json({ message: '你们已经是好友了' });
    if (recipient.friendRequests.some(req => req.userId.equals(sender._id))) return res.status(400).json({ message: '好友请求已发送，请勿重复发送' });
    recipient.friendRequests.push({ userId: sender._id, username: sender.username });
    await recipient.save();
    res.status(200).json({ message: '好友请求已发送' });
});

router.post('/friend-request/respond', protect, async (req, res) => { /* ... 此处代码不变 ... */
    const { senderId, accept } = req.body;
    const recipient = req.user;
    if (!recipient.friendRequests.some(req => req.userId.equals(senderId))) return res.status(404).json({ message: '未找到该好友请求' });
    recipient.friendRequests = recipient.friendRequests.filter(req => !req.userId.equals(senderId));
    if (accept) {
        const sender = await User.findById(senderId);
        if (sender) {
            recipient.friends.push(sender._id);
            sender.friends.push(recipient._id);
            await sender.save();
        }
    }
    await recipient.save();
    res.status(200).json({ message: `好友请求已${accept ? '接受' : '拒绝'}` });
});

router.get('/friends', protect, async (req, res) => { /* ... 此处代码不变 ... */
    const user = await User.findById(req.user._id).populate('friends', 'username _id');
    res.json(user.friends);
});

router.get('/friend-requests', protect, async (req, res) => { /* ... 此处代码不变 ... */
    res.json(req.user.friendRequests);
});

router.get('/chat-history/:friendId', protect, async (req, res) => { /* ... 此处代码不变 ... */
    try {
        const messages = await Message.find({
            $or: [{ sender: req.user._id, receiver: req.params.friendId }, { sender: req.params.friendId, receiver: req.user._id }]
        }).sort({ createdAt: 'asc' });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ message: "获取聊天记录失败" });
    }
});


// --- 新增: 推送通知相关的路由 ---

// @desc    提供 VAPID 公钥给前端
// @route   GET /api/users/vapid-public-key
// @access  Public
router.get('/vapid-public-key', (req, res) => {
    if (!process.env.VAPID_PUBLIC_KEY) {
        return res.status(500).send('VAPID public key not configured on server.');
    }
    res.send(process.env.VAPID_PUBLIC_KEY);
});

// @desc    保存用户的推送订阅信息
// @route   POST /api/users/save-subscription
// @access  Private (需要登录)
router.post('/save-subscription', protect, async (req, res) => {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ success: false, message: "无效的订阅对象" });
    }
    try {
        await User.findByIdAndUpdate(req.user._id, {
            $set: { pushSubscription: subscription }
        });
        res.status(201).json({ success: true, message: '订阅成功' });
    } catch (error) {
        console.error('保存订阅信息失败:', error);
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
});

module.exports = router;
