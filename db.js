const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'feedbacks.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ensure database file exists
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2), 'utf8');
}

/**
 * Read all feedbacks safely
 */
function getFeedbacks() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Lỗi đọc cơ sở dữ liệu feedbacks:', err);
    return [];
  }
}

/**
 * Save all feedbacks with atomic write to prevent corruption
 */
function saveFeedbacks(items) {
  const tempFile = `${DB_FILE}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(items, null, 2), 'utf8');
  fs.renameSync(tempFile, DB_FILE);
  return items;
}

/**
 * Create a new feedback
 */
function createFeedback(data) {
  const feedbacks = getFeedbacks();
  const now = new Date();

  // Create friendly display code like TL-1024
  const codeNumber = (feedbacks.length + 1).toString().padStart(4, '0');
  const code = `TL-${codeNumber}`;

  const newFeedback = {
    id: crypto.randomUUID ? crypto.randomUUID() : `fb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    code,
    age: parseInt(data.age, 10) || null,
    village: (data.village || '').trim(),
    topic: (data.topic || '').trim(),
    content: (data.content || '').trim(),
    isAnonymous: Boolean(data.isAnonymous),
    authorName: data.isAnonymous ? 'Ẩn danh' : ((data.authorName || '').trim() || 'Không cung cấp'),
    contact: data.isAnonymous ? '' : ((data.contact || '').trim() || ''),
    status: 'Mới tiếp nhận', // 'Mới tiếp nhận' | 'Đang xử lý' | 'Đã hoàn thành'
    adminNote: '',
    createdAt: now.toISOString(),
    createdAtFormatted: now.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }),
    updatedAt: now.toISOString()
  };

  feedbacks.unshift(newFeedback); // Newest first
  saveFeedbacks(feedbacks);
  return newFeedback;
}

/**
 * Update feedback status & admin note
 */
function updateFeedback(id, updates) {
  const feedbacks = getFeedbacks();
  const index = feedbacks.findIndex(item => item.id === id);
  if (index === -1) return null;

  const validStatuses = ['Mới tiếp nhận', 'Đang xử lý', 'Đã hoàn thành'];
  if (updates.status && validStatuses.includes(updates.status)) {
    feedbacks[index].status = updates.status;
  }

  if (typeof updates.adminNote === 'string') {
    feedbacks[index].adminNote = updates.adminNote.trim();
  }

  feedbacks[index].updatedAt = new Date().toISOString();
  saveFeedbacks(feedbacks);
  return feedbacks[index];
}

/**
 * Delete feedback by id
 */
function deleteFeedback(id) {
  const feedbacks = getFeedbacks();
  const filtered = feedbacks.filter(item => item.id !== id);
  if (filtered.length !== feedbacks.length) {
    saveFeedbacks(filtered);
    return true;
  }
  return false;
}

/**
 * Summary statistics
 */
function getStatistics() {
  const feedbacks = getFeedbacks();
  const total = feedbacks.length;
  const newCount = feedbacks.filter(f => f.status === 'Mới tiếp nhận').length;
  const processingCount = feedbacks.filter(f => f.status === 'Đang xử lý').length;
  const completedCount = feedbacks.filter(f => f.status === 'Đã hoàn thành').length;

  // Breakdown by topic
  const byTopic = {};
  // Breakdown by village
  const byVillage = {};

  feedbacks.forEach(f => {
    if (f.topic) {
      byTopic[f.topic] = (byTopic[f.topic] || 0) + 1;
    }
    if (f.village) {
      byVillage[f.village] = (byVillage[f.village] || 0) + 1;
    }
  });

  return {
    total,
    newCount,
    processingCount,
    completedCount,
    byTopic,
    byVillage
  };
}

module.exports = {
  getFeedbacks,
  createFeedback,
  updateFeedback,
  deleteFeedback,
  getStatistics
};
