// worker.js
let fetchInterval;
let isPaused = false;

self.onmessage = function(e) {
    if (e.data === 'start' && !isPaused) {
        clearInterval(fetchInterval);
        fetchInterval = setInterval(() => {
            self.postMessage('fetch');
        }, 5000);
    } else if (e.data === 'stop') {
        clearInterval(fetchInterval);
    } else if (e.data === 'pause') {
        isPaused = true;
        clearInterval(fetchInterval);
    } else if (e.data === 'resume') {
        isPaused = false;
        self.postMessage('start');
    }
};
