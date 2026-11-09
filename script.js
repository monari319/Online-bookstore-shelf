let books = [];
const adminTokenKey = 'bookstoreAdminToken';
const clientTokenKey = 'bookstoreClientToken';
const clientTokenExpiryKey = 'bookstoreClientTokenExpiry';
let activeGenre = 'all';
let searchTerm = '';
let clientLogoutTimer;

// Initialize Page
document.addEventListener('DOMContentLoaded', () => {
    switchAuthTab('login');
    updateNavigation('auth');
    document.querySelectorAll('[data-section]').forEach(button => {
        button.addEventListener('click', event => {
            if (button.tagName === 'A') event.preventDefault();
            showSection(button.dataset.section);
        });
    });
    document.querySelectorAll('[data-auth-tab]').forEach(button => {
        button.addEventListener('click', () => switchAuthTab(button.dataset.authTab));
    });
    document.getElementById('loginForm').addEventListener('submit', handleClientLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('showForgotPasswordButton').addEventListener('click', () => toggleForgotPassword(true));
    document.getElementById('cancelPasswordResetButton').addEventListener('click', () => toggleForgotPassword(false));
    document.getElementById('requestPasswordResetButton').addEventListener('click', handlePasswordReset);
    document.getElementById('clientLogoutButton').addEventListener('click', logoutClient);
    if (sessionStorage.getItem(clientTokenKey)) {
        scheduleClientLogout();
        if (sessionStorage.getItem(clientTokenKey)) openLibrary();
    }
    document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);
    document.getElementById('adminLogoutButton').addEventListener('click', logoutAdmin);
    document.getElementById('bookSearch').addEventListener('input', event => {
        searchTerm = event.target.value.trim().toLocaleLowerCase();
        renderBooks();
    });
    document.getElementById('genreFilter').addEventListener('change', event => {
        activeGenre = event.target.value;
        renderBooks();
    });
    document.addEventListener('keydown', event => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
            event.preventDefault();
            if (sessionStorage.getItem(clientTokenKey)) {
                showSection('browse');
                document.getElementById('bookSearch').focus();
            }
        }
    });
});

// Section Navigation Switcher
function showSection(sectionName) {
    document.getElementById('browseSection').classList.add('hidden');
    document.getElementById('authShell').classList.add('hidden');
    document.getElementById('adminShell').classList.add('hidden');
    if (sectionName === 'browse') {
        if (!sessionStorage.getItem(clientTokenKey)) {
            sectionName = 'auth';
            document.getElementById('authShell').classList.remove('hidden');
            showAlert('Sign in or create an account to browse the books.', 'error');
        } else {
            document.getElementById('browseSection').classList.remove('hidden');
        }
    }
    if (sectionName === 'auth') document.getElementById('authShell').classList.remove('hidden');
    if (sectionName === 'admin') {
        document.getElementById('adminShell').classList.remove('hidden');
        if (sessionStorage.getItem(adminTokenKey)) {
            showAdminLogs();
        } else {
            document.getElementById('adminLogsPanel').classList.add('hidden');
            document.getElementById('adminLoginPanel').classList.remove('hidden');
        }
    }
    updateNavigation(sectionName);
    document.querySelectorAll('[data-section]').forEach(button => {
        button.classList.toggle('active', button.dataset.section === sectionName);
    });
}

function updateNavigation(sectionName) {
    const clientSignedIn = Boolean(sessionStorage.getItem(clientTokenKey));
    const adminSignedIn = Boolean(sessionStorage.getItem(adminTokenKey));
    document.getElementById('signInNavButton').classList.toggle('hidden', clientSignedIn || adminSignedIn);
    document.getElementById('clientLogoutButton').classList.toggle('hidden', !clientSignedIn);
    document.querySelector('.admin-link').classList.toggle(
        'hidden',
        clientSignedIn && !(adminSignedIn && sectionName === 'admin')
    );
}

