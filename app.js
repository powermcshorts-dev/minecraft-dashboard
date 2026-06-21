document.addEventListener('DOMContentLoaded', () => {
    // Auto-detect if page is hosted statically (e.g., local file or GitHub Pages)
    const isLocalFile = window.location.protocol === 'file:';
    const isGitHubPages = window.location.hostname.includes('github.io');
    const useStaticFiles = isLocalFile || isGitHubPages;

    // Master Dashboard Configuration
    const DASHBOARD_CONFIG = {
        ranked_enabled: false, // Set to false to hide all Ranked/ELO stats across the site
        unified_api_url: useStaticFiles ? "./data.json" : "/api/data",
        teams_api_url: useStaticFiles ? "./teams.json" : "/api/teams"
    };

    // State Management
    let players = [];
    let serverHealth = { tps: 20, mspt: 0, players_online: 0, players_max: 0 };
    let playerHistory = [];
    let selectedPlayer = null;
    let currentSort = 'rating';
    let currentTab = 'players';
    let rankedOnly = false;
    let teams = [];
    let tpsOdo = null;
    let msptOdo = null;
    let avgTpsOdo = null;
    let avgMsptOdo = null;
    let playersOdo = null;
    let playersMaxOdo = null;
    let uptimeHoursOdo = null;
    let uptimeMinutesOdo = null;
    let uptimeSecondsOdo = null;
    let currentUptime = 0;
    let netOdo = null;
    const statCache = {}; // { uuid_statKey: lastValue } for odometer prev->new animation
    let eloMap = {};      // { uuid: calculatedElo } — updated by recalculateAllElos()
    let liveLogs = [];    // Global storage for events to support search/filtering


    // DOM Elements
    const playerGrid = document.getElementById('player-grid');
    const searchInput = document.getElementById('player-search');
    const sortBySelect = document.getElementById('sort-by');
    const detailsPanel = document.getElementById('details-panel');
    const closePanelBtn = document.getElementById('close-details');
    const onlineCountLabel = document.getElementById('online-count');
    const refreshBtn = document.getElementById('btn-refresh');
    
    // View Sections
    const playersSection = document.getElementById('players-section');
    const healthSection = document.getElementById('health-section');
    const faqSection = document.getElementById('faq-section');
    const teamsSection = document.getElementById('teams-section');
    const eventsSection = document.getElementById('events-section');
    
    // Health UI
    const hTPS = document.getElementById('h-tps');
    const hMSPT = document.getElementById('h-mspt');
    const hAvgTPS = document.getElementById('h-avg-tps');
    const hAvgMSPT = document.getElementById('h-avg-mspt');

    const navPlayers = document.getElementById('nav-players');
    const navLeaderboards = document.getElementById('nav-leaderboards');
    const navHealth = document.getElementById('nav-health');
    const navFaq = document.getElementById('nav-faq');
    const navTeams = document.getElementById('nav-teams');
    const navEvents = document.getElementById('nav-events');
    const btnFilterRanked = document.getElementById('btn-filter-ranked');

    // Hide Ranked UI if disabled (only the filter pill, keep the tab)
    if (!DASHBOARD_CONFIG.ranked_enabled) {
        if (btnFilterRanked) btnFilterRanked.style.display = 'none';
    }


    /**
     * Data Sync
     */
    async function updateAllData() {
        try {
            let data;
            let teamsData = [];
            try {
                const res = await fetch(DASHBOARD_CONFIG.unified_api_url);
                data = await res.json();
                
                try {
                    const teamsRes = await fetch(DASHBOARD_CONFIG.teams_api_url);
                    teamsData = await teamsRes.json();
                } catch (te) {
                    console.error("Error fetching teams:", te);
                }
            } catch (fetchErr) {
                console.warn("Using mock fallback data for local testing:", fetchErr);
                data = {
                    server: { tps: 19.95, mspt: 12.4, players_online: 2, players_max: 20, uptime: 72400 },
                    players: {
                        "kutto-uuid": {
                            uuid: "kutto-uuid", username: "Kutto", online: true,
                            kills: 42, deaths: 18, total_mined: 15400, playtime: 432000,
                            rating_ovr: 78, rating_kil: 79, rating_dth: 75, rating_dmd: 81, rating_dmt: 77,
                            history: []
                        },
                        "silver-uuid": {
                            uuid: "silver-uuid", username: "Grian", online: false,
                            kills: 15, deaths: 12, total_mined: 89000, playtime: 250000,
                            rating_ovr: 68, rating_kil: 67, rating_dth: 70, rating_dmd: 65, rating_dmt: 70,
                            history: []
                        },
                        "bronze-uuid": {
                            uuid: "bronze-uuid", username: "Steve", online: false,
                            kills: 2, deaths: 25, total_mined: 1200, playtime: 36000,
                            rating_ovr: 52, rating_kil: 48, rating_dth: 55, rating_dmd: 50, rating_dmt: 55,
                            history: []
                        }
                    },
                    live_logs: [
                        { type: "KILL", user: "Kutto", details: "Kutto killed Grian", time: Math.floor(Date.now()/1000) - 1800 }
                    ]
                };
                teamsData = [
                    {
                        name: "Vanquishers", badge: "🏆", created_at: Math.floor(Date.now()/1000) - 86400 * 5,
                        member_count: 1, total_elo: 78, total_kills: 42, total_deaths: 18, total_mined: 15400, total_mob_kills: 1700,
                        members: [
                            { mc_name: "Kutto", elo: 78, kills: 42, deaths: 18, mined: 15400, mob_kills: 1700, discord_id: "456", joined_at: Math.floor(Date.now()/1000) - 86400 * 4 }
                        ]
                    }
                ];
            }

            if (data.server) {
                serverHealth = data.server;
                if (data.server.uptime !== undefined) {
                    currentUptime = data.server.uptime;
                    updateUptimeDisplay(currentUptime);
                }
            }
            if (data.players) {
                players = Object.values(data.players);
                players.forEach(p => {
                    p.ranked = p.rsmp_rank || 0;
                });
            }
            if (data.history) playerHistory = data.history;
            if (data.live_logs) {
                liveLogs = data.live_logs;
                const newLogs = liveLogs.filter(l => l.time > lastSeenLogTime).reverse();
                newLogs.forEach(log => {
                    showToast(log);
                    lastSeenLogTime = Math.max(lastSeenLogTime, log.time);
                });
            }
            
            teams = teamsData;

            renderAll();
            updateGlobalCompetitionSummary();
            return;
        } catch (e) {
            console.error("Dashboard API Sync Error:", e);
        } finally {
            renderAll();
        }
    }

    let lastSeenLogTime = Math.floor(Date.now() / 1000);

    function updateGlobalCompetitionSummary() {
        const elPlayers = document.getElementById('global-players');
        const elOnlineCount = document.getElementById('global-online-count');
        const elTopRating = document.getElementById('global-top-rating');
        const elTopName = document.getElementById('global-top-name');
        const elTotalKills = document.getElementById('global-total-kills');

        if (elPlayers) elPlayers.textContent = players.length;
        if (elOnlineCount) elOnlineCount.textContent = `${players.filter(p => p.online).length} online`;

        const sorted = [...players].sort((a, b) => (b.rating_ovr || 0) - (a.rating_ovr || 0));
        const topPlayer = sorted[0];
        if (elTopRating) elTopRating.textContent = topPlayer ? (topPlayer.rating_ovr || 50) : 50;
        if (elTopName) elTopName.textContent = topPlayer ? topPlayer.username : '---';

        const totalKills = players.reduce((sum, p) => sum + (p.kills || 0), 0);
        if (elTotalKills) elTotalKills.textContent = totalKills.toLocaleString();
    }

    function showToast(log) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const typeLower = (log.type || '').toLowerCase();
        const isKill = typeLower === 'kill';
        const isDeath = typeLower === 'death';
        
        let toastClass = 'info';
        let iconClass = 'fa-circle-info';
        if (isKill) { toastClass = 'gain'; iconClass = 'fa-skull'; }
        else if (isDeath) { toastClass = 'loss'; iconClass = 'fa-ghost'; }

        const toast = document.createElement('div');
        toast.className = `toast ${toastClass}`;
        
        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fa-solid ${iconClass}"></i>
            </div>
            <div class="toast-content">
                <div class="toast-title">
                    ${log.user || 'System'}
                </div>
                <div class="toast-msg">${log.details || ''}</div>
            </div>
        `;

        container.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 600);
        }, 5000);
    }




    function renderAll() {
        if (currentTab === 'players') renderPlayersGrid();
        else if (currentTab === 'leaderboard') renderLeaderboard();
        else if (currentTab === 'faq') renderFaq();
        else if (currentTab === 'events') renderEvents();
        
        renderHealthStatus();
        if (currentTab === 'health') renderQuadGraphs();

        if (selectedPlayer) {
            const updated = players.find(p => p.uuid === selectedPlayer.uuid);
            if (updated) updateDetailPanel(updated);
        }
    }

    /**
     * Rendering logic
     */
    function renderHealthStatus() {
        const tps = serverHealth.tps || 20;
        const mspt = serverHealth.mspt || 0;
        const netIn = serverHealth.net_in || 0;
        const netOut = serverHealth.net_out || 0;
        const netTotal = netIn + netOut;

        // Update sidebar status card dynamically
        const sidebarStatusText = document.querySelector('.server-status-card .status-text');
        const sidebarStatusDot = document.querySelector('.server-status-card .status-indicator');
        if (sidebarStatusText && sidebarStatusDot) {
            const isServerOnline = serverHealth.status === 'online';
            sidebarStatusText.textContent = isServerOnline ? 'Online' : 'Offline';
            sidebarStatusText.style.color = isServerOnline ? 'var(--online)' : 'var(--offline)';
            sidebarStatusDot.className = `status-indicator ${isServerOnline ? 'online' : 'offline'}`;
        }

        const sidebarServerName = document.querySelector('.server-status-card .server-name');
        const sidebarServerAddress = document.getElementById('server-address');
        if (sidebarServerName && serverHealth.server_name) {
            sidebarServerName.textContent = serverHealth.server_name;
        }
        if (sidebarServerAddress && serverHealth.server_address) {
            sidebarServerAddress.textContent = serverHealth.server_address;
        }

        const tpsEl = document.getElementById('h-tps');
        const msptEl = document.getElementById('h-mspt');
        const hAvgTPS = document.getElementById('h-avg-tps');
        const hAvgMSPT = document.getElementById('h-avg-mspt');

        // Calculate 24h Summary Data
        const history = playerHistory || [];
        const recentHistory = history.slice(-288); // Approx 24h

        const avgTpsVal = recentHistory.length > 0 ? recentHistory.reduce((sum, h) => sum + (h.t || 20), 0) / recentHistory.length : tps;
        const avgMsptVal = recentHistory.length > 0 ? recentHistory.reduce((sum, h) => sum + (h.m || 0), 0) / recentHistory.length : mspt;

        const peakTpsVal = recentHistory.length > 0 ? Math.max(...recentHistory.map(h => h.t || 0)) : tps;
        const lowTpsVal = recentHistory.length > 0 ? Math.min(...recentHistory.map(h => h.t || 20)) : tps;
        const peakMsptVal = recentHistory.length > 0 ? Math.max(...recentHistory.map(h => h.m || 0)) : mspt;
        const lowMsptVal = recentHistory.length > 0 ? Math.min(...recentHistory.map(h => h.m || 0)) : mspt;
        const peakPlayersVal = recentHistory.length > 0 ? Math.max(...recentHistory.map(h => h.p || 0)) : players.filter(p => p.online).length;
        const peakNetVal = recentHistory.length > 0 ? Math.max(...recentHistory.map(h => (h.ni || 0) + (h.no || 0))) : netTotal;

        const onlineCount = serverHealth.players_online || 0;
        const maxCount = serverHealth.players_max || 0;
        const playersOnlineEl = document.getElementById('h-players-online');
        const playersMaxEl = document.getElementById('h-players-max');

        // 1. Update Odometer Cards (Real-time & Averages)
        if (typeof Odometer !== 'undefined') {
            if (!tpsOdo && tpsEl) tpsOdo = new Odometer({ el: tpsEl, value: tps, format: 'd', theme: 'minimal', duration: 800 });
            if (!msptOdo && msptEl) msptOdo = new Odometer({ el: msptEl, value: mspt, format: 'd', theme: 'minimal', duration: 800 });
            if (!avgTpsOdo && hAvgTPS) avgTpsOdo = new Odometer({ el: hAvgTPS, value: avgTpsVal, format: 'd', theme: 'minimal', duration: 800 });
            if (!avgMsptOdo && hAvgMSPT) avgMsptOdo = new Odometer({ el: hAvgMSPT, value: avgMsptVal, format: 'd', theme: 'minimal', duration: 800 });
            if (!playersOdo && playersOnlineEl) playersOdo = new Odometer({ el: playersOnlineEl, value: onlineCount, format: 'd', theme: 'minimal', duration: 800 });
            if (!playersMaxOdo && playersMaxEl) playersMaxOdo = new Odometer({ el: playersMaxEl, value: maxCount, format: 'd', theme: 'minimal', duration: 800 });

            if (tpsOdo) tpsOdo.update(Math.round(tps));
            if (msptOdo) msptOdo.update(Math.round(mspt));
            if (avgTpsOdo) avgTpsOdo.update(Math.round(avgTpsVal));
            if (avgMsptOdo) avgMsptOdo.update(Math.round(avgMsptVal));
            if (playersOdo) playersOdo.update(onlineCount);
            if (playersMaxOdo) playersMaxOdo.update(maxCount);
        } else {
            if (tpsEl) tpsEl.textContent = tps.toFixed(1);
            if (msptEl) msptEl.textContent = Math.round(mspt);
            if (hAvgTPS) hAvgTPS.textContent = avgTpsVal.toFixed(1);
            if (hAvgMSPT) hAvgMSPT.textContent = Math.round(avgMsptVal);
            if (playersOnlineEl) playersOnlineEl.textContent = onlineCount;
            if (playersMaxEl) playersMaxEl.textContent = maxCount;
        }

        // Trigger live uptime rendering
        updateUptimeDisplay(currentUptime);

        // 2. Update Summary Grid (Peaks/Lows)
        const elPeakTps = document.getElementById('peak-tps');
        const elLowTps = document.getElementById('low-tps');
        const elPeakMspt = document.getElementById('peak-mspt');
        const elLowMspt = document.getElementById('low-mspt');
        const elPeakPlayers = document.getElementById('peak-players');
        const elPeakNet = document.getElementById('peak-net');

        if (elPeakTps) elPeakTps.textContent = peakTpsVal.toFixed(2);
        if (elLowTps) elLowTps.textContent = lowTpsVal.toFixed(2);
        if (elPeakMspt) elPeakMspt.textContent = peakMsptVal.toFixed(1);
        if (elLowMspt) elLowMspt.textContent = lowMsptVal.toFixed(1);
        if (elPeakPlayers) elPeakPlayers.textContent = peakPlayersVal;
        if (elPeakNet) elPeakNet.textContent = peakNetVal.toFixed(1);

        // Update System Status Labels
        const elPerf = document.getElementById('status-perf');
        const elStatusTps = document.getElementById('status-tps');
        const elStatusNet = document.getElementById('status-net');
        const elStatusCap = document.getElementById('status-capacity');

        if (elPerf) {
            if (tps > 19.5 && mspt < 25) { elPerf.textContent = 'Excellent'; elPerf.className = 'status-value status-excellent'; }
            else if (tps > 18.0) { elPerf.textContent = 'Good'; elPerf.className = 'status-value status-stable'; }
            else { elPerf.textContent = 'Degraded'; elPerf.className = 'status-value status-critical'; }
        }

        if (elStatusTps) {
            const tpsVar = peakTpsVal - lowTpsVal;
            if (tpsVar < 0.2) { elStatusTps.textContent = 'Stable'; elStatusTps.className = 'status-value status-stable'; }
            else if (tpsVar < 1.0) { elStatusTps.textContent = 'Fluctuating'; elStatusTps.className = 'status-value status-moderate'; }
            else { elStatusTps.textContent = 'Unstable'; elStatusTps.className = 'status-value status-critical'; }
        }

        if (elStatusNet) {
            if (netTotal < 10) { elStatusNet.textContent = 'Stable'; elStatusNet.className = 'status-value status-stable'; }
            else if (netTotal < 50) { elStatusNet.textContent = 'Elevated'; elStatusNet.className = 'status-value status-elevated'; }
            else { elStatusNet.textContent = 'Critical'; elStatusNet.className = 'status-value status-critical'; }
        }

        if (elStatusCap) {
            const cap = players.filter(p => p.online).length / Math.max(1, serverHealth.players_max);
            if (cap < 0.5) { elStatusCap.textContent = 'Low Load'; elStatusCap.className = 'status-value status-excellent'; }
            else if (cap < 0.9) { elStatusCap.textContent = 'Moderate'; elStatusCap.className = 'status-value status-moderate'; }
            else { elStatusCap.textContent = 'Full'; elStatusCap.className = 'status-value status-critical'; }
        }
    }

    function updateUptimeDisplay(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const hEl = document.getElementById('h-uptime-hours');
        const mEl = document.getElementById('h-uptime-minutes');
        const sEl = document.getElementById('h-uptime-seconds');

        if (!hEl || !mEl || !sEl) return;

        if (typeof Odometer !== 'undefined') {
            if (!uptimeHoursOdo) uptimeHoursOdo = new Odometer({ el: hEl, value: 0, theme: 'minimal', duration: 400 });
            if (!uptimeMinutesOdo) uptimeMinutesOdo = new Odometer({ el: mEl, value: 0, theme: 'minimal', duration: 400 });
            if (!uptimeSecondsOdo) uptimeSecondsOdo = new Odometer({ el: sEl, value: 0, theme: 'minimal', duration: 400 });

            uptimeHoursOdo.update(hours);
            uptimeMinutesOdo.update(minutes);
            uptimeSecondsOdo.update(seconds);
        } else {
            hEl.textContent = hours;
            mEl.textContent = minutes;
            sEl.textContent = seconds;
        }
    }

    function renderQuadGraphs() {
        if (!playerHistory || playerHistory.length < 2) return;
        renderSingleChart('graph-players', 'p', 'var(--player-color)', 'line-players');
        renderSingleChart('graph-tps', 't', 'var(--tps-color)', 'line-tps');
        renderSingleChart('graph-mspt', 'm', 'var(--mspt-color)', 'line-mspt');
        renderSingleChart('graph-net', 'ni', '#3b82f6', 'line-net');
    }

    function renderSingleChart(svgId, key, color, lineClass) {
        const svg = document.getElementById(svgId);
        if (!svg) return;
        
        const w = svg.clientWidth;
        const h = 160;
        const marginL = 35, marginB = 35, marginT = 15, marginR = 15;
        const chartW = w - marginL - marginR;
        const chartH = h - marginB - marginT;

        const count = playerHistory.length;
        if (count < 2) {
            svg.innerHTML = ''; 
            return;
        }

        // Dynamic Scaling
        const values = playerHistory.map(d => {
            if (key === 'ni') return (d.ni || 0) + (d.no || 0);
            return d[key] || 0;
        });
        
        let minVal = Math.min(...values);
        let maxVal = Math.max(...values);
        
        // Add padding to scaling
        if (key === 't') { // TPS: focus on 15-20 usually
            maxVal = 20.1;
            minVal = Math.min(minVal, 19.0) - 0.2;
        } else {
            const padding = (maxVal - minVal) * 0.1 || 1;
            maxVal += padding;
            minVal = Math.max(0, minVal - padding);
        }

        const stepX = chartW / (count - 1);
        const getY = (val) => marginT + chartH - (((val - minVal) / Math.max(0.1, maxVal - minVal)) * chartH);
        
        let innerHTML = '';

        // Draw Horizontal Grid Lines & Y Axis Labels
        const gridCount = 4;
        for (let i = 0; i <= gridCount; i++) {
            const val = minVal + (maxVal - minVal) / gridCount * i;
            const y = getY(val);
            innerHTML += `
                <line x1="${marginL}" y1="${y}" x2="${w - marginR}" y2="${y}" class="grid-line"></line>
                <text x="${marginL - 8}" y="${y + 3}" class="axis-text axis-y">${val < 10 ? val.toFixed(1) : Math.round(val)}</text>
            `;
        }

        // Draw Data Path
        const points = playerHistory.map((d, i) => {
            const val = key === 'ni' ? (d.ni || 0) + (d.no || 0) : d[key];
            return `${marginL + i * stepX},${getY(val)}`;
        });
        innerHTML += `<path d="M ${points.join(' L ')}" class="graph-line ${lineClass}"></path>`;

        // Draw X Axis Time Labels (Sample points)
        const xSampleCount = 5;
        const xInterval = Math.max(1, Math.floor((count - 1) / (xSampleCount - 1)));
        for (let i = 0; i < xSampleCount; i++) {
            const idx = Math.min(i * xInterval, count - 1);
            const d = playerHistory[idx];
            if (!d) continue;
            
            const x = marginL + idx * stepX;
            const date = new Date(d.ts * 1000);
            const timeStr = date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
            
            innerHTML += `
                <text x="${x}" y="${h - 8}" class="axis-text axis-x" transform="rotate(-30, ${x}, ${h - 5})">${timeStr}</text>
            `;
            
            // Add a small tick
            innerHTML += `<line x1="${x}" y1="${marginT + chartH}" x2="${x}" y2="${marginT + chartH + 5}" class="grid-line" style="opacity:0.3"></line>`;
        }

        svg.innerHTML = innerHTML;
    }

    function setupChartTracking(wrapperId, graphId, tooltipId, key, label, unit) {
        const wrapper = document.getElementById(wrapperId);
        const tooltip = document.getElementById(tooltipId);
        if (!wrapper || !tooltip) return;
        wrapper.addEventListener('mousemove', (e) => {
            if (!playerHistory.length) return;
            const rect = wrapper.getBoundingClientRect();
            const x = e.clientX - rect.left;
            
            const marginL = 35, marginR = 15;
            const chartW = rect.width - marginL - marginR;
            const stepX = chartW / (playerHistory.length - 1);
            
            const chartX = x - marginL;
            const index = Math.min(Math.max(Math.round(chartX / stepX), 0), playerHistory.length - 1);
            
            const data = playerHistory[index];
            if (!data) return;
            
            tooltip.style.display = 'block';
            const pointX = marginL + index * stepX;
            tooltip.style.left = (pointX > rect.width - 120 ? pointX - 130 : pointX + 10) + 'px';
            tooltip.style.top = '10px';
            
            const date = new Date(data.ts * 1000);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            let val = data[key];
            if (key === 'ni') {
                val = ((data.ni || 0) + (data.no || 0)).toFixed(1);
            }
            
            tooltip.innerHTML = `<div style="font-size:9px; color:var(--text-muted); mb:4px">${timeStr}</div><div style="display:flex; justify-content:space-between"><span>${label}:</span> <strong style="color:var(--primary)">${val}${unit}</strong></div>`;
        });
        wrapper.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
    }

    setupChartTracking('wrapper-players', 'graph-players', 'tooltip-players', 'p', 'Players', '');
    setupChartTracking('wrapper-tps', 'graph-tps', 'tooltip-tps', 't', 'TPS', '');
    setupChartTracking('wrapper-mspt', 'graph-mspt', 'tooltip-mspt', 'm', 'MSPT', 'ms');
    setupChartTracking('wrapper-net', 'graph-net', 'tooltip-net', 'ni', 'Net In', ' Mbps');

    /**
     * Player Tab: Grid View
     */
    function getCardTier(ovr) {
        if (ovr >= 90) return 'special';
        if (ovr >= 75) return 'gold';
        if (ovr >= 65) return 'silver';
        return 'bronze';
    }

    function renderPlayerCardHtml(player) {
        const skinIdentity = player.skin || player.username || 'steve';
        const ovr = player.rating_ovr ?? 50;
        const tier = getCardTier(ovr);
        const kil = player.rating_kil ?? 50;
        const dth = player.rating_dth ?? 50;
        const dmd = player.rating_dmd ?? 50;
        const dmt = player.rating_dmt ?? 50;
        const offlineClass = !player.online ? 'offline-card' : '';
        
        return `
            <div class="fut-card ${tier} ${offlineClass}" onclick="showPlayerDetails('${player.uuid}')">
                <div class="card-inner">
                    <div class="card-top">
                        <div class="card-left">
                            <span class="card-ovr">${ovr}</span>
                            <span class="card-pos">PVP</span>
                        </div>
                        <div class="card-avatar">
                            <img src="https://mc-heads.net/avatar/${skinIdentity}/120" alt="${player.username}">
                        </div>
                    </div>
                    <div class="card-name">${player.username}</div>
                    <hr class="card-divider">
                    <div class="card-stats">
                        <div class="stat-col">
                            <div class="stat-item">
                                <span class="stat-num">${kil}</span>
                                <span class="stat-lbl">KIL</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-num">${dth}</span>
                                <span class="stat-lbl">DTH</span>
                            </div>
                        </div>
                        <div class="stat-col">
                            <div class="stat-item">
                                <span class="stat-num">${dmd}</span>
                                <span class="stat-lbl">DMD</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-num">${dmt}</span>
                                <span class="stat-lbl">DMT</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Player Tab: Grid View
     */
    function renderPlayersGrid() {
        const searchTerm = searchInput.value.toLowerCase();
        const filtered = getSortedPlayers().filter(p => p.username.toLowerCase().includes(searchTerm));
        if (filtered.length === 0) { playerGrid.innerHTML = '<div class="loading-state"><p>No data found.</p></div>'; return; }

        playerGrid.className = 'player-grid';
        playerGrid.innerHTML = filtered.map(player => renderPlayerCardHtml(player)).join('');
        onlineCountLabel.textContent = `${players.filter(p => p.online).length}/${players.length}`;
    }

    /**
     * Leaderboard Tab: Ranked List View
     */
    function renderLeaderboard() {
        const sorted = getSortedPlayers(true);
        if (sorted.length === 0) { playerGrid.innerHTML = '<div class="loading-state"><p>No competition data yet.</p></div>'; return; }

        // --- Calculate Global Competition Summary ---
        updateGlobalCompetitionSummary();
        // ---------------------------------------------

        let currentRank = 1;
        let previousVal = null;
        
        // 1. Calculate true ranks before filtering, so even lower players see exact global placement
        const rankedPlayers = sorted.map((player, index) => {
            const skinIdentity = player.skin || player.username;
            
            const elo = calculateElo(player);
            let displayVal = elo, displayLabel = 'OVR';
            if (currentSort === 'kills') { displayVal = player.kills || 0; displayLabel = 'Kills'; }
            else if (currentSort === 'playtime') { displayVal = Math.floor((player.playtime || 0) / 20 / 60 / 60) + 'h'; displayLabel = 'Playtime'; }
            else if (currentSort === 'mined') { displayVal = player.total_mined || 0; displayLabel = 'Mined'; }
            
            // Standard competition ranking (1, 2, 2, 4)
            if (previousVal !== displayVal) {
                currentRank = index + 1;
                previousVal = displayVal;
            }
            
            return { ...player, rank: currentRank, displayVal, displayLabel, elo, skinIdentity };
        });

        // 2. Filter by search logic and limit to top 100
        const searchTerm = searchInput.value.toLowerCase();
        const filtered = rankedPlayers.filter(p => p.username.toLowerCase().includes(searchTerm)).slice(0, 100);

        if (filtered.length === 0) { playerGrid.innerHTML = '<div class="loading-state"><p>No players found.</p></div>'; return; }

        let html = '<div class="leaderboard-list">';
        html += filtered.map((playerData) => {
            const eloRank = getRank(playerData.elo);
            
            // Calculate progress to next rank
            const min = eloRank.min || 0;
            const next = eloRank.next || 100;
            const range = next - min;
            const progress = range > 0 ? Math.min(100, Math.max(0, ((playerData.elo - min) / range) * 100)) : 100;

            const isOnline = playerData.online && serverHealth.status !== 'offline';

            return `
                <div class="leader-row rank-${playerData.rank}" onclick="showPlayerDetails('${playerData.uuid}')" style="border-color:${eloRank.color}33; border-left:3px solid ${eloRank.color}">
                    <div class="rank-number" style="color:${eloRank.color}">${playerData.rank}</div>
                    <div class="leader-avatar"><img src="https://mc-heads.net/avatar/${playerData.skinIdentity}/42" alt="${playerData.username}"></div>
                    <div class="leader-info">
                        <div class="leader-name-wrapper">
                            <span class="leader-name" title="${playerData.username}">${playerData.username}</span>
                            <span class="elo-rank-pill" style="color:${eloRank.color};border-color:${eloRank.color}44;background:${eloRank.color}11">${eloRank.icon} ${eloRank.name}</span>
                        </div>
                        <div class="l-stats-mini">
                            <span class="leader-status">${isOnline ? '● Active' : '○ Offline'}</span>
                            <span class="l-stat-item l-stat-strength"><i class="fa-solid fa-hand-fist"></i> ${playerData.kills || 0}</span>
                            <span class="l-stat-item"><i class="fa-solid fa-ghost"></i> ${playerData.deaths || 0}</span>
                            ${(playerData.global_rank || 0) > 0 && DASHBOARD_CONFIG.ranked_enabled ? `<span class="l-stat-item" style="color:#fbbf24; font-weight:700;"><i class="fa-solid fa-crown"></i> ${playerData.global_rank}</span>` : ''}
                        </div>
                    </div>
                    <div class="leader-metric">
                        <span class="m-val" style="color:${currentSort === 'rating' || currentSort === 'none' ? eloRank.color : 'var(--primary)'}">${playerData.displayVal}</span>
                        <span class="m-lab">${playerData.displayLabel}</span>
                        <div class="mini-rank-progress">
                            <div class="mini-rank-fill" style="width: ${progress}%; background: ${eloRank.color}; --primary-glow: ${eloRank.color}66;"></div>
                        </div>
                    </div>
                </div>`;
        }).join('');
        html += '</div>';
        
        // SWITCH TO LIST MODE
        playerGrid.className = 'leaderboard-mode';
        
        playerGrid.innerHTML = html;
        onlineCountLabel.textContent = `${players.filter(p => p.online).length}/${players.length}`;
    }

    function calculateElo(player) {
        return player.rating_ovr ?? 50;
    }

    function getRank(ovr) {
        if (ovr >= 90) return { name: 'Master', color: '#fbbf24', icon: '⭐', min: 90, next: 100 };
        if (ovr >= 75) return { name: 'Gold',   color: '#f59e0b', icon: '🥇', min: 75, next: 90 };
        if (ovr >= 65) return { name: 'Silver', color: '#d1d5db', icon: '🥈', min: 65, next: 75 };
        return                { name: 'Bronze', color: '#a87c53', icon: '🥉', min: 1,  next: 65 };
    }

    function getSortedPlayers(forLeaderboard = false) {
        let sorted = [...players];
        
        // If it's for the leaderboard, we ONLY care about ELO/chosen metric
        if (forLeaderboard) {
            if (currentSort === 'playtime') {
                return sorted.sort((a, b) => (b.playtime || 0) - (a.playtime || 0));
            } else if (currentSort === 'mined') {
                return sorted.sort((a, b) => (b.total_mined || 0) - (a.total_mined || 0));
            } else if (currentSort === 'kills') {
                return sorted.sort((a, b) => (b.kills || 0) - (a.kills || 0));
            } else {
                return sorted.sort((a, b) => calculateElo(b) - calculateElo(a));
            }
        }

        // For Player Grid, apply custom Rank logic if button is active
        if (currentSort === 'playtime') {
            sorted.sort((a, b) => (b.playtime || 0) - (a.playtime || 0));
        } else if (currentSort === 'mined') {
            sorted.sort((a, b) => (b.total_mined || 0) - (a.total_mined || 0));
        } else if (currentSort === 'kills') {
            sorted.sort((a, b) => (b.kills || 0) - (a.kills || 0));
        } else {
            sorted.sort((a, b) => {
                // ONLY prioritize Rank if button is active and we are in Grid
                if (rankedOnly) {
                    const rA = Number(a.ranked || 999);
                    const rB = Number(b.ranked || 999);
                    if (rA < 999 || rB < 999) return rA - rB;
                }
                return calculateElo(b) - calculateElo(a);
            });
        }

        if (rankedOnly) {
            sorted = sorted.filter(p => (p.ranked || 0) > 0);
        }

        return sorted;
    }

    /**
     * Detail Panel Logic
     */
    window.showPlayerDetails = (uuid) => {
        const player = players.find(p => p.uuid === uuid);
        if (!player) return;
        selectedPlayer = player;
        window.updateDetailPanel(player);
        detailsPanel.classList.add('open');
    };

    window.updateDetailPanel = (player) => {
        try {
            const ovr = player.rating_ovr ?? 50;
            const eloRank = getRank(ovr);
            
            // 1. Banner Color
            const banner = document.getElementById('profile-banner');
            if (banner) {
                banner.style.background = `linear-gradient(135deg, ${eloRank.color}33, rgba(0,0,0,0.8))`;
            }

            // 2. Render FUT Card inside profile container
            const cardContainer = document.getElementById('profile-card-container');
            if (cardContainer) {
                cardContainer.innerHTML = renderPlayerCardHtml(player);
            }

            // 3. General Stats
            const stats = player.stats || {};
            const container = document.getElementById('general-stats-container');
            
            if (container) {
                const kills = player.kills || 0, deaths = player.deaths || 0, mobs = player.mob_kills || 0;
                const mined = player.total_mined || 0, placed = player.total_placed || 0;
                const kd = (kills / Math.max(1, deaths)).toFixed(2);
                const playtime = Math.floor((player.playtime || 0) / 20 / 60 / 60) + 'h';
                const uuid = player.uuid;

                // 1. Initial Render if empty
                if (!container.innerHTML || container.innerHTML.includes('loading')) {
                    container.innerHTML = `
                        <div class="stat-card"><span class="stat-label">Playtime</span><span class="stat-value" id="stat-playtime">${playtime}</span></div>
                        <div class="stat-card"><span class="stat-label">Deaths</span><span class="stat-value odometer" id="stat-deaths">${deaths}</span></div>
                        <div class="stat-card"><span class="stat-label">Kills</span><span class="stat-value odometer" id="stat-kills">${kills}</span></div>
                        <div class="stat-card"><span class="stat-label">K/D</span><span class="stat-value" id="stat-kd">${kd}</span></div>
                        <div class="stat-card"><span class="stat-label">Mined</span><span class="stat-value odometer" id="stat-mined">${mined}</span></div>
                        <div class="stat-card"><span class="stat-label">Placed</span><span class="stat-value odometer" id="stat-placed">${placed}</span></div>
                        <div class="stat-card"><span class="stat-label">Mob Kills</span><span class="stat-value odometer" id="stat-mobs">${mobs}</span></div>`;
                }

                // 2. Update existing elements with Odometer
                const updateOdo = (id, val) => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    if (el.classList.contains('odometer') && typeof Odometer !== 'undefined') {
                        if (!el._odo) el._odo = new Odometer({ el: el, value: parseInt(el.textContent) || 0, theme: 'minimal' });
                        el._odo.update(parseInt(val));
                    } else {
                        el.textContent = val;
                    }
                };

                updateOdo('stat-playtime', playtime);
                updateOdo('stat-deaths', deaths);
                updateOdo('stat-kills', kills);
                updateOdo('stat-kd', kd);
                updateOdo('stat-mined', mined);
                updateOdo('stat-placed', placed);
                updateOdo('stat-mobs', mobs);

                let existingBtn = document.getElementById('btn-kill-logs');
                if (existingBtn) existingBtn.remove();
                let btn = document.createElement('button');
                btn.id = 'btn-kill-logs';
                btn.className = 'app-btn';
                btn.innerHTML = '<i class="fa-solid fa-scroll"></i> View Combat Logs';
                btn.onclick = () => openKillLogsModal(uuid);
                container.parentNode.appendChild(btn);
            }
            
            const miningGraph = document.getElementById('mining-graph');
            const combatGraph = document.getElementById('combat-graph');
            if (miningGraph) renderStatChart(miningGraph, stats['minecraft:mined'] || {}, 'bar-stone');
            if (combatGraph) renderStatChart(combatGraph, stats['minecraft:killed'] || {}, 'bar-emerald');
            
            if (container) animateCounters(container);
        } catch (err) {
            console.error("Critical error in updateDetailPanel:", err);
        }
    }

    function getBezierCurve(pts) {
        if (!pts || pts.length === 0) return "";
        if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
        let d = `M ${pts[0].x},${pts[0].y}`;
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i];
            const p1 = pts[i + 1];
            const cp1x = p0.x + (p1.x - p0.x) / 2;
            const cp2x = p0.x + (p1.x - p0.x) / 2;
            d += ` C ${cp1x},${p0.y} ${cp2x},${p1.y} ${p1.x},${p1.y}`;
        }
        return d;
    }

    function animateCounters(container) {
        container.querySelectorAll('.stat-value[data-count]').forEach(el => {
            const target = parseFloat(el.dataset.count);
            const key = el.dataset.statKey;
            if (isNaN(target) || typeof Odometer === 'undefined') return;
            const isDecimal = el.dataset.count.includes('.');

            // Get previous value from cache (first open = no animation, just show value)
            const prevVal = (key && statCache[key] !== undefined) ? statCache[key] : target;

            const odo = new Odometer({
                el: el,
                value: prevVal,
                format: isDecimal ? '(,ddd).dd' : '(,ddd)',
                theme: 'minimal',
                duration: 800
            });

            if (key) statCache[key] = target;
            odo.update(target);
        });
    }

    function renderStatChart(container, data, barClass) {
        if (!container) return;
        const sorted = Object.entries(data)
            .sort((a,b) => b[1] - a[1])
            .slice(0, 5); // Kept to top 5 for cleaner look
        
        if (sorted.length === 0) {
            container.innerHTML = '<div class="no-data">No recorded activity.</div>';
            return;
        }

        const max = Math.max(...sorted.map(s => s[1]), 1);
        container.innerHTML = sorted.map(([key, val]) => {
            const width = (val / max) * 100;
            const label = formatName(key);
            const ctxColor = getContextClass(key) || barClass;
            const icon = getContextIcon(key);
            return `
                <div class="graph-row">
                    <div class="graph-label" style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 15px;">${icon}</span>
                        <span>${label}</span>
                    </div>
                    <div class="bar-container">
                        <div class="bar-fill ${ctxColor}" style="width: ${width}%"></div>
                    </div>
                    <div class="graph-value">${val.toLocaleString()}</div>
                </div>`;
        }).join('');
    }

    function getContextIcon(key) {
        if (key.includes('diamond')) return '💎';
        if (key.includes('gold')) return '🟡';
        if (key.includes('iron')) return '⚙️';
        if (key.includes('coal')) return '⚫';
        if (key.includes('lapis')) return '🔵';
        if (key.includes('redstone')) return '🔴';
        if (key.includes('emerald')) return '💚';
        if (key.includes('stone') || key.includes('cobble')) return '🪨';
        if (key.includes('zombie')) return '🧟';
        if (key.includes('creeper')) return '🧨';
        if (key.includes('skeleton')) return '☠️';
        if (key.includes('player')) return '⚔️';
        return '📦';
    }

    function formatName(str) {
        return str.replace('minecraft:', '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }

    function getContextClass(key) {
        if (key.includes('diamond')) return 'bar-diamond';
        if (key.includes('gold')) return 'bar-gold';
        if (key.includes('iron')) return 'bar-iron';
        if (key.includes('coal')) return 'bar-coal';
        if (key.includes('lapis')) return 'bar-lapis';
        if (key.includes('redstone')) return 'bar-redstone';
        if (key.includes('copper')) return 'bar-copper';
        if (key.includes('wood') || key.includes('log')) return 'bar-wood';
        if (key.includes('emerald')) return 'bar-emerald';
        if (key.includes('stone') || key.includes('cobble')) return 'bar-stone';
        if (key.includes('zombie') || key.includes('skeleton') || key.includes('creeper') || key.includes('spider')) return 'bar-offline';
        return null;
    }

    function renderFaq() {} // FAQ is static HTML, no JS rendering needed



    function switchTab(tab) {
        currentTab = tab;
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        playersSection.style.display = 'none';
        healthSection.style.display = 'none';
        faqSection.style.display = 'none';
        eventsSection.style.display = 'none';
        if (teamsSection) teamsSection.style.display = 'none';

        if (tab === 'players') {
            navPlayers.classList.add('active'); 
            playersSection.style.display = 'block'; 
            playerGrid.className = 'player-grid'; 
        } else if (tab === 'leaderboard') {
            navLeaderboards.classList.add('active'); 
            playersSection.style.display = 'block'; 
        } else if (tab === 'health') {
            navHealth.classList.add('active'); 
            healthSection.style.display = 'block'; 
            setTimeout(renderQuadGraphs, 100);
        } else if (tab === 'faq') {
            navFaq.classList.add('active');
            faqSection.style.display = 'block';
        } else if (tab === 'teams') {
            if (navTeams) navTeams.classList.add('active');
            if (teamsSection) teamsSection.style.display = 'block';
            renderTeams();
        } else if (tab === 'events') {
            navEvents.classList.add('active');
            eventsSection.style.display = 'block';
        }
        renderAll();
    }

    navPlayers.addEventListener('click', () => switchTab('players'));
    navLeaderboards.addEventListener('click', () => switchTab('leaderboard'));
    navHealth.addEventListener('click', () => switchTab('health'));
    navFaq.addEventListener('click', () => switchTab('faq'));
    if (navTeams) navTeams.addEventListener('click', () => switchTab('teams'));
    navEvents.addEventListener('click', () => switchTab('events'));
    closePanelBtn.addEventListener('click', () => { detailsPanel.classList.remove('open'); selectedPlayer = null; });
    sortBySelect.addEventListener('change', (e) => { currentSort = e.target.value; renderAll(); });
    refreshBtn.addEventListener('click', updateAllData);

    if (btnFilterRanked) {
        btnFilterRanked.addEventListener('click', () => {
            rankedOnly = !rankedOnly;
            btnFilterRanked.classList.toggle('active', rankedOnly);
            renderAll();
        });
    }

    // Search: re-render instantly as you type
    searchInput.addEventListener('input', () => {
        if (currentTab === 'players') renderPlayersGrid();
        else if (currentTab === 'leaderboard') renderLeaderboard();
        else if (currentTab === 'events') renderEvents();
        else if (currentTab === 'teams') renderTeams();
    });

    // FAQ accordion: click question to toggle answer
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.faq-card');
        if (!card) return;
        const isOpen = card.classList.contains('faq-open');
        document.querySelectorAll('.faq-card.faq-open').forEach(c => c.classList.remove('faq-open'));
        if (!isOpen) card.classList.add('faq-open');
    });

    // Global functions for modal overlay
    window.openKillLogsModal = function(uuid) {
        const player = players.find(p => p.uuid === uuid);
        if (!player) return;
        
        const logs = player.history || player.elo_logs || [];
        const listContainer = document.getElementById('kill-logs-list');
        
        if (logs.length === 0) {
            listContainer.innerHTML = '<div class="kill-log-empty">No combat history recorded yet.</div>';
        } else {
            // Reverse logs so newest entries appear at the top
            const reversedLogs = [...logs].reverse();
            listContainer.innerHTML = reversedLogs.map(l => {
                const date = new Date(l.time * 1000);
                const timeStr = date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                
                const typeLower = (l.type || '').toLowerCase();
                const icon = typeLower === 'kill' ? '⚔️' : (typeLower === 'death' ? '💀' : '⏳');
                
                let badgeBg = 'rgba(255,255,255,0.1)';
                let badgeColor = 'var(--text-main)';
                if (typeLower === 'kill') { badgeBg = 'rgba(74, 222, 128, 0.15)'; badgeColor = '#4ade80'; }
                else if (typeLower === 'death') { badgeBg = 'rgba(239, 68, 68, 0.15)'; badgeColor = '#ef4444'; }
                else if (typeLower === 'whitelisted') { badgeBg = 'rgba(56, 189, 248, 0.15)'; badgeColor = '#38bdf8'; }

                return `
                <div class="kill-log-row">
                    <div class="kill-log-victim">
                        <span style="font-size:18px; margin-right:8px;">${icon}</span>
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-size:14px; font-weight:600;">${l.type}: ${l.details}</span>
                            <span style="font-size:11px; color:var(--text-muted);">${timeStr}</span>
                        </div>
                    </div>
                    <div style="color:${badgeColor}; font-weight:800; font-family:sans-serif; background:${badgeBg}; padding:4px 8px; border-radius:4px; font-size:11px;">
                        ${l.type.toUpperCase()}
                    </div>
                </div>`;
            }).join('');
        }
        document.getElementById('kill-logs-overlay').classList.add('active');
    };

    window.closeKillLogsModal = function() {
        document.getElementById('kill-logs-overlay').classList.remove('active');
    };

    window.copyServerAddress = function(e) {
        e.stopPropagation();
        const address = document.getElementById('server-address').textContent;
        navigator.clipboard.writeText(address).then(() => {
            // Show a brief toast
            const container = document.getElementById('toast-container');
            if (container) {
                const toast = document.createElement('div');
                toast.className = 'toast gain';
                toast.innerHTML = `
                    <div class="toast-icon"><i class="fa-solid fa-copy"></i></div>
                    <div class="toast-content">
                        <div class="toast-title">Copied!</div>
                        <div class="toast-msg">Server address copied.</div>
                    </div>
                `;
                container.appendChild(toast);
                setTimeout(() => {
                    toast.classList.add('fade-out');
                    setTimeout(() => toast.remove(), 600);
                }, 3000);
            }
        }).catch(err => {
            console.error('Failed to copy address:', err);
        });
    };

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const overlay = document.getElementById('kill-logs-overlay');
            if (overlay && overlay.classList.contains('active')) {
                window.closeKillLogsModal();
            }
        }
    });

    // Initialize tooltip dynamically if not exist
    if (!document.getElementById('elo-hover-tooltip')) {
        const eloHoverTooltip = document.createElement('div');
        eloHoverTooltip.id = 'elo-hover-tooltip';
        eloHoverTooltip.style.cssText = 'position:fixed; display:none; background:rgba(20,20,25,0.95); backdrop-filter:blur(6px); border:1px solid rgba(74, 222, 128, 0.4); color:#4ade80; padding:6px 12px; border-radius:6px; pointer-events:none; font-weight:bold; font-size:13px; font-family:monospace; z-index:99999; box-shadow:0 8px 16px rgba(74, 222, 128, 0.15); transition: opacity 0.1s;';
        document.body.appendChild(eloHoverTooltip);
        
        window.showEloTooltip = function(e, text) {
            const tooltip = document.getElementById('elo-hover-tooltip');
            tooltip.innerHTML = text;
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX + 15) + 'px';
            tooltip.style.top = (e.clientY - 15) + 'px';
        };
        window.hideEloTooltip = function() {
            const tooltip = document.getElementById('elo-hover-tooltip');
            if (tooltip) tooltip.style.display = 'none';
        };
        window.moveEloTooltip = function(e) {
            const tooltip = document.getElementById('elo-hover-tooltip');
            if (tooltip && tooltip.style.display === 'block') {
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY - 15) + 'px';
            }
        };
    }

    // Theme Switcher Logic
    const themeBtns = document.querySelectorAll('.theme-btn');
    const savedTheme = localStorage.getItem('quartz-theme') || 'abyss';
    
    function setTheme(theme) {
        document.body.className = theme === 'abyss' ? '' : `theme-${theme}`;
        themeBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
        localStorage.setItem('quartz-theme', theme);
        renderAll(); // Re-render to update graph colors
    }

    themeBtns.forEach(btn => {
        btn.addEventListener('click', () => setTheme(btn.dataset.theme));
    });

    setTheme(savedTheme);
    updateAllData();
    setInterval(updateAllData, 30000);

    // Client-side predictive live uptime ticker
    setInterval(() => {
        if (!serverHealth || serverHealth.status !== 'online') return;
        currentUptime++;
        updateUptimeDisplay(currentUptime);
    }, 1000);
    window.handleChartHover = function(e, crosshairId, text, svgX) {
        const crosshair = document.getElementById(crosshairId);
        if (crosshair) {
            const container = crosshair.parentElement;
            const rect = container.getBoundingClientRect();
            // Convert SVG 1000 coordinate back to pixel percentage
            const pct = (svgX / 1000) * 100;
            crosshair.style.left = `${pct}%`;
        }
        showEloTooltip(e, text);
    };

    window.hideChartHover = function(crosshairId) {
        hideEloTooltip();
    };

    /**
     * Renders the Live Events Tab with search filtering
     */
    function renderEvents() {
        const fullFeed = document.getElementById('events-feed-container');
        if (!fullFeed) return;

        const query = (searchInput.value || '').toLowerCase();
        
        // Sort players to determine rank context for each log
        const sortedP = [...players].sort((a, b) => (b.elo || 0) - (a.elo || 0));

        // Filter logs based on search query (username or details)
        const filteredLogs = liveLogs.filter(log => {
            if (!query) return true;
            return (log.user || '').toLowerCase().includes(query) || 
                   (log.details || '').toLowerCase().includes(query);
        });

        if (filteredLogs.length === 0) {
            fullFeed.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                    <i class="fa-solid fa-magnifying-glass" style="font-size: 2rem; margin-bottom: 15px; opacity: 0.3;"></i>
                    <p>No events found for "${searchInput.value}"</p>
                </div>
            `;
            return;
        }

        fullFeed.innerHTML = filteredLogs.map(log => {
            const timeStr = new Date(log.time * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
            let icon = '<i class="fa-solid fa-bolt"></i>';
            let cardClass = 'event-log-card';
            let valueStr = '';
            
            // Rank Tier Logic
            const pIdx = sortedP.findIndex(p => p.username === log.user);
            const playerRank = pIdx === -1 ? 0 : pIdx + 1;
            
            let tierClass = 'event-rank-regular';
            let tagClass = 'tag-regular';
            let tagText = playerRank > 0 ? '#' + playerRank : 'UNRANKED';

            if (playerRank > 0 && playerRank <= 10) { tierClass = 'event-rank-top10'; tagClass = 'tag-top10'; }
            else if (playerRank > 10 && playerRank <= 50) { tierClass = 'event-rank-top50'; tagClass = 'tag-top50'; }
            else if (playerRank > 50 && playerRank <= 100) { tierClass = 'event-rank-top100'; tagClass = 'tag-top100'; }
            else if (playerRank > 100 && playerRank <= 250) { tierClass = 'event-rank-top250'; tagClass = 'tag-top250'; }

            cardClass += ' ' + tierClass;

            let actionText = 'EVENT';
            let valueColor = 'var(--text-main)';
            
            if (log.type === 'KILL') {
                cardClass += ' event-card-gain';
                icon = '<i class="fa-solid fa-skull" style="color:#10b981;"></i>';
                actionText = 'COMBAT_KILL';
                valueColor = '#10b981';
                valueStr = 'KILL';
            } else if (log.type === 'DEATH') {
                cardClass += ' event-card-loss';
                icon = '<i class="fa-solid fa-ghost" style="color:#ef4444;"></i>';
                actionText = 'COMBAT_DEATH';
                valueColor = '#ef4444';
                valueStr = 'DEATH';
            } else if (log.type === 'WHITELISTED') {
                cardClass += ' event-card-whitelist';
                icon = '<i class="fa-solid fa-user-plus" style="color:#3b82f6;"></i>';
                actionText = 'WHITELIST_ADD';
                valueColor = '#3b82f6';
                valueStr = 'WHITELIST';
            } else if (log.type === 'UNWHITELISTED') {
                cardClass += ' event-card-whitelist';
                icon = '<i class="fa-solid fa-user-minus" style="color:#ef4444;"></i>';
                actionText = 'WHITELIST_REMOVE';
                valueColor = '#ef4444';
                valueStr = 'UNWHITELIST';
            } else {
                cardClass += ' event-card-regular';
                icon = '<i class="fa-solid fa-bolt"></i>';
                actionText = log.type || 'SYSTEM';
                valueColor = 'var(--text-muted)';
                valueStr = '';
            }
            
            return `
            <div class="console-log-line ${tierClass}">
                <span class="log-timestamp">[${timeStr}]</span>
                <span class="log-indicator" style="color:${valueColor}">●</span>
                <span class="log-user-tag">${log.user}</span>
                <span class="log-tag ${tagClass}">${tagText}</span>
                <span class="log-action">${actionText}</span>
                <span class="log-details">${log.details}</span>
                <span class="log-value" style="color:${valueColor}">${valueStr}</span>
            </div>`;
        }).join('');
    }

    let selectedTeam = null;

    function renderTeams() {
        const teamGrid = document.getElementById('team-grid');
        if (!teamGrid) return;

        if (!teams || teams.length === 0) {
            teamGrid.innerHTML = `
                <div class="team-no-data" style="grid-column: 1/-1;">
                    <i class="fa-solid fa-shield-halved" style="font-size: 3rem; opacity: 0.2; display: block; margin-bottom: 16px;"></i>
                    <p>No active teams have registered yet.</p>
                </div>
            `;
            updateTeamsSummary();
            return;
        }

        teamGrid.className = 'team-grid';
        teamGrid.innerHTML = teams.map(team => {
            const avatarsHtml = team.members.slice(0, 5).map(m => {
                const playerObj = players.find(p => p.username.toLowerCase() === m.mc_name.toLowerCase());
                const skin = playerObj?.skin || m.mc_name;
                return `<div class="team-avatar-mini" title="${m.mc_name}"><img src="https://mc-heads.net/avatar/${skin}/48" alt="${m.mc_name}"></div>`;
            }).join('');
            
            const overflow = team.member_count > 5 ? `<div class="team-avatar-overflow">+${team.member_count - 5}</div>` : '';

            return `
                <div class="team-card ${selectedTeam && selectedTeam.name === team.name ? 'active-card' : ''}" onclick="selectTeam('${team.name.replace(/'/g, "\\'")}')">
                    <span class="team-badge-large">${team.badge || '🛡️'}</span>
                    <div class="team-card-name">${team.name}</div>
                    <div class="team-card-member-count"><i class="fa-solid fa-users"></i> ${team.member_count} Members</div>
                    <div class="team-avatar-row">
                        ${avatarsHtml}
                        ${overflow}
                    </div>
                    <div class="team-stat-strip">
                        <div class="team-stat-strip-inner" style="display: flex; justify-content: space-around; width: 100%;">
                            <div class="team-strip-item">
                                <span class="team-strip-val">${team.total_elo}</span>
                                <span class="team-strip-lab">OVR</span>
                            </div>
                            <div class="team-strip-item">
                                <span class="team-strip-val">${team.total_kills}</span>
                                <span class="team-strip-lab">KILLS</span>
                            </div>
                            <div class="team-strip-item">
                                <span class="team-strip-val">${team.total_deaths}</span>
                                <span class="team-strip-lab">DEATHS</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        updateTeamsSummary();
        if (selectedTeam) {
            const updated = teams.find(t => t.name === selectedTeam.name);
            if (updated) {
                showTeamDetails(updated);
            }
        }
    }

    function updateTeamsSummary() {
        const tTotalTeams = document.getElementById('t-total-teams');
        const tTopElo = document.getElementById('t-top-elo');
        const tTopName = document.getElementById('t-top-name');
        const tTotalPlayers = document.getElementById('t-total-players');

        if (!tTotalTeams) return;

        tTotalTeams.textContent = teams.length;
        
        let totalPlayers = 0;
        let bestTeam = null;
        teams.forEach(t => {
            totalPlayers += t.member_count;
            if (!bestTeam || t.total_elo > bestTeam.total_elo) {
                bestTeam = t;
            }
        });

        tTotalPlayers.textContent = totalPlayers;
        if (bestTeam) {
            tTopElo.textContent = bestTeam.total_elo;
            tTopName.textContent = bestTeam.name;
        } else {
            tTopElo.textContent = "0";
            tTopName.textContent = "---";
        }
    }

    window.selectTeam = (name) => {
        const team = teams.find(t => t.name === name);
        if (!team) return;
        selectedTeam = team;
        showTeamDetails(team);
        document.querySelectorAll('.team-card').forEach(card => {
            const cardName = card.querySelector('.team-card-name')?.textContent;
            card.classList.toggle('active-card', cardName === name);
        });
    };

    function showTeamDetails(team) {
        const detailContainer = document.getElementById('team-detail-container');
        if (!detailContainer) return;

        const tdBadge = document.getElementById('td-badge');
        const tdName = document.getElementById('td-name');
        const tdSub = document.getElementById('td-sub');
        const aggRow = document.getElementById('team-aggregate-row');
        const chartDiv = document.getElementById('team-elo-chart');
        const rosterList = document.getElementById('team-roster-list');

        if (tdBadge) tdBadge.textContent = team.badge || '🛡️';
        if (tdName) tdName.textContent = team.name;
        if (tdSub) {
            const dateStr = team.created_at ? new Date(team.created_at * 1000).toLocaleDateString(undefined, {month: 'long', day: 'numeric', year: 'numeric'}) : 'recently';
            tdSub.textContent = `${team.member_count} members · Registered on ${dateStr}`;
        }

        if (aggRow) {
            const avgElo = team.member_count > 0 ? Math.round(team.total_elo / team.member_count) : 0;
            const avgMined = team.member_count > 0 ? Math.round(team.total_mined / team.member_count) : 0;
            const kd = (team.total_kills / Math.max(1, team.total_deaths)).toFixed(2);

            aggRow.innerHTML = `
                <div class="team-agg-card">
                    <span class="team-agg-label">Average OVR</span>
                    <span class="team-agg-value" style="color: var(--primary);">${avgElo}</span>
                </div>
                <div class="team-agg-card">
                    <span class="team-agg-label">Team K/D</span>
                    <span class="team-agg-value">${kd}</span>
                </div>
                <div class="team-agg-card">
                    <span class="team-agg-label">Total Blocks Mined</span>
                    <span class="team-agg-value" style="color:#60a5fa;">${team.total_mined.toLocaleString()}</span>
                </div>
                <div class="team-agg-card">
                    <span class="team-agg-label">Avg Mined</span>
                    <span class="team-agg-value">${avgMined.toLocaleString()}</span>
                </div>
                <div class="team-agg-card">
                    <span class="team-agg-label">Total Mob Kills</span>
                    <span class="team-agg-value" style="color:#4ade80;">${team.total_mob_kills.toLocaleString()}</span>
                </div>
            `;
        }

        if (chartDiv) {
            const maxElo = Math.max(...team.members.map(m => m.elo), 100);
            chartDiv.innerHTML = team.members.map(m => {
                const eloRank = getRank(m.elo);
                const pct = (m.elo / maxElo) * 100;
                return `
                    <div class="graph-row" style="margin-bottom: 15px;">
                        <div class="graph-label" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                            <span>${m.mc_name}</span>
                            <span style="font-family: 'JetBrains Mono', monospace; font-weight: 800; color: ${eloRank.color};">${m.elo} OVR</span>
                        </div>
                        <div class="graph-bar-container">
                            <div class="graph-bar" style="width: ${pct}%; background: ${eloRank.color};"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        if (rosterList) {
            rosterList.innerHTML = team.members.map(m => {
                const kd = (m.kills / Math.max(1, m.deaths)).toFixed(2);
                const playerObj = players.find(p => p.username.toLowerCase() === m.mc_name.toLowerCase());
                const skin = playerObj?.skin || m.mc_name;
                const eloRank = getRank(m.elo);
                const isCaptain = team.captain_discord && (m.discord_id === team.captain_discord);
                return `
                    <div class="team-roster-row" onclick="showPlayerDetails('${playerObj?.uuid || ''}')" style="${playerObj ? 'cursor:pointer;' : 'pointer-events:none;'}">
                        <div class="team-roster-avatar"><img src="https://mc-heads.net/avatar/${skin}/36" alt="${m.mc_name}"></div>
                        <div class="team-roster-name">
                            ${m.mc_name} 
                            ${isCaptain ? '<span style="color:#fbbf24; font-size:10px; font-weight:800; background:rgba(251,191,36,0.1); border:1px solid #fbbf24; border-radius:4px; padding:1px 5px; margin-left:6px;">CAPTAIN</span>' : ''}
                        </div>
                        <div class="team-roster-kd"><i class="fa-solid fa-skull" style="font-size:10px; opacity:0.6; margin-right:4px;"></i> ${m.kills}/${m.deaths} (K/D: ${kd})</div>
                        <div class="team-roster-elo" style="color:${eloRank.color}; border-color:${eloRank.color}44; background:${eloRank.color}11;">${m.elo} OVR</div>
                    </div>
                `;
            }).join('');
        }

        detailContainer.style.display = 'block';
    }

    const teamCloseBtn = document.getElementById('team-close-btn');
    if (teamCloseBtn) {
        teamCloseBtn.addEventListener('click', () => {
            const detailContainer = document.getElementById('team-detail-container');
            if (detailContainer) detailContainer.style.display = 'none';
            selectedTeam = null;
            document.querySelectorAll('.team-card').forEach(card => card.classList.remove('active-card'));
        });
    }

    function getWeaponIcon(weapon) {
        if (!weapon || weapon === 'None') return 'fa-shield-halved';
        const w = weapon.toLowerCase();
        if (w.includes('trident')) return 'fa-anchor'; // free alternative to fa-trident
        if (w.includes('crossbow')) return 'fa-bullseye';
        if (w.includes('mace')) return 'fa-hammer';
        return 'fa-shield-halved';
    }
});
