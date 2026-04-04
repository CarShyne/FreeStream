async function loadMovies() {
    const res = await fetch('/api/movies');
    const movies = await res.json();
    const grid = document.getElementById('grid');
    grid.innerHTML = '';

    movies.forEach(movie => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <img src="${movie.poster || 'placeholder.png'}" alt="${movie.title}">
            <div class="title">${movie.title}</div>
        `;
        card.addEventListener('click', () => playMovie(movie));
        grid.appendChild(card);
    });
}

function playMovie(movie) {
    // Opens movie in browser tab (can be changed to DLNA or SMB trigger)
    window.open(movie.filePath, '_blank');
}

loadMovies();
