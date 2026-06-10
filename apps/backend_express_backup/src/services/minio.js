const fs = require('fs');
const path = require('path');
require('dotenv').config();

const BUCKET_NAME = 'newspapers';
const localDir = path.join(__dirname, '../../uploads');

if (!fs.existsSync(localDir)) {
  fs.mkdirSync(localDir, { recursive: true });
}

async function initMinIO() {
  console.log(`Local static uploads initialised at: ${localDir}`);
}

async function uploadFile(objectName, filePathOrBuffer, metaData = {}) {
  try {
    const destPath = path.join(localDir, objectName);
    
    if (Buffer.isBuffer(filePathOrBuffer)) {
      fs.writeFileSync(destPath, filePathOrBuffer);
    } else {
      fs.copyFileSync(filePathOrBuffer, destPath);
    }
    
    const port = process.env.PORT || 5000;
    return `http://localhost:${port}/uploads/${objectName}`;
  } catch (error) {
    console.error(`Error saving file local static storage ${objectName}:`, error);
    throw error;
  }
}

module.exports = {
  minioClient: {},
  initMinIO,
  uploadFile,
  BUCKET_NAME
};
