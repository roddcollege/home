let initialSetup = {}; // <-- 1. We declare it here so the whole file can see it
let matches = [];
let standings = {};
let teamData = {}; 
let trigrams = {};
let forecastOverrides = {};
let activeModalGroup = null;

async function initEngine() {
    try {
        const response = await fetch('2026data.json');
        const data = await response.json();
        
        initialSetup = data.groups || {}; // <-- 2. We fill it with the loaded JSON data
        trigrams = data.trigrams || {};
        forecastOverrides = data.forecastOverrides || {};
        
        Object.keys(initialSetup).forEach(g => { // <-- 3. We iterate over it
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

        generateBracketHTML(); 
        calculateStandings();
    } catch (error) {
        console.error("Not able to load for security reasons, visit official site.", error);
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
            data.matches.forEach(liveMatch => {
                if (liveMatch.score && liveMatch.score.ft && liveMatch.score.ft.length === 2) {
                    let engineMatch = matches.find(m => (m.t1.includes(liveMatch.team1) && m.t2.includes(liveMatch.team2)) || (m.t1.includes(liveMatch.team2) && m.t2.includes(liveMatch.team1)));
                    if (engineMatch) {
                        if (engineMatch.t1.includes(liveMatch.team1)) {
                            engineMatch.s1 = liveMatch.score.ft[0]; engineMatch.s2 = liveMatch.score.ft[1];
                        } else {
                            engineMatch.s1 = liveMatch.score.ft[1]; engineMatch.s2 = liveMatch.score.ft[0];
                        }
                        engineMatch.played = true; engineMatch.locked = true; engineMatch.forecasted = false;
                        updatedCount++;
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
    renderGroupTables(); syncKnockoutBracket();
}

function forecastMatches() {
    matches.forEach(m => {
        if (!m.locked && (m.s1 === null || m.s2 === null || m.forecasted)) {
            let p1 = m.t1; let p2 = m.t2;
            
            if (forecastOverrides[p1]) {
                m.s1 = forecastOverrides[p1].win; m.s2 = forecastOverrides[p1].lose;
            } else if (forecastOverrides[p2]) {
                m.s1 = forecastOverrides[p2].lose; m.s2 = forecastOverrides[p2].win;
            } else {
                let diff = getAdjustedPower(m.t1, false) - getAdjustedPower(m.t2, false);
                if (diff > 180) { m.s1 = 2; m.s2 = 0; } else if (diff > 80) { m.s1 = 2; m.s2 = 1; } else if (diff > 25) { m.s1 = 1; m.s2 = 0; } else if (diff > -25) { m.s1 = 1; m.s2 = 1; } else if (diff > -80) { m.s1 = 0; m.s2 = 1; } else if (diff > -180) { m.s1 = 1; m.s2 = 2; } else { m.s1 = 0; m.s2 = 2; }
            }
            m.played = true; m.forecasted = true; 
        }
    });
    resetBracketPredictions(); calculateStandings(); showTab('bracket');
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
            html += `<tr><td class="team-name-col">
                <div>${t}</div>
                <span class="elo-badge">Knockout Power: ${pwr}</span>
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
    if (event.target == modal) { closeModal(); }
}

// --- SYMMETRIC GEOMETRIC BRACKET GENERATION ---
function generateBracketHTML() {
    const target = document.getElementById('bracket-render-target');
    
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

    const r32Tops = [0, 90, 180, 270, 450, 540, 630, 720];
    const r16Tops = [45, 225, 495, 675];
    const qfTops  = [135, 585];
    const sfTops  = [360];

    const r32ConnH = 90;
    const r16ConnH = 180;
    const qfConnH  = 450;

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

            let connectorLine = idx % 2 === 0 ? `<div class="line-tree-${isLeft ? 'left' : 'right'}" style="height: ${r32ConnH}px;"></div>` : '';

            html += `
            <div class="match r32 ${isLeft ? 'left-side' : 'right-side'}" style="top: ${r32Tops[idx]}px;" id="m-${p.m}" data-next="m-${nextM}" data-slot="${slot}">
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
            let connectorLine = idx % 2 === 0 ? `<div class="line-tree-${isLeft ? 'left' : 'right'}" style="height: ${r16ConnH}px;"></div>` : '';

            html += `
            <div class="match r16 ${isLeft ? 'left-side' : 'right-side'}" style="top: ${r16Tops[idx]}px;" id="m-${m}" data-next="m-${nextM}" data-slot="${slot}">
                <div class="match-num">#${m}</div>
                <div class="match-card">
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
            let connectorLine = idx === 0 ? `<div class="line-tree-${isLeft ? 'left' : 'right'}" style="height: ${qfConnH}px;"></div>` : '';

            html += `
            <div class="match qf ${isLeft ? 'left-side' : 'right-side'}" style="top: ${qfTops[idx]}px;" id="m-${m}" data-next="m-${nextM}" data-slot="${slot}">
                <div class="match-num">#${m}</div>
                <div class="match-card">
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
        let sfConnector = `<div class="line-straight ${isLeft ? 'left' : 'right'}"></div>`;

        html += `
            <div class="match sf ${isLeft ? 'left-side' : 'right-side'}" style="top: ${sfTops[0]}px;" id="m-${sfMatch}" data-next="final-1" data-slot="${sfSlot}">
                <div class="match-num">#${sfMatch}</div>
                <div class="match-card">
                    <div class="team-row slot-top empty" data-fullname="TBD" onclick="advance(this)">
                        <span class="team-name">TBD</span>
                    </div>
                    <div class="team-row slot-bottom empty" data-fullname="TBD" onclick="advance(this)">
                        <span class="team-name">TBD</span>
                    </div>
                </div>
                ${sfConnector}
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

    let thirdPlaceIndex = 0;
    document.querySelectorAll('.seed-target').forEach(slot => {
        const requiredSeed = slot.getAttribute('data-seed'); let teamToInsert = "TBD";
        if (requiredSeed.includes('3')) { if (thirdPlaceIndex < top8ThirdPlaces.length) { teamToInsert = top8ThirdPlaces[thirdPlaceIndex]; thirdPlaceIndex++; } } 
        else { if (seeds[requiredSeed]) teamToInsert = seeds[requiredSeed]; }

        let nameSpan = slot.querySelector('.team-name');
        if (nameSpan) {
            nameSpan.innerHTML = getTrigramBadge(teamToInsert);
            slot.setAttribute('data-fullname', teamToInsert);
        }
        
        slot.classList.remove('selected');
        if(teamToInsert === "TBD") slot.classList.add('empty'); else slot.classList.remove('empty');
    });

    autoPrefillBracketRounds();
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

window.onload = () => { initEngine(); };