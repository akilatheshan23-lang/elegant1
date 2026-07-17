const run = async () => {
  try {
    console.log('Requesting threads from local server using native fetch...');
    const response = await fetch('http://localhost:5000/api/emails/threads');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log('Total Threads returned by server:', data.length);
    console.log('Thread details (Subject | Sender | LastReceived):');
    data.forEach(t => {
      console.log(`- ${t.subject} | ${t.sender} | ${t.lastReceived}`);
    });
  } catch (error) {
    console.error('Error connecting to local server:', error.message);
  }
};
run();
