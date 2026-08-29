const axios = require('axios');

async function main() {
  try {
    // 1. Get a customer token
    const loginRes = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'customer@kogiride.com',
      password: 'password123',
      appType: 'CUSTOMER'
    });
    
    const token = loginRes.data.access_token;
    console.log('Customer logged in');
    
    // 2. Create ride order
    const orderRes = await axios.post('http://localhost:3000/api/orders/ride', {
      pickupLocation: 'Lokoja HQ',
      dropoffLocation: 'Kogi State University',
      amount: 1500,
      pickupLat: 7.7969,
      pickupLng: 6.7405,
      dropoffLat: 7.8012,
      dropoffLng: 6.735
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('Order Created:', orderRes.data.id);
  } catch (err) {
    console.error(err.response?.data || err.message);
  }
}
main();
