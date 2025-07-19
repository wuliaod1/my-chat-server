const { User } = require('../models');
const { hashPassword, comparePassword } = require('../utils/hash');
const { generateToken } = require('../utils/jwt');

const register = async (username, password, email) => {
  const existingUser = await User.findOne({ where: { username } });
  if (existingUser) {
    throw new Error('用户名已被占用');
  }

  const hashedPassword = await hashPassword(password);
  const user = await User.create({ username, password: hashedPassword, email });
  const token = generateToken({ userId: user.id });
  return { user, token };
};

const login = async (username, password) => {
  const user = await User.findOne({ where: { username } });
  if (!user) {
    throw new Error('用户名或密码不正确');
  }

  const isPasswordValid = await comparePassword(password, user.password);
  if (!isPasswordValid) {
    throw new Error('用户名或密码不正确');
  }

  const token = generateToken({ userId: user.id });
  return { user, token };
};

module.exports = {
  register,
  login,
};
