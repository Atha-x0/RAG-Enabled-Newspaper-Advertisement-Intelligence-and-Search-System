const fs = require('fs');
const path = require('path');

// Load .env manually
const envPath = "z:\\Projects\\rag-ad-intelligence\\.env";
const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split('\n');
let geminiKey = '';
for (const line of lines) {
  if (line.startsWith('GEMINI_API_KEY=')) {
    geminiKey = line.split('=')[1].trim();
  }
}

console.log(`Loaded API key prefix: ${geminiKey.substring(0, 10)}...`);

const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;

const payload = {
  contents: [{
    parts: [{
      text: "Say hello and confirm you are online and working."
    }]
  }]
};

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
})
.then(res => {
  console.log(`HTTP Status: ${res.status}`);
  return res.json();
})
.then(data => {
  console.log("Response:", JSON.stringify(data, null, 2));
})
.catch(err => {
  console.error("Fetch error:", err);
});
