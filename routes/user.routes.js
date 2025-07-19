const express = require('express');
const router = express.Router();
const User = require('../models/user.model.js');
const Message = require('../models/message.model.js');
const jwt = require('jsonwebtoken');
const { protect } = require('../middleware/auth.js');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// 注册
router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Please enter all fields' });
    const userExists = await User.findOne({ username });
    if (userExists) return res.status(400).json({ message: 'User already exists' });
    const user = await User.create({ username, password });
    if (user) {
        res.status(201).json({ _id: user._id, username: user.username, token: generateToken(user._id) });
    } else {
        res.status(400).json({ message: 'Invalid user data' });
    }
});

// 登入
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (user && (await user.matchPassword(password))) {
        res.json({ _id: user._id, username: user.username, token: generateToken(user._id) });
    } else {
        res.status(401).json({ message: 'Invalid username or password' });
    }
});

// 搜寻用户
router.get('/search', protect, async (req, res) => {
    const users = await User.find({
        username: { $regex: req.query.q || '', $options: 'i' },
        _id: { $ne: req.user._id }
    }).select('username _id');
    res.json(users);
});

// 发送好友请求
router.post('/friend-request', protect, async (req, res) => {
    const { recipientId } = req.body;
    const sender = req.user;
    const recipient = await User.findById(recipientId);
    if (!recipient) return res.status(404).json({ message: 'User not found' });
    if (recipient.friends.includes(sender._id) || sender.friends.includes(recipient._id)) return res.status(400).json({ message: 'You are already friends' });
    if (recipient.friendRequests.some(req => req.userId.equals(sender._id))) return res.status(400).json({ message: 'Friend request already sent' });
    recipient.friendRequests.push({ userId: sender._id, username: sender.username });
    await recipient.save();
    res.status(200).json({ message: 'Friend request sent' });
});

// 回应好友请求
router.post('/friend-request/respond', protect, async (req, res) => {
    const { senderId, accept } = req.body;
    const recipient = req.user;
    if (!recipient.friendRequests.some(req => req.userId.equals(senderId))) return res.status(404).json({ message: 'Friend request not found' });
    
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
    res.status(200).json({ message: `Friend request ${accept ? 'accepted' : 'declined'}` });
});

// 获取好友列表
router.get('/friends', protect, async (req, res) => {
    const user = await User.findById(req.user._id).populate('friends', 'username _id');
    res.json(user.friends);
});

// 获取好友请求列表
router.get('/friend-requests', protect, async (req, res) => {
    res.json(req.user.friendRequests);
});

// 获取聊天历史
router.get('/chat-history/:friendId', protect, async (req, res) => {
    const messages = await Message.find({
        $or: [
            { sender: req.user._id, receiver: req.params.friendId },
            { sender: req.params.friendId, receiver: req.user._id }
        ]
    }).sort({ createdAt: 'asc' });
    res.json(messages);
});

module.exports = router;
