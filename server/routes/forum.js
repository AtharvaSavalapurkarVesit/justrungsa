const express = require('express');
const router = express.Router();
const ForumPost = require('../models/ForumPost');
const auth = require('../middleware/auth');
const User = require('../models/User');

// Get all posts
router.get('/posts', auth, async (req, res) => {
  try {
    const posts = await ForumPost.find()
      .populate('author', 'username firstName lastName profilePic')
      .populate('replies.author', 'username firstName lastName profilePic')
      .sort({ createdAt: -1 });
    res.json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's posts
router.get('/posts/user', auth, async (req, res) => {
  try {
    const posts = await ForumPost.find({ author: req.user.id })
      .populate('author', 'username firstName lastName profilePic')
      .populate('replies.author', 'username firstName lastName profilePic')
      .sort({ createdAt: -1 });
    res.json(posts);
  } catch (error) {
    console.error('Error fetching user posts:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new post
router.post('/posts', auth, async (req, res) => {
  try {
    const { content } = req.body;
    
    // Get the current user's data
    const user = await User.findById(req.user.id).select('username firstName lastName profilePic');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newPost = new ForumPost({
      content,
      author: req.user.id,
    });
    await newPost.save();
    
    // Populate author details before sending response
    await newPost.populate('author', 'username firstName lastName profilePic');
    
    // Send response with user data included
    res.status(201).json({
      ...newPost.toObject(),
      author: user,
      likes: [],
      replies: []
    });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a reply to a post
router.post('/posts/:postId/replies', auth, async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Get the current user's data
    const user = await User.findById(req.user.id).select('username firstName lastName profilePic');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const reply = {
      content: req.body.content,
      author: req.user.id,
      createdAt: Date.now()
    };

    post.replies.push(reply);
    await post.save();
    
    // Populate all necessary fields
    await post.populate('author', 'username firstName lastName profilePic');
    await post.populate('replies.author', 'username firstName lastName profilePic');
    
    res.json(post);
  } catch (error) {
    console.error('Error adding reply:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Like/Unlike a post
router.post('/posts/:postId/like', auth, async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const likeIndex = post.likes.indexOf(req.user.id);
    if (likeIndex === -1) {
      // Like the post
      post.likes.push(req.user.id);
    } else {
      // Unlike the post
      post.likes.splice(likeIndex, 1);
    }

    await post.save();
    
    // Populate all necessary fields
    await post.populate('author', 'username firstName lastName profilePic');
    await post.populate('replies.author', 'username firstName lastName profilePic');
    
    res.json(post);
  } catch (error) {
    console.error('Error updating likes:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 