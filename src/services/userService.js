const { User, Friend } = require('../models');
const { Op } = require('sequelize');

const findUserById = async (userId) => {
  return User.findByPk(userId, {
    attributes: ['id', 'username', 'email', 'status', 'lastOnline']
  });
};

const findUserByUsername = async (username) => {
  return User.findOne({
    where: { username },
    attributes: ['id', 'username', 'email', 'status', 'lastOnline']
  });
};

const sendFriendRequest = async (requesterId, addresseeUsername) => {
  const addressee = await User.findOne({ where: { username: addresseeUsername } });
  if (!addressee) {
    throw new Error('接收方用户不存在');
  }
  if (requesterId === addressee.id) {
    throw new Error('不能给自己发送好友请求');
  }

  const existingFriendship = await Friend.findOne({
    where: {
      [Op.or]: [
        { requesterId: requesterId, addresseeId: addressee.id },
        { requesterId: addressee.id, addresseeId: requesterId }
      ]
    }
  });

  if (existingFriendship) {
    if (existingFriendship.status === 'pending') {
      throw new Error('好友请求已发送，正在等待对方接受');
    } else if (existingFriendship.status === 'accepted') {
      throw new Error('已经是好友');
    } else if (existingFriendship.status === 'blocked') {
      throw new Error('您已被对方屏蔽或您已屏蔽对方');
    }
  }

  const friendRequest = await Friend.create({ requesterId, addresseeId: addressee.id, status: 'pending' });
  return friendRequest;
};

const respondToFriendRequest = async (requestId, userId, status) => {
  const friendRequest = await Friend.findByPk(requestId);

  if (!friendRequest) {
    throw new Error('好友请求不存在');
  }
  if (friendRequest.addresseeId !== userId) {
    throw new Error('无权操作此好友请求');
  }
  if (friendRequest.status !== 'pending') {
    throw new Error('好友请求已处理');
  }

  friendRequest.status = status;
  await friendRequest.save();
  return friendRequest;
};

const getFriendsList = async (userId) => {
  const friends = await Friend.findAll({
    where: {
      [Op.or]: [
        { requesterId: userId },
        { addresseeId: userId }
      ],
      status: 'accepted'
    },
    include: [
      { model: User, as: 'Requester', attributes: ['id', 'username', 'status', 'lastOnline'] },
      { model: User, as: 'Addressee', attributes: ['id', 'username', 'status', 'lastOnline'] }
    ]
  });

  return friends.map(friendship => {
    if (friendship.requesterId === userId) {
      return friendship.Addressee;
    } else {
      return friendship.Requester;
    }
  });
};

const getPendingFriendRequests = async (userId) => {
  const requests = await Friend.findAll({
    where: {
      addresseeId: userId,
      status: 'pending'
    },
    include: [{ model: User, as: 'Requester', attributes: ['id', 'username'] }]
  });
  return requests.map(request => ({
    id: request.id,
    requester: request.Requester,
    createdAt: request.createdAt,
  }));
};

module.exports = {
  findUserById,
  findUserByUsername,
  sendFriendRequest,
  respondToFriendRequest,
  getFriendsList,
  getPendingFriendRequests,
};
