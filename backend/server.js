require('dotenv').config();
const express = require('express');
const cors = require('cors');
const os = require('os');
const sql = require('mssql');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());


const sqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
      encrypt: false,
      trustServerCertificate: true
  }
};


// Helper to get the first non-internal IPv4 address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

app.get('/api/local-ip', (req, res) => {
  const ip = getLocalIp();
  res.json({ ip });
});

// Attendance submission endpoint
app.post('/api/attendance', async (req, res) => {
  const { token, employeeId, status } = req.body;
  console.log("Submitted Token:", token);

  if (!token || !employeeId || !status) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  // Extract timestamp from token
  const tokenParts = token.split('-');
  const tokenTimestamp = parseInt(tokenParts[tokenParts.length - 1], 10);

  console.log(tokenTimestamp);

  if (isNaN(tokenTimestamp)) {
    return res.status(400).json({ error: 'Invalid token format.' });
  }

  const now = Date.now();
  if (now - tokenTimestamp > 20000) {
    return res.status(400).json({ error: 'QR is no longer valid.' });
  }
  console.log(`Now: ${now}, TokenTime: ${tokenTimestamp}, Age: ${now - tokenTimestamp}`);

  try {
    // Connect to SQL Server
    const pool = await sql.connect(sqlConfig);

    // Check if employee exists
    const empResult = await pool
      .request()
      .input('employeeId', sql.VarChar, employeeId)
     // .query('SELECT EmployeeID FROM employees WHERE EmployeeID = @employeeId');
     .query('SELECT EMPLOYEE# FROM BM_LIST_OPERATOR_TABLE WHERE EMPLOYEE# = @employeeId');
    if (empResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    // Check if token already used
    const tokenResult = await pool
      .request()
      .input('token', sql.VarChar, token)
      .query('SELECT tokenid FROM AttendanceRecord WHERE tokenid = @token');

    if (tokenResult.recordset.length > 0) {
      return res.status(409).json({ error: 'This QR code has already been used.' });
    }

    // Insert attendance record
    await pool
      .request()
      .input('token', sql.VarChar, token)
      .input('employeeId', sql.VarChar, employeeId)
      .input('status', sql.VarChar, status)
      .query(
        'INSERT INTO AttendanceRecord (tokenid, employeeid, status) VALUES (@token, @employeeId, @status)'
      );

    res.json({ message: 'Attendance recorded successfully.' });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

app.get('/api/db-status', async (req, res) => {
  try {
    // Try to connect and do a simple query
    const pool = await sql.connect(sqlConfig);
    await pool.request().query('SELECT 1');
    res.json({ connected: true });
  } catch (err) {
    res.json({ connected: false });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
