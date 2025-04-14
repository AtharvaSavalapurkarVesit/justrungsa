const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
  console.log('[Auth Middleware] Checking authorization...');
  
  // Get token from header
  const token = req.header('x-auth-token');
  console.log('[Auth Middleware] Token:', token);

  // Check if no token
  if (!token) {
    console.log('[Auth Middleware] No token provided');
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    // Verify token with a consistent secret
    const decoded = jwt.verify(token, 'garagesale_jwt_secret_key_2024');
    req.user = { id: decoded.userId };
    console.log('[Auth Middleware] Token verified successfully. User ID:', decoded.userId);
    next();
  } catch (err) {
    console.error('[Auth Middleware] Token verification failed:', err.message);
    res.status(401).json({ msg: 'Token is not valid' });
  }
}; 