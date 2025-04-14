const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Item = require('../models/Item');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/profiles';
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, `user-${req.user.id}-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5000000 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  }
});

// Get user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password')
      .populate('activeListings')
      .populate('watchlist')
      .populate('boughtItems')
      .populate('soldItems');
    res.json(user);
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Update user profile
router.put('/profile', auth, upload.single('profilePic'), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Update text fields
    const { firstName, lastName, collegeName, contactNumber, pincode, address, email } = req.body;
    
    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.collegeName = collegeName || user.collegeName;
    user.contactNumber = contactNumber || user.contactNumber;
    user.pincode = pincode || user.pincode;
    user.address = address || user.address;
    if (email && email !== user.email) {
      user.email = email;
    }

    // Update profile picture if provided
    if (req.file) {
      // Delete old profile picture if it exists
      if (user.profilePic && fs.existsSync(user.profilePic) && !user.profilePic.startsWith('http')) {
        fs.unlinkSync(user.profilePic);
      }
      user.profilePic = req.file.path;
    }

    await user.save();
    res.json(user);
  } catch (err) {
    console.error('Error updating profile:', err.message);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Get user's watchlist
router.get('/watchlist', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('watchlist');
    res.json(user.watchlist);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Add item to watchlist
router.post('/watchlist/:itemId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user.watchlist.includes(req.params.itemId)) {
      user.watchlist.push(req.params.itemId);
      await user.save();
    }
    res.json(user.watchlist);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Remove item from watchlist
router.delete('/watchlist/:itemId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.watchlist = user.watchlist.filter(id => id.toString() !== req.params.itemId);
    await user.save();
    res.json(user.watchlist);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get user's bought items
router.get('/bought-items', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('boughtItems', 'name photos price category');
    
    res.json(user.boughtItems);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's sold items
router.get('/sold-items', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    // Instead of just populating basic fields, fetch more details including buyer information
    const soldItems = await Item.find({
      _id: { $in: user.soldItems },
      status: 'sold'
    })
    .populate('seller', 'firstName lastName email contactNumber')
    .populate('buyer', 'firstName lastName email contactNumber');
    
    // Log detailed info about sold items and their buyers for debugging
    console.log('Found sold items:', soldItems.length);
    soldItems.forEach((item, index) => {
      console.log(`Item ${index + 1}:`, {
        id: item._id,
        name: item.name,
        soldAt: item.soldAt,
        hasBuyer: !!item.buyer,
        buyerInfo: item.buyer ? {
          id: item.buyer._id,
          name: `${item.buyer.firstName} ${item.buyer.lastName}`,
          email: item.buyer.email,
          contact: item.buyer.contactNumber
        } : 'No buyer information'
      });
    });
    
    res.json(soldItems);
  } catch (error) {
    console.error('Error fetching sold items:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's active listings
router.get('/listings', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate({
        path: 'activeListings',
        match: { status: 'available' }
      });
    res.json(user.activeListings);
  } catch (err) {
    console.error('Error fetching active listings:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Get user's delisted items
router.get('/delisted-items', auth, async (req, res) => {
  try {
    // Find all unavailable items for this seller directly from the Item collection
    const delistedItems = await Item.find({
      seller: req.user.id,
      status: 'unavailable'
    })
    .populate('seller', 'firstName lastName username')
    .sort({ createdAt: -1 });
    
    res.json(delistedItems);
  } catch (error) {
    console.error('Error fetching delisted items:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 