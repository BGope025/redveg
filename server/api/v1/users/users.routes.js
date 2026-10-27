const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middleware/auth.middleware');
const {
  getUserProfile,
  updateUserProfile,
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
} = require('./users.controller');

// Profile and user detail routes require an authenticated identity. Admins can
// manage any user; non-admins may only access their own profile.
router.use(protect);
router.get('/:userId', (req, res, next) => {
  if (req.user?.isAdminStaff) {
    req.params.id = req.params.userId;
    return authorize('admin')(req, res, () => getUserById(req, res, next));
  }
  return getUserProfile(req, res, next);
});
router.put('/:userId', (req, res, next) => {
  if (req.user?.isAdminStaff) {
    req.params.id = req.params.userId;
    return authorize('admin')(req, res, () => updateUser(req, res, next));
  }
  return updateUserProfile(req, res, next);
});

// Admin only routes for user management
router.use(authorize('admin'));

router.get('/', getAllUsers); // Get all users
router.post('/', createUser); // Create new user
router.delete('/:id', deleteUser); // Delete user

module.exports = router;

