let initialSetup = {}; 
let matches = [];
let standings = {};
let teamData = {}; 
let trigrams = {};
let forecastOverrides = {};
let activeModalGroup = null;

// Track knockout matches specifically
let completedKnockouts = {};

// UNIVERSAL TEAM TRANSLATOR 
function getEngineTeam(extName) {
    if (!extName) return null;
    
    const aliases = {
        "Czech Republic": "🇨🇿 Czechia",
        "Bosnia & Herzegovina": "🇧🇦 Bosnia",
        "Turkey": "🇹🇷 Türkiye",
        "Cape Verde": "🇨🇻 Cabo Verde",
        "Congo DR": "🇨🇩 DR Congo",
        "IR Iran": "🇮🇷 Iran",
        "Korea Republic": "🇰🇷 South Korea"
    };
    
    if (aliases[extName]) return aliases[extName];

    for (let engineTeam of Object.keys(teamData)) {
        let cleanEngineTeam = engineTeam.substring(engineTeam.indexOf(' ') + 1).trim();
        let cleanExtName = extName;
        
        if (cleanExtName.includes(' ') && cleanExtName.charCodeAt(0) > 1000) {
            cleanExtName = cleanExtName.substring(cleanExtName.indexOf(' ') + 1).trim();
        }
        
        if (cleanEngineTeam === cleanExtName || cleanEngineTeam.includes(cleanExtName) || cleanExtName.includes(cleanEngineTeam)) {
            return engineTeam;
        }
    }
    return null;
}

async function initEngine() {
    try {
        const myUrl = 'https://raw.githubusercontent.com/roddcollege/home/main/fifa/2026data.json?t=' + new Date().getTime();
        const myResponse = await fetch(myUrl);
        const myData = await myResponse.json();
        
        initialSetup = myData.groups || {}; 
        trigrams = myData.trigrams || {};
        forecastOverrides = myData.forecastOverrides || {};
        
        Object.keys(initialSetup).forEach(g => { 
            let teams = initialSetup[g];
            matches.push({ id: `${g}1`, group: g, t1: teams[0].t, t2: teams[1].t, s1: teams[0].sc, s2: teams[1].sc, played: true, locked: true, forecasted: false });
            matches.push({ id: `${g}2`, group: g, t1: teams[2].t, t2: teams[3].t, s1: teams[2].sc, s2: teams[3].sc, played: true, locked: true, forecasted: false });
            matches.push({ id: `${g}3`, group: g, t1: teams[3].t, t2: teams[1].t, s1: null, s2: null, played: false, locked: false, forecasted: false });
            matches.push({ id: `${g}4`, group: g, t1: teams[0].t, t2: teams[2].t, s1: null, s2: null, played: false, locked: false, forecasted: false });
            matches.push({ id: `${g}5`, group: g, t1: teams[3].t, t2: teams[0].t, s1: null, s2: null, played: false, locked: false, forecasted: false });
            matches.push({ id: `${g}6`, group: g, t1: teams[1].t, t2: teams[2].t, s1: null, s2: null, played: false, locked: false, forecasted: false });
            
            teams.forEach(t => { 
                standings[t.t] = { group: g, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }; 
                teamData[t.t] = { elo: t.elo, host: t.host, ped: t.ped, star: t.star, comm: t.comm };
            });
        });

        // APPLY LOCAL BACKUPS
        if (myData.completedMatches) {
            myData.completedMatches.forEach(cm => {
                let eT1 = getEngineTeam(cm.t1);
                let eT2 = getEngineTeam(cm.t2);
                if (eT1 && eT2) {
                    let m = matches.find(match => 
                        (match.t1 === eT1 && match.t2 === eT2) || 
                        (match.t1 === eT2 && match.t2 === eT1)
                    );
                    if (m) {
                        if (m.t1 === eT1) { m.s1 = cm.s1; m.s2 = cm.s2; }
                        else { m.s1 = cm.s2; m.s2 = cm.s1; }
                        m.played = true; m.locked = true; m.forecasted = false;
                    }
                }
            });
        }

        // EXTERNAL API SYNC
        try {
            const liveResponse = await fetch('https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json');
            if (!liveResponse.ok) throw new Error("External API is down or missing."); 
            
            const liveData = await liveResponse.json();
            if (liveData && liveData.matches) {
                liveData.matches.forEach(lm => {
                    if (lm.score && lm.score.ft && lm.score.ft.length === 2) {
                        
                        // IF IT IS A KNOCKOUT MATCH, SAVE IT FOR LATER
                        if (lm.num && lm.num >= 73) {
                            completedKnockouts[lm.num] = lm;
                        } else {
                            // OTHERWISE, IT'S A GROUP MATCH
                            let eT1 = getEngineTeam(lm.team1);
                            let eT2 = getEngineTeam(lm.team2);
                            if (eT1 && eT2) {
                                let m = matches.find(match => 
                                    (match.t1 === eT1 && match.t2 === eT2) || 
                                    (match.t1 === eT2 && match.t2 === eT1)
                                );
                                if (m) {
                                    if (m.t1 === eT1) { m.s1 = lm.score.ft[0]; m.s2 = lm.score.ft[1]; }
                                    else { m.s1 = lm.score.ft[1]; m.s2 = lm.score.ft[0]; }
                                    m.played = true; m.locked = true; m.forecasted = false;
                                }
                            }
                        }
                    }
                });
            }
        } catch (syncError) {
            console.warn("Live external sync failed. Relying entirely on your GitHub backup JSON.", syncError);
        }

        generateBracketHTML(); 
        calculateStandings();
		renderSuperstars();
		setTimeout(() => syncKnockoutBracket(), 500);
    } catch (error) {
        console.error("Critical Error: Could not load your primary GitHub JSON.", error);
    }
}