// Switch between the two client account forms.
function switchAuthTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const regForm = document.getElementById('registerForm');
    const tabs = document.querySelectorAll('.tab-btn');

    loginForm.classList.toggle('hidden', tab !== 'login');
    regForm.classList.toggle('hidden', tab !== 'register');
    toggleForgotPassword(false);

    const activeTab = [...tabs].find(button => button.dataset.authTab === tab);
    tabs.forEach(button => {
        const selected = button === activeTab;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-selected', String(selected));
    });
}

function toggleForgotPassword(show) {
    document.getElementById('forgotPasswordPanel').classList.toggle('hidden', !show);
    document.getElementById('showForgotPasswordButton').classList.toggle('hidden', show);
    document.getElementById('showForgotPasswordButton').setAttribute('aria-expanded', String(show));
}

// Render Books
function populateGenres() {
    const filter = document.getElementById('genreFilter');
    [...new Set(books.map(book => book.genre))].sort().forEach(genre => {
        filter.add(new Option(genre, genre));
    });
}

function renderBooks() {
    const container = document.getElementById('bookList');
    const matchingBooks = books.filter(book => {
        const matchesGenre = activeGenre === 'all' || book.genre === activeGenre;
        const searchableText = `${book.title} ${book.author} ${book.genre}`.toLocaleLowerCase();
        return matchesGenre && searchableText.includes(searchTerm);
    });

    document.getElementById('resultsLabel').textContent =
        `${matchingBooks.length} ${matchingBooks.length === 1 ? 'book' : 'books'} to discover`;
    document.getElementById('emptyState').classList.toggle('hidden', matchingBooks.length > 0);
    container.replaceChildren(...matchingBooks.map(createBookCard));
}

function createBookCard(book) {
    const card = document.createElement('article');
    card.className = 'book-card';

    const cover = document.createElement('div');
    cover.className = `book-cover cover-${book.color}`;
    cover.setAttribute('aria-hidden', 'true');
    const coverFrame = document.createElement('div');
    coverFrame.className = 'cover-frame';
    const coverLabel = document.createElement('span');
    coverLabel.className = 'cover-label';
    coverLabel.textContent = 'OPEN SHELF CLASSICS';
    const coverTitle = document.createElement('span');
    coverTitle.className = 'cover-title';
    coverTitle.textContent = book.title;
    const coverAuthor = document.createElement('span');
    coverAuthor.className = 'cover-author';
    coverAuthor.textContent = book.author;
    coverFrame.append(coverLabel, coverTitle, coverAuthor);
    cover.appendChild(coverFrame);

    const details = document.createElement('div');
    details.className = 'book-details';
    const genre = document.createElement('p');
    genre.className = 'book-genre';
    genre.textContent = book.genre;
    const title = document.createElement('h3');
    title.textContent = book.title;
    const author = document.createElement('p');
    author.className = 'book-author';
    author.textContent = `by ${book.author}`;
    const description = document.createElement('p');
    description.className = 'book-description';
    description.textContent = book.description;
    const footer = document.createElement('div');
    footer.className = 'book-card-footer';
    const freeLabel = document.createElement('span');
    freeLabel.className = 'free-label';
    const freeIcon = document.createElement('span');
    freeIcon.setAttribute('aria-hidden', 'true');
    freeIcon.textContent = '✳';
    freeLabel.append(freeIcon, document.createTextNode(' FREE'));
    const readLink = document.createElement('a');
    readLink.className = 'read-link';
    readLink.href = `https://www.gutenberg.org/ebooks/${book.id}`;
    readLink.target = '_blank';
    readLink.rel = 'noopener noreferrer';
    readLink.textContent = 'Read free';
    readLink.setAttribute('aria-label', `Read ${book.title} free at Project Gutenberg`);
    readLink.addEventListener('click', () => {
        logBookView(book.id).catch(error => {
            showAlert(`We couldn't record this book view: ${error.message}`, 'error');
        });
    });
    footer.append(freeLabel, readLink);
    details.append(genre, title, author, description, footer);
    card.append(cover, details);
    return card;
}

