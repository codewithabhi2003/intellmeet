const jwt = require('jsonwebtoken');
const User = require('../models/User');
// The one place that turns a token into a user, for HTTP and for sockets.
// A token is only good if the account is active AND the token was issued under the account's CURRENT session version.
exports.userFromToken = async (raw) => {
  if (!raw) return null;
  let payload;
  try { payload = jwt.verify(raw, process.env.JWT_SECRET); } catch { return null; }
  const user = await User.findById(payload.id);
  if (!user || !user.isActive || (payload.tv ?? 0) !== (user.tokenVersion ?? 0)) return null;
  return user;
};