document.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    const resetTime = new Date();
    resetTime.setHours(18, 0, 0, 0); // Set target time to today's 18:00 (6 PM)

    if (now > resetTime) {
        const lastReset = localStorage.getItem('lastDailyReset');
        const lastResetDate = lastReset ? new Date(lastReset) : null;

        if (!lastResetDate || lastResetDate < resetTime) {
            localStorage.clear();
            localStorage.setItem('lastDailyReset', resetTime.toISOString());
        }
    }

    // Restore input fields
    accessTokenInput.value = localStorage.getItem('accessToken') || '';
    authCodeInput.value = localStorage.getItem('authCode') || '';
    document.getElementById('expiryDate').value = localStorage.getItem('expiryDate') || '';

    // Restore Live Refresh state
    isLiveRefreshActive = localStorage.getItem('liveRefreshActive') === 'true';
    if (isLiveRefreshActive) {
        liveRefreshBtn.textContent = 'Stop Refresh';
        worker.postMessage('start');
        startCalculateChangeTimer();

        const savedChain = localStorage.getItem('rawOptionChain');
        if (savedChain) {
            const underlyingPrice = localStorage.getItem('lastUnderlyingPrice');
            updateOptionChainData(JSON.parse(savedChain), parseFloat(underlyingPrice));
        }
    }
});

const getDataBtn = document.getElementById('getDataBtn');
const liveRefreshBtn = document.getElementById('liveRefreshBtn');
const loginBtn = document.getElementById('loginBtn');
const accessTokenInput = document.getElementById('accessToken');
const authCodeInput = document.getElementById('authCode');
const sendAuthCodeBtn = document.getElementById('sendAuthCodeBtn');
const optionChainTableBody = document.getElementById('optionChainTableBody');
const expiryDateInput = document.getElementById('expiryDate');

let worker;
let calculateChangeInterval;
let isLiveRefreshActive = localStorage.getItem('liveRefreshActive') === 'true';

if (window.Worker) {
    worker = new Worker('worker.js');

    worker.onmessage = function(e) {
        if (e.data === 'fetch') {
            fetchData();
        }
    };

    if (isLiveRefreshActive) {
        worker.postMessage('start');
        liveRefreshBtn.textContent = 'Stop Refresh';
    }
}

let initialValues = {
    CallVolume: 0, CallOI: 0, CallAskQty: 0, CallBidQty: 0, CallIV: 0, CallDelta: 0,
    PutVolume: 0, PutOI: 0, PutAskQty: 0, PutBidQty: 0, PutIV: 0, PutDelta: 0,
    price: 0
};

let deltas = {
    CallVolume: 0, CallOI: 0, PutVolume: 0, PutOI: 0, CallDelta: 0, PutDelta: 0, CallIV: 0, PutIV: 0
};

let changes = {
    CallVolume: 0, CallOI: 0, PutVolume: 0, PutOI: 0, CallDelta: 0, PutDelta: 0, CallIV: 0, PutIV: 0
};


let totals = {
    CallVolume: 0, CallOI: 0, CallAskQty: 0, CallBidQty: 0, CallIV: 0, CallDelta: 0,
    PutVolume: 0, PutOI: 0, PutAskQty: 0, PutBidQty: 0, PutIV: 0, PutDelta: 0
};

getDataBtn.addEventListener('click', fetchData);
liveRefreshBtn.addEventListener('click', toggleLiveRefresh);
loginBtn.addEventListener('click', startAuthentication);
sendAuthCodeBtn.addEventListener('click', submitAuthCode);

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
    .then(response => response.json())
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
        const data = await response.json();

        if (data.status === "success" && Array.isArray(data.data)) {
            const underlyingSpotPrice = data.data[0].underlying_spot_price;
            localStorage.setItem('rawOptionChain', JSON.stringify(data.data));
            localStorage.setItem('lastUnderlyingPrice', underlyingSpotPrice);
            updateOptionChainData(data.data, underlyingSpotPrice);
        } else {
            throw new Error('Invalid data format received');
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        alert('Fetch error: ' + error.message);
    }
}

function toggleLiveRefresh() {
    if (isLiveRefreshActive) {
        worker.postMessage('stop');
        liveRefreshBtn.textContent = 'Live Refresh';
        localStorage.removeItem('rawOptionChain');
        localStorage.removeItem('lastUnderlyingPrice');
        localStorage.removeItem('optionChainState');
        localStorage.removeItem('calculateChangeLastRun');
        resetInitialValues();
        optionChainTableBody.innerHTML = '';
        stopCalculateChangeTimer();
    } else {
        worker.postMessage('start');
        liveRefreshBtn.textContent = 'Stop Refresh';
        startCalculateChangeTimer();
    }

    isLiveRefreshActive = !isLiveRefreshActive;
    localStorage.setItem('liveRefreshActive', isLiveRefreshActive);
}

