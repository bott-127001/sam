const getDataBtn = document.getElementById('getDataBtn');
const liveRefreshBtn = document.getElementById('liveRefreshBtn');
const loginBtn = document.getElementById('loginBtn');
const accessTokenInput = document.getElementById('accessToken');
const authCodeInput = document.getElementById('authCode');
const sendAuthCodeBtn = document.getElementById('sendAuthCodeBtn');
const optionChainTableBody = document.getElementById('optionChainTableBody');
let liveRefreshInterval;

// Event listeners
getDataBtn.addEventListener('click', fetchData);
liveRefreshBtn.addEventListener('click', toggleLiveRefresh);
loginBtn.addEventListener('click', startAuthentication);
sendAuthCodeBtn.addEventListener('click', submitAuthCode);

function startAuthentication() {
    const authUrl = '/login'; 
    window.open(authUrl, '_blank'); // Open the URL in a new tab
}

// Function to submit the authorization code and get the access token
function submitAuthCode() {
    const authCode = authCodeInput.value;

    fetch('/generate-token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ authCode }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        accessTokenInput.value = data.accessToken;
        alert('Access Token generated successfully!');
    })
    .catch(error => console.error('Error generating access token:', error));
}

// Function to fetch data from your backend
function fetchData() {
    const accessToken = accessTokenInput.value;
    const inputDate = document.getElementById('expiryDate').value;

    if (!inputDate) {
        console.error('Expiry date is not provided');
        alert('Please enter a valid expiry date.');
        return; // Exit the function if the date is not valid
    }

    fetch(`/option-chain?accessToken=${accessToken}&expiryDate=${inputDate}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        console.log(data);
        if (data.status === "success" && Array.isArray(data.data)) {

            const underlyingSpotPrice = data.data[0].underlying_spot_price;
            console.log('Underlying Spot Price:', underlyingSpotPrice);

            updateOptionChainData(data.data, underlyingSpotPrice);
        } else {
            console.error('Expected an array but got:', data);
            alert('Error: Expected an array of option chain data.');
        }
    })
    .catch(error => console.error('Error fetching data:', error));
}

async function fetchOptionChain(symbol) {
    const response = await fetch(`https://api.example.com/options/${symbol}`);
    const data = await response.json();
    return data.option_chain;
}

let initialCallVolume=0, initialCallOI=0, initialCallAskQty=0, initialCallBidQty=0, initialCallIV=0, initialCallDelta=0;
let initialPutVolume=0, initialPutOI=0, initialPutAskQty=0, initialPutBidQty=0, initialPutIV=0, initialPutDelta=0;
let initialprice =0;

let deltCallvolume = 0, deltCalloi =0, deltPutvolume=0, deltPutoi=0;
let initialdeltCallvolume = 0, initialdeltCalloi =0, initialdeltPutvolume=0, initialdeltPutoi=0;

function updateOptionChainData(optionChain, underlyingSpotPrice) {
    optionChainTableBody.innerHTML = '';


    let totalCallVolume = 0;
    let totalCallOI = 0;
    let totalCallAskQty = 0;
    let totalCallBidQty = 0;
    let totalCalldelta = 0;
    let totalCallIV = 0;

    let currentprice = 0;

    let totalPutVolume = 0;
    let totalPutOI = 0;
    let totalPutAskQty = 0;
    let totalPutBidQty = 0;
    let totalPutdelta = 0;
    let totalPutIV = 0;

    optionChain.forEach(item => {
        const strikePrice = item.strike_price;
        let currentprice = underlyingSpotPrice;

        // Determine if the strike is ATM or OTM
        const isATM = strikePrice === underlyingSpotPrice;
        const isOTMCall = strikePrice > underlyingSpotPrice; // OTM for calls
        const isOTMPut = strikePrice < underlyingSpotPrice; // OTM for puts

        // Accumulate totals for Call options
        if (isATM || isOTMCall) {
            totalCallVolume += item.call_options.market_data.volume;
            totalCallOI += item.call_options.market_data.oi;
            totalCallAskQty += item.call_options.market_data.ask_qty;
            totalCallBidQty += item.call_options.market_data.bid_qty;
            totalCalldelta += item.call_options.option_greeks.delta;
            totalCallIV += item.call_options.option_greeks.iv;
        }

        // Accumulate totals for Put options
        if (isATM || isOTMPut) {
            totalPutVolume += item.put_options.market_data.volume;
            totalPutOI += item.put_options.market_data.oi;
            totalPutAskQty += item.put_options.market_data.ask_qty;
            totalPutBidQty += item.put_options.market_data.bid_qty;
            totalPutdelta = item.put_options.option_greeks.delta;
            totalPutIV = item.put_options.option_greeks.iv;
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.call_options.market_data.volume}</td>
            <td>${item.call_options.market_data.oi}</td>
            <td>${item.call_options.option_greeks.iv}</td>
            <td>${item.call_options.option_greeks.delta}</td>
            <td>${item.call_options.market_data.ltp}</td>
            <td>${item.call_options.market_data.bid_qty}</td>
            <td>${item.call_options.market_data.bid_price}</td>
            <td>${item.call_options.market_data.ask_price}</td>
            <td>${item.call_options.market_data.ask_qty}</td>
            <td>${strikePrice}</td>
            <td>${item.put_options.market_data.ask_qty}</td>
            <td>${item.put_options.market_data.ask_price}</td>
            <td>${item.put_options.market_data.bid_price}</td>
            <td>${item.put_options.market_data.bid_qty}</td>
            <td>${item.put_options.market_data.ltp}</td>
            <td>${item.put_options.option_greeks.delta}</td>
            <td>${item.put_options.option_greeks.iv}</td>
            <td>${item.put_options.market_data.oi}</td>
            <td>${item.put_options.market_data.volume}</td>
        `;
        optionChainTableBody.appendChild(row);
    });
    if (!initialCallVolume) {
        initialCallVolume = totalCallVolume;
        initialCallOI = totalCallOI;
        initialCallAskQty = totalCallAskQty;
        initialCallBidQty = totalCallBidQty;
        initialCallIV = totalCallIV;
        initialCallDelta = totalCalldelta;
        initialPutVolume = totalPutVolume;
        initialPutOI = totalPutOI;
        initialPutAskQty = totalPutAskQty;
        initialPutBidQty = totalPutBidQty;
        initialPutIV = totalPutIV;
        initialPutDelta = totalPutdelta;
        initialprice = currentprice;
    }

    deltCallvolume = (totalCallVolume-initialCallVolume)/totalCallVolume * 100;
    deltCalloi = (totalCallOI-initialCallOI)/totalCallOI * 100;

    deltPutvolume = (totalPutVolume-initialPutVolume)/totalPutVolume * 100;
    deltPutoi = (totalPutOI-initialPutOI)/totalPutOI * 100;

    if (!initialdeltaCallvolume)
    {
        initialdeltCallvolume = deltCallvolume;
        initialdeltCalloi = deltCalloi;
        initialdeltPutvolume = deltPutvolume;
        initialdeltPutoi = deltPutoi;
    }



    // Display combined totals for ATM and OTM
    const totalRow = document.createElement('tr');
    totalRow.innerHTML = `
        <td>${totalCallVolume}</td>
        <td>${totalCallOI}</td>
        <td>${totalCallIV}</td>
        <td>${totalCalldelta}</td>
        <td></td>
        <td>${totalCallBidQty}</td>
        <td></td>
        <td></td>
        <td>${totalCallAskQty}</td>
        <td></td>
        <td>${totalPutAskQty}</td>
        <td></td>
        <td></td>
        <td>${totalPutBidQty}</td>
        <td></td>
        <td>${totalPutdelta}</td>
        <td>${totalPutIV}</td>
        <td>${totalPutOI}</td>
        <td>${totalPutVolume}</td>
    `;
    optionChainTableBody.appendChild(totalRow);

    const diffRow = document.createElement('tr');
    diffRow.innerHTML = `
    <td>${totalCallVolume - initialCallVolume}</td>
    <td>${totalCallOI - initialCallOI}</td>
    <td></td>
    <td></td>
    <td></td>
    <td>${totalCallBidQty - initialCallBidQty}</td>
    <td></td>
    <td></td>
    <td>${totalCallAskQty - initialCallAskQty}</td>
    <td></td>
    <td>${totalPutAskQty - initialPutAskQty}</td>
    <td></td>
    <td></td>
    <td>${totalPutBidQty - initialPutBidQty}</td>
    <td></td>
    <td></td>
    <td></td>
    <td>${totalPutOI - initialPutOI}</td>
    <td>${totalPutVolume - initialPutVolume}</td>
    `;
    optionChainTableBody.appendChild(diffRow);

    const deltarow = document.createElement('tr');
    deltarow.innerHTML = `
    <td>${deltCallvolume}, ${deltCallvolume - initialdeltCallvolume}</td>
    <td>${deltCalloi}, ${deltCalloi - initialdeltCalloi}</td>
    <td>${totalCallIV - initialCallIV}</td>
    <td>${totalCalldelta - initialCallDelta}</td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td>${totalPutdelta - initialPutDelta}</td>
    <td>${totalPutIV - initialPutIV}</td>
    <td>${deltPutoi}, ${deltPutoi - initialdeltPutoi}</td>
    <td>${deltPutvolume}, ${deltPutvolume - initialdeltPutvolume}</td>
    `;
    optionChainTableBody.appendChild(deltarow);

}


fetchOptionChain(symbol)
    .then(optionChain => updateOptionChainData(optionChain, underlyingSpotPrice))
    .catch(error => console.error('Error fetching option chain:', error));
// Function to toggle live refresh
function toggleLiveRefresh() {
    if (liveRefreshInterval) {
        clearInterval(liveRefreshInterval);
        liveRefreshInterval = null;
        liveRefreshBtn.textContent = 'Live Refresh';
    } else {
        liveRefreshInterval = setInterval(fetchData, 5000); // Fetch data every minute
        liveRefreshBtn.textContent = 'Stop Refresh';
    }
}
