const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { isAdmin } = require('../middleware/isAdmin');

// Admin endpoint to sync all users and items
router.post('/sync-all', [auth, isAdmin], async (req, res) => {
  try {
    console.log('Starting sync-all operation');
    const results = {
      users: 0,
      items: 0,
      fixedItemStatuses: 0,
      fixedUserReferences: 0,
      errors: []
    };

    // Get all users
    const users = await User.find({});
    results.users = users.length;
    
    // Process each user
    for (const user of users) {
      try {
        // Find all items sold by this user
        const userItems = await Item.find({ seller: user._id });
        
        // Separate items into available and sold
        const availableItems = userItems
          .filter(item => !item.buyer && item.status === 'available')
          .map(item => item._id);
        
        const soldItems = userItems
          .filter(item => item.buyer && item.status === 'sold')
          .map(item => item._id);
        
        // Fix any inconsistent items 
        for (const item of userItems) {
          if (!item.buyer && item.status !== 'available') {
            item.status = 'available';
            await item.save();
            results.fixedItemStatuses++;
          } else if (item.buyer && item.status !== 'sold') {
            item.status = 'sold';
            if (!item.soldAt) {
              item.soldAt = new Date();
            }
            await item.save();
            results.fixedItemStatuses++;
          }
        }
        
        // Check if the user's arrays need to be updated
        const activeListingsNeedUpdate = !arraysEqual(
          user.activeListings.map(id => id.toString()),
          availableItems.map(id => id.toString())
        );
        
        const soldItemsNeedUpdate = !arraysEqual(
          user.soldItems.map(id => id.toString()),
          soldItems.map(id => id.toString())
        );
        
        // Update user if needed
        if (activeListingsNeedUpdate || soldItemsNeedUpdate) {
          await User.findByIdAndUpdate(user._id, {
            $set: {
              activeListings: availableItems,
              soldItems: soldItems
            }
          });
          results.fixedUserReferences++;
        }
      } catch (error) {
        console.error(`Error processing user ${user._id}:`, error);
        results.errors.push({
          userId: user._id,
          error: error.message
        });
      }
    }
    
    // Process all items to ensure buyer references are correct
    const allItems = await Item.find({ status: 'sold' });
    results.items = allItems.length;
    
    for (const item of allItems) {
      try {
        if (item.buyer) {
          const buyer = await User.findById(item.buyer);
          if (buyer) {
            // Ensure this item is in the buyer's boughtItems
            if (!buyer.boughtItems.includes(item._id)) {
              await User.findByIdAndUpdate(buyer._id, {
                $addToSet: { boughtItems: item._id }
              });
              results.fixedUserReferences++;
            }
          }
        }
      } catch (error) {
        console.error(`Error processing item ${item._id}:`, error);
        results.errors.push({
          itemId: item._id,
          error: error.message
        });
      }
    }
    
    res.json({
      message: 'Sync operation completed',
      results
    });
  } catch (error) {
    console.error('Error in sync-all operation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Helper function to compare arrays
function arraysEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) return false;
  
  const set = new Set(arr2);
  for (const item of arr1) {
    if (!set.has(item)) return false;
  }
  
  return true;
}

module.exports = router; 