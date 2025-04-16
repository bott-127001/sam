// Optimized DOM elements cache
const elements = {
    getDataBtn: document.getElementById('getDataBtn'),
    liveRefreshBtn: document.getElementById('liveRefreshBtn'),
    loginBtn: document.getElementById('loginBtn'),
    accessTokenInput: document.getElementById('accessToken'),
    authCodeInput: document.getElementById('authCode'),
    sendAuthCodeBtn: document.getElementById('sendAuthCodeBtn'),
    optionChainTableBody: document.getElementById('optionChainTableBody'),
    expiryDateInput: document.getElementById('expiryDate'),
    resetBtn: document.getElementById('resetBtn')
};

// State initialization
const state = {
    isLiveRefreshActive: localStorage.getItem('liveRefreshActive') === 'true',
    CHANGE_INTERVAL: 900000, // 15 minutes
    lastChangeCalculation: parseInt(localStorage.getItem('lastChangeCalculation')) || 0,
    worker: window.Worker ? new Worker('worker.js') : null,
    
    // Data structures
    initialValues: { CallVolume: 0, CallOI: 0, CallAskQty: 0, CallBidQty: 0, CallIV: 0, CallDelta: 0,
                   PutVolume: 0, PutOI: 0, PutAskQty: 0, PutBidQty: 0, PutIV: 0, PutDelta: 0, price: 0 },
    deltas: { CallVolume: 0, CallOI: 0, PutVolume: 0, PutOI: 0, CallDelta: 0, PutDelta: 0, CallIV: 0, PutIV: 0 },
    changes: { CallVolume: 0, CallOI: 0, PutVolume: 0, PutOI: 0, CallDelta: 0, PutDelta: 0, CallIV: 0, PutIV: 0 },
    totals: { CallVolume: 0, CallOI: 0, CallAskQty: 0, CallBidQty: 0, CallIV: 0, CallDelta: 0,
             PutVolume: 0, PutOI: 0, PutAskQty: 0, PutBidQty: 0, PutIV: 0, PutDelta: 0 },
    difference: { CallVolume: 0, CallOI: 0, CallAskQty: 0, CallBidQty: 0, CallIV: 0, CallDelta: 0,
                 PutVolume: 0, PutOI: 0, PutAskQty: 0, PutBidQty: 0, PutIV: 0, PutDelta: 0 },
    deltaReferenceValues: { CallVolume: 0, CallOI: 0, PutVolume: 0, PutOI: 0, CallDelta: 0, 
                          PutDelta: 0, CallIV: 0, PutIV: 0, timestamp: 0 }
};

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', init);

function init() {
    const now = new Date();
    const resetTime = new Date();
    resetTime.setHours(18, 0, 0, 0);

    if (now > resetTime) {
        const lastReset = localStorage.getItem('lastDailyReset');
        if (!lastReset || new Date(lastReset) < resetTime) {
            localStorage.clear();
            localStorage.setItem('lastDailyReset', resetTime.toISOString());
        }
    }

    // Restore inputs
    elements.accessTokenInput.value = localStorage.getItem('accessToken') || '';
    elements.authCodeInput.value = localStorage.getItem('authCode') || '';
    loadState();

    // Setup worker
    if (state.worker) {
        state.worker.onmessage = e => e.data === 'fetch' && fetchData();
        if (state.isLiveRefreshActive) {
            state.worker.postMessage('start');
            elements.liveRefreshBtn.textContent = 'Stop Refresh';
        }
    }

    // Event listeners
    elements.getDataBtn.addEventListener('click', fetchData);
    elements.liveRefreshBtn.addEventListener('click', toggleLiveRefresh);
    elements.loginBtn.addEventListener('click', startAuthentication);
    elements.sendAuthCodeBtn.addEventListener('click', submitAuthCode);
    elements.resetBtn.addEventListener('click', () => {
    if (confirm('This will reset ALL calculations and data. Proceed?')) {
        clearDashboard();
        // Optional: Show visual feedback
        showToast('Dashboard has been reset to initial state');
    }
    });
}

function showToast(message) {
    // Simple toast implementation
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.padding = '10px 20px';
    toast.style.background = '#4CAF50';
    toast.style.color = 'white';
    toast.style.borderRadius = '4px';
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}