function resetInitialValues() {
    initialValues = {
        CallVolume: 0, CallOI: 0, CallAskQty: 0, CallBidQty: 0, CallIV: 0, CallDelta: 0,
        PutVolume: 0, PutOI: 0, PutAskQty: 0, PutBidQty: 0, PutIV: 0, PutDelta: 0,
        price: 0
    };
}

function calculateChange() {
    if (!initialValues.CallVolume) {
        initialValues = { ...deltas };
        return changes;
    }

    changes = {
        CallVolume: deltas.CallVolume - initialValues.CallVolume,
        CallOI: deltas.CallOI - initialValues.CallOI,
        PutVolume: deltas.PutVolume - initialValues.PutVolume,
        PutOI: deltas.PutOI - initialValues.PutOI,
        CallDelta: deltas.CallDelta - initialValues.CallDelta,
        PutDelta: deltas.PutDelta - initialValues.PutDelta,
        CallIV: deltas.CallIV - initialValues.CallIV,
        PutIV: deltas.PutIV - initialValues.PutIV
    };

    initialValues = { ...deltas };
    return changes;
}

let calculateChangeTimer;

function startCalculateChangeTimer() {
    if (calculateChangeTimer) clearTimeout(calculateChangeTimer);

    const lastExecution = parseInt(localStorage.getItem('calculateChangeLastRun')) || Date.now();
    const nextExecution = lastExecution + 900000;
    const remainingTime = nextExecution - Date.now();

    calculateChangeTimer = setTimeout(() => {
        calculateChange();
        localStorage.setItem('calculateChangeLastRun', Date.now());
        startCalculateChangeTimer();
    }, Math.max(remainingTime, 0));

    localStorage.setItem('calculateChangeTimerActive', 'true');
}

function stopCalculateChangeTimer() {
    clearTimeout(calculateChangeTimer);
    localStorage.removeItem('calculateChangeLastRun');
    localStorage.removeItem('calculateChangeTimerActive');
}

