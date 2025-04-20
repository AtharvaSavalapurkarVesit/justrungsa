const express = require('express');
const app = express();
const http = require('http');

// Basic middleware
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Simple route
app.get('/', (req, res) => {
  console.log('Root route accessed');
  res.send('Test server is working!');
});

app.get('/api/test', (req, res) => {
  console.log('Test API route accessed');
  res.json({ message: 'API test route is working!' });
});

// Start server
const PORT = 5003;
const server = http.createServer(app);

server.listen(PORT, '0.0.0.0');

server.on('listening', () => {
  const addr = server.address();
  console.log(`Test server running on ${addr.address}:${addr.port}`);
  console.log(`Try accessing: http://localhost:${PORT}/`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
}); 