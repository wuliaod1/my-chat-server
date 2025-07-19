const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const friendController = require('../controllers/friendController');
const messageController = require('../controllers/messageController');

// 认证路由
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);

// 好友路由
router.post('/friends/add', friendController.addFriend);
router.post('/friends/accept', friendController.acceptFriend);
router.get('/friends', friendController.getFriends);

// 消息路由
router.post('/messages/send', messageController.sendMessage);
router.get('/messages', messageController.getMessages);
router.put('/messages/read', messageController.markAsRead);

module.exports = router;