async function logBookView(bookId) {
    const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/view`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + sessionStorage.getItem(clientTokenKey) }
    });
    if (!response.ok) {
        let errorMessage = 'Please try again.';
        try {
            const result = await response.json();
            if (result.error) errorMessage = result.error;
        } catch {
            errorMessage = `The server returned HTTP ${response.status}.`;
        }
        throw new Error(errorMessage);
    }
}

async function handleAdminLogin(event) {
    event.preventDefault();
    const status = document.getElementById('logStatus');
    status.textContent = 'Signing in...';

    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('adminUsername').value,
                password: document.getElementById('adminPassword').value
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to sign in.');

        sessionStorage.setItem(adminTokenKey, result.token);
        document.getElementById('adminLoginForm').reset();
        updateNavigation('admin');
        await showAdminLogs();
    } catch (error) {
        status.textContent = error.message;
    }
}

async function showAdminLogs() {
    document.getElementById('adminLoginPanel').classList.add('hidden');
    document.getElementById('adminLogsPanel').classList.remove('hidden');
    const status = document.getElementById('logStatus');
    status.textContent = 'Loading logs...';
    clearLogRows();

    try {
        const result = await adminRequest('/api/admin/logs');
        const head = document.getElementById('logTableHead');
        const headerRow = document.createElement('tr');
        result.columns.forEach(column => {
            const cell = document.createElement('th');
            cell.textContent = column;
            headerRow.appendChild(cell);
        });
        head.replaceChildren(headerRow);

        const body = document.getElementById('logTableBody');
        result.rows.forEach(row => {
            const tableRow = document.createElement('tr');
            result.columns.forEach(column => {
                const cell = document.createElement('td');
                const value = row[column];
                cell.textContent = value === null ? '' : String(value);
                tableRow.appendChild(cell);
            });
            body.appendChild(tableRow);
        });
        status.textContent = `Showing ${result.rows.length} recent audit log row(s).`;
    } catch (error) {
        status.textContent = error.message;
        if (error.status === 401) logoutAdmin();
    }
}

async function adminRequest(url) {
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem(adminTokenKey)}` }
    });
    const result = await response.json();
    if (!response.ok) {
        const error = new Error(result.error || 'The request failed.');
        error.status = response.status;
        throw error;
    }
    return result;
}

function clearLogRows() {
    document.getElementById('logTableHead').replaceChildren();
    document.getElementById('logTableBody').replaceChildren();
}

function logoutAdmin() {
    sessionStorage.removeItem(adminTokenKey);
    document.getElementById('adminLogsPanel').classList.add('hidden');
    document.getElementById('adminLoginPanel').classList.remove('hidden');
    document.getElementById('adminLoginForm').reset();
    document.getElementById('adminPassword').value = '';
    clearLogRows();
    document.getElementById('logStatus').textContent = 'You have been signed out.';
    updateNavigation('admin');
}

async function handleRegister(event) {
    event.preventDefault();
    const status = document.getElementById('authStatus');
    status.textContent = 'Creating your account...';
    try {
        const response = await fetch('/api/client/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('regUsername').value,
                email: document.getElementById('regEmail').value,
                password: document.getElementById('regPassword').value
            })
        });
        if (response.status === 405) {
            throw new Error('Registration did not reach the bookstore API: this website host does not allow POST requests to /api/client/register. Run or deploy the Express server as the website host so registrations can be saved to SQL Server.');
        }
        const responseBody = await response.text();
        let result;
        try {
            result = responseBody ? JSON.parse(responseBody) : {};
        } catch {
            throw new Error('The server returned an invalid response while creating your account. The account may have been created; try signing in before submitting again.');
        }
        if (!responseBody && response.ok) {
            throw new Error('The server returned an empty response while creating your account. The account may have been created; try signing in before submitting again.');
        }
        if (!response.ok) {
            throw new Error(result.error || `Unable to create account (HTTP ${response.status}). Please try again or contact support if the problem continues.`);
        }
        document.getElementById('registerForm').reset();
        document.getElementById('loginUsername').value = result.username;
        switchAuthTab('login');
        status.textContent = 'Account created. Sign in with your new username to open the library.';
    } catch (error) {
        status.textContent = error.message;
    }
}