function getTrigramBadge(fullTeamString) {
    if (fullTeamString === 'TBD' || fullTeamString.includes('3rd') || fullTeamString.match(/^[12][A-L]$/)) return fullTeamString;
    let name = fullTeamString.replace(/[^a-zA-Z\s-]/g, '').trim();
    let flag = fullTeamString.replace(/[a-zA-Z\s-]/g, '').trim();
    let code = trigrams[name] || name.substring(0,3).toUpperCase();
    return `${flag} ${code}`;
}

async function syncLiveData() {
    const btn = document.getElementById('syncButton');
    btn.classList.add('loading');
    try {
        const response = await fetch('https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json');
        const data = await response.json();
        if (data && data.matches) {
            let updatedCount = 0;
            data.matches.forEach(lm => {
                if (lm.score && lm.score.ft && lm.score.ft.length === 2) {
                    
                    if (lm.num && lm.num >= 73) {
                        completedKnockouts[lm.num] = lm;
                        updatedCount++;
                    } else {
                        let eT1 = getEngineTeam(lm.team1);
                        let eT2 = getEngineTeam(lm.team2);
                        if (eT1 && eT2) {
                            let engineMatch = matches.find(m => 
                                (m.t1 === eT1 && m.t2 === eT2) || 
                                (m.t1 === eT2 && m.t2 === eT1)
                            );
                            if (engineMatch) {
                                if (engineMatch.t1 === eT1) {
                                    engineMatch.s1 = lm.score.ft[0]; engineMatch.s2 = lm.score.ft[1];
                                } else {
                                    engineMatch.s1 = lm.score.ft[1]; engineMatch.s2 = lm.score.ft[0];
                                }
                                engineMatch.played = true; engineMatch.locked = true; engineMatch.forecasted = false;
                                updatedCount++;
                            }
                        }
                    }
                }
            });
            if(updatedCount > 0) { calculateStandings(); }
        }
    } catch (error) { console.error(error); } finally { btn.classList.remove('loading'); }
}

function getAdjustedPower(teamName, isKnockout = false) {
    let data = teamData[teamName]; if (!data) return 1500;
    let power = data.elo;
    if (data.host) power += 50; power += (data.ped * 10) + (data.comm * 10); 
    let groupLetter = standings[teamName] ? standings[teamName].group : 'A';
    power += (groupLetter.charCodeAt(0) - 65) * 2; 
    if (isKnockout) power += (data.star * 15); else power += (data.star * 5);
    let gd = standings[teamName] ? standings[teamName].gd : 0; power += (gd * 5); 
    return power;
}

function calculateStandings() {
    Object.keys(standings).forEach(t => { standings[t] = { group: standings[t].group, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }; });
    matches.forEach(m => {
        if (m.played) {
            let st1 = standings[m.t1]; let st2 = standings[m.t2];
            st1.mp++; st2.mp++; st1.gf += m.s1; st1.ga += m.s2; st2.gf += m.s2; st2.ga += m.s1;
            if (m.s1 > m.s2) { st1.w++; st2.l++; st1.pts += 3; }
            else if (m.s1 < m.s2) { st2.w++; st1.l++; st2.pts += 3; }
            else { st1.d++; st2.d++; st1.pts += 1; st2.pts += 1; }
        }
    });
    Object.keys(standings).forEach(t => { standings[t].gd = standings[t].gf - standings[t].ga; });
    renderGroupTables(); 
    syncKnockoutBracket();
    applyCompletedKnockouts(); // Processes advancing teams after R32 populates
}

function forecastMatches() {
    matches.forEach(m => {
        if (!m.locked && (m.s1 === null || m.s2 === null || m.forecasted)) {
            let p1 = m.t1; let p2 = m.t2;
            
            if (forecastOverrides[p1] && forecastOverrides[p1].win > 0) {
                m.s1 = forecastOverrides[p1].win; m.s2 = forecastOverrides[p1].lose;
            } else if (forecastOverrides[p2] && forecastOverrides[p2].win > 0) {
                m.s1 = forecastOverrides[p2].lose; m.s2 = forecastOverrides[p2].win;
            } else {
                let diff = getAdjustedPower(m.t1, false) - getAdjustedPower(m.t2, false);
                if (diff > 180) { m.s1 = 2; m.s2 = 0; } else if (diff > 80) { m.s1 = 2; m.s2 = 1; } else if (diff > 25) { m.s1 = 1; m.s2 = 0; } else if (diff > -25) { m.s1 = 1; m.s2 = 1; } else if (diff > -80) { m.s1 = 0; m.s2 = 1; } else if (diff > -180) { m.s1 = 1; m.s2 = 2; } else { m.s1 = 0; m.s2 = 2; }
            }
            m.played = true; m.forecasted = true; 
        }
    });
    resetBracketPredictions(); calculateStandings(); showTab('bracket'); autoPrefillBracketRounds();
}

