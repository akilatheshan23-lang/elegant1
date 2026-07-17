async function test() {
  try {
    const res = await fetch('http://localhost:5000/api/analytics');
    console.log('API Status:', res.status);
    const data = await res.json();
    console.log('API Data:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('API Error:', err.message);
  }
}

test();
