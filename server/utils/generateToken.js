
const jwt = require('jsonwebtoken');

const sign = (id, tv = 0) =>
  jwt.sign(
    { id, tv },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );

const days = () => parseInt(process.env.JWT_EXPIRE, 10) || 7;

const cookieOpts = () => {
  const production = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? 'none' : 'lax',
    path: '/',
  };
};

exports.signToken = sign;

exports.setAuthCookie = (res, user) => {
  const token = sign(user._id, user.tokenVersion || 0);

  res.cookie('token', token, {
    ...cookieOpts(),
    maxAge: days() * 24 * 60 * 60 * 1000,
  });

  return token;
};

exports.clearAuthCookie = (res) =>
  res.clearCookie('token', cookieOpts());
