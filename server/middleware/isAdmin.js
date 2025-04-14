const User = require('../models/User');

// Check if user is an admin
const isAdmin = async (req, res, next) => {
  try {
    // The auth middleware should have already verified the user and set req.user
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const user = await User.findById(req.user.id);
    
    // Check if user exists and is an admin
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // For now, let's consider users with specific IDs as admins
    // In a production system, you'd want to have an isAdmin field in your User model
    const adminIds = [
      // Add admin user IDs here, or check for an isAdmin field in the user document
    ];
    
    if (adminIds.includes(user._id.toString())) {
      next();
    } else {
      return res.status(403).json({ message: 'Admin privileges required' });
    }
  } catch (error) {
    console.error('Error in isAdmin middleware:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { isAdmin }; 