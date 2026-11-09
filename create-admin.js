require('dotenv').config();

const bcrypt = require('bcryptjs');
const sql = require('mssql');

async function main() {
    const username = process.env.ADMIN_USERNAME;
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!username || !email || !password) {
        throw new Error('Set ADMIN_USERNAME, ADMIN_EMAIL, and ADMIN_PASSWORD for this command.');
    }
    if (username.length > 50 || email.length > 100 || password.length < 12) {
        throw new Error('Username must be at most 50 characters, email at most 100 characters, and password at least 12 characters.');
    }

    const pool = await sql.connect(getSqlConfig());
    try {
        const passwordHash = await bcrypt.hash(password, 12);
        await pool.request()
            .input('username', sql.VarChar(50), username)
            .input('email', sql.VarChar(100), email)
            .input('passwordHash', sql.VarChar(255), passwordHash)
            .query(`
                SET XACT_ABORT ON;
                BEGIN TRY
                    BEGIN TRANSACTION;

                    DECLARE @AdministratorRoleID int = (
                        SELECT RoleID FROM dbo.Roles WHERE RoleName = 'Administrator'
                    );
                    IF @AdministratorRoleID IS NULL
                        THROW 50001, 'The Administrator role is missing. Run the database schema script first.', 1;

                    INSERT INTO dbo.Users (Username, Email, PasswordHash)
                    VALUES (@username, @email, @passwordHash);

                    DECLARE @UserID int = SCOPE_IDENTITY();
                    INSERT INTO dbo.UserRoles (UserID, RoleID)
                    VALUES (@UserID, @AdministratorRoleID);

                    COMMIT TRANSACTION;
                END TRY
                BEGIN CATCH
                    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
                    THROW;
                END CATCH;
            `);
        console.log(`Administrator "${username}" created.`);
    } finally {
        await pool.close();
    }
}

function getSqlConfig() {
    const options = {
        encrypt: process.env.DB_ENCRYPT !== 'false',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
    };
    if (process.env.DB_INSTANCE) options.instanceName = process.env.DB_INSTANCE;

    const config = {
        server: required('DB_SERVER'),
        database: required('DB_NAME'),
        user: required('ADMIN_DB_USER'),
        password: required('ADMIN_DB_PASSWORD'),
        options
    };
    if (process.env.DB_PORT && !process.env.DB_INSTANCE) {
        config.port = Number(process.env.DB_PORT);
    }
    return config;
}

function required(name) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing ${name} in the local environment.`);
    return value;
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
