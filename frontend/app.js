// Local use: leave API_BASE empty. Netlify: set it in config.js to the Render URL.
const API = `${window.SMOKEWATCH_API_BASE || ''}/api/v1`;
const state = { hours: 24, page: 1, totalPages: 1, chart: null };
const labels = { on: 'เปิด', off: 'ปิด', auto: 'อัตโนมัติ', abnormal: 'ผิดปกติ', connected: 'เชื่อมต่ออยู่', disconnected: 'ขาดการเชื่อมต่อ' };
const $ = id => document.getElementById(id);
const number = value => value === null || value === undefined ? '—' : Number(value).toFixed(1);
const thaiDate = value => new Intl.DateTimeFormat('th-TH', { day:'2-digit', month:'short', year:'numeric' }).format(new Date(value));
const thaiTime = value => new Intl.DateTimeFormat('th-TH', { hour:'2-digit', minute:'2-digit', second:'2-digit' }).format(new Date(value));
const statusText = value => labels[value] || value || '—';

function smokeLevel(value) { return value >= 75 ? ['อันตราย', 'danger'] : value >= 50 ? ['เฝ้าระวัง', 'warning'] : ['ปกติ', 'normal']; }
function updateClock() { $('clock').textContent = new Intl.DateTimeFormat('th-TH', { hour:'2-digit', minute:'2-digit', second:'2-digit' }).format(new Date()); }
function updateConnection(latest) {
  const connected = latest?.connection_status === 'connected';
  $('connection-label').textContent = connected ? 'เชื่อมต่ออยู่' : 'ขาดการเชื่อมต่อ';
  $('connection-pill').classList.toggle('disconnected', !connected);
  $('system-status').textContent = connected ? 'พร้อมใช้งาน' : 'ขาดการเชื่อมต่อ';
  $('system-status').style.color = connected ? '#1d916c' : '#c74b55';
  $('system-status-detail').textContent = latest ? `ข้อมูลล่าสุด ${thaiTime(latest.timestamp)} น.` : 'ยังไม่มีข้อมูลจากเครื่อง';
}
function updateEquipment(prefix, value, timestamp) {
  const dot = $(`${prefix}-dot`); const display = statusText(value);
  $(`${prefix}-status`).textContent = display;
  $(`${prefix}-updated`).textContent = timestamp ? `เปลี่ยนสถานะล่าสุด ${thaiTime(timestamp)} น.` : 'รอข้อมูล';
  dot.className = `status-dot ${value === 'off' ? 'off' : value === 'abnormal' ? 'alerting' : ''}`;
}
function updateEnvironmentalSensors(latest) {
  $('temperature-value').textContent = number(latest?.temperature_c);
  $('humidity-value').textContent = number(latest?.humidity_percent);
  const detected = latest?.flame_detected === 1 || latest?.flame_detected === true;
  $('flame-status').textContent = latest ? (detected ? 'ตรวจพบเปลวไฟ' : 'ไม่พบเปลวไฟ') : '—';
  const channels = Array.isArray(latest?.flame_channels) ? latest.flame_channels : [];
  const activeChannels = channels.map((active, index) => active ? `D${index + 1}` : null).filter(Boolean);
  $('flame-detail').textContent = latest ? (detected ? `ตรวจพบที่ ${activeChannels.join(', ') || 'Sensor'}` : 'ทุกช่องอยู่ในสถานะปกติ') : 'รอข้อมูล';
  $('flame-dot').className = `status-dot ${detected ? 'alerting' : 'off'}`;
}
function drawChart(history) {
  const labels = history.map(row => new Intl.DateTimeFormat('th-TH', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }).format(new Date(row.timestamp)));
  const values = history.map(row => row.smoke_value);
  if (state.chart) state.chart.destroy();
  state.chart = new Chart($('smoke-chart'), { type: 'line', data: { labels, datasets: [{ label:'ค่าควัน', data:values, borderColor:'#3d73ed', backgroundColor:'rgba(61,115,237,.10)', fill:true, tension:.35, pointRadius: values.length > 90 ? 0 : 2, pointHoverRadius:5, borderWidth:2.5 }] }, options: { maintainAspectRatio:false, interaction:{intersect:false,mode:'index'}, plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label: context => ` ${context.parsed.y.toFixed(1)} หน่วย` } } }, scales:{ x:{ grid:{display:false}, ticks:{color:'#77859a',maxTicksLimit:7} }, y:{ beginAtZero:true, suggestedMax:100, ticks:{color:'#77859a', callback:value=>`${value}`}, grid:{color:'#edf1f5'} } } } });
}
async function loadDashboard() {
  const response = await fetch(`${API}/dashboard?hours=${state.hours}`); if (!response.ok) throw new Error('ไม่สามารถโหลด Dashboard ได้');
  const data = await response.json(); const { device, latest, summary, history } = data;
  $('device-name').textContent = device.name; $('device-details').textContent = `${device.organization} • ${device.location}`; $('device-id').textContent = device.id;
  $('last-seen').textContent = latest ? `ข้อมูลล่าสุด ${thaiDate(latest.timestamp)} เวลา ${thaiTime(latest.timestamp)} น.` : 'ยังไม่มีข้อมูล';
  $('current-value').textContent = number(latest?.smoke_value); $('max-value').textContent = number(summary.max); $('min-value').textContent = number(summary.min); $('average-value').textContent = number(summary.average);
  const [level] = smokeLevel(latest?.smoke_value ?? 0); $('smoke-level').textContent = level; updateConnection(latest); updateEquipment('pump', latest?.pump_status, latest?.timestamp); updateEquipment('alarm', latest?.alarm_status, latest?.timestamp);
  updateEnvironmentalSensors(latest);
  const danger = latest && latest.smoke_value >= 75; $('alert').classList.toggle('hidden', !danger); if (danger) { $('alert-title').textContent = 'ตรวจพบค่าควันสูง'; $('alert-message').textContent = `${latest.alarm_status !== 'off' ? 'สัญญาณเตือนภัยกำลังทำงาน' : 'ระบบกำลังตรวจสอบสถานการณ์'}${latest.pump_status !== 'off' ? ' • ปั๊มน้ำกำลังทำงาน' : ''}`; }
  drawChart(history);
}
async function loadTable() {
  const response = await fetch(`${API}/readings?page=${state.page}&page_size=10`); if (!response.ok) throw new Error('ไม่สามารถโหลดตารางได้'); const data = await response.json(); state.totalPages = data.totalPages;
  $('row-count').textContent = `${data.total.toLocaleString()} รายการ`; $('page-info').textContent = `หน้า ${data.page} จาก ${data.totalPages}`; $('previous-page').disabled = data.page === 1; $('next-page').disabled = data.page >= data.totalPages;
  $('readings-body').innerHTML = data.items.map(row => `<tr><td>${thaiDate(row.timestamp)}</td><td>${thaiTime(row.timestamp)}</td><td class="value">${number(row.smoke_value)} หน่วย</td><td><span class="table-status ${row.connection_status}">${statusText(row.connection_status)}</span></td><td>ปั๊ม: <span class="table-status ${row.pump_status}">${statusText(row.pump_status)}</span> &nbsp; แจ้งเตือน: <span class="table-status ${row.alarm_status}">${statusText(row.alarm_status)}</span></td></tr>`).join('') || '<tr><td colspan="5" class="loading">ไม่พบข้อมูล</td></tr>';
}
async function refresh() { try { await Promise.all([loadDashboard(), loadTable()]); } catch (error) { console.error(error); } }
document.querySelectorAll('[data-hours]').forEach(button => button.addEventListener('click', () => { state.hours = Number(button.dataset.hours); state.page = 1; document.querySelectorAll('[data-hours]').forEach(item => item.classList.toggle('active', item === button)); refresh(); }));
$('previous-page').addEventListener('click', () => { if (state.page > 1) { state.page--; loadTable(); } }); $('next-page').addEventListener('click', () => { if (state.page < state.totalPages) { state.page++; loadTable(); } });
updateClock(); setInterval(updateClock, 1000); refresh(); setInterval(refresh, 5000);
