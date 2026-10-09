const http = require('http');

async function runTests() {
  console.log('--- BẮT ĐẦU KIỂM THỬ HỆ THỐNG LẤY Ý KIẾN TRẺ EM XÃ TRÀ LIÊN ---');

  const BASE_URL = 'http://localhost:3000';

  // Helper request
  function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, BASE_URL);
      const reqHeaders = {
        'Content-Type': 'application/json',
        ...headers
      };

      const req = http.request(url, {
        method,
        headers: reqHeaders
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            parsed = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      });

      req.on('error', reject);
      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    });
  }

  try {
    // 1. Test public homepage
    console.log('1. Kiểm tra trang lấy ý kiến thiếu nhi (GET /)...');
    const homeRes = await request('GET', '/');
    if (homeRes.status === 200 && typeof homeRes.body === 'string' && homeRes.body.includes('HỘP THƯ LẤY Ý KIẾN TRẺ EM')) {
      console.log('   ✅ Trang chủ tải thành công, giao diện đúng chuẩn tiếng Việt!');
    } else {
      throw new Error(`Trang chủ lỗi: ${homeRes.status}`);
    }

    // 2. Test submit validation (invalid age)
    console.log('2. Kiểm tra xác thực dữ liệu gửi (validation)...');
    const invalidRes = await request('POST', '/api/feedback', {
      age: 99,
      village: 'Thôn 1',
      topic: 'Học tập',
      content: 'Test'
    });
    if (invalidRes.status === 400 && invalidRes.body.success === false) {
      console.log('   ✅ Xác thực độ tuổi thành công (từ chối tuổi không hợp lệ)');
    } else {
      throw new Error('Validation thất bại');
    }

    // 3. Test submit valid feedback (Ẩn danh)
    console.log('3. Kiểm tra gửi ý kiến ẩn danh của thiếu nhi (POST /api/feedback)...');
    const submit1 = await request('POST', '/api/feedback', {
      age: 12,
      village: 'Thôn Trà Liên Tây',
      topic: 'Vui chơi',
      content: 'Em mong muốn các anh chị Đoàn xã mở thêm sân bóng đá mini và khu vui chơi thiếu nhi dịp hè ạ!',
      isAnonymous: true
    });
    if (submit1.status === 201 && submit1.body.success === true && submit1.body.code) {
      console.log(`   ✅ Gửi ý kiến thành công! Mã số: ${submit1.body.code}`);
    } else {
      throw new Error('Gửi ý kiến 1 thất bại');
    }

    // 4. Test submit valid feedback (Có họ tên)
    console.log('4. Kiểm tra gửi ý kiến có thông tin họ tên...');
    const submit2 = await request('POST', '/api/feedback', {
      age: 14,
      village: 'Thôn Trà Liên Đông',
      topic: 'Học tập',
      content: 'Chúng em mong muốn Đoàn xã tổ chức các lớp học bơi phòng chống đuối nước và câu lạc bộ tiếng Anh hè.',
      isAnonymous: false,
      authorName: 'Lê Hoàng Nam',
      contact: '0912345678'
    });
    if (submit2.status === 201 && submit2.body.success === true) {
      console.log(`   ✅ Gửi ý kiến thành công! Mã số: ${submit2.body.code}`);
    } else {
      throw new Error('Gửi ý kiến 2 thất bại');
    }

    // 5. Test security: unauthenticated access to admin endpoints
    console.log('5. Kiểm tra bảo vệ thông tin trẻ em: Chặn truy cập trái phép...');
    const unauthRes = await request('GET', '/api/admin/feedbacks');
    if (unauthRes.status === 401) {
      console.log('   ✅ Đã chặn thành công: Người lạ không thể xem dữ liệu quản lý trẻ em (HTTP 401)');
    } else {
      throw new Error('Bảo mật thất bại: Cho phép truy cập không xác thực');
    }

    // 6. Test Admin login
    console.log('6. Kiểm tra đăng nhập tài khoản quản trị Đoàn xã...');
    const loginRes = await request('POST', '/api/admin/login', {
      username: 'admin',
      password: 'doanxatralien@2026'
    });
    if (loginRes.status === 200 && loginRes.body.token) {
      console.log('   ✅ Đăng nhập quản trị thành công! Token đã được cấp.');
    } else {
      throw new Error('Đăng nhập thất bại: ' + JSON.stringify(loginRes.body));
    }

    const token = loginRes.body.token;
    const authHeader = { 'Authorization': `Bearer ${token}` };

    // 7. Test Admin stats
    console.log('7. Kiểm tra API thống kê tổng quan (GET /api/admin/stats)...');
    const statsRes = await request('GET', '/api/admin/stats', null, authHeader);
    if (statsRes.status === 200 && statsRes.body.stats.total >= 2) {
      console.log(`   ✅ Thống kê hoạt động chính xác! Tổng số ý kiến: ${statsRes.body.stats.total}, Mới: ${statsRes.body.stats.newCount}`);
    } else {
      throw new Error('Lỗi lấy thống kê');
    }

    // 8. Test Admin feedbacks list & filter
    console.log('8. Kiểm tra danh sách và bộ lọc ý kiến...');
    const listRes = await request('GET', '/api/admin/feedbacks?village=Thôn Trà Liên Tây', null, authHeader);
    if (listRes.status === 200 && Array.isArray(listRes.body.feedbacks)) {
      console.log(`   ✅ Lọc theo thôn thành công: tìm thấy ${listRes.body.feedbacks.length} ý kiến tại Thôn Trà Liên Tây`);
    } else {
      throw new Error('Lỗi lọc danh sách');
    }

    // 9. Test update status
    const targetFeedback = listRes.body.feedbacks[0];
    console.log(`9. Kiểm tra cập nhật trạng thái ý kiến ${targetFeedback.code} -> "Đang xử lý"...`);
    const updateRes = await request('PATCH', `/api/admin/feedbacks/${targetFeedback.id}/status`, {
      status: 'Đang xử lý',
      adminNote: 'Đoàn xã đã tiếp nhận và đưa vào kế hoạch hè 2026'
    }, authHeader);
    if (updateRes.status === 200 && updateRes.body.feedback.status === 'Đang xử lý') {
      console.log('   ✅ Cập nhật trạng thái và ghi chú xử lý thành công!');
    } else {
      throw new Error('Lỗi cập nhật trạng thái');
    }

    // 10. Test export Excel & CSV
    console.log('10. Kiểm tra xuất dữ liệu ra file Excel (.xlsx) & CSV...');
    const exportExcelRes = await request('GET', '/api/admin/export?format=xlsx', null, authHeader);
    if (exportExcelRes.status === 200 && exportExcelRes.headers['content-type'].includes('spreadsheetml')) {
      console.log('   ✅ Xuất file Excel (.xlsx) thành công!');
    } else {
      throw new Error('Lỗi xuất Excel');
    }

    const exportCsvRes = await request('GET', '/api/admin/export?format=csv', null, authHeader);
    if (exportCsvRes.status === 200 && exportCsvRes.headers['content-type'].includes('csv')) {
      console.log('   ✅ Xuất file CSV (UTF-8 BOM) thành công!');
    } else {
      throw new Error('Lỗi xuất CSV');
    }

    console.log('\n======================================================');
    console.log('🎉 TẤT CẢ 10 BƯỚC KIỂM THỬ ĐÃ VƯỢT QUA XUẤT SẮC!');
    console.log('======================================================');
    process.exit(0);

  } catch (err) {
    console.error('❌ LỖI TRONG QUÁ TRÌNH KIỂM THỬ:', err.message);
    process.exit(1);
  }
}

runTests();
