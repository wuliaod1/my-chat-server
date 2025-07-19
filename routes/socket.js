// /socket/socket.js

const User = require('../models/user.model');
const Message = require('../models/message.model');
const webPush = require('web-push');

// --- 新增：在文件顶部配置 web-push ---
// 确保环境变量都存在，否则推送功能不可用
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT) {
    webPush.setVapidDetails(
        process.env.VAPID_SUBJECT, // e.g., 'mailto:your-email@example.com'
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
    console.log("Web Push VAPID keys configured.");
} else {
    console.warn("VAPID 密钥未在环境变量中配置，Web推送通知功能将不可用。");
}


// 用于追踪在线用户, key 是 userId, value 是 socket.id
const onlineUsers = {};

function initializeSocket(io) {
    io.on('connection', (socket) => {
        const socketId = socket.id;
        console.log(`一个用户连接成功: ${socketId}`);

        socket.on('go-online', (userId) => {
            if (!userId) return;
            onlineUsers[userId] = socketId;
            console.log(`用户 ${userId} 上线了。`);
            io.emit('online-users-list', Object.keys(onlineUsers));
        });

        // --- 核心修改：私人聊天事件处理 ---
        socket.on('private-message', async ({ senderId, receiverId, content }) => {
            const sender = await User.findById(senderId);
            if (!sender || !sender.friends.includes(receiverId)) {
                return socket.emit('error-message', { message: "只能向好友发送消息。" });
            }

            const receiverSocketId = onlineUsers[receiverId];
            
            const message = new Message({
                sender: senderId,
                receiver: receiverId,
                content: content,
                status: receiverSocketId ? 'delivered' : 'sent'
            });
            await message.save();

            // 将消息回传给发送者，确认已发送
            socket.emit('message-sent-confirmation', message);

            if (receiverSocketId) {
                // 对方在线，正常发送socket消息
                io.to(receiverSocketId).emit('receive-message', message);
                // 同时通知发送者，消息已送达
                 io.to(socketId).emit('message-status-update', { messageId: message._id, status: 'delivered' });
            } else {
                // --- 新增逻辑：对方不在线，发送推送通知 ---
                console.log(`用户 ${receiverId} 不在线，尝试发送推送通知。`);
                try {
                    const receiver = await User.findById(receiverId);
                    // 确保接收者存在，并且有有效的订阅信息
                    if (receiver && receiver.pushSubscription && receiver.pushSubscription.endpoint) {
                        
                        // 准备推送通知的内容
                        const payload = JSON.stringify({
                            title: `来自 ${sender.username} 的新消息`,
                            body: content,
                            icon: 'icon-192.png' // 这个图标路径需要与前端PWA配置的图标一致
                        });
                        
                        // 发送通知
                        await webPush.sendNotification(receiver.pushSubscription, payload);
                        console.log(`推送通知已成功发送给 ${receiver.username}。`);

                    } else {
                         console.log(`用户 ${receiverId} 没有有效的订阅信息，无法推送。`);
                    }
                } catch (error) {
                    // 如果订阅已过期或无效，通常会返回410 Gone的状态码
                    if (error.statusCode === 410) {
                        console.log(`用户 ${receiverId} 的订阅已过期，准备从数据库中移除。`);
                        // 可选：从数据库中清除无效的订阅信息
                        await User.findByIdAndUpdate(receiverId, { $unset: { pushSubscription: "" } });
                    } else {
                        console.error('发送推送通知失败:', error.statusCode, error.body);
                    }
                }
            }
        });

        socket.on('message-read', async ({ messageId }) => { /* ... 此处代码不变 ... */
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

        socket.on('disconnect', () => { /* ... 此处代码不变 ... */
            console.log(`一个用户断开连接: ${socketId}`);
            for (const userId in onlineUsers) {
                if (onlineUsers[userId] === socketId) {
                    delete onlineUsers[userId];
                    console.log(`用户 ${userId} 下线了。`);
                    io.emit('online-users-list', Object.keys(onlineUsers));
                    break;
                }
            }
        });
    });
}

module.exports = initializeSocket;
