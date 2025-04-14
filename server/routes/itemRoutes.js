const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const User = require('../models/User');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, '..', 'uploads', 'items');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image! Please upload only images.'), false);
    }
  }
});

// Get all items (public route)
router.get('/', async (req, res) => {
  try {
    const items = await Item.find({ 
      status: 'available' // Only show available items
    })
      .populate('seller', 'firstName lastName username')
      .sort({ createdAt: -1 });

    // Format photo paths
    const formattedItems = items.map(item => ({
      ...item.toObject(),
      photos: item.photos.map(photo => {
        const filename = path.basename(photo);
        return `/uploads/items/${filename}`;
      })
    }));

    res.json(formattedItems);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Create new item
router.post('/', auth, upload.array('photos', 4), async (req, res) => {
  try {
    console.log('Received item creation request');
    console.log('Request body:', req.body);
    console.log('Files:', req.files);

    if (!req.files || req.files.length < 3) {
      console.log('Photo validation failed:', req.files);
      return res.status(400).json({ message: 'Please upload at least 3 photos' });
    }

    // Store only the filenames in the database
    const photos = req.files.map(file => `/uploads/items/${file.filename}`);
    console.log('Processed photos:', photos);

    const newItem = new Item({
      ...req.body,
      photos,
      price: Number(req.body.price),
      mrp: Number(req.body.mrp),
      seller: req.user.id,
      status: 'available'
    });

    console.log('Created new item object:', newItem);

    const savedItem = await newItem.save();
    console.log('Saved item:', savedItem);

    res.status(201).json(savedItem);
  } catch (err) {
    console.error('Error creating item:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Get item by ID
router.get('/:id', async (req, res) => {
  try {
    const item = await Item.findById(req.params.id)
      .populate('seller', 'firstName lastName username email contactNumber')
      .populate('buyer', 'firstName lastName username email contactNumber');
    
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Format photo paths
    const formattedItem = {
      ...item.toObject(),
      photos: item.photos.map(photo => {
        const filename = path.basename(photo);
        return `/uploads/items/${filename}`;
      })
    };

    res.json(formattedItem);
  } catch (err) {
    console.error('Error fetching item:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Serve item images
router.get('/image/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const imagePath = path.join(uploadDir, filename);
    
    console.log('Attempting to serve image:', imagePath);
    
    if (fs.existsSync(imagePath)) {
      res.sendFile(imagePath);
    } else {
      console.log('Image not found:', imagePath);
      res.status(404).send('Image not found');
    }
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).send('Error serving image');
  }
});

// Update item
router.put('/:id', auth, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ msg: 'Item not found' });
    }

    // Check if user is the seller
    if (item.seller.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'User not authorized' });
    }

    const updatedItem = await Item.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );

    res.json(updatedItem);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Delete item
router.delete('/:id', auth, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ msg: 'Item not found' });
    }

    // Check if user is the seller
    if (item.seller.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'User not authorized' });
    }

    await item.remove();
    res.json({ msg: 'Item removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Mark item as sold
router.put('/:id/sold', auth, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Check if item is already sold
    if (item.status === 'sold') {
      return res.status(400).json({ message: 'This item has already been sold' });
    }

    // Check if user is trying to buy their own item
    if (item.seller.toString() === req.user.id) {
      return res.status(400).json({ message: 'You cannot buy your own item' });
    }

    // Update item status
    item.status = 'sold';
    item.soldAt = Date.now();
    item.buyer = req.user.id;  // Use the authenticated user's ID as the buyer
    await item.save();

    // Update buyer's bought items
    await User.findByIdAndUpdate(req.user.id, {
      $push: { boughtItems: item._id }
    });

    // Update seller's sold items and remove from active listings
    await User.findByIdAndUpdate(item.seller, {
      $push: { soldItems: item._id },
      $pull: { activeListings: item._id }
    });

    // Populate seller and buyer details before sending response
    const populatedItem = await Item.findById(item._id)
      .populate('seller', 'firstName lastName username')
      .populate('buyer', 'firstName lastName username');

    res.json(populatedItem);
  } catch (err) {
    console.error('Error marking item as sold:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router; 