function renderGroupTables() {
    const container = document.getElementById('group-grid-container');
    container.innerHTML = '';
    
    let allTeamsRanked = Object.keys(standings).sort((a, b) => {
        let stA = standings[a]; let stB = standings[b];
        if (stB.pts !== stA.pts) return stB.pts - stA.pts;
        if (stB.gd !== stA.gd) return stB.gd - stA.gd;
        return stB.gf - stA.gf;
    });

    Object.keys(initialSetup).forEach(g => {
        let groupTeams = Object.keys(standings).filter(t => standings[t].group === g);
        groupTeams.sort((a, b) => allTeamsRanked.indexOf(a) - allTeamsRanked.indexOf(b));

        let html = `<div class="group-card" onclick="openModal('${g}')">
            <div class="group-header"><span>GROUP ${g}</span></div>
            <table class="standings-table">
                <tr><th>Team</th><th class="center">MP</th><th class="center">GD</th><th class="center">Pts</th></tr>`;
        
		groupTeams.forEach(t => {
            let st = standings[t];
            let pwr = getAdjustedPower(t, true); 
            html += `<tr><td class="team-name" style="position: relative; padding-right: 30px;">
                <div style="font-weight: bold;">${t}</div>
                <span class="elo-badge" style="color:var(--accent); display:inline-block; margin-top:4px;">Knockout Power: ${pwr}</span>
                <span title="Adjust Knock out power" onclick="openTunerModal('${t}', event)" style="position: absolute; top: 20px; right: 20px; cursor: pointer; font-size: 1.1rem; opacity: 0.6; transition: 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">⚙️</span>
                </td><td class="center">${st.mp}</td><td class="center">${st.gd > 0 ? '+'+st.gd : st.gd}</td><td class="center" style="font-weight:bold;">${st.pts}</td></tr>`;
        });
        html += `</table></div>`;
        container.innerHTML += html;
    });
}

function openModal(group) {
    activeModalGroup = group;
    document.getElementById('modalGroupTitle').innerText = `Update Group ${group} Matches`;
    const container = document.getElementById('modalMatchesContainer');
    container.innerHTML = '';
    let groupMatches = matches.filter(m => m.group === group);
    groupMatches.forEach(m => {
        let s1Val = m.s1 !== null ? m.s1 : ''; let s2Val = m.s2 !== null ? m.s2 : '';
        let readOnlyAttr = m.locked ? 'readonly' : ''; let lockedClass = m.locked ? 'locked-input' : '';
        let matchRowClass = m.locked ? 'locked-match' : ''; let forecastClass = m.forecasted ? 'forecasted-input' : '';
        container.innerHTML += `
            <div class="match-edit-row ${matchRowClass}">
                <div class="team-label" style="text-align:right;">${m.t1}</div>
                <div style="display:flex; align-items:center; padding: 0 15px;">
                    <input type="number" id="s1_${m.id}" value="${s1Val}" min="0" class="${lockedClass} ${forecastClass}" ${readOnlyAttr}>
                    <span style="font-weight:bold; padding:0 10px;">-</span>
                    <input type="number" id="s2_${m.id}" value="${s2Val}" min="0" class="${lockedClass} ${forecastClass}" ${readOnlyAttr}>
                </div>
                <div class="team-label" style="text-align:left;">${m.t2}</div>
            </div>`;
    });
    document.getElementById('scoreModal').style.display = 'block';
}

function closeModal() { document.getElementById('scoreModal').style.display = 'none'; }

function saveScores() {
    let groupMatches = matches.filter(m => m.group === activeModalGroup);
    groupMatches.forEach(m => {
        if (!m.locked) {
            let val1 = document.getElementById(`s1_${m.id}`).value; let val2 = document.getElementById(`s2_${m.id}`).value;
            if (val1 !== '' && val2 !== '') {
                if (m.s1 != val1 || m.s2 != val2) m.forecasted = false;
                m.s1 = parseInt(val1); m.s2 = parseInt(val2); m.played = true;
            } else { m.s1 = null; m.s2 = null; m.played = false; m.forecasted = false; }
        }
    });
    closeModal(); resetBracketPredictions(); calculateStandings();
}

window.onclick = function(event) {
    let modal = document.getElementById('scoreModal');
    let tunerModal = document.getElementById('tunerModal');
    if (event.target == modal) { closeModal(); }
    if (tunerModal && event.target == tunerModal) { closeTunerModal(); }
}

