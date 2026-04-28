const prospects = await buildMasterBoard()

const metadata = {
    sourceCount: 18,
    lastUpdated: "Prototype"
};

let currentRows = [...prospects];

const boardBody = document.getElementById("boardBody");
const mobileList = document.getElementById("mobileList");
const searchInput = document.getElementById("searchInput");
const positionFilter = document.getElementById("positionFilter");
const schoolFilter = document.getElementById("schoolFilter");
const sortSelect = document.getElementById("sortSelect");
const resultCount = document.getElementById("resultCount");
const scrollSentinel = document.getElementById("scrollSentinel");

function uniqueValues(key) {
    return [...new Set(prospects.map(item => item[key]))].sort();
}

function fillSelect(select, values) {
    values.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
    });
}

function trendLabel(value) {
    if (value > 0) return `<span class="trend-up">▲ ${value}</span>`;
    if (value < 0) return `<span class="trend-down">▼ ${Math.abs(value)}</span>`;
    return `<span class="trend-flat">—</span>`;
}

function sortRows(rows, sortValue) {
    const [key, direction] = sortValue.split("-");
    const sorted = [...rows].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];

    if (typeof aVal === "string") {
        return direction === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }

    return direction === "asc" ? aVal - bVal : bVal - aVal;
    });
    return sorted;
}

function filterRows() {
    const query = searchInput.value.trim().toLowerCase();
    const pos = positionFilter.value;
    const school = schoolFilter.value;

    let rows = prospects.filter(p => {
    const matchesSearch = !query || [p.name, p.pos, p.school].join(" ").toLowerCase().includes(query);
    const matchesPos = !pos || p.pos === pos;
    const matchesSchool = !school || p.school === school;
    return matchesSearch && matchesPos && matchesSchool;
    });

    rows = sortRows(rows, sortSelect.value);
    currentRows = rows;
    render(rows);
}

const pageSize = 32;
let visibleCount = pageSize;
let activeRows = [];

function render(rows) {
    activeRows = rows;

    boardBody.innerHTML = "";
    mobileList.innerHTML = "";

    if (!rows.length) {
        boardBody.innerHTML = `<tr><td colspan="8" class="no-results">No prospects match your filters.</td></tr>`;
        mobileList.innerHTML = `<div class="no-results">No prospects match your filters.</div>`;
        resultCount.textContent = "Showing 0 prospects";
        return;
    };

    const visibleRows = rows.slice(0, visibleCount);

    visibleRows.forEach(p => {
        // Desktop table row
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td class="rank">${p.rank}</td>
            <td><div class="player"><strong>${p.name}</strong></div></td>
            <td><span class="tag pos-${p.pos.replace("/", "").toLowerCase()}">${p.pos}</span></td>
            <td>${p.school}</td>
            <td>${p.boards}</td>
            <td>${p.avg.toFixed(1)}</td>
            <td>${p.high}–${p.low}</td>
            <td>${trendLabel(p.trend)}</td>
        `;

        boardBody.appendChild(tr);

        // Mobile card
        const card = document.createElement("article");
        card.className = "mobile-card";

        card.innerHTML = `
            <div class="mobile-card-top">
                <div>
                    <h3>${p.rank}. ${p.name}</h3>
                    <div class="school">${p.school}</div>
                </div>
                <span class="tag">${p.pos}</span>
            </div>
            <div class="mobile-meta">
                <div>
                    <strong>${p.boards}</strong>
                    <span>Boards</span>
                </div>
                <div>
                    <strong>${p.avg.toFixed(1)}</strong>
                    <span>Avg</span>
                </div>
                <div>
                    <strong>${p.high}–${p.low}</strong>
                    <span>Range</span>
                </div>
                <div>
                    <strong>
                        ${p.trend === 0 ? "—" : p.trend > 0 ? "+" + p.trend : p.trend}
                    </strong>
                    <span>Trend</span>
                </div>
            </div>
        `;

        mobileList.appendChild(card);
    });

    resultCount.textContent = `Showing ${visibleRows.length} of ${rows.length} prospect${rows.length === 1 ? "" : "s"}`;
}

const observer = new IntersectionObserver(entries => {
    const entry = entries[0];
    if (!entry.isIntersecting) return;
    if (visibleCount >= activeRows.length) return;
    visibleCount += pageSize;
    render(activeRows);
}, { root: null, rootMargin: "400px", threshold: 0 });

observer.observe(scrollSentinel);

function initialize() {
    fillSelect(positionFilter, uniqueValues("pos"));
    fillSelect(schoolFilter, uniqueValues("school"));

    document.getElementById("statPlayers").textContent = prospects.length;
    document.getElementById("statSources").textContent = metadata.sourceCount;
    document.getElementById("statUpdated").textContent = metadata.lastUpdated;
    document.getElementById("lastUpdated").textContent = metadata.lastUpdated;
    document.getElementById("year").textContent = new Date().getFullYear();

    searchInput.addEventListener("input", filterRows);
    positionFilter.addEventListener("change", filterRows);
    schoolFilter.addEventListener("change", filterRows);
    sortSelect.addEventListener("change", filterRows);

    document.querySelectorAll("th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
        const key = th.dataset.sort;
        const current = sortSelect.value;
        const direction = current.startsWith(key) && current.endsWith("asc") ? "desc" : "asc";
        sortSelect.value = `${key}-${direction}`;
        filterRows();
    });
    });

    filterRows();
}

async function buildMasterBoard() {
    const manifestRes = await fetch("./json/raw-files.json");
    const rawFiles = await manifestRes.json();

    const rawBoards = await Promise.all(
        rawFiles.map(async file => {
            const res = await fetch(`./json/raw/${file}`);
            return await res.json();
        })
    );

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const players = new Map();

    for (const raw of rawBoards) {
        const boardDate = new Date(raw.now);

        for (const item of raw.board) {
            const name = item.player || item.name;
            const rank = Number(item.rank);

            if (!name || !rank) continue;

            const key = name.toLowerCase().replace(/[^\w]/g, "");


            if (!players.has(key)) {
                players.set(key, {
                    name,
                    pos: item.pos,
                    school: item.team || item.school,
                    ranks: [],
                    recentRanks: []
                });
            }

            const player = players.get(key);

            player.ranks.push(rank);

            if (boardDate >= sevenDaysAgo) {
                player.recentRanks.push(rank);
            }
        }
    }

    const master = [...players.values()]
        .map(player => {
            const avg = player.ranks.reduce((a, b) => a + b, 0) / player.ranks.length;
            const recentAvg = player.recentRanks.length
                ? player.recentRanks.reduce((a, b) => a + b, 0) / player.recentRanks.length
                : avg;

            return {
                rank: 0,
                name: player.name,
                pos: player.pos,
                school: player.school,
                boards: player.ranks.length,
                avg: Number(avg.toFixed(1)),
                high: Math.min(...player.ranks),
                low: Math.max(...player.ranks),
                trend: Number((avg - recentAvg).toFixed(1))
            };
        })
        .sort((a, b) => a.avg - b.avg)
        .map((player, index) => ({
            ...player,
            rank: index + 1
        }));

    return master;
}

initialize();