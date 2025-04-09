require("dotenv").config();

module.exports = {
  JWT_SECRET: process.env.JWT_SECRET,
  PORT: process.env.PORT,
  SERVER: process.env.SERVER,
  HOST: process.env.HOST,
  M3_HOST: process.env.M3_HOST,
  M3_DATABASE: process.env.M3_DATABASE,
  M3_USER: process.env.M3_USER,
  M3_PASSWORD: process.env.M3_PASSWORD,
  ANT_HOST: process.env.ANT_HOST,
  ANT_DATABASE: process.env.ANT_DATABASE,
  ANT_USER: process.env.ANT_USER,
  ANT_PASSWORD: process.env.ANT_PASSWORD,
  SECRET_KEY: process.env.SECRET_KEY,
  ERP_API_BASE_URL: process.env.ERP_API_BASE_URL
};