// --- SYMMETRIC GEOMETRIC BRACKET GENERATION ---
function generateBracketHTML() {
    const target = document.getElementById('bracket-render-target');
    
    // The exact dates compiled from the JSON
const schedule = {
        // ROUND OF 32 - Left Side (Top to Bottom)
        75:"Jun 29 - 15:30", 
        78:"Jun 30 - 16:00", 
        73:"Jun 28 - 14:00", 
        76:"Jun 29 - 20:00",
        84:"Jul 02 - 18:00", 
        83:"Jul 02 - 14:00", 
        82:"Jul 01 - 19:00", 
        81:"Jul 01 - 15:00",

        // ROUND OF 32 - Right Side (Top to Bottom)
        74:"Jun 29 - 12:00", 
        77:"Jun 30 - 12:00", 
        79:"Jun 30 - 20:00", 
        80:"Jul 01 - 11:00",
        87:"Jul 03 - 17:00", 
        86:"Jul 03 - 13:00", 
        85:"Jul 02 - 22:00", 
        88:"Jul 03 - 20:30",

        // ROUND OF 16 - Left Side
        90:"Jul 04 - 16:00", 
        89:"Jul 04 - 12:00", 
        94:"Jul 06 - 14:00", 
        93:"Jul 06 - 19:00", 
        
        // ROUND OF 16 - Right Side
        91:"Jul 05 - 15:00", 
        92:"Jul 05 - 19:00", 
        95:"Jul 07 - 11:00", 
        96:"Jul 07 - 15:00", 

        // QUARTERFINALS
        97:"Jul 09 - 15:00", // Left Top
        99:"Jul 10 - 14:00", // Left Bottom
        98:"Jul 11 - 16:00", // Right Top
        100:"Jul 11 - 20:00", // Right Bottom

        // SEMIFINALS & FINAL
        101:"Jul 14 - 14:00", 
        102:"Jul 15 - 14:00", 
        104:"Jul 19 - 14:00"
    };

    const leftR32 = [
        {m: 75, t1: '1E', t2: '3rd'}, {m: 78, t1: '1I', t2: '3rd'},
        {m: 73, t1: '2A', t2: '2B'}, {m: 76, t1: '1F', t2: '2C'},
        {m: 84, t1: '2K', t2: '2L'}, {m: 83, t1: '1H', t2: '2J'},
        {m: 82, t1: '1D', t2: '3rd'}, {m: 81, t1: '1G', t2: '3rd'}
    ];
    
    const rightR32 = [
        {m: 74, t1: '1C', t2: '2F'}, {m: 77, t1: '2E', t2: '2I'},
        {m: 79, t1: '1A', t2: '3rd'}, {m: 80, t1: '1L', t2: '3rd'},
        {m: 87, t1: '1J', t2: '2H'}, {m: 86, t1: '2D', t2: '2G'},
        {m: 85, t1: '1B', t2: '3rd'}, {m: 88, t1: '1K', t2: '3rd'}
    ];

	const r32Tops = [0, 105, 210, 315, 420, 525, 630, 735];
    const r16Tops = [53, 263, 473, 683];
    const qfTops  = [158, 578];
    const sfTops  = [368];

    const r32ConnH = 105;
    const r16ConnH = 210;
    const qfConnH  = 420;

    const generateSide = (side, r32Pairs) => {
        let isLeft = side === 'L';
        let html = `<div class="bracket-half ${isLeft ? 'left' : 'right'}">`;

        // Col 1: R32
        html += `<div class="bracket-col" id="${side}-r32-col"><div class="col-title">ROUND OF 32</div>`;
        r32Pairs.forEach((p, idx) => {
            let nextM = isLeft ? (p.m === 75||p.m === 78 ? 90 : p.m === 73||p.m === 76 ? 89 : p.m === 84||p.m === 83 ? 94 : 93) 
                               : (p.m === 74||p.m === 77 ? 91 : p.m === 79||p.m === 80 ? 92 : p.m === 87||p.m === 86 ? 95 : 96);
            let slot = (p.m === 75 || p.m === 73 || p.m === 84 || p.m === 82 || p.m === 74 || p.m === 79 || p.m === 87 || p.m === 85) ? 'top' : 'bottom';
            
            let t1HTML = isLeft ? `<span class="seed" style="left:-25px;">${p.t1}</span><span class="team-name">TBD</span>` : `<span class="team-name">TBD</span><span class="seed" style="right:-25px;">${p.t1}</span>`;
            let t2HTML = isLeft ? `<span class="seed" style="left:-25px;">${p.t2.startsWith('3')?'3rd':p.t2}</span><span class="team-name">TBD</span>` : `<span class="team-name">TBD</span><span class="seed" style="right:-25px;">${p.t2.startsWith('3')?'3rd':p.t2}</span>`;

            let connectorLine = idx % 2 === 0 ? `<div class="line-tree-${isLeft ? 'left' : 'right'}" style="height: ${r32ConnH - 1}px; top: 49%"></div>` : '';
            let dateHTML = `<div class="match-date">${schedule[p.m]||""}</div>`;

            html += `
            <div class="match r32 ${isLeft ? 'left-side' : 'right-side'}" style="top: ${r32Tops[idx]}px;" id="m-${p.m}" data-next="m-${nextM}" data-slot="${slot}">
                ${dateHTML}
                <div class="match-num">#${p.m}</div>
                <div class="match-card">
                    <div class="team-row seed-target empty slot-top" data-seed="${p.t1}" data-fullname="TBD" onclick="advance(this)">
                        ${t1HTML}
                    </div>
                    <div class="team-row seed-target empty slot-bottom" data-seed="${p.t2.startsWith('3')?'3rd':p.t2}" data-fullname="TBD" onclick="advance(this)">
                        ${t2HTML}
                    </div>
                </div>
                ${connectorLine}
            </div>`;
        });
        html += `</div>`;

        // Col 2: R16
        html += `<div class="bracket-col"><div class="col-title">ROUND OF 16</div>`;
        const r16Matches = isLeft ? [90, 89, 94, 93] : [91, 92, 95, 96];
        r16Matches.forEach((m, idx) => {
            let nextM = isLeft ? (idx < 2 ? 97 : 99) : (idx < 2 ? 98 : 100);
            let slot = idx % 2 === 0 ? 'top' : 'bottom';
            let connectorLine = idx % 2 === 0 ? `<div class="line-tree-${isLeft ? 'left' : 'right'}" style="height: ${r16ConnH - 1}px; top:49%"></div>` : '';
            let r16Connector = `<div class="line-straight ${isLeft ? 'right' : 'left'}" style="top: 50%;"></div>`;
			let connectorArrow = `<div class="match-arrow ${isLeft ? 'arrow-right' : 'arrow-left'}">${isLeft ? '▶' : '◀'}</div>`;
			let dateHTML = `<div class="match-date">${schedule[m]||""}</div>`;

            html += `
            <div class="match r16 ${isLeft ? 'left-side' : 'right-side'}" style="top: ${r16Tops[idx]}px;" id="m-${m}" data-next="m-${nextM}" data-slot="${slot}">
                ${dateHTML}
                <div class="match-num">#${m}</div>
                ${r16Connector} ${connectorArrow} <div class="match-card">
                    <div class="team-row slot-top empty" data-fullname="TBD" onclick="advance(this)">
                        <span class="team-name">TBD</span>
                    </div>
                    <div class="team-row slot-bottom empty" data-fullname="TBD" onclick="advance(this)">
                        <span class="team-name">TBD</span>
                    </div>
                </div>
                ${connectorLine}
            </div>`;
        });
        html += `</div>`;

        // Col 3: QF
        html += `<div class="bracket-col"><div class="col-title">QUARTERFINALS</div>`;
        const qfMatches = isLeft ? [97, 99] : [98, 100];
        qfMatches.forEach((m, idx) => {
            let nextM = isLeft ? 101 : 102;
            let slot = idx === 0 ? 'top' : 'bottom';
            let connectorLine = idx === 0 ? `<div class="line-tree-${isLeft ? 'left' : 'right'}" style="height: ${qfConnH - 1}px; top: 50%;"></div>` : '';
			let qfConnector = `<div class="line-straight ${isLeft ? 'right' : 'left'}" style="top: 50%;"></div>`;
            let connectorArrow = `<div class="match-arrow ${isLeft ? 'arrow-right' : 'arrow-left'}">${isLeft ? '▶' : '◀'}</div>`;
			let dateHTML = `<div class="match-date">${schedule[m]||""}</div>`;

            html += `
            <div class="match qf ${isLeft ? 'left-side' : 'right-side'}" style="top: ${qfTops[idx]}px;" id="m-${m}" data-next="m-${nextM}" data-slot="${slot}">
                ${dateHTML}
                <div class="match-num">#${m}</div>
                ${qfConnector} ${connectorArrow} <div class="match-card">
                    <div class="team-row slot-top empty" data-fullname="TBD" onclick="advance(this)">
                        <span class="team-name">TBD</span>
                    </div>
                    <div class="team-row slot-bottom empty" data-fullname="TBD" onclick="advance(this)">
                        <span class="team-name">TBD</span>
                    </div>
                </div>
                ${connectorLine}
            </div>`;
        });
        html += `</div>`;

        // Col 4: SF
        html += `<div class="bracket-col"><div class="col-title">SEMIFINALS</div>`;
        let sfMatch = isLeft ? 101 : 102;
        let sfSlot = isLeft ? 'top' : 'bottom';
        let sfConnector = `<div class="line-straight ${isLeft ? 'right' : 'left'}" style="top: 50%;"></div>`;
        let connectorArrow = `<div class="match-arrow ${isLeft ? 'arrow-right' : 'arrow-left'}">${isLeft ? '▶' : '◀'}</div>`;
		let finalConnector = `<div class="line-straight ${isLeft ? 'final-left' : 'final-right'}" style="top: 50%;"></div> <div class="match-arrow ${isLeft ? 'final-left' : 'final-right'}">${isLeft ? '▶' : '◀'}</div>`;
		let dateHTML = `<div class="match-date">${schedule[sfMatch]||""}</div>`;

        html += `
            <div class="match sf ${isLeft ? 'left-side' : 'right-side'}" style="top: ${sfTops[0]}px;" id="m-${sfMatch}" data-next="final-1" data-slot="${sfSlot}">
                ${dateHTML}
                <div class="match-num">#${sfMatch}</div>
                ${sfConnector} ${connectorArrow} <div class="match-card">
                    <div class="team-row slot-top empty" data-fullname="TBD" onclick="advance(this)">
                        <span class="team-name">TBD</span>
                    </div>
                    <div class="team-row slot-bottom empty" data-fullname="TBD" onclick="advance(this)">
                        <span class="team-name">TBD</span>
                    </div>
                </div>
                ${finalConnector}
            </div>`;
        html += `</div>`;

        html += `</div>`; // End half
        return html;
    };

    let fullHTML = generateSide('L', leftR32);
    
    // CENTER COLUMN
    fullHTML += `
        <div class="center-col">
            <div style="font-size: 3.5rem; position: absolute; top: 100px; z-index: 10;">🏆</div>
            
            <div class="champion-box empty" id="champion-slot">
                <span class="team-name" style="text-align:center;">TBD</span>
            </div>

            <div class="final-title">THE FINAL</div>
            <div class="final-sub">Match #104</div>
            
            <div class="final-match-wrapper">
                <div class="match" id="final-1" data-next="champion-slot" data-slot="top" style="margin:0; border:none; width: 100%;">
                    <div class="match-date">${schedule[104]||""}</div>
                    <div class="match-card" style="border:1px solid var(--accent); box-shadow: 0 0 10px rgba(251,191,36,0.3);">
                        <div class="team-row slot-top empty" data-fullname="TBD" onclick="advance(this)" style="justify-content:center;"><span class="team-name" style="text-align:center;">TBD</span></div>
                        <div class="team-row slot-bottom empty" data-fullname="TBD" onclick="advance(this)" style="justify-content:center;"><span class="team-name" style="text-align:center;">TBD</span></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    fullHTML += generateSide('R', rightR32);
    target.innerHTML = fullHTML;
}

function syncKnockoutBracket() {
    let allTeamsRanked = Object.keys(standings).sort((a, b) => {
        let stA = standings[a]; let stB = standings[b];
        if (stB.pts !== stA.pts) return stB.pts - stA.pts;
        if (stB.gd !== stA.gd) return stB.gd - stA.gd;
        return stB.gf - stA.gf;
    });

    const seeds = {}; let allThirdPlaces = [];
    Object.keys(initialSetup).forEach(g => {
        let groupTeams = Object.keys(standings).filter(t => standings[t].group === g);
        groupTeams.sort((a, b) => allTeamsRanked.indexOf(a) - allTeamsRanked.indexOf(b));
        seeds['1' + g] = groupTeams[0]; seeds['2' + g] = groupTeams[1]; allThirdPlaces.push(groupTeams[2]);
    });

    allThirdPlaces.sort((a, b) => allTeamsRanked.indexOf(a) - allTeamsRanked.indexOf(b));
    const top8ThirdPlaces = allThirdPlaces.slice(0, 8);

    const wildcardMatchups = {
        '1E': allThirdPlaces.find(t => standings[t] && standings[t].group === 'D'), 
        '1A': allThirdPlaces.find(t => standings[t] && standings[t].group === 'E'), 
        '1L': allThirdPlaces.find(t => standings[t] && standings[t].group === 'K'), 
        '1G': allThirdPlaces.find(t => standings[t] && standings[t].group === 'I'), 
        '1K': allThirdPlaces.find(t => standings[t] && standings[t].group === 'L'), 
        '1D': allThirdPlaces.find(t => standings[t] && standings[t].group === 'B'), 
        '1B': allThirdPlaces.find(t => standings[t] && standings[t].group === 'J')  
    };
    
    let assigned = Object.values(wildcardMatchups).filter(Boolean);
    let remaining = top8ThirdPlaces.filter(t => !assigned.includes(t));
    wildcardMatchups['1I'] = remaining[0]; 

    let thirdPlaceIndex = 0;
    document.querySelectorAll('.seed-target').forEach(slot => {
        const requiredSeed = slot.getAttribute('data-seed'); let teamToInsert = "TBD";
        
        if (requiredSeed.includes('3')) { 
            let matchDiv = slot.closest('.match');
            let groupWinnerSlot = matchDiv.querySelector('.seed-target:not([data-seed="3rd"])');
            let groupWinnerSeed = groupWinnerSlot ? groupWinnerSlot.getAttribute('data-seed') : null;

            if (groupWinnerSeed && wildcardMatchups[groupWinnerSeed]) {
                teamToInsert = wildcardMatchups[groupWinnerSeed];
            } else if (thirdPlaceIndex < remaining.length) {
                teamToInsert = remaining[thirdPlaceIndex]; 
                thirdPlaceIndex++;
            }
        } 
        else { if (seeds[requiredSeed]) teamToInsert = seeds[requiredSeed]; }

        let nameSpan = slot.querySelector('.team-name');
        if (nameSpan) {
            let tcode = teamToInsert === "TBD" ? "TBD" : getTrigramBadge(teamToInsert);
            nameSpan.innerText = tcode;
            slot.setAttribute('data-fullname', teamToInsert);
        }
        
        slot.classList.remove('selected');
        if(teamToInsert === "TBD") slot.classList.add('empty'); else slot.classList.remove('empty');
    });
}

// CASCADES COMPLETED MATCHES UP THE BRACKET
function applyCompletedKnockouts() {
    // 1. Wait to ensure DOM elements exist
    let allMatches = document.querySelectorAll('.match');
    if (allMatches.length === 0) return; 

    // 2. Process matches directly from the completedKnockouts object
    Object.keys(completedKnockouts).sort((a,b) => parseInt(a) - parseInt(b)).forEach(num => {
        let lm = completedKnockouts[num];
        
        let s1 = lm.score.ft[0];
        let s2 = lm.score.ft[1];
        if (lm.score.p) { s1 += lm.score.p[0]; s2 += lm.score.p[1]; } 
        else if (lm.score.et) { s1 = lm.score.et[0]; s2 = lm.score.et[1]; }
        
        let winnerName = (s1 > s2) ? getEngineTeam(lm.team1) : (s2 > s1 ? getEngineTeam(lm.team2) : null);
        let loserName = (s1 > s2) ? getEngineTeam(lm.team2) : (s2 > s1 ? getEngineTeam(lm.team1) : null);

        if (!winnerName) return; 

        // 3. Find the visual box where this match happens
        for (let mDiv of allMatches) {
            let rows = mDiv.querySelectorAll('.team-row');
            if (rows.length === 2) {
                let r1 = rows[0].getAttribute('data-fullname');
                let r2 = rows[1].getAttribute('data-fullname');
                
                // If the box contains the two teams that played, click the winner
                if ((r1 === winnerName && r2 === loserName) || (r1 === loserName && r2 === winnerName)) {
                    rows.forEach(r => {
                        if (r.getAttribute('data-fullname') === winnerName) {
                            advance(r, true); 
                        }
                    });
                }
            }
        }
    });
}

function advance(clickedElement, isAuto = false) {
    const fullName = clickedElement.getAttribute('data-fullname');
    const badgeHTML = clickedElement.querySelector('.team-name').innerHTML;
    
    if (clickedElement.classList.contains('empty') || fullName === 'TBD') return;

    const matchDiv = clickedElement.closest('.match');
    if(!matchDiv) return;

    const nextMatchId = matchDiv.getAttribute('data-next'); 
    const targetSlot = matchDiv.getAttribute('data-slot');
    
    if(!isAuto) {
        Array.from(matchDiv.querySelectorAll('.team-row')).forEach(child => child.classList.remove('selected'));
        clickedElement.classList.add('selected');
    }

    const nextMatchDiv = document.getElementById(nextMatchId);
    if (!nextMatchDiv) return;

    if (nextMatchId === 'champion-slot') {
        nextMatchDiv.classList.remove('empty'); 
        nextMatchDiv.querySelector('.team-name').innerHTML = fullName;
        nextMatchDiv.setAttribute('data-fullname', fullName);
    } else {
        let targetElement = nextMatchDiv.querySelector(`.slot-${targetSlot}`);
        if(targetElement) {
            targetElement.classList.remove('empty'); 
            targetElement.querySelector('.team-name').innerHTML = badgeHTML;
            targetElement.setAttribute('data-fullname', fullName);
            targetElement.classList.remove('selected'); 
            clearDownstream(nextMatchId, targetSlot);
        }
    }
}

function clearDownstream(matchId, slotChanged) {
    const matchDiv = document.getElementById(matchId);
    if(!matchDiv) return;
    const nextMatchId = matchDiv.getAttribute('data-next'); 
    const targetSlot = matchDiv.getAttribute('data-slot');
    if (!nextMatchId) return;

    const nextMatchDiv = document.getElementById(nextMatchId);
    if (nextMatchId === 'champion-slot') {
        nextMatchDiv.classList.add('empty'); 
        let champName = nextMatchDiv.querySelector('.team-name');
        if(champName) champName.innerText = "TBD";
        nextMatchDiv.setAttribute('data-fullname', "TBD");
    } else {
        let targetElement = nextMatchDiv.querySelector(`.slot-${targetSlot}`);
        if(targetElement) {
            targetElement.classList.add('empty'); 
            targetElement.querySelector('.team-name').innerText = "TBD";
            targetElement.setAttribute('data-fullname', "TBD");
            targetElement.classList.remove('selected'); 
            clearDownstream(nextMatchId, targetSlot);
        }
    }
}

function resetBracketPredictions() {
    document.querySelectorAll('.match:not([id*="-r32-"]) .team-row').forEach(el => { 
        let tName = el.querySelector('.team-name');
        if(tName) tName.innerText = 'TBD'; 
        el.setAttribute('data-fullname', 'TBD');
        el.classList.add('empty'); 
        el.classList.remove('selected'); 
    });
    let champBox = document.getElementById('champion-slot');
    champBox.classList.add('empty');
    champBox.setAttribute('data-fullname', 'TBD');
    let champName = champBox.querySelector('.team-name');
    if(champName) champName.innerText = 'TBD';
    document.querySelectorAll('.match[id*="m-"] .team-row').forEach(el => el.classList.remove('selected'));
}

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    if (event && event.target) event.target.classList.add('active');
}

// --- INTANGIBLES TUNER MODAL LOGIC ---
function openTunerModal(team, event) {
    event.stopPropagation();

    if(!teamData[team]) return;
    const data = teamData[team];
    const st = standings[team] || {gd: 0};

    document.getElementById('tunerModalTitle').innerText = ` ${team}`;
    document.getElementById('tuner-active-team').value = team;

    document.getElementById('tune-elo').value = data.elo;
    document.getElementById('tune-gd').value = st.gd;
    document.getElementById('tune-host').checked = data.host;
    document.getElementById('tune-ped').value = data.ped;
    document.getElementById('tune-star').value = data.star;
    document.getElementById('tune-comm').value = data.comm;

    updateTunerCalc();
    document.getElementById('tunerModal').style.display = 'block';
}

function closeTunerModal() {
    document.getElementById('tunerModal').style.display = 'none';
}

function updateTunerCalc() {
    const team = document.getElementById('tuner-active-team').value;
    const elo = parseInt(document.getElementById('tune-elo').value) || 0;
    const gd = parseInt(document.getElementById('tune-gd').value) || 0;
    const host = document.getElementById('tune-host').checked;
    const ped = parseInt(document.getElementById('tune-ped').value) || 0;
    const star = parseInt(document.getElementById('tune-star').value) || 0;
    const comm = parseInt(document.getElementById('tune-comm').value) || 0;

    document.getElementById('val-ped').innerText = ped;
    document.getElementById('val-star').innerText = star;
    document.getElementById('val-comm').innerText = comm;

    const hostBonus = host ? 50 : 0;
    const pedBonus = ped * 10;
    const starBonus = star * 15; 
    const commBonus = comm * 10;
    const gdBonus = gd * 5;
    
    const groupLetter = standings[team] ? standings[team].group : 'A';
    const groupBonus = (groupLetter.charCodeAt(0) - 65) * 2;

    const total = elo + hostBonus + pedBonus + starBonus + commBonus + gdBonus + groupBonus;

    document.getElementById('tuner-results-panel').innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.85rem; color:var(--text-muted);"><span>Base Elo</span> <span>${elo}</span></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.85rem; color:var(--text-muted);"><span>Host Advantage</span> <span>+${hostBonus}</span></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.85rem; color:var(--text-muted);"><span>Pedigree (${ped})</span> <span>+${pedBonus}</span></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.85rem; color:var(--text-muted);"><span>Superstar Clutch (${star})</span> <span>+${starBonus}</span></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.85rem; color:var(--text-muted);"><span style="color:var(--money);">Commercial Bias (${comm}) 💰</span> <span>+${commBonus}</span></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.85rem; color:var(--text-muted);"><span>Goal Diff (${gd})</span> <span>+${gdBonus}</span></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.85rem; color:var(--text-muted);"><span style="color:var(--schedule);">Group (${groupLetter}) 📅</span> <span>+${groupBonus}</span></div>
        <div style="display:flex; justify-content:space-between; margin-top:10px; padding-top:10px; border-top:1px solid var(--border-color); font-size:1.1rem; font-weight:bold; color:#fff;"><span>Total Power</span> <span style="color:var(--accent);">${total}</span></div>
    `;
}

