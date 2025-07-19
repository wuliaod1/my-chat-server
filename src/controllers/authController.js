const authService = require('../services/authService');

const register = async (req, res) => {
  const { username, password, email } = req.body;
  try {
    const { user, token } = await authService.register(username, password, email);
    res.status(201).json({
      message: '注册成功',
      user: { id: user.id, username: user.username, email: user.email },
      token,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const login = async (req, res) => {
  const { username, password } = req.body;
  try {
    const { user, token } = await authService.login(username, password);
    res.status(200).json({
      message: '登录成功',
      user: { id: user.id, username: user.username, email: user.email },
      token,
    });
  } catch (error) {
    res.status(401).json({ message: error.message });
  }
};

module.exports = {
  register,
  login,
};
