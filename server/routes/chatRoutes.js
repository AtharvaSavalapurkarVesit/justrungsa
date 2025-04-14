const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const auth = require('../middleware/auth');

// Delete all chats (temporary route)
router.delete('/all', async (req, res) => {
  try {
    const result = await Chat.deleteMany({});
    res.json({ message: `All chats deleted successfully. Deleted ${result.deletedCount} chats.` });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get all chats for a user with unread count
router.get('/', auth, async (req, res) => {
  try {
    const chats = await Chat.find({
      participants: req.user.id
    })
    .populate('participants', 'username')
    .populate('item', 'name photos')
    .sort({ lastMessage: -1 });

    // Add unread count for each chat
    const chatsWithUnreadCount = chats.map(chat => {
      const chatObj = chat.toObject();
      
      // Count messages not read by current user
      chatObj.unreadCount = chat.messages.filter(msg => 
        msg.sender.toString() !== req.user.id && 
        (!msg.readBy || !msg.readBy.some(id => id.toString() === req.user.id))
      ).length;
      
      return chatObj;
    });

    res.json(chatsWithUnreadCount);
  } catch (err) {
    console.error('Error fetching chats:', err.message);
    res.status(500).send('Server Error');
  }
});

// Get chat by ID and mark messages as read
router.get('/:id', auth, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id)
      .populate('participants', 'username')
      .populate('item', 'name photos');

    if (!chat) {
      return res.status(404).json({ msg: 'Chat not found' });
    }

    // Check if user is a participant
    if (!chat.participants.some(p => p._id.toString() === req.user.id)) {
      return res.status(401).json({ msg: 'User not authorized' });
    }

    // Mark all messages from other participants as read by current user
    let updated = false;
    chat.messages.forEach(message => {
      if (message.sender.toString() !== req.user.id) {
        if (!message.readBy) {
          message.readBy = [req.user.id];
          updated = true;
        } else if (!message.readBy.some(id => id.toString() === req.user.id)) {
          message.readBy.push(req.user.id);
          updated = true;
        }
      }
    });

    // Save if updates were made
    if (updated) {
      await chat.save();
    }

    res.json(chat);
  } catch (err) {
    console.error('Error getting chat:', err.message);
    res.status(500).send('Server Error');
  }
});

// Create new chat
router.post('/', auth, async (req, res) => {
  try {
    const { itemId, participantId } = req.body;

    // Check if chat already exists
    const existingChat = await Chat.findOne({
      item: itemId,
      participants: { $all: [req.user.id, participantId] }
    });

    if (existingChat) {
      return res.json(existingChat);
    }

    const newChat = new Chat({
      participants: [req.user.id, participantId],
      item: itemId,
      messages: []
    });

    const chat = await newChat.save();
    res.json(chat);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Send message
router.post('/:id/messages', auth, async (req, res) => {
  try {
    const { content } = req.body;
    const chat = await Chat.findById(req.params.id);

    if (!chat) {
      return res.status(404).json({ msg: 'Chat not found' });
    }

    // Check if user is a participant
    if (!chat.participants.some(p => p.toString() === req.user.id)) {
      return res.status(401).json({ msg: 'User not authorized' });
    }

    const message = {
      sender: req.user.id,
      content,
      readBy: [req.user.id] // Sender has already read their own message
    };

    chat.messages.push(message);
    chat.lastMessage = Date.now();
    await chat.save();

    res.json(message);
  } catch (err) {
    console.error('Error sending message:', err.message);
    res.status(500).send('Server Error');
  }
});

// Mark messages as read
router.post('/:id/read', auth, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);
    
    if (!chat) {
      return res.status(404).json({ msg: 'Chat not found' });
    }
    
    // Check if user is a participant
    if (!chat.participants.some(p => p.toString() === req.user.id)) {
      return res.status(401).json({ msg: 'User not authorized' });
    }
    
    // Mark all messages as read by current user
    let updated = false;
    chat.messages.forEach(message => {
      if (!message.readBy) {
        message.readBy = [req.user.id];
        updated = true;
      } else if (!message.readBy.some(id => id.toString() === req.user.id)) {
        message.readBy.push(req.user.id);
        updated = true;
      }
    });
    
    // Save if updates were made
    if (updated) {
      await chat.save();
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error marking messages as read:', err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router; 