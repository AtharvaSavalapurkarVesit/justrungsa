const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { check, validationResult } = require('express-validator');

const User = require('../models/User');
const Feedback = require('../models/Feedback');

// @route   GET api/feedback
// @desc    Get all feedback entries
// @access  Public (temporarily for testing)
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 0; // If limit is provided, use it, otherwise fetch all
    
    // Get all feedback entries sorted by most recent first
    let query = Feedback.find()
      .sort({ createdAt: -1 })
      .populate('author', ['firstName', 'lastName', 'email', 'profilePic']);
    
    // Apply limit if provided
    if (limit > 0) {
      query = query.limit(limit);
    }
    
    const feedbacks = await query.exec();
    
    console.log('Feedback data being sent:', feedbacks);
    return res.json(feedbacks);
  } catch (err) {
    console.error('Error getting feedbacks:', err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/feedback
// @desc    Create a new feedback entry
// @access  Private
router.post(
  '/',
  [
    auth,
    [
      check('content', 'Feedback content is required').not().isEmpty(),
      check('rating', 'Rating must be between 1 and 5').optional().isInt({ min: 1, max: 5 }),
      check('category', 'Invalid category').optional().isIn(['general', 'ui', 'feature', 'bug', 'performance'])
    ]
  ],
  async (req, res) => {
    console.log('POST /api/feedback received:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const user = await User.findById(req.user.id).select('-password');
      console.log('User found:', user ? user._id : 'User not found');
      
      if (!user) {
        return res.status(404).json({ msg: 'User not found' });
      }
      
      const newFeedback = new Feedback({
        content: req.body.content,
        rating: req.body.rating || 5,
        category: req.body.category || 'general',
        author: req.user.id
      });

      console.log('Saving feedback:', newFeedback);
      const feedback = await newFeedback.save();
      
      // Populate author info before sending response
      await feedback.populate('author', ['firstName', 'lastName', 'email', 'profilePic']);
      console.log('Feedback saved successfully:', feedback._id);
      
      res.json(feedback);
    } catch (err) {
      console.error('Error creating feedback:', err);
      res.status(500).send('Server Error');
    }
  }
);

// @route   GET api/feedback/:id
// @desc    Get feedback by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id)
      .populate('author', ['firstName', 'lastName', 'email', 'profilePic']);
    
    if (!feedback) {
      return res.status(404).json({ msg: 'Feedback not found' });
    }

    res.json(feedback);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Feedback not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/feedback/:id
// @desc    Delete a feedback entry
// @access  Private (only for admins or the author)
router.delete('/:id', auth, async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id);
    
    if (!feedback) {
      return res.status(404).json({ msg: 'Feedback not found' });
    }

    // Check if user is the author or an admin
    const user = await User.findById(req.user.id);
    if (feedback.author.toString() !== req.user.id && user.role !== 'admin') {
      return res.status(401).json({ msg: 'User not authorized to delete this feedback' });
    }

    await feedback.deleteOne();
    res.json({ msg: 'Feedback removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Feedback not found' });
    }
    res.status(500).send('Server Error');
  }
});

module.exports = router; 