// Core functions
function startAuthentication() {
    window.open('/login', '_blank');
}

async function submitAuthCode() {
    try {
        const response = await fetch('/generate-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ authCode: elements.authCodeInput.value })
        });
        const data = await response.json();
        elements.accessTokenInput.value = data.accessToken;
        localStorage.setItem('accessToken', data.accessToken);
        alert('Access Token generated successfully!');
    } catch (error) {
        console.error('Error generating access token:', error);
        alert('Error generating token: ' + error.message);
    }
}

async function fetchData() {
    const accessToken = localStorage.getItem('accessToken') || elements.accessTokenInput.value;
    const inputDate = elements.expiryDateInput.value;

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
    isLiveRefreshActive = !isLiveRefreshActive;
    localStorage.setItem('liveRefreshActive', isLiveRefreshActive);
    
    if (isLiveRefreshActive) {
        worker.postMessage('start');
        liveRefreshBtn.textContent = 'Stop Refresh';
    } else {
        worker.postMessage('stop');
        liveRefreshBtn.textContent = 'Live Refresh';
    }
}

function clearDashboard() {
    // 1. Clear ALL relevant localStorage data
    localStorage.clear();
    
    // 2. Reset ALL state variables
    initialValues = { 
        CallVolume: 0, CallOI: 0, CallAskQty: 0, CallBidQty: 0, CallIV: 0, CallDelta: 0,
        PutVolume: 0, PutOI: 0, PutAskQty: 0, PutBidQty: 0, PutIV: 0, PutDelta: 0,
        price: 0 
    };

    changes = deltas = totals = difference = {...initialValues};
    deltaReferenceValues = {...deltas, timestamp: 0};
    
    // 3. Reset UI
    elements.optionChainTableBody.innerHTML = '';
    elements.accessTokenInput.value =''; // Preserve token
    elements.authCodeInput.value = '';
    elements.expiryDateInput.value = '';
    
    // 4. Stop live refresh if active
    if (state.isLiveRefreshActive && state.worker) {
        state.worker.postMessage('stop');
        elements.liveRefreshBtn.textContent = 'Live Refresh';
        state.isLiveRefreshActive = false;
    }
    
    console.log('Dashboard fully cleared');
}

function calculateChange() {
    const now = Date.now();
    if (now - state.lastChangeCalculation < state.CHANGE_INTERVAL) return;

    if (state.deltaReferenceValues.timestamp === 0) {
        state.deltaReferenceValues = { ...state.deltas, timestamp: now };
    } else {
        state.changes = {
            CallVolume: state.deltas.CallVolume - state.deltaReferenceValues.CallVolume,
            CallOI: state.deltas.CallOI - state.deltaReferenceValues.CallOI,
            PutVolume: state.deltas.PutVolume - state.deltaReferenceValues.PutVolume,
            PutOI: state.deltas.PutOI - state.deltaReferenceValues.PutOI,
            CallDelta: state.deltas.CallDelta - state.deltaReferenceValues.CallDelta,
            PutDelta: state.deltas.PutDelta - state.deltaReferenceValues.PutDelta,
            CallIV: state.deltas.CallIV - state.deltaReferenceValues.CallIV,
            PutIV: state.deltas.PutIV - state.deltaReferenceValues.PutIV
        };
    }
    
    state.lastChangeCalculation = now;
    localStorage.setItem('lastChangeCalculation', state.lastChangeCalculation);
    saveState();
}

