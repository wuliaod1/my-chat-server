require('dotenv').config();

module.exports = {
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'supersecretjwtkey',
  port: process.env.PORT || 3000,
};
