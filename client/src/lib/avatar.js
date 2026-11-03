
// Pure helpers for profile pictures (unit tested).
export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const AVATAR_MAX_MB = 2;

// Supports both Cloudinary absolute URLs and legacy server-relative paths.
const origin = () => {
  try {
    return new URL(
      import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
    ).origin;
  } catch {
    return '';
  }
};

export const avatarSrc = (path) => {
  if (!path) return '';

  // Cloudinary URL: use directly without adding the API origin.
  if (/^https:\/\/res\.cloudinary\.com\//i.test(path)) {
    return path;
  }

  // Legacy server-relative avatar path.
  if (path.startsWith('/api/users/')) {
    return `${origin()}${path}`;
  }

  return '';
};

// Checked in the browser for fast feedback; the server re-checks the real file bytes.
export const checkAvatarFile = (file) => {
  if (!file) return 'Choose an image to upload.';
  if (!AVATAR_TYPES.includes(file.type)) return 'Use a PNG, JPEG or WebP image.';
  if (file.size > AVATAR_MAX_MB * 1024 * 1024) {
    return `The image must be ${AVATAR_MAX_MB} MB or smaller.`;
  }
  return null;
};
