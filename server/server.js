const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/garagesale', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB successfully'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something broke!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Handle 404 routes
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

const PORT = process.env.PORT || 5002;
const MAX_PORT_ATTEMPTS = 10;

// Function to try starting the server on different ports
const startServer = (port, attempt = 0) => {
  const server = app.listen(port)
    .on('error', (err) => {
      if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS) {
        console.warn(`Port ${port} is in use, trying port ${port + 1}...`);
        server.close();
        startServer(port + 1, attempt + 1);
      } else {
        console.error('Error starting server:', err);
        process.exit(1);
      }
    })
    .on('listening', () => {
      const actualPort = server.address().port;
      console.log(`Server is running on port ${actualPort}`);
    });

  return server;
};

// Start the server with retry mechanism
startServer(PORT); 