function updateOptionChainData(optionChain, underlyingSpotPrice) {
    optionChainTableBody.innerHTML = '';

    optionChain.forEach(item => {
        const strikePrice = item.strike_price;
        const isATM = strikePrice === underlyingSpotPrice;
        const isOTMCall = strikePrice > underlyingSpotPrice;
        const isOTMPut = strikePrice < underlyingSpotPrice;

        if (isATM || isOTMCall) {
            totals.CallVolume += item.call_options.market_data.volume;
            totals.CallOI += item.call_options.market_data.oi;
            totals.CallAskQty += item.call_options.market_data.ask_qty;
            totals.CallBidQty += item.call_options.market_data.bid_qty;
            totals.CallDelta += item.call_options.option_greeks.delta;
            totals.CallIV += item.call_options.option_greeks.iv;
        }

        if (isATM || isOTMPut) {
            totals.PutVolume += item.put_options.market_data.volume;
            totals.PutOI += item.put_options.market_data.oi;
            totals.PutAskQty += item.put_options.market_data.ask_qty;
            totals.PutBidQty += item.put_options.market_data.bid_qty;
            totals.PutDelta += item.put_options.option_greeks.delta;
            totals.PutIV += item.put_options.option_greeks.iv;
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

    if (!initialValues.CallVolume) {
        initialValues = { ...totals, price: underlyingSpotPrice };
    }

    deltas = {
        CallVolume: (totals.CallVolume - initialValues.CallVolume) / totals.CallVolume * 100,
        CallOI: (totals.CallOI - initialValues.CallOI) / totals.CallOI * 100,
        CallDelta: (totals.CallDelta - initialValues.CallDelta) / totals.CallDelta * 100,
        CallIV: (totals.CallIV - initialValues.CallIV) / totals.CallIV * 100,
        PutVolume: (totals.PutVolume - initialValues.PutVolume) / totals.PutVolume * 100,
        PutOI: (totals.PutOI - initialValues.PutOI) / totals.PutOI * 100,
        PutDelta: (totals.PutDelta - initialValues.PutDelta) / totals.PutDelta * 100,
        PutIV: (totals.PutIV - initialValues.PutIV) / totals.PutIV * 100
    };

    if (localStorage.getItem('calculateChangeTimerActive') === 'true') {
        startCalculateChangeTimer();
    }

    const totalRow = document.createElement('tr');
    totalRow.innerHTML = `
        <td>${totals.CallVolume}</td>
        <td>${totals.CallOI}</td>
        <td>${totals.CallIV.toFixed(2)}</td>
        <td>${totals.CallDelta.toFixed(2)}</td>
        <td></td>
        <td>${totals.CallBidQty}</td>
        <td></td>
        <td></td>
        <td>${totals.CallAskQty}</td>
        <td></td>
        <td>${totals.PutAskQty}</td>
        <td></td>
        <td></td>
        <td>${totals.PutBidQty}</td>
        <td></td>
        <td>${totals.PutDelta.toFixed(2)}</td>
        <td>${totals.PutIV.toFixed(2)}</td>
        <td>${totals.PutOI}</td>
        <td>${totals.PutVolume}</td>
    `;
    optionChainTableBody.appendChild(totalRow);

    const diffRow = document.createElement('tr');
    diffRow.innerHTML = `
        <td>${totals.CallVolume - initialValues.CallVolume}</td>
        <td>${totals.CallOI - initialValues.CallOI}</td>
        <td>${(totals.CallIV - initialValues.CallIV).toFixed(4)}</td>
        <td>${(totals.CallDelta - initialValues.CallDelta).toFixed(4)}</td>
        <td></td>
        <td>${totals.CallBidQty - initialValues.CallBidQty}</td>
        <td></td>
        <td></td>
        <td>${totals.CallAskQty - initialValues.CallAskQty}</td>
        <td></td>
        <td>${totals.PutAskQty - initialValues.PutAskQty}</td>
        <td></td>
        <td></td>
        <td>${totals.PutBidQty - initialValues.PutBidQty}</td>
        <td></td>
        <td>${(totals.PutDelta - initialValues.PutDelta).toFixed(4)}</td>
        <td>${(totals.PutIV - initialValues.PutIV).toFixed(4)}</td>
        <td>${totals.PutOI - initialValues.PutOI}</td>
        <td>${totals.PutVolume - initialValues.PutVolume}</td>
    `;
    optionChainTableBody.appendChild(diffRow);

    const deltaRow = document.createElement('tr');
    deltaRow.innerHTML = `
        <td>${deltas.CallVolume.toFixed(3)}, ${changes.CallVolume?.toFixed(3) || '0.000'}</td>
        <td>${deltas.CallOI.toFixed(3)}, ${changes.CallOI?.toFixed(3) || '0.000'}</td>
        <td>${deltas.CallIV.toFixed(3)}, ${changes.CallIV?.toFixed(3) || '0.000'}</td>
        <td>${deltas.CallDelta.toFixed(3)}, ${changes.CallDelta?.toFixed(3) || '0.000'}</td>
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
        <td>${deltas.PutDelta.toFixed(3)}, ${changes.PutDelta?.toFixed(3) || '0.000'}</td>
        <td>${deltas.PutIV.toFixed(3)}, ${changes.PutIV?.toFixed(3) || '0.000'}</td>
        <td>${deltas.PutOI.toFixed(3)}, ${changes.PutOI?.toFixed(3) || '0.000'}</td>
        <td>${deltas.PutVolume.toFixed(3)}, ${changes.PutVolume?.toFixed(3) || '0.000'}</td>
    `;
    optionChainTableBody.appendChild(deltaRow);

    saveState();
}

function saveState() {
    const state = {
        totals,
        initialValues,
        deltas,
        changes,
        expiryDate: document.getElementById('expiryDate').value,
        calculateChangeLastRun: localStorage.getItem('calculateChangeLastRun'),
        calculateChangeTimerActive: localStorage.getItem('calculateChangeTimerActive')
    };

    localStorage.setItem('optionChainState', JSON.stringify(state));
}

function loadState() {
    const savedState = JSON.parse(localStorage.getItem('optionChainState')) || {};

    if (savedState.calculateChangeTimerActive) {
        localStorage.setItem('calculateChangeTimerActive', savedState.calculateChangeTimerActive);
    }
    if (savedState.calculateChangeLastRun) {
        localStorage.setItem('calculateChangeLastRun', savedState.calculateChangeLastRun);
    }

    totals = savedState.totals || { ...initialValues };
    initialValues = savedState.initialValues || { ...initialValues };
    deltas = savedState.deltas || { ...deltas };
    changes = savedState.changes || { ...changes };

    document.getElementById('expiryDate').value = savedState.expiryDate || '';
    calculateChangeTimerActive = savedState.calculateChangeTimerActive || false;
}

window.addEventListener('beforeunload', () => {
    if (worker) worker.postMessage('stop');
    saveState();
});
