require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const xlsx = require('xlsx');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Admin credentials from environment or defaults
const ADMIN_USERNAME = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'doanxatralien@2026';

// Active admin sessions in memory: token -> { username, loginAt, expiresAt }
const activeSessions = new Map();
const SESSION_DURATION_HOURS = 24;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Authentication Middleware for Admin routes
 */
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'Yêu cầu đăng nhập quản trị viên' });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const session = activeSessions.get(token);

  if (!session) {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
  }

  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại' });
  }

  req.adminSession = session;
  next();
}

// ----------------------------------------------------
// PUBLIC API: GỬI Ý KIẾN TRẺ EM (KHÔNG CẦN ĐĂNG NHẬP)
// ----------------------------------------------------

/**
 * POST /api/feedback
 * Trẻ em gửi ý kiến đóng góp
 */
app.post('/api/feedback', (req, res) => {
  try {
    const { age, village, topic, content, isAnonymous, authorName, contact } = req.body;

    // Validate age
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 4 || ageNum > 18) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp độ tuổi hợp lệ của em (từ 4 đến 18 tuổi)'
      });
    }

    // Validate village
    if (!village || typeof village !== 'string' || !village.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn hoặc nhập tên thôn/xóm nơi em sinh sống'
      });
    }

    // Validate topic
    const validTopics = [
      'Học tập',
      'Vui chơi',
      'Gia đình',
      'Nhà trường',
      'Môi trường',
      'Bảo vệ trẻ em',
      'Hoạt động Đoàn – Đội',
      'Ý kiến khác'
    ];
    if (!topic || !validTopics.includes(topic.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn một chủ đề phù hợp trong danh sách'
      });
    }

    // Validate content
    if (!content || typeof content !== 'string' || content.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Nội dung ý kiến cần có ít nhất 5 ký tự để các anh chị hiểu rõ nguyện vọng của em'
      });
    }

    // Create record
    const newFeedback = db.createFeedback({
      age: ageNum,
      village: village.trim(),
      topic: topic.trim(),
      content: content.trim(),
      isAnonymous: Boolean(isAnonymous),
      authorName: authorName ? authorName.trim() : '',
      contact: contact ? contact.trim() : ''
    });

    return res.status(201).json({
      success: true,
      message: 'Gửi ý kiến thành công! Cảm ơn em đã đóng góp ý kiến cho Đoàn TNCS Hồ Chí Minh xã Trà Liên.',
      code: newFeedback.code,
      topic: newFeedback.topic,
      createdAtFormatted: newFeedback.createdAtFormatted
    });
  } catch (err) {
    console.error('Lỗi khi tiếp nhận ý kiến:', err);
    return res.status(500).json({
      success: false,
      message: 'Có lỗi xảy ra trong quá trình gửi ý kiến. Em vui lòng thử lại sau nhé!'
    });
  }
});

// ----------------------------------------------------
// ADMIN API: QUẢN TRỊ ĐOÀN XÃ
// ----------------------------------------------------

/**
 * POST /api/admin/login
 * Đăng nhập quản trị
 */
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập tên tài khoản và mật khẩu' });
  }

  if (username.trim() === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000;

    activeSessions.set(token, {
      username: ADMIN_USERNAME,
      loginAt: Date.now(),
      expiresAt
    });

    return res.json({
      success: true,
      message: 'Đăng nhập thành công',
      token,
      user: {
        username: ADMIN_USERNAME,
        role: 'Cán bộ quản trị Đoàn xã Trà Liên'
      }
    });
  }

  return res.status(401).json({
    success: false,
    message: 'Tài khoản hoặc mật khẩu không chính xác'
  });
});

/**
 * GET /api/admin/me
 * Kiểm tra trạng thái đăng nhập
 */
app.get('/api/admin/me', requireAdminAuth, (req, res) => {
  res.json({
    success: true,
    user: {
      username: req.adminSession.username,
      role: 'Cán bộ quản trị Đoàn xã Trà Liên'
    }
  });
});

/**
 * POST /api/admin/logout
 * Đăng xuất quản trị
 */
app.post('/api/admin/logout', requireAdminAuth, (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  activeSessions.delete(token);
  res.json({ success: true, message: 'Đăng xuất thành công' });
});

/**
 * GET /api/admin/stats
 * Thống kê tổng quan
 */
app.get('/api/admin/stats', requireAdminAuth, (req, res) => {
  const stats = db.getStatistics();
  res.json({ success: true, stats });
});

/**
 * GET /api/admin/feedbacks
 * Danh sách ý kiến với bộ lọc & tìm kiếm
 */
