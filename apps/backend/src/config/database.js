const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config();

// Use SQLite file-based database for zero-dependency execution
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../../../database.sqlite'),
  logging: false
});

module.exports = sequelize;
