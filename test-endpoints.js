const axios = require('axios');

async function test() {
  try {
    const loginRes = await axios.post('http://localhost:3001/api/v1/auth/login', {
      email: 'admin@tolongin.co',
      password: 'AdminPassword123!'
    });
    const token = loginRes.data.access_token;

    const usersRes = await axios.get('http://localhost:3001/api/v1/admin/users', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("Users status:", usersRes.status);
    console.log("Is array:", Array.isArray(usersRes.data));
    
    const statsRes = await axios.get('http://localhost:3001/api/v1/admin/analytics', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("Analytics status:", statsRes.status);
  } catch (err) {
    console.error("Error:", err.response ? err.response.data : err.message);
  }
}

test();
