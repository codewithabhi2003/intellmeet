const jwt = require('jsonwebtoken');
const sign = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });
const days = () => parseInt(process.env.JWT_EXPIRE, 10) || 7;
exports.signToken = sign;
exports.setAuthCookie = (res, id) => {
  const token = sign(id);
  res.cookie('token', token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    maxAge: days() * 24 * 60 * 60 * 1000,
  });
  return token;
};
