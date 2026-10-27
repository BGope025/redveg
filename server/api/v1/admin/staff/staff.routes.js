const express = require('express');
const { protect, authorize } = require('../../../../middleware/auth.middleware');
const { claimOwner, createStaff, deleteStaff, getActivity, getStaff, setStaffPassword, updateStaff } = require('./staff.controller');

const router = express.Router();
router.use(protect, authorize('admin'));
router.get('/', getStaff);
router.get('/activity', getActivity);
router.post('/claim-owner', claimOwner);
router.post('/', createStaff);
router.patch('/:id/password', setStaffPassword);
router.delete('/:id', deleteStaff);
router.patch('/:id', updateStaff);

module.exports = router;