async function handleClientLogin(event) {
    event.preventDefault();
    const status = document.getElementById('authStatus');
    status.textContent = 'Signing in...';
    try {
        const response = await fetch('/api/client/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('loginUsername').value,
                password: document.getElementById('loginPassword').value
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to sign in.');
        sessionStorage.setItem(clientTokenKey, result.token);
        sessionStorage.setItem(clientTokenExpiryKey, String(Date.now() + 60 * 60 * 1000));
        scheduleClientLogout();
        document.getElementById('loginForm').reset();
        toggleForgotPassword(false);
        status.textContent = '';
        await openLibrary();
    } catch (error) {
        status.textContent = error.message;
    }
}

async function clientRequest(url) {
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem(clientTokenKey)}` }
    });
    const result = await response.json();
    if (!response.ok) {
        const error = new Error(result.error || 'The request failed.');
        error.status = response.status;
        throw error;
    }
    return result;
}

async function openLibrary() {
    try {
        const response = await clientRequest('/api/books');
        if (!sessionStorage.getItem(clientTokenKey)) return;
        books = response.books;
        populateGenres();
        renderBooks();
        document.getElementById('clientLogoutButton').classList.remove('hidden');
        showSection('browse');
    } catch (error) {
        sessionStorage.removeItem(clientTokenKey);
        sessionStorage.removeItem(clientTokenExpiryKey);
        clearTimeout(clientLogoutTimer);
        document.getElementById('clientLogoutButton').classList.add('hidden');
        books = [];
        document.getElementById('bookList').replaceChildren();
        showSection('auth');
        showAlert(error.message || 'Please sign in to view the library.', 'error');
    }
}

function scheduleClientLogout() {
    clearTimeout(clientLogoutTimer);
    const expiresAt = Number(sessionStorage.getItem(clientTokenExpiryKey));
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        logoutClient();
        return;
    }
    clientLogoutTimer = setTimeout(logoutClient, expiresAt - Date.now());
}

function logoutClient() {
    clearTimeout(clientLogoutTimer);
    sessionStorage.removeItem(clientTokenKey);
    sessionStorage.removeItem(clientTokenExpiryKey);
    books = [];
    activeGenre = 'all';
    searchTerm = '';
    document.getElementById('bookSearch').value = '';
    document.getElementById('genreFilter').replaceChildren(new Option('All stories', 'all'));
    document.getElementById('bookList').replaceChildren();
    document.getElementById('clientLogoutButton').classList.add('hidden');
    document.getElementById('authStatus').textContent = 'You have been signed out.';
    document.getElementById('loginPassword').value = '';
    switchAuthTab('login');
    showSection('auth');
}

// Handle Form Submission: Request Password Reset (Calls sp_RequestPasswordReset via API in production)
function handlePasswordReset() {
    const email = document.getElementById('resetEmail');
    if (!email.reportValidity()) return;
    document.getElementById('authStatus').textContent =
        'Password reset is not configured yet. Contact an administrator for help.';
}

// Helper: Show Feedback Alerts
function showAlert(message, type) {
    const alertBox = document.getElementById('alertBox');
    alertBox.className = `alert alert-${type}`;
    alertBox.innerText = message;
    alertBox.classList.remove('hidden');

    setTimeout(() => {
        alertBox.classList.add('hidden');
    }, 4000);
}