const express = require('express');
const messageController = require('../controllers/messageController');
const authMiddleware = require('./../middlewares/authMiddleware');

const router = express.Router();

router.post('/', authMiddleware, messageController.sendMessage);
router.get('/conversation/:partnerId', authMiddleware, messageController.getConversation);
router.put('/:messageId/read', authMiddleware, messageController.markMessageAsRead);

module.exports = router;
