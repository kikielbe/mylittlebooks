// ============================================
// MY LITTLE BOOKS — Timer Web Worker
// Berjalan di background thread browser
// Tidak terpengaruh oleh tab yang diminimize
// ============================================

let _interval = null;
let _state    = {
  running:   false,
  remaining: 25 * 60,
  total:     25 * 60,
  phase:     'work',   // work | short | long
};

self.onmessage = function(e) {
  const { cmd, data } = e.data;

  switch(cmd) {
    case 'start':
      if (data) Object.assign(_state, data);
      _state.running = true;
      _startTick();
      break;

    case 'pause':
      _state.running = false;
      clearInterval(_interval);
      _interval = null;
      self.postMessage({ type: 'paused', state: _state });
      break;

    case 'reset':
      clearInterval(_interval);
      _interval     = null;
      _state.running   = false;
      _state.remaining = data?.total || 25 * 60;
      _state.total     = _state.remaining;
      _state.phase     = data?.phase || 'work';
      self.postMessage({ type: 'reset', state: _state });
      break;

    case 'get_state':
      self.postMessage({ type: 'state', state: _state });
      break;

    case 'set_phase':
      clearInterval(_interval);
      _interval = null;
      _state.running   = false;
      _state.phase     = data.phase;
      _state.remaining = data.remaining;
      _state.total     = data.remaining;
      self.postMessage({ type: 'phase_set', state: _state });
      break;
  }
};

function _startTick() {
  if (_interval) clearInterval(_interval);
  _interval = setInterval(() => {
    if (!_state.running) return;

    _state.remaining--;
    self.postMessage({ type: 'tick', state: { ..._state } });

    if (_state.remaining <= 0) {
      clearInterval(_interval);
      _interval      = null;
      _state.running = false;
      self.postMessage({ type: 'complete', state: { ..._state } });
    }
  }, 1000);
}
