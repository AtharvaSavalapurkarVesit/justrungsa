const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const User = require('../models/User');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const fs = require('fs');
const mongoose = require('mongoose');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Create full path to upload directory
    const uploadDir = path.join(__dirname, '../uploads/items');
    
    // Ensure all parent directories exist
    try {
      // Check if '../uploads' directory exists, create if not
      const baseUploadDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(baseUploadDir)) {
        console.log('Creating base uploads directory:', baseUploadDir);
        fs.mkdirSync(baseUploadDir, { recursive: true, mode: 0o755 });
      }
      
      // Check if upload directory exists, create if not
      if (!fs.existsSync(uploadDir)) {
        console.log('Creating items uploads directory:', uploadDir);
        fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
      }
      
      // Check write permissions explicitly
      try {
        const testFile = path.join(uploadDir, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        console.log('Upload directory confirmed writable:', uploadDir);
      } catch (writeErr) {
        console.error('Upload directory is not writable:', writeErr);
        
        try {
          // Try to fix permissions
          fs.chmodSync(uploadDir, 0o755);
          console.log('Attempted to fix permissions on upload directory');
          
          // Test again
          const testFile = path.join(uploadDir, '.write-test');
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
          console.log('Permissions fixed, directory is now writable');
        } catch (fixErr) {
          console.error('Failed to fix permissions:', fixErr);
          return cb(new Error('Upload directory is not writable. Please check permissions.'));
        }
      }
      
      // Log success
      console.log('Upload directory confirmed:', uploadDir);
      cb(null, uploadDir);
    } catch (error) {
      console.error('Error with upload directory:', error);
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    // Create a safe filename to prevent path traversal or invalid characters
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeFilename = uniqueSuffix + path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    console.log('Generated filename:', safeFilename);
    cb(null, safeFilename);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    console.log('Checking file:', file.originalname, 'mimetype:', file.mimetype);
    
    // Accept common image types
    if (
      file.mimetype === 'image/jpeg' || 
      file.mimetype === 'image/jpg' || 
      file.mimetype === 'image/png' || 
      file.mimetype === 'image/gif' ||
      // For compatibility with some devices that may use different mime types
      file.mimetype === 'application/octet-stream'
    ) {
      // Check file extension as additional verification
      const validExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
      const ext = path.extname(file.originalname).toLowerCase();
      
      if (validExtensions.includes(ext)) {
        console.log(`File ${file.originalname} accepted`);
        return cb(null, true);
      }
    }
    
    console.log(`File ${file.originalname} rejected, mimetype: ${file.mimetype}`);
    // Don't throw an error, just reject the file
    return cb(null, false);
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

    res.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get items by category
router.get('/category/:category', async (req, res) => {
  try {
    const items = await Item.find({ 
      category: req.params.category,
      status: 'available' // Only show available items
    })
    .populate('seller', 'firstName lastName username')
    .sort({ createdAt: -1 });
    res.json(items);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's active listings
router.get('/user/active', auth, async (req, res) => {
  try {
    console.log('Fetching active listings for user:', req.user.id);
    
    // First, let's check all items by this seller
    const allSellerItems = await Item.find({ 
      seller: req.user.id,
      status: 'available'
    });
    console.log('All available items by seller:', allSellerItems.map(item => ({
      id: item._id,
      name: item.name,
      category: item.category,
      status: item.status
    })));

    const user = await User.findById(req.user.id)
      .populate({
        path: 'activeListings',
        match: { status: 'available' },
        populate: {
          path: 'seller',
          select: 'firstName lastName username email contactNumber'
        }
      });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('User active listings:', user.activeListings.map(item => ({
      id: item._id,
      name: item.name,
      category: item.category,
      status: item.status
    })));

    res.json(user.activeListings);
  } catch (error) {
    console.error('Error fetching active listings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new item listing
router.post('/',
  auth,
  (req, res, next) => {
    console.log('Starting file upload process...');
    console.log('Request headers:', req.headers['content-type']);
    
    // Debug incoming request
    if (req.is('multipart/form-data')) {
      console.log('Request is multipart/form-data');
    } else {
      console.log('Request is NOT multipart/form-data, but:', req.is());
    }
    
    // Wrap multer middleware in try-catch to handle any errors
    try {
      upload.array('photos', 4)(req, res, (err) => {
        if (err) {
          console.error('Multer error:', err);
          return res.status(400).json({ 
            message: 'File upload error',
            error: err.toString()
          });
        }
        
        // Check if any files were uploaded
        if (!req.files) {
          console.error('No files property on request');
          return res.status(400).json({ 
            message: 'File upload error',
            error: 'No files were uploaded. Please try again.'
          });
        }
        
        // Check if any files were rejected
        if (req.files.length === 0) {
          console.error('Files array is empty');
          return res.status(400).json({ 
            message: 'File upload error',
            error: 'Please upload only image files (jpg, jpeg, png, gif)'
          });
        }
        
        console.log(`Successfully uploaded ${req.files.length} files`);
        next();
      });
    } catch (error) {
      console.error('Error in upload middleware:', error);
      return res.status(500).json({
        message: 'Server error during file upload',
        error: error.message
      });
    }
  },
  [
    body('name').trim().notEmpty().withMessage('Item name is required'),
    body('category').isIn(['Books', 'Notes', 'Stationary', 'Clothes & Costumes', 'Art', 'Sports Accessories', 'Devices'])
      .withMessage('Invalid category'),
    body('age').trim().notEmpty().withMessage('Item age is required'),
    body('condition').trim().notEmpty().withMessage('Item condition is required'),
    body('workingStatus')
      .if(body('category').equals('Devices'))
      .trim()
      .notEmpty()
      .withMessage('Working status is required for Devices'),
    body('missingParts').trim().notEmpty().withMessage('Missing parts information is required'),
    body('price').isNumeric().withMessage('Price must be a number'),
    body('location').trim().notEmpty().withMessage('Location is required'),
    body('isOriginalOwner').isBoolean().withMessage('Original owner status is required'),
    body('warrantyStatus').trim().notEmpty().withMessage('Warranty status is required'),
    body('hasReceipt').isBoolean().withMessage('Receipt status is required'),
    body('mrp').isNumeric().withMessage('MRP must be a number'),
    body('termsAccepted').isBoolean().withMessage('Terms must be accepted')
  ],
  async (req, res) => {
    console.log('Starting item creation process...');
    console.log('Request body:', {
      ...req.body,
      photos: req.files?.length || 0
    });
    
    try {
      // Validate request body
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('Validation errors:', errors.array());
        return res.status(400).json({ errors: errors.array() });
      }

      // Additional validation for Devices category
      if (req.body.category === 'Devices' && !req.body.workingStatus) {
        return res.status(400).json({ 
          errors: [{ msg: 'Working status is required for Devices category' }] 
        });
      }

      // Validate photos
      console.log('Validating photos. Files received:', req.files?.length || 0);
      if (!req.files || req.files.length < 1) {
        console.log('Photo validation failed. Number of photos:', req.files?.length || 0);
        return res.status(400).json({ message: 'At least 1 photo is required' });
      }

      // Process photos
      console.log('Processing photos...');
      const photos = req.files.map(file => {
        console.log('Processing photo:', file.filename);
        return `/uploads/items/${file.filename}`;
      });

      // Create and save item
      const item = new Item({
        ...req.body,
        photos,
        seller: req.user.id,
        status: 'available'
      });

      const savedItem = await item.save();
      console.log('Item saved successfully. Item ID:', savedItem._id);
      console.log('Item details:', {
        id: savedItem._id,
        name: savedItem.name,
        category: savedItem.category,
        status: savedItem.status,
        workingStatus: savedItem.workingStatus
      });

      // Update user's active listings
      const updatedUser = await User.findByIdAndUpdate(
        req.user.id,
        { $push: { activeListings: savedItem._id } },
        { new: true }
      ).populate('activeListings');

      if (!updatedUser) {
        // If user update fails, delete the saved item
        await Item.findByIdAndDelete(savedItem._id);
        return res.status(404).json({ message: 'User not found' });
      }

      console.log('Updated user active listings:', updatedUser.activeListings.map(item => ({
        id: item._id,
        name: item.name,
        category: item.category,
        status: item.status
      })));

      // Return the populated item
      const populatedItem = await Item.findById(savedItem._id)
        .populate('seller', 'firstName lastName username email contactNumber');

      res.status(201).json(populatedItem);

    } catch (error) {
      console.error('Error in item creation:', error);
      
      if (error.name === 'ValidationError') {
        return res.status(400).json({ 
          message: 'Validation error', 
          errors: Object.values(error.errors).map(err => err.message)
        });
      }

      res.status(500).json({ 
        message: 'Server error while creating item',
        error: error.message
      });
    }
  }
);

// Buy item
router.post('/:id/buy', auth, async (req, res) => {
  try {
    console.log(`Starting purchase process for item ${req.params.id} by user ${req.user.id}`);
    
    // Find the item and populate seller info
    const item = await Item.findById(req.params.id)
      .populate('seller', 'firstName lastName username');
    
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (item.status !== 'available') {
      return res.status(400).json({ message: 'Item is no longer available' });
    }

    if (item.seller._id.toString() === req.user.id) {
      return res.status(400).json({ message: 'You cannot buy your own item' });
    }

    // Get buyer information
    const buyer = await User.findById(req.user.id)
      .select('firstName lastName username');

    if (!buyer) {
      return res.status(404).json({ message: 'Buyer information not found' });
    }

    // Update item status and buyer
    item.status = 'sold';
    item.buyer = buyer._id;
    item.soldAt = new Date();
    await item.save();

    console.log(`Item ${item._id} marked as sold to ${buyer._id}`);

    // Update buyer's bought items and remove from watchlist if present
    await User.findByIdAndUpdate(
      buyer._id,
      { 
        $addToSet: { boughtItems: item._id }, // Use addToSet to prevent duplicates
        $pull: { watchlist: item._id } // Remove from watchlist if it was there
      }
    );

    console.log(`Updated buyer (${buyer._id}) boughtItems`);

    // Update seller's sold items and remove from active listings
    await User.findByIdAndUpdate(
      item.seller._id,
      {
        $addToSet: { soldItems: item._id }, // Use addToSet to prevent duplicates
        $pull: { activeListings: item._id }
      }
    );

    console.log(`Updated seller (${item.seller._id}) soldItems and activeListings`);

    // Get the fully populated item with both seller and buyer details
    const populatedItem = await Item.findById(item._id)
      .populate('seller', 'firstName lastName username email')
      .populate('buyer', 'firstName lastName username email');

    // Send notification or email here if needed

    res.json({
      message: `Item purchased successfully. This item is sold to ${buyer.firstName} ${buyer.lastName}`,
      item: {
        ...populatedItem.toObject(),
        soldToMessage: `This item is sold to ${buyer.firstName} ${buyer.lastName}`
      },
      seller: {
        name: `${item.seller.firstName} ${item.seller.lastName}`,
        username: item.seller.username
      },
      buyer: {
        name: `${buyer.firstName} ${buyer.lastName}`,
        username: buyer.username
      },
      purchaseDate: item.soldAt
    });

  } catch (error) {
    console.error('Error buying item:', error);
    res.status(500).json({ 
      message: 'Failed to complete purchase',
      error: error.message 
    });
  }
});

// Check if item is in user's watchlist
router.get('/:id/watchlist', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const isInWatchlist = user.watchlist.includes(req.params.id);
    res.json({ isInWatchlist });
  } catch (error) {
    console.error('Error checking watchlist status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add to watchlist
router.post('/:id/watchlist', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (user.watchlist.includes(req.params.id)) {
      return res.status(400).json({ message: 'Item already in watchlist' });
    }

    user.watchlist.push(req.params.id);
    await user.save();

    res.json({ message: 'Added to watchlist', isInWatchlist: true });
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove from watchlist
router.delete('/:id/watchlist', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    user.watchlist = user.watchlist.filter(id => id.toString() !== req.params.id);
    await user.save();

    res.json({ message: 'Removed from watchlist', isInWatchlist: false });
  } catch (error) {
    console.error('Error removing from watchlist:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Serve item images
router.get('/image/:filename', (req, res) => {
  const { filename } = req.params;
  console.log('Attempting to serve image:', filename);
  
  // Clean the filename to prevent directory traversal
  const sanitizedFilename = path.basename(filename);
  const imagePath = path.join(__dirname, '../uploads/items', sanitizedFilename);
  
  console.log('Full image path:', imagePath);
  
  if (fs.existsSync(imagePath)) {
    console.log('Image found, serving file');
    res.sendFile(imagePath);
  } else {
    console.error('Image not found at path:', imagePath);
    res.status(404).json({ message: 'Image not found' });
  }
});

// Get single item by ID
router.get('/:id', async (req, res) => {
  try {
    const item = await Item.findById(req.params.id)
      .populate('seller', 'firstName lastName username email contactNumber pincode')
      .populate('buyer', 'firstName lastName username');
    
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Add buyer information message if item is sold
    const responseItem = item.toObject();
    if (item.status === 'sold' && item.buyer) {
      responseItem.soldToMessage = `This item is sold to ${item.buyer.firstName} ${item.buyer.lastName}`;
    }
    
    res.json(responseItem);
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Fix item status
router.post('/:id/fix-status', auth, async (req, res) => {
  try {
    // Find the item
    const item = await Item.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Check if user is the seller
    if (item.seller.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // If item has no buyer, it should be available and in active listings
    if (!item.buyer) {
      item.status = 'available';
      await item.save();

      // Update seller's listings
      await User.findByIdAndUpdate(item.seller, {
        $addToSet: { activeListings: item._id }, // Add to active listings if not already there
        $pull: { soldItems: item._id } // Remove from sold items if it's there
      });

      const updatedItem = await Item.findById(item._id)
        .populate('seller', 'firstName lastName username email contactNumber');

      return res.json({ 
        message: 'Item status fixed',
        item: updatedItem
      });
    }

    res.json({ message: 'No changes needed' });
  } catch (error) {
    console.error('Error fixing item status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Fix all items for a user
router.post('/fix-all-items', auth, async (req, res) => {
  try {
    console.log('Starting fix-all-items for user:', req.user.id);
    
    // Find all items by this seller
    const items = await Item.find({ seller: req.user.id });
    console.log('Found items:', items.map(i => ({ id: i._id, status: i.status, buyer: i.buyer })));

    // Get the user
    const user = await User.findById(req.user.id);
    console.log('Current user listings:', {
      activeListings: user.activeListings,
      soldItems: user.soldItems
    });

    // Fix each item's status
    const fixedItems = [];
    for (const item of items) {
      // If item has no buyer but is not marked as available, fix it
      if (!item.buyer && item.status !== 'available') {
        console.log(`Fixing item ${item._id}: changing status from ${item.status} to 'available'`);
        item.status = 'available';
        await item.save();
        fixedItems.push(item._id);
      }
      
      // If item has a buyer but is not marked as sold, fix it
      if (item.buyer && item.status !== 'sold') {
        console.log(`Fixing item ${item._id}: changing status from ${item.status} to 'sold'`);
        item.status = 'sold';
        if (!item.soldAt) {
          item.soldAt = new Date();
        }
        await item.save();
        fixedItems.push(item._id);
      }
    }

    // Get accurate lists of available and sold items
    const availableItems = items
      .filter(item => !item.buyer && item.status === 'available')
      .map(item => item._id);
    
    const soldItems = items
      .filter(item => item.buyer && item.status === 'sold')
      .map(item => item._id);

    // Update user's listings with accurate data
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { 
        $set: { 
          activeListings: availableItems,
          soldItems: soldItems
        }
      },
      { new: true }
    )
    .populate('activeListings')
    .populate('soldItems');

    res.json({
      message: `Items fixed: ${fixedItems.length} items updated`,
      fixedItems,
      activeListings: updatedUser.activeListings,
      soldItems: updatedUser.soldItems
    });

  } catch (error) {
    console.error('Error fixing all items:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Calculate distance between pincodes
router.post('/distance', auth, async (req, res) => {
  try {
    const { fromPincode, toPincode, sellerId } = req.body;
    let fromPin = fromPincode;
    let toPin = toPincode;
    
    // If sellerId is provided, get seller's pincode from database
    if (sellerId && !toPincode) {
      const seller = await User.findById(sellerId).select('pincode');
      if (seller && seller.pincode) {
        toPin = seller.pincode;
      } else {
        return res.status(404).json({ message: 'Seller pincode not found' });
      }
    }
    
    // If no fromPincode is provided, use the authenticated user's pincode
    if (!fromPin) {
      const buyer = await User.findById(req.user.id).select('pincode');
      if (buyer && buyer.pincode) {
        fromPin = buyer.pincode;
      } else {
        return res.status(404).json({ message: 'Your pincode information is missing' });
      }
    }
    
    console.log('Distance calculation request:', { fromPin, toPin });
    
    if (!fromPin || !toPin) {
      return res.status(400).json({ 
        message: 'Both pincodes are required',
        details: { fromPin, toPin }
      });
    }
    
    // Basic validation for Indian pincodes (6 digits)
    const pincodeRegex = /^\d{6}$/;
    if (!pincodeRegex.test(fromPin) || !pincodeRegex.test(toPin)) {
      return res.status(400).json({ 
        message: 'Invalid pincode format. Pincodes should be 6 digits.',
        details: { fromPin, toPin }
      });
    }
    
    // Calculate distance using Haversine formula
    const distance = await calculateDistance(fromPin, toPin);
    
    // Log successful calculation
    console.log('Distance calculated:', distance);
    
    res.json(distance);
  } catch (error) {
    console.error('Error calculating distance:', error);
    res.status(500).json({ 
      message: 'Server error while calculating distance',
      error: error.message 
    });
  }
});

// Haversine formula implementation
function haversine(lat1, lon1, lat2, lon2) {
  // Validate inputs
  if (typeof lat1 !== 'number' || typeof lon1 !== 'number' || 
      typeof lat2 !== 'number' || typeof lon2 !== 'number') {
    console.error('Invalid coordinates in haversine:', { lat1, lon1, lat2, lon2 });
    return 0;
  }

  // Convert all coordinates to number explicitly to avoid string calculations
  lat1 = Number(lat1);
  lon1 = Number(lon1);
  lat2 = Number(lat2);
  lon2 = Number(lon2);
  
  // If coordinates are exactly the same, return 0
  if (lat1 === lat2 && lon1 === lon2) {
    return 0;
  }
  
  const R = 6371; // Radius of Earth in kilometers
  
  const toRadians = (degrees) => {
    return degrees * (Math.PI / 180);
  };
  
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  // Using the Haversine formula
  // a = sin²(Δlat/2) + cos(lat1) · cos(lat2) · sin²(Δlon/2)
  // c = 2 · atan2(√a, √(1−a))
  // d = R · c
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in kilometers
  
  return distance;
}

// A simple pincode to coordinates mapping (for demo purposes)
// In production, use a proper geocoding service or database
const pincodeCoordinates = {
  // Delhi region
  '110001': { lat: 28.6139, lon: 77.2090, region: 'Delhi' },
  // Mumbai region
  '400001': { lat: 19.0760, lon: 72.8777, region: 'Mumbai' },
  // Bengaluru region
  '560001': { lat: 12.9716, lon: 77.5946, region: 'Bengaluru' },
  // Chennai region
  '600001': { lat: 13.0827, lon: 80.2707, region: 'Chennai' },
  // Hyderabad region
  '500001': { lat: 17.3850, lon: 78.4867, region: 'Hyderabad' },
  // Kolkata region
  '700001': { lat: 22.5726, lon: 88.3639, region: 'Kolkata' },
};

// Function to get approximate coordinates based on pincode
// This is simplified - in production use a proper geocoding service
async function getPincodeCoordinates(pincode) {
  // Look for exact pincode match first
  if (pincodeCoordinates[pincode]) {
    return {
      lat: pincodeCoordinates[pincode].lat,
      lon: pincodeCoordinates[pincode].lon,
      region: pincodeCoordinates[pincode].region
    };
  }
  
  // Try to match on first 3 digits for more accuracy
  const firstThreeDigits = pincode.substring(0, 3);
  
  // More detailed mapping based on first three digits
  const detailedRegionMap = {
    // Delhi & NCR (110xxx, 120xxx, 121xxx, 122xxx, 201xxx)
    '110': { lat: 28.6139, lon: 77.2090, region: 'Delhi' },
    '120': { lat: 28.5355, lon: 77.3910, region: 'Noida' },
    '121': { lat: 28.6692, lon: 77.4538, region: 'Ghaziabad' },
    '122': { lat: 28.4595, lon: 77.0266, region: 'Gurugram' },
    '201': { lat: 28.6304, lon: 77.2177, region: 'Greater Noida' },
    
    // Mumbai & MMR (400xxx-402xxx) - Enhanced with more accurate Mumbai areas
    '400': { lat: 19.0760, lon: 72.8777, region: 'Mumbai' },
    '400001': { lat: 18.9387, lon: 72.8353, region: 'Mumbai South' },     // Fort/Colaba
    '400002': { lat: 18.9520, lon: 72.8327, region: 'Mumbai South' },     // Ballard Estate
    '400003': { lat: 18.9631, lon: 72.8308, region: 'Mumbai South' },     // Colaba
    '400004': { lat: 18.9548, lon: 72.8224, region: 'Mumbai South' },     // Navy Nagar
    '400005': { lat: 18.9379, lon: 72.8276, region: 'Mumbai South' },     // Masjid Bunder
    '400008': { lat: 18.9568, lon: 72.8111, region: 'Mumbai South' },     // Wadi Bunder
    '400009': { lat: 18.9647, lon: 72.7993, region: 'Mumbai South' },     // Fort
    '400010': { lat: 18.9764, lon: 72.8156, region: 'Mumbai South' },     // Nariman Point
    '400011': { lat: 18.9622, lon: 72.8359, region: 'Mumbai South' },     // CST
    '400012': { lat: 18.9673, lon: 72.8440, region: 'Mumbai South' },     // Dongri
    '400018': { lat: 19.0101, lon: 72.8498, region: 'Mumbai Central' },   // Mumbai Central
    '400020': { lat: 19.0283, lon: 72.8545, region: 'Mumbai Central' },   // Dadar
    '400022': { lat: 19.0389, lon: 72.8293, region: 'Mumbai Central' },   // Worli
    '400025': { lat: 19.0499, lon: 72.8176, region: 'Mumbai West' },      // Prabhadevi
    '400026': { lat: 19.0628, lon: 72.8308, region: 'Mumbai West' },      // Lower Parel
    '400028': { lat: 19.0773, lon: 72.8296, region: 'Mumbai West' },      // Mahalaxmi
    '400030': { lat: 19.0883, lon: 72.8311, region: 'Mumbai West' },      // Tardeo
    '400050': { lat: 19.0968, lon: 72.8517, region: 'Mumbai West' },      // Bandra (W)
    '400051': { lat: 19.0643, lon: 72.8396, region: 'Mumbai West' },      // Bandra (E)
    '400052': { lat: 19.1246, lon: 72.8361, region: 'Mumbai Northwest' }, // Santacruz
    '400053': { lat: 19.1310, lon: 72.8298, region: 'Mumbai Northwest' }, // Khar
    '400054': { lat: 19.1462, lon: 72.8296, region: 'Mumbai Northwest' }, // Vile Parle
    '400055': { lat: 19.1505, lon: 72.8554, region: 'Mumbai Northwest' }, // Andheri (W)
    '400056': { lat: 19.1190, lon: 72.8816, region: 'Mumbai Northwest' }, // Andheri (E)
    '400060': { lat: 19.1755, lon: 72.8370, region: 'Mumbai Northwest' }, // Jogeshwari
    '400063': { lat: 19.2006, lon: 72.8406, region: 'Mumbai Northwest' }, // Malad
    '400064': { lat: 19.2065, lon: 72.8629, region: 'Mumbai Northwest' }, // Goregaon
    '400065': { lat: 19.2305, lon: 72.8567, region: 'Mumbai Northwest' }, // Kandivali
    '400066': { lat: 19.2502, lon: 72.8486, region: 'Mumbai Northwest' }, // Borivali
    '400070': { lat: 19.0903, lon: 72.8894, region: 'Mumbai Northeast' }, // Kurla
    '400071': { lat: 19.0508, lon: 72.9073, region: 'Mumbai Northeast' }, // Chembur
    '400072': { lat: 19.0635, lon: 72.9137, region: 'Mumbai Northeast' }, // Vikhroli
    '400075': { lat: 19.1149, lon: 72.9070, region: 'Mumbai Northeast' }, // Powai
    '400076': { lat: 19.1331, lon: 72.9425, region: 'Mumbai Northeast' }, // Mulund
    '400078': { lat: 19.0435, lon: 72.9251, region: 'Mumbai Northeast' }, // Bhandup
    '400080': { lat: 19.0625, lon: 72.9988, region: 'Navi Mumbai' },      // Airoli
    '400081': { lat: 19.0301, lon: 73.0297, region: 'Navi Mumbai' },      // Vashi
    '400082': { lat: 19.0467, lon: 73.0153, region: 'Navi Mumbai' },      // Kopar Khairane
    '400083': { lat: 19.0154, lon: 73.0410, region: 'Navi Mumbai' },      // Nerul
    '400086': { lat: 19.0048, lon: 73.0297, region: 'Navi Mumbai' },      // Seawoods
    '400087': { lat: 18.9901, lon: 73.0365, region: 'Navi Mumbai' },      // Belapur
    '400088': { lat: 18.9720, lon: 73.0566, region: 'Navi Mumbai' },      // Panvel
    '401': { lat: 19.2183, lon: 72.9781, region: 'Thane' },
    '401107': { lat: 19.1943, lon: 72.9615, region: 'Thane' },            // Thane
    '402': { lat: 18.9068, lon: 72.8164, region: 'Navi Mumbai' },
    
    // Bengaluru (560xxx-562xxx)
    '560': { lat: 12.9716, lon: 77.5946, region: 'Bengaluru Central' },
    '561': { lat: 13.0827, lon: 77.7085, region: 'Bengaluru East' },
    '562': { lat: 13.1986, lon: 77.7066, region: 'Bengaluru North' },
    
    // Chennai (600xxx-603xxx)
    '600': { lat: 13.0827, lon: 80.2707, region: 'Chennai Central' },
    '601': { lat: 13.1231, lon: 80.1127, region: 'Chennai West' },
    '602': { lat: 12.9217, lon: 80.1152, region: 'Chennai South' },
    '603': { lat: 13.2331, lon: 80.3047, region: 'Chennai North' },
    
    // Hyderabad (500xxx-501xxx)
    '500': { lat: 17.3850, lon: 78.4867, region: 'Hyderabad' },
    '501': { lat: 17.5451, lon: 78.5715, region: 'Secunderabad' },
    
    // Kolkata (700xxx-701xxx)
    '700': { lat: 22.5726, lon: 88.3639, region: 'Kolkata' },
    '701': { lat: 22.6920, lon: 88.3697, region: 'Kolkata North' },
    
    // Pune (411xxx-412xxx)
    '411': { lat: 18.5204, lon: 73.8567, region: 'Pune' },
    '412': { lat: 18.4088, lon: 73.9325, region: 'Pimpri-Chinchwad' },
    
    // Ahmedabad (380xxx-382xxx)
    '380': { lat: 23.0225, lon: 72.5714, region: 'Ahmedabad' },
    '382': { lat: 23.1215, lon: 72.5714, region: 'Gandhinagar' },
  };
  
  if (detailedRegionMap[firstThreeDigits]) {
    return detailedRegionMap[firstThreeDigits];
  }
  
  // Fall back to first two digits for broader regions
  const firstTwoDigits = pincode.substring(0, 2);
  
  // Broader mapping based on first two digits
  const regionMap = {
    '11': { lat: 28.6139, lon: 77.2090, region: 'Delhi NCR' },        // Delhi NCR
    '12': { lat: 28.4595, lon: 77.0266, region: 'Delhi NCR' },        // Delhi NCR
    '20': { lat: 28.6304, lon: 77.2177, region: 'UP (West)' },        // Western UP
    
    '40': { lat: 19.0760, lon: 72.8777, region: 'Mumbai Region' },    // Mumbai
    '41': { lat: 18.5204, lon: 73.8567, region: 'Pune Region' },      // Pune
    '42': { lat: 19.9975, lon: 73.7898, region: 'Nashik' },           // Nashik
    '43': { lat: 21.1458, lon: 79.0882, region: 'Nagpur' },           // Nagpur
    
    '50': { lat: 17.3850, lon: 78.4867, region: 'Telangana' },        // Hyderabad/Telangana
    '51': { lat: 16.5062, lon: 80.6480, region: 'Andhra Pradesh' },   // Andhra Pradesh
    '53': { lat: 13.6288, lon: 79.4192, region: 'Southern AP' },      // Southern AP
    
    '56': { lat: 12.9716, lon: 77.5946, region: 'Karnataka' },        // Bengaluru/Karnataka
    '57': { lat: 15.3173, lon: 76.3422, region: 'Northern Karnataka' },// Northern Karnataka
    '58': { lat: 14.4673, lon: 75.9218, region: 'Central Karnataka' }, // Central Karnataka
    
    '60': { lat: 13.0827, lon: 80.2707, region: 'Tamil Nadu' },       // Chennai/TN
    '62': { lat: 9.9252, lon: 78.1198, region: 'Southern TN' },       // Southern TN
    '64': { lat: 11.0168, lon: 76.9558, region: 'Western TN' },       // Western TN
    
    '70': { lat: 22.5726, lon: 88.3639, region: 'West Bengal' },      // Kolkata/WB
    '71': { lat: 26.7271, lon: 88.3953, region: 'Northern WB' },      // Northern WB
    
    '38': { lat: 23.0225, lon: 72.5714, region: 'Gujarat' },          // Gujarat
    '39': { lat: 21.1702, lon: 72.8311, region: 'Southern Gujarat' }, // Southern Gujarat
    
    '30': { lat: 26.9124, lon: 75.7873, region: 'Rajasthan' },        // Rajasthan
    '33': { lat: 30.9010, lon: 75.8573, region: 'Punjab' },           // Punjab
    '34': { lat: 31.1048, lon: 77.1734, region: 'Himachal Pradesh' }, // Himachal
    '18': { lat: 23.3441, lon: 85.3096, region: 'Jharkhand' },        // Jharkhand
    '80': { lat: 25.5941, lon: 85.1376, region: 'Bihar' },            // Bihar
    '85': { lat: 20.2961, lon: 85.8245, region: 'Odisha' },           // Odisha
  };
  
  return regionMap[firstTwoDigits] || { lat: 20.5937, lon: 78.9629, region: 'Central India' };
}

// Calculate distance between two pincodes
async function calculateDistance(fromPincode, toPincode) {
  try {
    const from = await getPincodeCoordinates(fromPincode);
    const to = await getPincodeCoordinates(toPincode);
    
    if (!from || !to) {
      console.error('Failed to get coordinates for pincodes:', { fromPincode, toPincode });
      return {
        distance: null,
        error: 'Could not determine coordinates for the provided pincodes',
        from: { pincode: fromPincode, region: 'Unknown' },
        to: { pincode: toPincode, region: 'Unknown' }
      };
    }
    
    const distance = haversine(from.lat, from.lon, to.lat, to.lon);
    
    // Apply distance adjustments based on region type
    let adjustedDistance = distance;
    let distanceNote = '';

    // More accurate handling for same region/city
    if (from.region === to.region) {
      // If exact same pincode, set minimum distance to 1km
      if (fromPincode === toPincode) {
        adjustedDistance = 1;
        distanceNote = '(same area)';
      } 
      // For same city/region but different pincodes
      else if (distance < 5) {
        // For Mumbai and other large cities, use a smaller minimum
        if (from.region.includes('Mumbai') || 
            from.region.includes('Delhi') || 
            from.region.includes('Bengaluru') || 
            from.region.includes('Chennai') || 
            from.region.includes('Kolkata') || 
            from.region.includes('Hyderabad')) {
          adjustedDistance = Math.max(2, distance);
          distanceNote = '(same city)';
        } else {
          adjustedDistance = Math.max(3, distance);
          distanceNote = '(same region)';
        }
      }
    }
    
    // Special handling for Mumbai regions for more accurate distance calculations
    if ((from.region.includes('Mumbai') && to.region.includes('Mumbai')) || 
        (from.region.includes('Navi Mumbai') && to.region.includes('Mumbai')) ||
        (from.region.includes('Mumbai') && to.region.includes('Navi Mumbai')) ||
        (from.region.includes('Thane') && to.region.includes('Mumbai')) ||
        (from.region.includes('Mumbai') && to.region.includes('Thane'))) {
      
      // Apply traffic and geography-based adjustment for Mumbai's complex layout
      // This accounts for the fact that straight-line distances in Mumbai don't reflect real travel distances
      
      // South Mumbai to suburbs adjustment (higher traffic)
      if ((from.region.includes('Mumbai South') && !to.region.includes('Mumbai South')) ||
          (!from.region.includes('Mumbai South') && to.region.includes('Mumbai South'))) {
        adjustedDistance = adjustedDistance * 1.4; // 40% increase to account for traffic and geography
        distanceNote = '(Mumbai traffic adjustment)';
      }
      
      // East-West adjustment (crossing the city)
      else if ((from.region.includes('Mumbai West') && to.region.includes('Mumbai Northeast')) ||
               (from.region.includes('Mumbai Northeast') && to.region.includes('Mumbai West')) ||
               (from.region.includes('Mumbai Northwest') && to.region.includes('Mumbai Northeast')) ||
               (from.region.includes('Mumbai Northeast') && to.region.includes('Mumbai Northwest'))) {
        adjustedDistance = adjustedDistance * 1.5; // 50% increase for cross-city travel
        distanceNote = '(Mumbai cross-city adjustment)';
      }
      
      // Mumbai to Navi Mumbai adjustment (sea link)
      else if ((from.region.includes('Mumbai') && to.region.includes('Navi Mumbai')) ||
               (from.region.includes('Navi Mumbai') && to.region.includes('Mumbai'))) {
        adjustedDistance = adjustedDistance * 1.3; // 30% increase
        distanceNote = '(Mumbai-Navi Mumbai route)';
      }
      
      // Mumbai to Thane adjustment
      else if ((from.region.includes('Mumbai') && to.region.includes('Thane')) ||
               (from.region.includes('Thane') && to.region.includes('Mumbai'))) {
        adjustedDistance = adjustedDistance * 1.25; // 25% increase
        distanceNote = '(Mumbai-Thane route)';
      }
    }
    
    // For very long distances, we round to the nearest 5km
    if (adjustedDistance > 100) {
      adjustedDistance = Math.round(adjustedDistance / 5) * 5;
    } else {
      // For shorter distances, round to 1 decimal place
      adjustedDistance = Math.round(adjustedDistance * 10) / 10;
    }
    
    return {
      distance: adjustedDistance,
      exactDistance: distance.toFixed(1), // Include exact calculation for debugging
      note: distanceNote,
      from: {
        pincode: fromPincode,
        region: from.region,
        coordinates: { lat: from.lat, lon: from.lon }
      },
      to: {
        pincode: toPincode,
        region: to.region,
        coordinates: { lat: to.lat, lon: to.lon }
      }
    };
  } catch (error) {
    console.error('Error in distance calculation:', error);
    return {
      distance: null,
      error: 'Distance calculation failed',
      from: { pincode: fromPincode },
      to: { pincode: toPincode }
    };
  }
}

// Relist an unavailable item
router.put('/:id/relist', auth, async (req, res) => {
  try {
    // Find the item
    const item = await Item.findById(req.params.id);
    
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Check if user is the seller
    if (item.seller.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Check if item is unavailable
    if (item.status !== 'unavailable') {
      return res.status(400).json({ message: 'Item is not currently delisted' });
    }

    // Update the item status to available
    item.status = 'available';
    await item.save();

    // Make sure it's in the user's active listings
    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { activeListings: item._id }
    });

    // Return the updated item
    const updatedItem = await Item.findById(item._id)
      .populate('seller', 'firstName lastName username email contactNumber');

    res.json(updatedItem);
  } catch (error) {
    console.error('Error relisting item:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update item photos
router.post('/:id/photos', auth, upload.array('photos', 4), async (req, res) => {
  try {
    // Find the item
    const item = await Item.findById(req.params.id);
    
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Check if user is the seller
    if (item.seller.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No photos uploaded' });
    }

    // Process the uploaded photos
    const newPhotos = req.files.map(file => `/uploads/items/${file.filename}`);
    
    // Add new photos to the existing ones
    const updatedPhotos = [...item.photos, ...newPhotos].slice(0, 4); // Limit to 4 photos total
    
    // Update the item
    item.photos = updatedPhotos;
    await item.save();

    res.json({ 
      message: 'Photos updated successfully',
      photos: updatedPhotos
    });
  } catch (error) {
    console.error('Error updating item photos:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update item
router.put('/:id', auth, async (req, res) => {
  try {
    // Find the item
    const item = await Item.findById(req.params.id);
    
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Check if user is the seller
    if (item.seller.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Parse deliveryOptions if it's a string
    if (req.body.deliveryOptions && typeof req.body.deliveryOptions === 'string') {
      req.body.deliveryOptions = JSON.parse(req.body.deliveryOptions);
    }

    // Update the item fields
    const updatedFields = { ...req.body };
    
    // Don't update photos through this route
    delete updatedFields.photos;

    // Update the item
    const updatedItem = await Item.findByIdAndUpdate(
      req.params.id,
      { $set: updatedFields },
      { new: true }
    ).populate('seller', 'firstName lastName username email contactNumber');

    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 