function applyTunerChanges() {
    const team = document.getElementById('tuner-active-team').value;
    if(!teamData[team]) return;

    teamData[team].elo = parseInt(document.getElementById('tune-elo').value) || 0;
    teamData[team].host = document.getElementById('tune-host').checked;
    teamData[team].ped = parseInt(document.getElementById('tune-ped').value) || 0;
    teamData[team].star = parseInt(document.getElementById('tune-star').value) || 0;
    teamData[team].comm = parseInt(document.getElementById('tune-comm').value) || 0;
    
    calculateStandings(); 
    
    const btn = document.getElementById('tuner-save-btn');
    btn.innerText = "Applied to Engine!";
    setTimeout(() => { 
        btn.innerText = "Inject into Engine"; 
        closeTunerModal(); 
    }, 1000);
}

function autoPrefillBracketRounds() {
    const triggerWeightedWin = (matchId) => {
        let matchDiv = document.getElementById(matchId);
        if(!matchDiv) return null;
        let teams = matchDiv.querySelectorAll('.team-row');
        if(teams.length === 2) {
            let t1 = teams[0].getAttribute('data-fullname');
            let t2 = teams[1].getAttribute('data-fullname');
            if(t1 && t2 && t1 !== 'TBD' && t2 !== 'TBD') {
                let p1 = getAdjustedPower(t1, true);
                let p2 = getAdjustedPower(t2, true);
                let winnerElem = p1 >= p2 ? teams[0] : teams[1];
                advance(winnerElem, true); 
            }
        }
    };

    const runList = [
        75,78,73,76,84,83,82,81,74,77,79,80,87,86,85,88, // R32
        90,89,94,93,91,92,95,96, // R16
        97,99,98,100, // QF
        101,102 // SF
    ];
    
    runList.forEach(m => triggerWeightedWin(`m-${m}`));
    triggerWeightedWin(`final-1`);
}

