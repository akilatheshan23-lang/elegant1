async function check() {
  try {
    const res = await fetch('http://localhost:5173/');
    console.log('Vite Status:', res.status);
    const html = await res.text();
    console.log('HTML head:', html.substring(0, 500));
  } catch (err) {
    console.error('Vite Error:', err.message);
  }
}

check();
