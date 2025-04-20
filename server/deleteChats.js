const mongoose = require('mongoose');
const Chat = require('./models/Chat');
require('dotenv').config();

// Use the Atlas URL from environment variables
const MONGODB_URI = process.env.MONGODB_URI;
console.log('Connecting to MongoDB Atlas for chat deletion');

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(async () => {
  console.log('Connected to MongoDB Atlas');
  try {
    const result = await Chat.deleteMany({});
    console.log(`Deleted ${result.deletedCount} chats`);
  } catch (err) {
    console.error('Error deleting chats:', err);
  } finally {
    mongoose.connection.close();
  }
})
.catch(err => {
  console.error('MongoDB connection error:', err);
}); 