function updateOptionChainData(optionChain, underlyingSpotPrice) {
    const currentExpiryDate = elements.expiryDateInput.value;
    const fragment = document.createDocumentFragment();
    
    // Reset totals
    state.totals = Object.fromEntries(Object.keys(state.totals).map(k => [k, 0]));

    // Process data
    optionChain.forEach(item => {
        const { strike_price, call_options, put_options } = item;
        const isATM = strike_price === underlyingSpotPrice;
        const isOTMCall = strike_price > underlyingSpotPrice;
        const isOTMPut = strike_price < underlyingSpotPrice;

        if (isATM || isOTMCall) {
            state.totals.CallVolume += call_options.market_data.volume;
            state.totals.CallOI += call_options.market_data.oi;
            state.totals.CallAskQty += call_options.market_data.ask_qty;
            state.totals.CallBidQty += call_options.market_data.bid_qty;
            state.totals.CallDelta += call_options.option_greeks.delta;
            state.totals.CallIV += call_options.option_greeks.iv;
        }

        if (isATM || isOTMPut) {
            state.totals.PutVolume += put_options.market_data.volume;
            state.totals.PutOI += put_options.market_data.oi;
            state.totals.PutAskQty += put_options.market_data.ask_qty;
            state.totals.PutBidQty += put_options.market_data.bid_qty;
            state.totals.PutDelta += put_options.option_greeks.delta;
            state.totals.PutIV += put_options.option_greeks.iv;
        }

        const row = document.createElement('tr');
        row.innerHTML = generateRowHTML(item, strike_price);
        fragment.appendChild(row);
    });

    if (!state.initialValues.CallVolume) {
        state.initialValues = { ...state.totals };
    }

    calculateDifferences();
    calculateDeltas();
    calculateChange();

    // Append all rows at once
    elements.optionChainTableBody.innerHTML = '';
    elements.optionChainTableBody.appendChild(fragment);
    elements.optionChainTableBody.appendChild(createTotalRow());
    elements.optionChainTableBody.appendChild(createDiffRow());
    elements.optionChainTableBody.appendChild(createDeltaRow());
    elements.expiryDateInput.value = currentExpiryDate;
    
    saveState();
}

// Helper functions
function generateRowHTML(item, strikePrice) {
    const { call_options, put_options } = item;
    return `
        <td>${call_options.market_data.volume}</td>
        <td>${call_options.market_data.oi}</td>
        <td>${call_options.option_greeks.iv}</td>
        <td>${call_options.option_greeks.delta}</td>
        <td>${call_options.market_data.ltp}</td>
        <td>${call_options.market_data.bid_qty}</td>
        <td>${call_options.market_data.bid_price}</td>
        <td>${call_options.market_data.ask_price}</td>
        <td>${call_options.market_data.ask_qty}</td>
        <td>${strikePrice}</td>
        <td>${put_options.market_data.ask_qty}</td>
        <td>${put_options.market_data.ask_price}</td>
        <td>${put_options.market_data.bid_price}</td>
        <td>${put_options.market_data.bid_qty}</td>
        <td>${put_options.market_data.ltp}</td>
        <td>${put_options.option_greeks.delta}</td>
        <td>${put_options.option_greeks.iv}</td>
        <td>${put_options.market_data.oi}</td>
        <td>${put_options.market_data.volume}</td>
    `;
}

function createTotalRow() {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${state.totals.CallVolume}</td>
        <td>${state.totals.CallOI}</td>
        <td>${state.totals.CallIV.toFixed(2)}</td>
        <td>${state.totals.CallDelta.toFixed(2)}</td>
        <td></td>
        <td>${state.totals.CallBidQty}</td>
        <td></td>
        <td></td>
        <td>${state.totals.CallAskQty}</td>
        <td></td>
        <td>${state.totals.PutAskQty}</td>
        <td></td>
        <td></td>
        <td>${state.totals.PutBidQty}</td>
        <td></td>
        <td>${state.totals.PutDelta.toFixed(2)}</td>
        <td>${state.totals.PutIV.toFixed(2)}</td>
        <td>${state.totals.PutOI}</td>
        <td>${state.totals.PutVolume}</td>
    `;
    return row;
}

function createDiffRow() {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${state.difference.CallVolume}</td>
        <td>${state.difference.CallOI}</td>
        <td>${state.difference.CallIV.toFixed(4)}</td>
        <td>${state.difference.CallDelta.toFixed(4)}</td>
        <td></td>
        <td>${state.difference.CallBidQty}</td>
        <td></td>
        <td></td>
        <td>${state.difference.CallAskQty}</td>
        <td></td>
        <td>${state.difference.PutAskQty}</td>
        <td></td>
        <td></td>
        <td>${state.difference.PutBidQty}</td>
        <td></td>
        <td>${state.difference.PutDelta.toFixed(4)}</td>
        <td>${state.difference.PutIV.toFixed(4)}</td>
        <td>${state.difference.PutOI}</td>
        <td>${state.difference.PutVolume}</td>
    `;
    return row;
}

