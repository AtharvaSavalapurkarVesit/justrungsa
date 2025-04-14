const mongoose = require('mongoose');
const Feedback = require('./models/Feedback');
const User = require('./models/User');

async function testFeedbackAPI() {
  try {
    console.log('Testing Feedback API...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/garagesale', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB successfully');
    
    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Collections in database:', collections.map(c => c.name));
    
    // Check if feedback collection exists
    const feedbackCollectionExists = collections.some(c => c.name === 'feedbacks');
    console.log('Feedback collection exists:', feedbackCollectionExists);
    
    // Get all feedback entries
    const feedbacks = await Feedback.find();
    console.log('All feedback entries:', feedbacks);
    
    // Get a user for testing
    const user = await User.findOne();
    console.log('Sample user for testing:', user ? user._id : 'No users found');
    
    if (user) {
      // Create a test feedback entry
      const newFeedback = new Feedback({
        content: 'Test feedback entry',
        rating: 5,
        category: 'general',
        author: user._id
      });
      
      // Save to database
      const savedFeedback = await newFeedback.save();
      console.log('Saved test feedback:', savedFeedback);
      
      // Verify it was saved by querying again
      const allFeedbacks = await Feedback.find();
      console.log('Updated feedback list:', allFeedbacks);
    }
    
    console.log('Test completed successfully');
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the test
testFeedbackAPI(); 