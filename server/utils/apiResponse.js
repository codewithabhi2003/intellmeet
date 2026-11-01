exports.ok = (res, data = {}, status = 200) => res.status(status).json({ success: true, ...data });
exports.fail = (res, status, code, message) => res.status(status).json({ success: false, code, message });
