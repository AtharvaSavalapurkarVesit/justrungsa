require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware
app.use(cors({
  origin: '*', // Allow all origins in development
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware for all requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Create uploads directories if they don't exist - with improved error handling
const uploadDirs = ['uploads', 'uploads/profile-pics', 'uploads/items'];
uploadDirs.forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) {
    try {
      console.log(`Creating directory: ${fullPath}`);
      fs.mkdirSync(fullPath, { recursive: true, mode: 0o755 });
      console.log(`Successfully created directory: ${fullPath}`);
    } catch (error) {
      console.error(`Failed to create directory ${fullPath}:`, error);
      // Don't exit process, just log the error
    }
  } else {
    console.log(`Directory already exists: ${fullPath}`);
  }
});

// Check permissions on upload directories and verify they're writable
uploadDirs.forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  try {
    // Try writing a test file
    const testFilePath = path.join(fullPath, '.test-permissions');
    fs.writeFileSync(testFilePath, 'test');
    fs.unlinkSync(testFilePath);
    console.log(`Directory ${fullPath} is writable`);
  } catch (error) {
    console.error(`Directory ${fullPath} is not writable:`, error);
    // Try to fix permissions
    try {
      fs.chmodSync(fullPath, 0o755);
      console.log(`Attempted to fix permissions on ${fullPath}`);
    } catch (chmodError) {
      console.error(`Failed to fix permissions on ${fullPath}:`, chmodError);
    }
  }
});

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI; // Only use Atlas URL from env var, no fallback
console.log('Attempting to connect to MongoDB Atlas exclusively at:', MONGODB_URI);

// Add a timeout to catch stuck connections
let connectionTimeout = setTimeout(() => {
  console.error('MongoDB connection timeout - connection attempt did not complete within 10 seconds');
}, 10000);

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000, // 5 second timeout
  connectTimeoutMS: 5000 // Connection timeout
})
.then(() => {
  clearTimeout(connectionTimeout);
  console.log('Connected to MongoDB Atlas successfully');
})
.catch(err => {
  clearTimeout(connectionTimeout);
  console.error('MongoDB connection error details:', {
    message: err.message,
    code: err.code,
    name: err.name
  });
  console.error('MongoDB connection error:', err);
  console.log('CRITICAL ERROR: Cannot connect to MongoDB Atlas. Application may not function correctly.');
  // Don't continue without the database connection
  process.exit(1);
});

// Set up an event listener for failed connections
mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

// Listen for disconnect events
mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
});

// Create public directory if it doesn't exist
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Routes
app.use('/api/auth', require('./routes/auth.js'));
app.use('/api/items', require('./routes/items.js'));
app.use('/api/users', require('./routes/userRoutes.js'));
app.use('/api/chats', require('./routes/chatRoutes.js'));
app.use('/api/forum', require('./routes/forum.js'));
app.use('/api/feedback', require('./routes/feedback.js'));
app.use('/api/admin', require('./routes/admin.js'));

// Special route for testing login
app.post('/api/auth/login-test', (req, res) => {
  console.log('Login test route hit', req.body);
  res.status(200).json({ 
    message: 'Login test successful',
    body: req.body 
  });
});

// Debug routes with more detailed route definition
app.get('/test', (req, res) => {
  console.log('Test endpoint hit');
  res.status(200).json({ message: 'Server is running correctly' });
});

app.get('/api/test', (req, res) => {
  console.log('API test endpoint hit');
  res.status(200).json({ message: 'API routes are working' });
});

app.post('/api/test-post', (req, res) => {
  console.log('POST test endpoint hit', req.body);
  res.status(200).json({ 
    message: 'POST request received', 
    body: req.body 
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error in middleware:', err.stack);
  res.status(500).json({ 
    message: 'Something broke!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Handle 404 routes
app.use((req, res) => {
  console.log(`404 for ${req.method} ${req.url}`);
  res.status(404).json({ 
    message: 'Route not found',
    path: req.url,
    method: req.method
  });
});

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// Start server with fixed port
const PORT = 5002; // Always use 5002
console.log('Attempting to start server on port', PORT);

// Function for starting server
const startServer = () => {
  try {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Server accessible at http://localhost:${PORT}`);
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Critical error: Port ${PORT} is already in use. Please close any other applications using this port and restart the server.`);
        process.exit(1);
      } else {
        console.error('Server error:', err);
        process.exit(1);
      }
    });
    
    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer(); 