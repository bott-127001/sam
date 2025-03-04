const getDataBtn = document.getElementById('getDataBtn');
const liveRefreshBtn = document.getElementById('liveRefreshBtn');
const loginBtn = document.getElementById('loginBtn');
const accessTokenInput = document.getElementById('accessToken');
const authCodeInput = document.getElementById('authCode');
const sendAuthCodeBtn = document.getElementById('sendAuthCodeBtn');
const optionChainTableBody = document.getElementById('optionChainTableBody');

// ========== Background Execution Setup ==========
let worker;
let calculateChangeinterval;
let liveRefreshInterval;
let isLiveRefreshActive = localStorage.getItem('liveRefreshActive') === 'true';

// Web Worker for background execution
if (window.Worker) {
    worker = new Worker('worker.js');
    
    worker.onmessage = function(e) {
        if (e.data === 'fetch') {
            fetchData();
        }
    };

    // Restore previous state
    if (isLiveRefreshActive) {
        worker.postMessage('start');
        liveRefreshBtn.textContent = 'Stop Refresh';
    }
}

// ========== State Management ==========
let initialState = JSON.parse(localStorage.getItem('optionChainState')) || {
    call: { volume: 0, OI: 0, askQty: 0, bidQty: 0, IV: 0, delta: 0 },
    put: { volume: 0, OI: 0, askQty: 0, bidQty: 0, IV: 0, delta: 0 },
    price: 0,
    deltas: { callVolume: 0, callOI: 0, putVolume: 0, putOI: 0 },
    changes: { changeinCallvolume: 0, changeinCallOI: 0, changeinPutOI: 0, changeinPutvolume: 0 }
};

// ========== Original Variables ==========
let initialCallVolume = initialState.call.volume;
let initialCallOI = initialState.call.OI;
let initialCallAskQty = initialState.call.askQty;
let initialCallBidQty = initialState.call.bidQty;
let initialCallIV = initialState.call.IV;
let initialCallDelta = initialState.call.delta;

let initialPutVolume = initialState.put.volume;
let initialPutOI = initialState.put.OI;
let initialPutAskQty = initialState.put.askQty;
let initialPutBidQty = initialState.put.bidQty;
let initialPutIV = initialState.put.IV;
let initialPutDelta = initialState.put.delta;

let initialprice = initialState.price;
let deltCallvolume = initialState.deltas.callVolume;
let deltCalloi = initialState.deltas.callOI;
let deltPutvolume = initialState.deltas.putVolume;
let deltPutoi = initialState.deltas.putOI;

let initialdeltCallvolume = initialState.deltas.callVolume;
let initialdeltCalloi = initialState.deltas.callOI;
let initialdeltPutvolume = initialState.deltas.putVolume;
let initialdeltPutoi = initialState.deltas.putOI;

let changeinCallvolume = initialState.changes.changeinCallvolume;
let changeinCallOI = initialState.changes.changeinCallOI;
let changeinPutvolume = initialState.changes.changeinPutvolume;
let changeinPutOI = initialState.changes.changeinPutOI;

let calculateChangeTimerStarted = localStorage.getItem('calculateChangeTimer') === 'true';

let changes;
// ========== Event Listeners ==========
getDataBtn.addEventListener('click', fetchData);
liveRefreshBtn.addEventListener('click', toggleLiveRefresh);
loginBtn.addEventListener('click', startAuthentication);
sendAuthCodeBtn.addEventListener('click', submitAuthCode);

// ========== Core Functions ==========
function startAuthentication() {
    const authUrl = '/login'; 
    window.open(authUrl, '_blank');
}

function submitAuthCode() {
    const authCode = authCodeInput.value;

    fetch('/generate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authCode }),
    })
    .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
    })
    .then(data => {
        accessTokenInput.value = data.accessToken;
        localStorage.setItem('accessToken', data.accessToken);
        alert('Access Token generated successfully!');
    })
    .catch(error => {
        console.error('Error generating access token:', error);
        alert('Error generating token: ' + error.message);
    });
}

