import { listen } from '@tauri-apps/api/event';

const HISTORY = 60;

class RingBuffer {
  constructor() { this.buf = new Array(HISTORY).fill(0); }
  push(v) { this.buf.push(v); this.buf.shift(); }
}

const cpuBuf       = new RingBuffer();
const memBuf       = new RingBuffer();
const downBuf      = new RingBuffer();
const upBuf        = new RingBuffer();
const diskReadBuf  = new RingBuffer();
const diskWriteBuf = new RingBuffer();
const loadBuf      = new RingBuffer();

function rgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function drawSpark(canvas, buf, color, fixedMax = null) {
  const ctx  = canvas.getContext('2d');
  const w    = canvas.width;
  const h    = canvas.height;
  const data = buf.buf;

  ctx.clearRect(0, 0, w, h);

  const max = fixedMax ?? Math.max(...data, 1);
  if (max === 0) return;

  const step = w / (HISTORY - 1);
  const pts  = data.map((v, i) => [i * step, h - (v / max) * h * 0.85]);

  // filled area
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = rgba(color, 0.15);
  ctx.fill();

  // line
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.5;
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';
  ctx.stroke();
}

function cpuColor(pct) {
  if (pct >= 80) return '#f7768e';
  if (pct >= 50) return '#e0af68';
  return '#7aa2f7';
}

function fmtBytes(bytes) {
  if (bytes < 1024)       return `${bytes} B/s`;
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB/s`;
  return                         `${(bytes / 1048576).toFixed(1)} MB/s`;
}

function fmtGb(bytes) {
  return (bytes / 1073741824).toFixed(1);
}

export async function initStatusBar() {
  const cpuEl        = document.getElementById('stat-cpu');
  const memEl        = document.getElementById('stat-mem');
  const downEl       = document.getElementById('stat-net-down');
  const upEl         = document.getElementById('stat-net-up');
  const diskReadEl   = document.getElementById('stat-disk-read');
  const diskWriteEl  = document.getElementById('stat-disk-write');
  const loadEl       = document.getElementById('stat-load');

  const cpuCanvas       = document.getElementById('spark-cpu');
  const memCanvas       = document.getElementById('spark-mem');
  const downCanvas      = document.getElementById('spark-net-down');
  const upCanvas        = document.getElementById('spark-net-up');
  const diskReadCanvas  = document.getElementById('spark-disk-read');
  const diskWriteCanvas = document.getElementById('spark-disk-write');
  const loadCanvas      = document.getElementById('spark-load');

  await listen('system-stats', ({ payload: s }) => {
    const memPct = (s.mem_used / s.mem_total) * 100;
    const color  = cpuColor(s.cpu);

    cpuBuf.push(s.cpu);
    memBuf.push(memPct);
    downBuf.push(s.net_down);
    upBuf.push(s.net_up);
    diskReadBuf.push(s.disk_read);
    diskWriteBuf.push(s.disk_write);
    loadBuf.push(s.load_avg_1);

    cpuEl.textContent       = `${s.cpu.toFixed(1)}%`;
    cpuEl.style.color       = color;
    memEl.textContent       = `${fmtGb(s.mem_used)} / ${fmtGb(s.mem_total)} GB`;
    downEl.textContent      = fmtBytes(s.net_down);
    upEl.textContent        = fmtBytes(s.net_up);
    diskReadEl.textContent  = fmtBytes(s.disk_read);
    diskWriteEl.textContent = fmtBytes(s.disk_write);
    loadEl.textContent      = `${s.load_avg_1.toFixed(2)} · ${s.load_avg_5.toFixed(2)} · ${s.load_avg_15.toFixed(2)}`;

    drawSpark(cpuCanvas,       cpuBuf,       color,     100);
    drawSpark(memCanvas,       memBuf,       '#bb9af7', 100);
    drawSpark(downCanvas,      downBuf,      '#7aa2f7', null);
    drawSpark(upCanvas,        upBuf,        '#9ece6a', null);
    drawSpark(diskReadCanvas,  diskReadBuf,  '#e0af68', null);
    drawSpark(diskWriteCanvas, diskWriteBuf, '#f7768e', null);
    drawSpark(loadCanvas,      loadBuf,      '#7dcfff', null);
  });
}
