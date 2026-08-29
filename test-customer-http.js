const axios = require('axios');
const jwt = require('jsonwebtoken');

async function testPatch() {
  const token = jwt.sign(
    { sub: 'test-admin', email: 'admin@test.com', role: 'admin' },
    'jwt_secret_key_placeholder'
  );

  try {
    const res = await axios.get('http://localhost:3000/customers', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const customers = res.data;
    if (customers.length === 0) return console.log('No customers');
    
    const customer = customers[0];
    console.log(`Patching customer ${customer.id}`);
    
    const patchRes = await axios.patch(`http://localhost:3000/customers/${customer.id}`, 
    {
      status: customer.status === 'Active' ? 'Blocked' : 'Active'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('Success:', patchRes.data);
  } catch (err) {
    if (err.response) {
      console.error('HTTP Error:', err.response.status, err.response.data);
    } else {
      console.error('Network Error:', err.message);
    }
  }
}

testPatch();
