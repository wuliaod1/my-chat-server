const express = require('express');
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/me', authMiddleware, userController.getMyProfile);
router.get('/search', authMiddleware, userController.searchUser);
router.post('/friends/request', authMiddleware, userController.sendFriendRequest);
router.post('/friends/respond', authMiddleware, userController.respondToFriendRequest);
router.get('/friends', authMiddleware, userController.getFriendsList);
router.get('/friends/pending', authMiddleware, userController.getPendingFriendRequests);

module.exports = router;
