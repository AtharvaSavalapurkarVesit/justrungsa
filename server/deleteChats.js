const mongoose = require('mongoose');
const Chat = require('./models/Chat');

mongoose.connect('mongodb://localhost:27017/garage_sale', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(async () => {
  console.log('Connected to MongoDB');
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