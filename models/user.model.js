// /models/user.model.js

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const friendRequestSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: String,
}, { _id: false });

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    friendRequests: [friendRequestSchema],
    // --- 新增字段 ---
    // 这个对象将存储从浏览器获取的 Web Push 订阅信息
    pushSubscription: {
        type: Object,
        required: false 
    }
}, { timestamps: true });

// 在保存用户前，如果密码被修改，则进行哈希加密
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// 实例方法：比对输入的密码和数据库中加密的密码
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
