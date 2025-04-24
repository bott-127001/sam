//money making mahchine (source code)
document.addEventListener('DOMContentLoaded', () => {
    // Restore input fields
    accessTokenInput.value = localStorage.getItem('accessToken') || '';
    authCodeInput.value = localStorage.getItem('authCode') || '';
    loadState(); 

    // Restore Live Refresh state - SIMPLIFIED VERSION
    isLiveRefreshActive = localStorage.getItem('liveRefreshActive') === 'true';
    if (isLiveRefreshActive) {
        liveRefreshBtn.textContent = 'Stop Refresh';
        worker.postMessage('start');
        
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
const resetBtn = document.getElementById('resetBtn');

let worker;
let isLiveRefreshActive = localStorage.getItem('liveRefreshActive') === 'true';
const CHANGE_INTERVAL = 900000; // 15 minutes in milliseconds
let lastChangeCalculation = localStorage.getItem('lastChangeCalculation') || 0;

// Initialize data structures with default values
const defaultValues = {
    CallVolume: 0, CallOI: 0, CallAskQty: 0, CallBidQty: 0, CallIV: 0, CallDelta: 0,
    PutVolume: 0, PutOI: 0, PutAskQty: 0, PutBidQty: 0, PutIV: 0, PutDelta: 0,
    price: 0
};

// Use a single object to store all data states
let dataState = {
    initialValues: { ...defaultValues },
    totals: { ...defaultValues },
    deltas: {
        CallVolume: 0, CallOI: 0, PutVolume: 0, PutOI: 0, 
        CallDelta: 0, PutDelta: 0, CallIV: 0, PutIV: 0
    },
    changes: {
        CallVolume: 0, CallOI: 0, PutVolume: 0, PutOI: 0, 
        CallDelta: 0, PutDelta: 0, CallIV: 0, PutIV: 0
    },
    difference: { ...defaultValues },
    deltaReferenceValues: {
        CallVolume: 0, CallOI: 0, PutVolume: 0, PutOI: 0, 
        CallDelta: 0, PutDelta: 0, CallIV: 0, PutIV: 0, timestamp: 0
    }
};

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

getDataBtn.addEventListener('click', fetchData);
liveRefreshBtn.addEventListener('click', toggleLiveRefresh);
loginBtn.addEventListener('click', startAuthentication);
sendAuthCodeBtn.addEventListener('click', submitAuthCode);
resetBtn.addEventListener('click', resetAll);
document.getElementById('downloadSnapshotBtn').addEventListener('click', downloadTableSnapshot);

function downloadTableSnapshot() {
    // Show loading indicator
    const btn = document.getElementById('downloadSnapshotBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Downloading...';
    btn.disabled = true;

    // Import html2canvas dynamically
    const script = document.createElement('script');
    script.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
    script.onload = function() {
        // Get the table element
        const table = document.querySelector('#optionChainData');
        
        // Store original styles
        const originalStyles = {
            width: table.style.width,
            maxWidth: table.style.maxWidth,
            overflow: table.style.overflow
        };

        // Apply temporary styles for capture
        table.style.width = 'auto';
        table.style.maxWidth = 'none';
        table.style.overflow = 'visible';

        // Capture the table with adjusted options
        html2canvas(table, {
            backgroundColor: '#ffffff',
            scale: 2,
            width: table.scrollWidth, // Capture full width
            height: table.scrollHeight, // Capture full height
            windowWidth: table.scrollWidth, // Consider full width for rendering
            logging: false,
            useCORS: true,
            allowTaint: true
        }).then(canvas => {
            // Convert canvas to image and trigger download
            const image = canvas.toDataURL('image/png', 1.0);
            const link = document.createElement('a');
            const timestamp = new Date().toLocaleString().replace(/[/:]/g, '-');
            link.download = `option-chain-${timestamp}.png`;
            link.href = image;
            link.click();

            // Restore original styles
            table.style.width = originalStyles.width;
            table.style.maxWidth = originalStyles.maxWidth;
            table.style.overflow = originalStyles.overflow;

            // Reset button state
            btn.textContent = originalText;
            btn.disabled = false;
        }).catch(error => {
            console.error('Error generating image:', error);
            alert('Error generating image. Please try again.');
            
            // Restore original styles
            table.style.width = originalStyles.width;
            table.style.maxWidth = originalStyles.maxWidth;
            table.style.overflow = originalStyles.overflow;

            btn.textContent = originalText;
            btn.disabled = false;
        });
    };
    script.onerror = function() {
        alert('Failed to load required library. Please check your internet connection.');
        btn.textContent = originalText;
        btn.disabled = false;
    };
    document.head.appendChild(script);
}

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
            console.log("5 sec fetch");
        } else {
            throw new Error('Invalid data format received');
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        alert('Fetch error: ' + error.message);
    }
}

function resetAll() {
    // Stop live refresh if active
    if (isLiveRefreshActive) {
        worker.postMessage('stop');
        liveRefreshBtn.textContent = 'Live Refresh';
        isLiveRefreshActive = false;
    }

    // Clear all localStorage
    localStorage.clear();

    // Reset all data state
    dataState = {
        initialValues: { ...defaultValues },
        totals: { ...defaultValues },
        deltas: {
            CallVolume: 0, CallOI: 0, PutVolume: 0, PutOI: 0, 
            CallDelta: 0, PutDelta: 0, CallIV: 0, PutIV: 0
        },
        changes: {
            CallVolume: 0, CallOI: 0, PutVolume: 0, PutOI: 0, 
            CallDelta: 0, PutDelta: 0, CallIV: 0, PutIV: 0
        },
        difference: { ...defaultValues },
        deltaReferenceValues: {
            CallVolume: 0, CallOI: 0, PutVolume: 0, PutOI: 0, 
            CallDelta: 0, PutDelta: 0, CallIV: 0, PutIV: 0, timestamp: 0
        }
    };
    lastChangeCalculation = 0;

    // Clear HTML elements
    optionChainTableBody.innerHTML = '';
    accessTokenInput.value = '';
    authCodeInput.value = '';
    expiryDateInput.value = '';

    // Update UI state
    liveRefreshBtn.textContent = 'Live Refresh';
} 

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

function calculateChange() {
    const now = Date.now();
    
    // Only proceed if 15 minutes have passed since last calculation
    if (now - lastChangeCalculation < CHANGE_INTERVAL) {
        return;
    }

    // For first run or after reset
    if (dataState.deltaReferenceValues.timestamp === 0) {
        dataState.deltaReferenceValues = {
            ...dataState.deltas,
            timestamp: now
        };
    } else {
        // Calculate changes since last reference point
        dataState.changes = {
            CallVolume: dataState.deltas.CallVolume - dataState.deltaReferenceValues.CallVolume,
            CallOI: dataState.deltas.CallOI - dataState.deltaReferenceValues.CallOI,
            PutVolume: dataState.deltas.PutVolume - dataState.deltaReferenceValues.PutVolume,
            PutOI: dataState.deltas.PutOI - dataState.deltaReferenceValues.PutOI,
            CallDelta: dataState.deltas.CallDelta - dataState.deltaReferenceValues.CallDelta,
            PutDelta: dataState.deltas.PutDelta - dataState.deltaReferenceValues.PutDelta,
            CallIV: dataState.deltas.CallIV - dataState.deltaReferenceValues.CallIV,
            PutIV: dataState.deltas.PutIV - dataState.deltaReferenceValues.PutIV
        };
    }

    dataState.deltaReferenceValues = {
         ...dataState.deltas,
         timestamp: Date.now()
    }
    
    // Update last calculation time
    lastChangeCalculation = now;
    localStorage.setItem('lastChangeCalculation', lastChangeCalculation);
    console.log("zhala be!!");
    saveState();
}

function updateOptionChainData(optionChain, underlyingSpotPrice) {
    const currentExpiryDate = document.getElementById('expiryDate').value;
    
    // Clear the table body
    optionChainTableBody.innerHTML = '';
    
    // Load saved state
    loadState();
    document.getElementById('expiryDate').value = currentExpiryDate;
    
    // Reset totals
    dataState.totals = { ...defaultValues };

    // Create a document fragment for better performance
    const fragment = document.createDocumentFragment();
    
    // Process all option chain data in a single pass
    optionChain.forEach(item => {
        const strikePrice = item.strike_price;
        const isATM = strikePrice === underlyingSpotPrice;
        const isOTMCall = strikePrice > underlyingSpotPrice;
        const isOTMPut = strikePrice < underlyingSpotPrice;
        
        // Process call options
        if (isATM || isOTMCall) {
            const callData = item.call_options.market_data;
            const callGreeks = item.call_options.option_greeks;
            
            dataState.totals.CallVolume += callData.volume;
            dataState.totals.CallOI += callData.oi;
            dataState.totals.CallAskQty += callData.ask_qty;
            dataState.totals.CallBidQty += callData.bid_qty;
            dataState.totals.CallDelta += callGreeks.delta;
            dataState.totals.CallIV += callGreeks.iv;
        }

        // Process put options
        if (isATM || isOTMPut) {
            const putData = item.put_options.market_data;
            const putGreeks = item.put_options.option_greeks;
            
            dataState.totals.PutVolume += putData.volume;
            dataState.totals.PutOI += putData.oi;
            dataState.totals.PutAskQty += putData.ask_qty;
            dataState.totals.PutBidQty += putData.bid_qty;
            dataState.totals.PutDelta += putGreeks.delta;
            dataState.totals.PutIV += putGreeks.iv;
        }

        // Create row for the table
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
        fragment.appendChild(row);
    });

    // Append all rows at once
    optionChainTableBody.appendChild(fragment);

    // Set initial values if not already set
    if (!dataState.initialValues.CallVolume) {
        dataState.initialValues = { ...dataState.totals };
        saveState();
    }

    // Calculate differences
    dataState.difference = {
        CallVolume: dataState.totals.CallVolume - dataState.initialValues.CallVolume,
        CallOI: dataState.totals.CallOI - dataState.initialValues.CallOI, 
        CallAskQty: dataState.totals.CallAskQty - dataState.initialValues.CallAskQty,
        CallBidQty: dataState.totals.CallBidQty - dataState.initialValues.CallBidQty,
        CallIV: dataState.totals.CallIV - dataState.initialValues.CallIV,
        CallDelta: dataState.totals.CallDelta - dataState.initialValues.CallDelta,
        PutVolume: dataState.totals.PutVolume - dataState.initialValues.PutVolume,
        PutOI: dataState.totals.PutOI - dataState.initialValues.PutOI,
        PutAskQty: dataState.totals.PutAskQty - dataState.initialValues.PutAskQty,
        PutBidQty: dataState.totals.PutBidQty - dataState.initialValues.PutBidQty,
        PutIV: dataState.totals.PutIV - dataState.initialValues.PutIV,
        PutDelta: dataState.totals.PutDelta - dataState.initialValues.PutDelta  
    };

    // Calculate deltas (percentage changes)
    dataState.deltas = {
        CallVolume: (dataState.difference.CallVolume) / dataState.totals.CallVolume * 100,
        CallOI: (dataState.difference.CallOI) / dataState.totals.CallOI * 100,
        CallDelta: (dataState.difference.CallDelta) / dataState.totals.CallDelta * 100,
        CallIV: (dataState.difference.CallIV) / dataState.totals.CallIV * 100,
        PutVolume: (dataState.difference.PutVolume) / dataState.totals.PutVolume * 100,
        PutOI: (dataState.difference.PutOI) / dataState.totals.PutOI * 100,
        PutDelta: (dataState.difference.PutDelta) / dataState.totals.PutDelta * 100,
        PutIV: (dataState.difference.PutIV) / dataState.totals.PutIV * 100
    };

    // Calculate changes
    calculateChange();

    // Create summary rows
    const summaryFragment = document.createDocumentFragment();
    
    // Total row
    const totalRow = document.createElement('tr');
    totalRow.innerHTML = `
        <td>${dataState.totals.CallVolume}</td>
        <td>${dataState.totals.CallOI}</td>
        <td>${dataState.totals.CallIV.toFixed(2)}</td>
        <td>${dataState.totals.CallDelta.toFixed(2)}</td>
        <td></td>
        <td>${dataState.totals.CallBidQty}</td>
        <td></td>
        <td></td>
        <td>${dataState.totals.CallAskQty}</td>
        <td></td>
        <td>${dataState.totals.PutAskQty}</td>
        <td></td>
        <td></td>
        <td>${dataState.totals.PutBidQty}</td>
        <td></td>
        <td>${dataState.totals.PutDelta.toFixed(2)}</td>
        <td>${dataState.totals.PutIV.toFixed(2)}</td>
        <td>${dataState.totals.PutOI}</td>
        <td>${dataState.totals.PutVolume}</td>
    `;
    summaryFragment.appendChild(totalRow);

    // Difference row
    const diffRow = document.createElement('tr');
    diffRow.innerHTML = `
        <td>${dataState.difference?.CallVolume ?? 0}</td>
        <td>${dataState.difference?.CallOI ?? 0}</td>
        <td>${(dataState.difference?.CallIV ?? 0).toFixed(4)}</td>
        <td>${(dataState.difference?.CallDelta ?? 0).toFixed(4)}</td>
        <td></td>
        <td>${dataState.difference?.CallBidQty ?? 0}</td>
        <td></td>
        <td></td>
        <td>${dataState.difference?.CallAskQty ?? 0}</td>
        <td></td>
        <td>${dataState.difference?.PutAskQty ?? 0}</td>
        <td></td>
        <td></td>
        <td>${dataState.difference?.PutBidQty ?? 0}</td>
        <td></td>
        <td>${(dataState.difference?.PutDelta ?? 0).toFixed(4)}</td>
        <td>${(dataState.difference?.PutIV ?? 0).toFixed(4)}</td>
        <td>${dataState.difference?.PutOI ?? 0}</td>
        <td>${dataState.difference?.PutVolume ?? 0}</td>
    `;
    summaryFragment.appendChild(diffRow);

    // Delta row
    const deltaRow = document.createElement('tr');
    deltaRow.innerHTML = `
        <td>${dataState.deltas.CallVolume.toFixed(3)}, ${dataState.changes.CallVolume?.toFixed(3) || '0.000'}</td>
        <td>${dataState.deltas.CallOI.toFixed(3)}, ${dataState.changes.CallOI?.toFixed(3) || '0.000'}</td>
        <td>${dataState.deltas.CallIV.toFixed(3)}, ${dataState.changes.CallIV?.toFixed(3) || '0.000'}</td>
        <td>${dataState.deltas.CallDelta.toFixed(3)}, ${dataState.changes.CallDelta?.toFixed(3) || '0.000'}</td>
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
        <td>${dataState.deltas.PutDelta.toFixed(3)}, ${dataState.changes.PutDelta?.toFixed(3) || '0.000'}</td>
        <td>${dataState.deltas.PutIV.toFixed(3)}, ${dataState.changes.PutIV?.toFixed(3) || '0.000'}</td>
        <td>${dataState.deltas.PutOI.toFixed(3)}, ${dataState.changes.PutOI?.toFixed(3) || '0.000'}</td>
        <td>${dataState.deltas.PutVolume.toFixed(3)}, ${dataState.changes.PutVolume?.toFixed(3) || '0.000'}</td>
    `;
    summaryFragment.appendChild(deltaRow);

    // Append all summary rows at once
    optionChainTableBody.appendChild(summaryFragment);

    // Save state
    saveState();
}

function saveState() {
    const state = {
        ...dataState,
        expiryDate: document.getElementById('expiryDate').value,
        lastChangeCalculation: lastChangeCalculation
    };

    localStorage.setItem('optionChainState', JSON.stringify(state));
}

function loadState() {
    const savedState = JSON.parse(localStorage.getItem('optionChainState')) || {};

    // Load all data state properties
    if (savedState.totals) dataState.totals = savedState.totals;
    if (savedState.initialValues) dataState.initialValues = savedState.initialValues;
    if (savedState.deltas) dataState.deltas = savedState.deltas;
    if (savedState.changes) dataState.changes = savedState.changes;
    if (savedState.difference) dataState.difference = savedState.difference;
    if (savedState.deltaReferenceValues) dataState.deltaReferenceValues = savedState.deltaReferenceValues;

    // Load last change calculation time
    lastChangeCalculation = savedState.lastChangeCalculation || 0;
    
    // Load expiry date
    if (savedState.expiryDate) {
        document.getElementById('expiryDate').value = savedState.expiryDate;
    }
}

window.addEventListener('beforeunload', () => {
    if (worker) worker.postMessage('stop');
    saveState();
});
