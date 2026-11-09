require('dotenv').config();

const path = require('node:path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const books = require('./books-data');

const app = express();
const port = Number(process.env.PORT || 3000);
const dbAuth = process.env.DB_AUTH || 'sql';
if (dbAuth !== 'sql' && dbAuth !== 'windows') {
    throw new Error('DB_AUTH must be either "sql" or "windows".');
}
const sql = dbAuth === 'windows'
    ? require('mssql/msnodesqlv8')
    : require('mssql');
const jwtSecret = process.env.JWT_SECRET;
const tokenIssuer = 'online-bookstore';
const tokenAudience = 'online-bookstore-admin';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port.');
}
if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('Set JWT_SECRET to a random secret of at least 32 characters.');
}

const sqlOptions = {
    encrypt: process.env.DB_ENCRYPT !== 'false',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
};

const sqlServer = required('DB_SERVER');
const sqlDatabase = required('DB_NAME');
const sqlPool = { max: 10, min: 0, idleTimeoutMillis: 30000 };
let sqlConfig;
if (dbAuth === 'windows') {
    const server = process.env.DB_INSTANCE
        ? `${sqlServer}\\${process.env.DB_INSTANCE}`
        : sqlServer;
    const driver = process.env.DB_ODBC_DRIVER || 'ODBC Driver 18 for SQL Server';
    const encrypt = sqlOptions.encrypt ? 'Yes' : 'No';
    const trustServerCertificate = sqlOptions.trustServerCertificate ? 'Yes' : 'No';
    sqlConfig = {
        connectionString: `Driver=${odbcValue(driver)};Server=${odbcValue(server)};Database=${odbcValue(sqlDatabase)};Trusted_Connection=Yes;Encrypt=${encrypt};TrustServerCertificate=${trustServerCertificate};`,
        pool: sqlPool
    };
} else {
    sqlConfig = {
        server: sqlServer,
        database: sqlDatabase,
        user: required('DB_USER'),
        password: required('DB_PASSWORD'),
        options: sqlOptions,
        pool: sqlPool
    };
    if (process.env.DB_INSTANCE) sqlOptions.instanceName = process.env.DB_INSTANCE;
    if (process.env.DB_PORT && !process.env.DB_INSTANCE) {
        sqlConfig.port = Number(process.env.DB_PORT);
    }
}

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"]
        }
    }
}));
app.use(express.json({ limit: '10kb' }));

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Try again later.' }
});

app.post('/api/client/register', loginLimiter, async (req, res) => {
    const { username, email, password } = req.body || {};
    if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string'
        || username.trim().length < 3 || username.trim().length > 50
        || email.trim().length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        || password.length < 6 || password.length > 1024) {
        return res.status(400).json({
            error: 'Enter a username (3–50 characters), valid email, and password of at least 6 characters.'
        });
    }

    const pool = await sql.connect(sqlConfig);
    const passwordHash = await bcrypt.hash(password, 12);
    try {
        await pool.request()
            .input('username', sql.VarChar(50), username.trim())
            .input('email', sql.VarChar(100), email.trim())
            .input('passwordHash', sql.VarChar(255), passwordHash)
            .input('ipAddress', sql.VarChar(45), (req.ip || 'unknown').slice(0, 45))
            .execute('dbo.sp_RegisterClient');
    } catch (error) {
        if (error.number === 2601 || error.number === 2627) {
            return res.status(409).json({ error: 'That username or email is already registered.' });
        }
        throw error;
    }
    return res.status(201).json({ username: username.trim() });
});

app.post('/api/client/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string'
        || !username.trim() || username.length > 50 || !password || password.length > 1024) {
        return res.status(400).json({ error: 'Enter a valid username and password.' });
    }

    const pool = await sql.connect(sqlConfig);
    const result = await pool.request()
        .input('username', sql.VarChar(50), username.trim())
        .execute('dbo.sp_GetClientLogin');
    const client = result.recordset[0];
    if (!client || !(await bcrypt.compare(password, client.PasswordHash))) {
        return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = jwt.sign(
        { role: 'client', username: client.Username },
        jwtSecret,
        { subject: String(client.UserID), issuer: tokenIssuer, audience: tokenAudience, expiresIn: '1h' }
    );
    return res.json({ token });
});

app.get('/api/books', requireClient, (req, res) => res.json({ books }));

