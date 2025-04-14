const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/profile-pics/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Helper function to generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    'garagesale_jwt_secret_key_2024',
    { expiresIn: '24h' }
  );
};

// Register user
router.post('/register', 
  upload.single('profilePic'),
  [
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('collegeName').trim().notEmpty().withMessage('College name is required'),
    body('email').isEmail().withMessage('Please enter a valid email'),
    body('contactNumber').trim().notEmpty().withMessage('Contact number is required'),
    body('pincode').trim().notEmpty().withMessage('Pincode is required'),
    body('address').trim().notEmpty().withMessage('Address is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { firstName, lastName, username, collegeName, email, contactNumber, pincode, address, password } = req.body;

      // Check if user already exists
      let user = await User.findOne({ $or: [{ email }, { username }] });
      if (user) {
        return res.status(400).json({ message: 'User already exists' });
      }

      // Create new user
      user = new User({
        firstName,
        lastName,
        username,
        collegeName,
        email,
        contactNumber,
        pincode,
        address,
        password,
        profilePic: req.file ? req.file.path : ''
      });

      await user.save();

      // Create JWT token
      const token = generateToken(user._id);

      res.status(201).json({
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          email: user.email
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      if (error.message === 'JWT_SECRET not found in environment variables') {
        res.status(500).json({ message: 'Server configuration error' });
      } else {
        res.status(500).json({ message: 'Server error' });
      }
    }
  }
);

// Login user
router.post('/login',
  [
    body('email').isEmail().withMessage('Please enter a valid email'),
    body('password').exists().withMessage('Password is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // Check if user exists
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      // Check password
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      // Create JWT token
      const token = generateToken(user._id);

      res.json({
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          email: user.email
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      if (error.message === 'JWT_SECRET not found in environment variables') {
        res.status(500).json({ message: 'Server configuration error' });
      } else {
        res.status(500).json({ message: 'Server error' });
      }
    }
  }
);

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    res.json({
      id: req.user.id,
      username: 'user123',
      firstName: 'John',
      lastName: 'Doe'
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user (root route)
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error fetching current user:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router; 