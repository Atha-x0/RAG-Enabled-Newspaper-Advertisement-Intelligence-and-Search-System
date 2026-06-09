const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const sequelize = require('./config/database');
const { initMinIO } = require('./services/minio');
const { connectRabbitMQ } = require('./services/rabbitmq');
const adsController = require('./controllers/adsController');

const app = express();
const PORT = process.env.PORT || 5000;

// Setup local temporary uploads directory
const tempUploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
}

// Multer disk storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempUploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  }
});
const upload = multer({ storage: storage });

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(tempUploadDir));

// REST Routes
app.post('/api/v1/pages/upload', upload.single('file'), adsController.uploadPage);
app.get('/api/v1/pages', adsController.listPages);
app.get('/api/v1/ads/search', adsController.searchAds);
app.post('/api/v1/ads/ask', adsController.askRAG);
app.get('/api/v1/ads/analytics', adsController.getAnalytics);
app.get('/api/v1/ads/:id', adsController.getAdDetails);
app.get('/api/v1/ads/:id/similar', adsController.getSimilarAds);


// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'adintel-backend-gateway' });
});

// Bootstrapper function
async function bootstrap() {
  try {
    // 1. Sync SQL Database
    await sequelize.authenticate();
    console.log('Database connection authenticated.');
    
    // In production we would use migrations, but for rapid prototyping and template setup, sync is used.
    await sequelize.sync({ alter: true });
    console.log('PostgreSQL database models synchronized successfully.');

    // 2. Init Object Storage
    await initMinIO();

    // 3. Connect Message Broker
    await connectRabbitMQ();

    // 4. Start Server
    app.listen(PORT, () => {
      console.log(`Backend API Gateway running on port ${PORT}`);
    });
  } catch (error) {
    console.error('System bootstrapping failed:', error);
    process.exit(1);
  }
}

bootstrap();