const superstarDictionary = {
    'France': 'Kylian Mbappé',
    'Argentina': 'Lionel Messi',
    'Portugal': 'Cristiano Ronaldo',
    'Brazil': 'Vinícius Júnior',
    'England': 'Jude Bellingham',
    'Norway': 'Erling Haaland',
    'Belgium': 'Kevin De Bruyne',
    'Mexico': 'Santiago Giménez',
    'USA': 'Christian Pulisic',
    'Germany': 'Jamal Musiala',
    'Netherlands': 'Xavi Simons',
    'Spain': 'Lamine Yamal',
    'Uruguay': 'Federico Valverde',
    'Senegal': 'Sadio Mané',
    'Colombia': 'Luis Díaz',
    'Croatia': 'Luka Modrić'
};

function renderSuperstars() {
    const target = document.getElementById('superstar-render-target');
    if (!target) return;
    target.innerHTML = '';

    let superstarTeams = Object.keys(teamData)
        .filter(t => teamData[t].star >= 4)
        .sort((a, b) => {
            if (teamData[b].star !== teamData[a].star) return teamData[b].star - teamData[a].star;
            return teamData[b].elo - teamData[a].elo;
        });

    let html = '';
    superstarTeams.forEach(t => {
        let cleanName = t.replace(/[^a-zA-Z\s-]/g, '').trim();
        let flag = t.replace(/[a-zA-Z\s-]/g, '').trim();
        
        let playerName = superstarDictionary[cleanName] || 'Marquee Player';
        let starCount = teamData[t].star;
        let starIcons = '★'.repeat(starCount);
        let clutchMultiplier = starCount * 15; 
        
        let tierClass = starCount === 5 ? 'sc-tier-5' : 'sc-tier-4';

        html += `
            <div class="superstar-card ${tierClass}">
                <div class="sc-flag">${flag}</div>
                <div class="sc-player">${playerName}</div>
                <div class="sc-country">${cleanName}</div>
                <div class="sc-stars">${starIcons}</div>
                <div class="sc-power">Clutch Power: +${clutchMultiplier}</div>
            </div>
        `;
    });
    
    target.innerHTML = html;
}


window.onload = () => { initEngine(); };