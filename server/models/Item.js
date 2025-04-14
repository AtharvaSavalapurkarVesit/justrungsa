const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['Books', 'Notes', 'Stationary', 'Clothes & Costumes', 'Art', 'Sports Accessories', 'Devices']
  },
  photos: [{
    type: String,
    required: true
  }],
  age: {
    type: String,
    required: true
  },
  condition: {
    type: String,
    required: true
  },
  workingStatus: {
    type: String,
    required: function() {
      return this.category === 'Sports Accessories' || this.category === 'Art' || this.category === 'Devices';
    }
  },
  missingParts: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  isNegotiable: {
    type: Boolean,
    default: false
  },
  location: {
    type: String,
    required: true
  },
  deliveryOptions: {
    pickup: {
      type: Boolean,
      default: true
    },
    shipping: {
      type: Boolean,
      default: false
    }
  },
  isOriginalOwner: {
    type: Boolean,
    required: true
  },
  warrantyStatus: {
    type: String,
    required: true
  },
  hasReceipt: {
    type: Boolean,
    required: true
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['available', 'sold', 'pending', 'unavailable'],
    default: 'available'
  },
  termsAccepted: {
    type: Boolean,
    required: true,
    default: false
  },
  mrp: {
    type: Number,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  soldAt: {
    type: Date
  }
});

module.exports = mongoose.model('Item', ItemSchema); 