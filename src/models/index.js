const { Sequelize, DataTypes } = require('sequelize');
const config = require('../config');

const sequelize = new Sequelize(config.databaseUrl, {
  dialect: 'postgres',
  logging: false,
});

const User = require('./user')(sequelize, DataTypes);
const Friend = require('./friend')(sequelize, DataTypes);
const Message = require('./message')(sequelize, DataTypes);

// 定义关联关系
User.hasMany(Message, { as: 'SentMessages', foreignKey: 'senderId' });
User.hasMany(Message, { as: 'ReceivedMessages', foreignKey: 'receiverId' });
Message.belongsTo(User, { as: 'Sender', foreignKey: 'senderId' });
Message.belongsTo(User, { as: 'Receiver', foreignKey: 'receiverId' });

User.hasMany(Friend, { as: 'RequesterFriends', foreignKey: 'requesterId' });
User.hasMany(Friend, { as: 'AddresseeFriends', foreignKey: 'addresseeId' });
Friend.belongsTo(User, { as: 'Requester', foreignKey: 'requesterId' });
Friend.belongsTo(User, { as: 'Addressee', foreignKey: 'addresseeId' });

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功！');
    await sequelize.sync({ alter: true }); // 使用 alter: true 可以在不删除数据的情况下更新表结构
    console.log('数据库模型同步成功！');
  } catch (error) {
    console.error('数据库连接失败：', error);
    process.exit(1);
  }
};

module.exports = {
  sequelize,
  User,
  Friend,
  Message,
  connectDB,
};

// 如果直接运行此文件，则执行迁移
if (require.main === module) {
  connectDB();
}