function createDeltaRow() {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${state.deltas.CallVolume.toFixed(3)}, ${state.changes.CallVolume?.toFixed(3) || '0.000'}</td>
        <td>${state.deltas.CallOI.toFixed(3)}, ${state.changes.CallOI?.toFixed(3) || '0.000'}</td>
        <td>${state.deltas.CallIV.toFixed(3)}, ${state.changes.CallIV?.toFixed(3) || '0.000'}</td>
        <td>${state.deltas.CallDelta.toFixed(3)}, ${state.changes.CallDelta?.toFixed(3) || '0.000'}</td>
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
        <td>${state.deltas.PutDelta.toFixed(3)}, ${state.changes.PutDelta?.toFixed(3) || '0.000'}</td>
        <td>${state.deltas.PutIV.toFixed(3)}, ${state.changes.PutIV?.toFixed(3) || '0.000'}</td>
        <td>${state.deltas.PutOI.toFixed(3)}, ${state.changes.PutOI?.toFixed(3) || '0.000'}</td>
        <td>${state.deltas.PutVolume.toFixed(3)}, ${state.changes.PutVolume?.toFixed(3) || '0.000'}</td>
    `;
    return row;
}

function calculateDifferences() {
    state.difference = {
        CallVolume: state.totals.CallVolume - state.initialValues.CallVolume,
        CallOI: state.totals.CallOI - state.initialValues.CallOI,
        CallAskQty: state.totals.CallAskQty - state.initialValues.CallAskQty,
        CallBidQty: state.totals.CallBidQty - state.initialValues.CallBidQty,
        CallIV: state.totals.CallIV - state.initialValues.CallIV,
        CallDelta: state.totals.CallDelta - state.initialValues.CallDelta,
        PutVolume: state.totals.PutVolume - state.initialValues.PutVolume,
        PutOI: state.totals.PutOI - state.initialValues.PutOI,
        PutAskQty: state.totals.PutAskQty - state.initialValues.PutAskQty,
        PutBidQty: state.totals.PutBidQty - state.initialValues.PutBidQty,
        PutIV: state.totals.PutIV - state.initialValues.PutIV,
        PutDelta: state.totals.PutDelta - state.initialValues.PutDelta
    };
}

function calculateDeltas() {
    state.deltas = {
        CallVolume: (state.difference.CallVolume) / state.totals.CallVolume * 100,
        CallOI: (state.difference.CallOI) / state.totals.CallOI * 100,
        CallDelta: (state.difference.CallDelta) / state.totals.CallDelta * 100,
        CallIV: (state.difference.CallIV) / state.totals.CallIV * 100,
        PutVolume: (state.difference.PutVolume) / state.totals.PutVolume * 100,
        PutOI: (state.difference.PutOI) / state.totals.PutOI * 100,
        PutDelta: (state.difference.PutDelta) / state.totals.PutDelta * 100,
        PutIV: (state.difference.PutIV) / state.totals.PutIV * 100
    };
}

function saveState() {
    const savedState = {
        totals: state.totals,
        initialValues: state.initialValues,
        deltas: state.deltas,
        changes: state.changes,
        difference: state.difference,
        deltaReferenceValues: state.deltaReferenceValues,
        expiryDate: elements.expiryDateInput.value,
        lastChangeCalculation: state.lastChangeCalculation
    };
    localStorage.setItem('optionChainState', JSON.stringify(savedState));
}

function loadState() {
    const savedState = JSON.parse(localStorage.getItem('optionChainState')) || {};
    
    state.totals = savedState.totals || { ...state.initialValues };
    state.initialValues = savedState.initialValues || { ...state.initialValues };
    state.deltas = savedState.deltas || { ...state.deltas };
    state.changes = savedState.changes || { ...state.changes };
    state.difference = savedState.difference || { ...state.difference };
    state.deltaReferenceValues = savedState.deltaReferenceValues || { ...state.deltaReferenceValues };
    state.lastChangeCalculation = savedState.lastChangeCalculation || 0;
    
    elements.expiryDateInput.value = savedState.expiryDate || '';
}

// Cleanup on exit
window.addEventListener('beforeunload', () => {
    if (state.worker) state.worker.postMessage('stop');
    saveState();
});
