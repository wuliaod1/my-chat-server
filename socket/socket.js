const User = require('../models/user.model');
const Message = require('../models/message.model');

// 用于追踪在线用户, key 是 userId, value 是 socket.id
const onlineUsers = {};

function initializeSocket(io) {
    io.on('connection', (socket) => {
        const socketId = socket.id;
        console.log(`一个用户连接成功: ${socketId}`);

        // 4. 用户在线状态显示
        socket.on('go-online', (userId) => {
            if (!userId) return;
            onlineUsers[userId] = socketId;
            console.log(`用户 ${userId} 上线了。`);
            // 向所有客户端广播当前在线的用户列表
            io.emit('online-users-list', Object.keys(onlineUsers));
        });

        // 3. 私人聊天与消息状态
        socket.on('private-message', async ({ senderId, receiverId, content }) => {
            // 4. 只能给好友发送消息
            const sender = await User.findById(senderId);
            if (!sender || !sender.friends.includes(receiverId)) {
                return socket.emit('error-message', { message: "只能向好友发送消息。" });
            }

            const receiverSocketId = onlineUsers[receiverId];
            const message = new Message({
                sender: senderId,
                receiver: receiverId,
                content: content,
                // 如果接收者在线，状态为 'delivered'，否则为 'sent'
                status: receiverSocketId ? 'delivered' : 'sent'
            });
            await message.save();

            // 将消息回传给发送者，确认已发送
            socket.emit('message-sent-confirmation', message);

            // 如果接收者在线，实时发送消息给他
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('receive-message', message);
                // 同时通知发送者，消息已送达
                 io.to(socketId).emit('message-status-update', { messageId: message._id, status: 'delivered' });
            }
        });

        // 3. 消息已读回执
        socket.on('message-read', async ({ messageId }) => {
            const message = await Message.findById(messageId);
            if (message && message.status !== 'read') {
                message.status = 'read';
                await message.save();
                // 找到原始发送者的socketId
                const senderSocketId = onlineUsers[message.sender.toString()];
                if (senderSocketId) {
                    // 通知原始发送者，消息已被阅读
                    io.to(senderSocketId).emit('message-status-update', { messageId, status: 'read' });
                }
            }
        });

        // 用户断开连接
        socket.on('disconnect', () => {
            console.log(`一个用户断开连接: ${socketId}`);
            for (const userId in onlineUsers) {
                if (onlineUsers[userId] === socketId) {
                    delete onlineUsers[userId];
                    console.log(`用户 ${userId} 下线了。`);
                    // 向所有客户端广播更新后的在线用户列表
                    io.emit('online-users-list', Object.keys(onlineUsers));
                    break;
                }
            }
        });
    });
}

module.exports = initializeSocket;
