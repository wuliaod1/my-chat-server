const { Message, User, Friend } = require('../models');
const { Op } = require('sequelize');

const createMessage = async (senderId, receiverId, content) => {
  // 检查是否是好友关系
  const friendship = await Friend.findOne({
    where: {
      [Op.or]: [
        { requesterId: senderId, addresseeId: receiverId },
        { requesterId: receiverId, addresseeId: senderId }
      ],
      status: 'accepted'
    }
  });

  if (!friendship) {
    throw new Error('您和对方不是好友关系，无法发送消息');
  }

  const message = await Message.create({ senderId, receiverId, content, status: 'sent' });
  return message;
};

const getConversation = async (userId1, userId2, limit = 50, offset = 0) => {
  const messages = await Message.findAll({
    where: {
      [Op.or]: [
        { senderId: userId1, receiverId: userId2 },
        { senderId: userId2, receiverId: userId1 }
      ]
    },
    order: [['sentAt', 'ASC']],
    limit,
    offset,
    include: [
      { model: User, as: 'Sender', attributes: ['id', 'username'] },
      { model: User, as: 'Receiver', attributes: ['id', 'username'] },
    ],
  });
  return messages;
};

const updateMessageStatus = async (messageId, status, userId) => {
  const message = await Message.findByPk(messageId);

  if (!message) {
    throw new Error('消息未找到');
  }

  // 只有接收方可以标记为已送达或已读
  if (message.receiverId !== userId) {
    throw new Error('无权更新此消息状态');
  }

  if (status === 'delivered' && !message.deliveredAt) {
    message.status = 'delivered';
    message.deliveredAt = new Date();
  } else if (status === 'read' && !message.readAt) {
    message.status = 'read';
    message.readAt = new Date();
  } else {
    throw new Error('无效的消息状态或状态已更新');
  }

  await message.save();
  return message;
};

module.exports = {
  createMessage,
  getConversation,
  updateMessageStatus,
};
