const User = require('../models/user.model');
const Message = require('../models/message.model');

const onlineUsers = {}; // { userId: socketId }

function initializeSocket(io) {
    io.on('connection', (socket) => {
        const socketId = socket.id;
        console.log(`A user connected: ${socketId}`);

        socket.on('go-online', (userId) => {
            if (!userId) return;
            onlineUsers[userId] = socketId;
            console.log(`User ${userId} is online.`);
            socket.broadcast.emit('friend-online', { userId });
        });

        socket.on('private-message', async ({ senderId, receiverId, content }) => {
            const sender = await User.findById(senderId);
            if (!sender || !sender.friends.includes(receiverId)) {
                return socket.emit('error-message', { message: "Cannot send message to non-friend." });
            }

            const receiverSocketId = onlineUsers[receiverId];
            const message = new Message({
                sender: senderId,
                receiver: receiverId,
                content: content,
                status: receiverSocketId ? 'delivered' : 'sent'
            });
            await message.save();

            socket.emit('message-sent', message); // 回传给发送者确认

            if (receiverSocketId) {
                io.to(receiverSocketId).emit('receive-message', message);
                io.to(socketId).emit('message-status-update', { messageId: message._id, status: 'delivered' });
            }
        });

        socket.on('message-read', async ({ messageId }) => {
            const message = await Message.findById(messageId);
            if (message && message.status !== 'read') {
                message.status = 'read';
                await message.save();
                const senderSocketId = onlineUsers[message.sender.toString()];
                if (senderSocketId) {
                    io.to(senderSocketId).emit('message-status-update', { messageId, status: 'read' });
                }
            }
        });

        socket.on('disconnect', () => {
            console.log(`A user disconnected: ${socketId}`);
            for (const userId in onlineUsers) {
                if (onlineUsers[userId] === socketId) {
                    delete onlineUsers[userId];
                    console.log(`User ${userId} went offline.`);
                    socket.broadcast.emit('friend-offline', { userId });
                    break;
                }
            }
        });
    });
}

module.exports = initializeSocket;
