const http = require('http');
require('dotenv').config();

async function connectRabbitMQ() {
  console.log('Synchronous direct HTTP routing service active (RabbitMQ mock).');
  return true;
}

async function publishIngestionJob(jobPayload) {
  return new Promise((resolve) => {
    try {
      const mlUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';
      const parsedUrl = new URL('/api/v1/ingest', mlUrl);
      const data = JSON.stringify(jobPayload);

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      console.log(`Forwarding ingestion job directly to FastAPI: ${parsedUrl.href}`);

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          console.log(`FastAPI ingestion trigger response: ${res.statusCode} - ${body}`);
          resolve(true);
        });
      });

      req.on('error', (err) => {
        console.error('FastAPI direct ingestion trigger failed:', err.message);
        // We resolve true anyway to not block client upload success in mock mode
        resolve(true);
      });

      req.write(data);
      req.end();
    } catch (error) {
      console.error('Error forwarding job directly:', error);
      resolve(true);
    }
  });
}

module.exports = {
  publishIngestionJob,
  connectRabbitMQ
};