app.post('/api/books/:bookId/view', requireClient, async (req, res) => {
    if (!/^\d+$/.test(req.params.bookId)) {
        return res.status(404).json({ error: 'Book not found.' });
    }

    const bookId = Number(req.params.bookId);
    if (!Number.isSafeInteger(bookId)) {
        return res.status(404).json({ error: 'Book not found.' });
    }

    const book = books.find(item => item.id === bookId);
    if (!book) return res.status(404).json({ error: 'Book not found.' });

    const pool = await sql.connect(sqlConfig);
    await pool.request()
        .input('userId', sql.Int, Number(req.client.sub))
        .input('bookId', sql.Int, book.id)
        .input('bookTitle', sql.VarChar(200), book.title)
        .input('ipAddress', sql.VarChar(45), (req.ip || 'unknown').slice(0, 45))
        .execute('dbo.sp_LogBookView');

    return res.status(204).end();
});

app.post('/api/admin/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string'
        || !username.trim() || !password || username.length > 50 || password.length > 1024) {
        return res.status(400).json({ error: 'Enter a valid username and password.' });
    }

    const pool = await sql.connect(sqlConfig);
    const result = await pool.request()
        .input('username', sql.VarChar(50), username.trim())
        .execute('dbo.sp_GetAdminLogin');
    const admin = result.recordset[0];
    if (!admin || !(await bcrypt.compare(password, admin.PasswordHash))) {
        return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = jwt.sign(
        { role: 'admin', username: admin.Username },
        jwtSecret,
        { subject: String(admin.UserID), issuer: tokenIssuer, audience: tokenAudience, expiresIn: '1h' }
    );
    return res.json({ token });
});

app.get('/api/admin/logs', requireAdmin, async (req, res) => {
    const pool = await sql.connect(sqlConfig);
    const result = await pool.request().query(`
        SELECT TOP (200) LogID, Username, ActionType, Description, IpAddress, Timestamp
        FROM dbo.vw_SystemAuditLogs
        ORDER BY Timestamp DESC, LogID DESC
    `);
    return res.json({
        columns: result.recordset.columns.map(column => column.name),
        rows: result.recordset
    });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'styles.css')));
app.get('/script.js', (req, res) => res.sendFile(path.join(__dirname, 'script.js')));
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((req, res) => res.status(404).send('Not found'));

app.use((error, req, res, next) => {
    console.error(error);
    const status = error.status === 400 ? 400 : 500;
    return res.status(status).json({
        error: status === 400 ? 'Invalid request.' : 'The server could not complete the request.'
    });
});

function requireAdmin(req, res, next) {
    const authorization = req.get('authorization') || '';
    const match = authorization.match(/^Bearer ([^\s]+)$/);
    if (!match) return res.status(401).json({ error: 'Administrator sign-in required.' });

    try {
        const claims = jwt.verify(match[1], jwtSecret, {
            issuer: tokenIssuer,
            audience: tokenAudience
        });
        if (claims.role !== 'admin' || !claims.sub) {
            return res.status(403).json({ error: 'Administrator access required.' });
        }
        req.admin = claims;
        return next();
    } catch (error) {
        return res.status(401).json({ error: 'Your sign-in has expired. Please sign in again.' });
    }
}

function requireClient(req, res, next) {
    const authorization = req.get('authorization') || '';
    const match = authorization.match(/^Bearer ([^\s]+)$/);
    if (!match) return res.status(401).json({ error: 'Sign in to browse the books.' });

    let claims;
    try {
        claims = jwt.verify(match[1], jwtSecret, {
            issuer: tokenIssuer,
            audience: tokenAudience
        });
    } catch (error) {
        return res.status(401).json({ error: 'Your sign-in has expired. Please sign in again.' });
    }
    if (claims.role !== 'client' || !/^\d+$/.test(claims.sub || '')) {
        return res.status(403).json({ error: 'A client account is required to browse the books.' });
    }

    sql.connect(sqlConfig).then(pool => pool.request()
        .input('userId', sql.Int, Number(claims.sub))
        .execute('dbo.sp_ValidateClient')
    ).then(result => {
        if (!result.recordset.length) {
            return res.status(401).json({ error: 'This account is no longer active. Please sign in again.' });
        }
        req.client = claims;
        return next();
    }).catch(next);
}

function required(name) {
    const value = process.env[name];
    if (!value) throw new Error(`Set ${name} in your local .env file.`);
    return value;
}

function odbcValue(value) {
    return `{${value.replace(/}/g, '}}')}}`;
}

const server = app.listen(port, () => {
    console.log(`Online Bookstore running at http://localhost:${port}`);
});

async function shutdown() {
    server.close(async () => {
        await sql.close();
        process.exit(0);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
