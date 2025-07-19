const messageService = require('../services/messageService');
const { getIo } = require('../services/socketService');

const sendMessage = async (req, res) => {
  const { receiverId, content } = req.body;
  try {
    const message = await messageService.createMessage(req.user.id, receiverId, content);

    // 通过 WebSocket 发送消息
    const io = getIo();
    // 假设 receiverId 是一个 room ID，或者可以通过 connectedUsers 映射到 socketId
    // 这里简化为直接向 receiverId 的房间发送，实际可能需要更复杂的查找
    io.to(receiverId).emit('receiveMessage', message); // 发送给接收方
    req.io.to(req.user.id).emit('messageSentConfirmation', message); // 确认发送成功给发送方

    res.status(201).json({ message: '消息已发送', data: message });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getConversation = async (req, res) => {
  const { partnerId } = req.params;
  const { limit, offset } = req.query; // 可以添加分页参数
  try {
    const messages = await messageService.getConversation(req.user.id, partnerId, parseInt(limit), parseInt(offset));
    res.status(200).json(messages);
  } catch (error) {
    console.error('获取对话失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
};

const markMessageAsRead = async (req, res) => {
  const { messageId } = req.params;
  try {
    const message = await messageService.updateMessageStatus(messageId, 'read', req.user.id);

    // 通知发送方消息已读
    const io = getIo();
    io.to(message.senderId).emit('messageStatusUpdate', { messageId: message.id, status: 'read' });

    res.status(200).json({ message: '消息已标记为已读', data: message });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  sendMessage,
  getConversation,
  markMessageAsRead,
};
