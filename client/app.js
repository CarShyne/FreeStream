let allMovies = [];
let currentMovie = null;

async function loadMovies() {
    const res = await fetch('/movies');
    allMovies = await res.json();
    renderGrid(allMovies);
}

function renderGrid(movies) {
    const grid = document.getElementById('grid');
    grid.innerHTML = '';
    movies.forEach(movie => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-poster">
                ${movie.poster
                    ? `<img src="${movie.poster}" alt="${movie.title}" loading="lazy">`
                    : `<div class="no-poster">${movie.title || movie.filename}</div>`}
                <div class="card-hover">
                    <div class="play-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </div>
                </div>
            </div>
            <div class="card-info">
                <div class="card-title">${movie.title || movie.filename}</div>
                ${movie.year ? `<div class="card-year">${movie.year}</div>` : ''}
            </div>
        `;
        card.addEventListener('click', () => openModal(movie));
        grid.appendChild(card);
    });
}

async function openModal(movie) {
    currentMovie = movie;
    document.getElementById('m-poster').src = movie.poster || '';
    document.getElementById('m-poster').style.display = movie.poster ? 'block' : 'none';
    document.getElementById('m-title').textContent = movie.title || movie.filename;
    document.getElementById('m-year').textContent = movie.year || '';
    document.getElementById('m-rating').textContent = movie.rating ? '⭐ ' + movie.rating.toFixed(1) + ' / 10' : '';
    document.getElementById('m-overview').textContent = movie.overview || 'No description available.';

    const actions = document.querySelector('.modal-actions');
    if (movie.type === 'tv') {
        const res = await fetch('/tvshows/episodes?show=' + encodeURIComponent(movie.showName));
        const episodes = await res.json();
        actions.innerHTML = '<div style="display:flex;flex-direction:column;gap:6px;width:100%;max-height:200px;overflow-y:auto;padding-right:4px;">' +
            episodes.map(ep => `<button onclick="playEpisode('${movie.showName.replace(/'/g,"\'")}','${ep.file.replace(/'/g,"\'")}')"
                style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#e0e0e0;font-family:'Advent Pro',sans-serif;font-size:12px;padding:8px 12px;text-align:left;cursor:pointer;transition:background 0.15s;"
                onmouseover="this.style.background='rgba(0,212,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.06)'">
                ${ep.name}
            </button>`).join('') +
        '</div>';
    } else {
        actions.innerHTML = '<button class="btn-play" onclick="playMovie()"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play</button>';
    }

    document.getElementById('modal').style.display = 'flex';
}

function playEpisode(show, episode) {
    const file = encodeURIComponent(show + '/' + episode);
    window.open('/player.html?tvfile=' + file, '_blank');
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

function playMovie() {
    if (!currentMovie) return;
    window.open('/player.html?file=' + encodeURIComponent(currentMovie.filename), '_blank');
}

document.getElementById('search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderGrid(allMovies.filter(m => (m.title || m.filename).toLowerCase().includes(q)));
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
});

loadMovies();

async function setSection(section, btn) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (section === 'tvshows') {
        const res = await fetch('/tvshows');
        const shows = await res.json();
        renderGrid(shows);
    } else {
        renderGrid(allMovies.filter(m => !m.filename?.toLowerCase().includes('tv shows') && !m.filename?.toLowerCase().includes('tvshows')));
    }
}
