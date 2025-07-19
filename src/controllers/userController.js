const userService = require('../services/userService');

const getMyProfile = async (req, res) => {
  try {
    const user = await userService.findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: '用户未找到' });
    }
    res.status(200).json(user);
  } catch (error) {
    console.error('获取用户资料失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
};

const searchUser = async (req, res) => {
  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ message: '请提供用户名进行搜索' });
  }
  try {
    const user = await userService.findUserByUsername(username);
    if (!user) {
      return res.status(404).json({ message: '用户未找到' });
    }
    res.status(200).json(user);
  } catch (error) {
    console.error('搜索用户失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
};

const sendFriendRequest = async (req, res) => {
  const { addresseeUsername } = req.body;
  try {
    const friendRequest = await userService.sendFriendRequest(req.user.id, addresseeUsername);
    res.status(200).json({ message: '好友请求已发送', request: friendRequest });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const respondToFriendRequest = async (req, res) => {
  const { requestId, status } = req.body; // status: 'accepted' or 'rejected'
  try {
    const updatedRequest = await userService.respondToFriendRequest(requestId, req.user.id, status);
    res.status(200).json({ message: `好友请求已${status === 'accepted' ? '接受' : '拒绝'}`, request: updatedRequest });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getFriendsList = async (req, res) => {
  try {
    const friends = await userService.getFriendsList(req.user.id);
    res.status(200).json(friends);
  } catch (error) {
    console.error('获取好友列表失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
};

const getPendingFriendRequests = async (req, res) => {
  try {
    const requests = await userService.getPendingFriendRequests(req.user.id);
    res.status(200).json(requests);
  } catch (error) {
    console.error('获取待处理好友请求失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
};

module.exports = {
  getMyProfile,
  searchUser,
  sendFriendRequest,
  respondToFriendRequest,
  getFriendsList,
  getPendingFriendRequests,
};
