const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Item = require('../models/Item');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Configure multer for profile picture upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/profile-pics/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Get user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password')
      .populate('watchlist', 'name photos price')
      .populate('boughtItems', 'name photos price')
      .populate('soldItems', 'name photos price');

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user profile
router.put('/profile',
  auth,
  upload.single('profilePic'),
  async (req, res) => {
    try {
      const updates = req.body;
      
      if (req.file) {
        updates.profilePic = req.file.path;
      }

      const user = await User.findByIdAndUpdate(
        req.user.id,
        { $set: updates },
        { new: true }
      ).select('-password');

      res.json(user);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Get user's watchlist
router.get('/watchlist', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('watchlist', 'name photos price category');
    
    res.json(user.watchlist);
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's bought items
router.get('/bought-items', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('boughtItems', 'name photos price category');
    
    res.json(user.boughtItems);
  } catch (error) {
    console.error('Error fetching bought items:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's sold items
router.get('/sold-items', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('soldItems', 'name photos price category');
    
    res.json(user.soldItems);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's active listings
router.get('/listings', auth, async (req, res) => {
  try {
    // Find all available items for this seller directly from the Item collection
    const availableItems = await Item.find({
      seller: req.user.id,
      status: 'available'
    })
    .populate('seller', 'firstName lastName username')
    .sort({ createdAt: -1 });
    
    // Get the user to check if activeListings needs updating
    const user = await User.findById(req.user.id);
    
    // Check if the user's activeListings array is out of sync
    const availableItemIds = availableItems.map(item => item._id.toString());
    const userListingIds = user.activeListings.map(id => id.toString());
    
    let needsSync = false;
    
    // Check if arrays are different (missing items or containing extra items)
    if (availableItemIds.length !== userListingIds.length) {
      needsSync = true;
    } else {
      // Check if arrays contain different items
      for (const itemId of availableItemIds) {
        if (!userListingIds.includes(itemId)) {
          needsSync = true;
          break;
        }
      }
    }
    
    // Sync the user's activeListings if needed
    if (needsSync) {
      console.log('Syncing user activeListings with available items');
      await User.findByIdAndUpdate(
        req.user.id,
        { $set: { activeListings: availableItemIds } }
      );
    }
    
    res.json(availableItems);
  } catch (error) {
    console.error('Error fetching listings:', error);
    res.status(500).json({ message: 'Server error' });
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