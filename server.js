const express = require('express');
const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Default route to serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Your existing routes for Upstox API
const clientId = "2f86a5b5-bef6-4c1a-9ce6-1753df6c0f6b"; // Your API Key
const clientSecret = "yw71gnmh3g"; // Your API Secret
const redirectUri = "https://www.google.co.in/"; // Your Redirect URI

// Step 1: Redirect to Upstox for authentication
app.get('/login', (req, res) => {
    const authUrl = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}`;
    res.redirect(authUrl);
});

// Step 2: Handle the redirect back from Upstox
app.get('/callback', async (req, res) => {
    const authCode = req.query.code;

    try {
        const response = await axios.post('https://api.upstox.com/v2/login/authorization/token', null, {
            params: {
                code: authCode,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const accessToken = response.data.access_token;
        // Store the access token securely (e.g., in a session or database)
        res.json({ accessToken });
    } catch (error) {
        console.error('Error fetching access token:', error);
        res.status(500).send('Error fetching access token');
    }
});

// Step 3: Handle the POST request to generate access token
app.post('/generate-token', async (req, res) => {
    const { authCode } = req.body; // Get the authorization code from the request body

    try {
        const response = await axios.post('https://api.upstox.com/v2/login/authorization/token', null, {
            params: {
                code: authCode,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const accessToken = response.data.access_token;
        // Store the access token securely (e.g., in a session or database)
        res.json({ accessToken });
    } catch (error) {
        console.error('Error fetching access token:', error);
        res.status(500).send('Error fetching access token');
    }
});

app.get('/option-chain', async (req, res) => {
    const accessToken = req.query.accessToken; 
    const instrumentKey = 'NSE_INDEX|Nifty 50';
    const expiryDate = req.query.expiryDate;

    // Configure the request to fetch option chain data
    const url = 'https://api.upstox.com/v2/option/chain';
    const params = {
        mode: 'option_chain',
        instrument_key: instrumentKey,
        expiry_date: expiryDate
    };
    const headers = {
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}` // Include the access token in the Authorization header
    };

    try {
        const response = await axios.get(url, { params, headers });
        res.json(response.data); // Send the response data back to the client
    } catch (error) {
        console.error('Error fetching option chain data:', error.response ? error.response.data : error.message);
        res.status(500).send('Error fetching option chain data');
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