app.get('/api/admin/feedbacks', requireAdminAuth, (req, res) => {
  try {
    let feedbacks = db.getFeedbacks();
    const { village, topic, status, search } = req.query;

    // Filter by village
    if (village && village.trim() !== 'all') {
      feedbacks = feedbacks.filter(f => f.village === village.trim());
    }

    // Filter by topic
    if (topic && topic.trim() !== 'all') {
      feedbacks = feedbacks.filter(f => f.topic === topic.trim());
    }

    // Filter by status
    if (status && status.trim() !== 'all') {
      feedbacks = feedbacks.filter(f => f.status === status.trim());
    }

    // Search keyword
    if (search && search.trim()) {
      const keyword = search.trim().toLowerCase();
      feedbacks = feedbacks.filter(f =>
        (f.code && f.code.toLowerCase().includes(keyword)) ||
        (f.content && f.content.toLowerCase().includes(keyword)) ||
        (f.village && f.village.toLowerCase().includes(keyword)) ||
        (f.authorName && f.authorName.toLowerCase().includes(keyword)) ||
        (f.topic && f.topic.toLowerCase().includes(keyword)) ||
        (f.adminNote && f.adminNote.toLowerCase().includes(keyword))
      );
    }

    res.json({
      success: true,
      totalFiltered: feedbacks.length,
      feedbacks
    });
  } catch (err) {
    console.error('Lỗi lấy danh sách ý kiến:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải danh sách ý kiến' });
  }
});

/**
 * PATCH /api/admin/feedbacks/:id/status
 * Cập nhật trạng thái và ghi chú xử lý
 */
app.patch('/api/admin/feedbacks/:id/status', requireAdminAuth, (req, res) => {
  const { id } = req.params;
  const { status, adminNote } = req.body;

  const updated = db.updateFeedback(id, { status, adminNote });
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy ý kiến yêu cầu' });
  }

  res.json({
    success: true,
    message: 'Cập nhật trạng thái thành công',
    feedback: updated
  });
});

/**
 * DELETE /api/admin/feedbacks/:id
 * Xóa ý kiến
 */
app.delete('/api/admin/feedbacks/:id', requireAdminAuth, (req, res) => {
  const { id } = req.params;
  const deleted = db.deleteFeedback(id);
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy ý kiến để xóa' });
  }
  res.json({ success: true, message: 'Xóa ý kiến thành công' });
});

/**
 * GET /api/admin/export
 * Xuất danh sách ý kiến ra Excel (.xlsx) hoặc CSV
 */
app.get('/api/admin/export', requireAdminAuth, (req, res) => {
  try {
    const feedbacks = db.getFeedbacks();
    const format = (req.query.format || 'xlsx').toLowerCase();

    // Map data to clean Vietnamese column headers
    const exportData = feedbacks.map((item, index) => ({
      'STT': index + 1,
      'Mã ý kiến': item.code || '',
      'Thời gian gửi': item.createdAtFormatted || item.createdAt,
      'Độ tuổi': item.age ? `${item.age} tuổi` : 'Không rõ',
      'Thôn/Xóm': item.village || '',
      'Chủ đề': item.topic || '',
      'Nội dung ý kiến': item.content || '',
      'Hình thức gửi': item.isAnonymous ? 'Ẩn danh' : 'Có danh tính',
      'Người gửi': item.authorName || '',
      'Thông tin liên hệ': item.contact || '',
      'Trạng thái': item.status || 'Mới tiếp nhận',
      'Ghi chú xử lý của Đoàn xã': item.adminNote || ''
    }));

    const dateStr = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      // Create CSV with UTF-8 BOM so Excel opens with proper Vietnamese diacritics
      const worksheet = xlsx.utils.json_to_sheet(exportData);
      const csvContent = xlsx.utils.sheet_to_csv(worksheet);
      const bom = '\uFEFF';
      const filename = `Y_kien_tre_em_Xa_Tra_Lien_${dateStr}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(bom + csvContent);
    }

    // Default to Excel (.xlsx)
    const worksheet = xlsx.utils.json_to_sheet(exportData);

    // Auto-fit column widths
    const columnWidths = [
      { wch: 6 },  // STT
      { wch: 12 }, // Mã ý kiến
      { wch: 20 }, // Thời gian gửi
      { wch: 10 }, // Độ tuổi
      { wch: 20 }, // Thôn/Xóm
      { wch: 22 }, // Chủ đề
      { wch: 50 }, // Nội dung ý kiến
      { wch: 15 }, // Hình thức gửi
      { wch: 20 }, // Người gửi
      { wch: 18 }, // Thông tin liên hệ
      { wch: 16 }, // Trạng thái
      { wch: 35 }  // Ghi chú xử lý
    ];
    worksheet['!cols'] = columnWidths;

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Ý kiến trẻ em Trà Liên');

    const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const filename = `Y_kien_tre_em_Xa_Tra_Lien_${dateStr}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('Lỗi khi xuất file Excel/CSV:', err);
    res.status(500).json({ success: false, message: 'Lỗi khi xuất file dữ liệu' });
  }
});

// Direct admin page route helper
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Fallback to index.html for client routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 HỆ THỐNG LẤY Ý KIẾN TRẺ EM XÃ TRÀ LIÊN ĐANG CHẠY!`);
  console.log(`📍 Cổng phục vụ: http://localhost:${PORT}`);
  console.log(`👶 Giao diện thiếu nhi: http://localhost:${PORT}/`);
  console.log(`👔 Trang quản trị: http://localhost:${PORT}/admin`);
  console.log(`🔑 Tài khoản mặc định: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
  console.log(`=======================================================`);
});