async function fetchData() {
    const accessToken = localStorage.getItem('accessToken') || accessTokenInput.value;
    const inputDate = document.getElementById('expiryDate').value;

    if (!inputDate) {
        alert('Please enter a valid expiry date.');
        return;
    }

    try {
        const response = await fetch(`/option-chain?accessToken=${accessToken}&expiryDate=${inputDate}`);
        if (!response.ok) throw new Error('Network response was not ok');
        
        const data = await response.json();
        
        if (data.status === "success" && Array.isArray(data.data)) {
            const underlyingSpotPrice = data.data[0].underlying_spot_price;
            updateOptionChainData(data.data, underlyingSpotPrice);
        } else {
            throw new Error('Invalid data format received');
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        alert('Fetch error: ' + error.message);
    }
}

// ========== Background Execution Control ==========
function toggleLiveRefresh() {
    if (isLiveRefreshActive) {
        worker.postMessage('stop');
        liveRefreshBtn.textContent = 'Live Refresh';
    } else {
        worker.postMessage('start');
        liveRefreshBtn.textContent = 'Stop Refresh';
    }
    isLiveRefreshActive = !isLiveRefreshActive;
    localStorage.setItem('liveRefreshActive', isLiveRefreshActive);
}

// ========== State Management Functions ==========


function calculateChange(deltCallvolume, deltCalloi, deltPutoi, deltPutvolume) {
    if (!initialdeltCallvolume) {
        initialdeltCallvolume = deltCallvolume;
        initialdeltCalloi = deltCalloi;
        initialdeltPutvolume = deltPutvolume;
        initialdeltPutoi = deltPutoi;
        return { changeinCallvolume, changeinCallOI, changeinPutOI, changeinPutvolume };
    }

    changeinCallvolume = deltCallvolume - initialdeltCallvolume;
    changeinCallOI = deltCalloi - initialdeltCalloi;
    changeinPutvolume = deltPutvolume - initialdeltPutvolume;
    changeinPutOI = deltPutoi - initialdeltPutoi;

    initialdeltCallvolume = deltCallvolume;
    initialdeltCalloi = deltCalloi;
    initialdeltPutvolume = deltPutvolume;
    initialdeltPutoi = deltPutoi;
    
    return { changeinCallvolume, changeinCallOI, changeinPutOI, changeinPutvolume };
}

// ========== Original Update Function ==========
function updateOptionChainData(optionChain, underlyingSpotPrice) {
    optionChainTableBody.innerHTML = '';

    let totalCallVolume = 0, totalCallOI = 0, totalCallAskQty = 0, totalCallBidQty = 0, totalCalldelta = 0, totalCallIV = 0;
    let totalPutVolume = 0, totalPutOI = 0, totalPutAskQty = 0, totalPutBidQty = 0, totalPutdelta = 0, totalPutIV = 0;
    let currentprice = underlyingSpotPrice;

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
            totalPutdelta += item.put_options.option_greeks.delta;
            totalPutIV += item.put_options.option_greeks.iv;
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

    if (!calculateChangeTimerStarted) {
        calculateChangeTimerStarted = true;
        setInterval(() => {
            changes = calculateChange(deltCallvolume, deltCalloi, deltPutoi, deltPutvolume);
        }, 900000);
        localStorage.setItem('calculateChangeTimer', 'true');
    }

    //displaying values in the table
    const totalRow = document.createElement('tr');
    totalRow.innerHTML = `
        <td>${totalCallVolume}</td>
        <td>${totalCallOI}</td>
        <td>${totalCallIV.toFixed(2)}</td>
        <td>${totalCalldelta.toFixed(2)}</td>
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
        <td>${totalPutdelta.toFixed(2)}</td>
        <td>${totalPutIV.toFixed(2)}</td>
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
    <td>${deltCallvolume.toFixed(3)}, ${changes?.changeinCallvolume?.toFixed(3) || '0.000'}</td>
    <td>${deltCalloi.toFixed(3)}, ${changes?.changeinCallOI?.toFixed(3) ||'0.000'}</td>
    <td>${(totalCallIV - initialCallIV).toFixed(4)}</td>
    <td>${(totalCalldelta - initialCallDelta).toFixed(4)}</td>
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
    <td>${(totalPutdelta - initialPutDelta).toFixed(4)}</td>
    <td>${(totalPutIV - initialPutIV).toFixed(4)}</td>
    <td>${deltPutoi.toFixed(3)}, ${changes?.changeinPutOI?.toFixed(3) || '0.000'}</td>
    <td>${deltPutvolume.toFixed(3)}, ${changes?.changeinPutvolume?.toFixed(3) || '0.000'}</td>
    `;
    optionChainTableBody.appendChild(deltarow);

}


    function saveState() {
        const state = {
            call: {
                volume: totalCallVolume,
                OI: totalCallOI,
                askQty: totalCallAskQty,
                bidQty: totalCallBidQty,
                IV: totalCallIV,
                delta: totalCalldelta
            },
            put: {
                volume: totalPutVolume,
                OI: totalPutOI,
                askQty: totalPutAskQty,
                bidQty: totalPutBidQty,
                IV: totalPutIV,
                delta: totalPutdelta
            },
            price: currentprice,
            deltas: { callVolume: deltCallvolume, callOI: deltCalloi, putVolume: deltPutvolume, putOI: deltPutoi },
            changes: { changeinCallvolume, changeinCallOI, changeinPutOI, changeinPutvolume }
        };
        
        localStorage.setItem('optionChainState', JSON.stringify(state));
        localStorage.setItem('calculateChangeTimer', calculateChangeTimerStarted);
    }
    


// ========== Cleanup ==========
window.addEventListener('beforeunload', () => {
    if (worker) worker.postMessage('stop');
    saveState();
});
