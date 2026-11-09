CREATE OR ALTER PROCEDURE dbo.sp_GetAdminLogin
    @username VARCHAR(50)
WITH EXECUTE AS OWNER
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP (1) u.UserID, u.Username, u.PasswordHash
    FROM dbo.Users AS u
    INNER JOIN dbo.UserRoles AS ur ON ur.UserID = u.UserID
    INNER JOIN dbo.Roles AS r ON r.RoleID = ur.RoleID
    WHERE u.Username = @username
      AND u.IsActive = 1
      AND r.RoleName = 'Administrator';
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetClientLogin
    @username VARCHAR(50)
WITH EXECUTE AS OWNER
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP (1) u.UserID, u.Username, u.PasswordHash
    FROM dbo.Users AS u
    INNER JOIN dbo.UserRoles AS ur ON ur.UserID = u.UserID
    INNER JOIN dbo.Roles AS r ON r.RoleID = ur.RoleID
    WHERE u.Username = @username
      AND u.IsActive = 1
      AND r.RoleName = 'Client';
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ValidateClient
    @userId INT
WITH EXECUTE AS OWNER
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP (1) u.UserID
    FROM dbo.Users AS u
    INNER JOIN dbo.UserRoles AS ur ON ur.UserID = u.UserID
    INNER JOIN dbo.Roles AS r ON r.RoleID = ur.RoleID
    WHERE u.UserID = @userId
      AND u.IsActive = 1
      AND r.RoleName = 'Client';
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_RegisterClient
    @username VARCHAR(50),
    @email VARCHAR(100),
    @passwordHash VARCHAR(255),
    @ipAddress VARCHAR(45)
WITH EXECUTE AS OWNER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ClientRoleID INT = (
        SELECT RoleID FROM dbo.Roles WHERE RoleName = 'Client'
    );
    IF @ClientRoleID IS NULL
        THROW 50002, 'The Client role is missing. Create it before registering accounts.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO dbo.Users (Username, Email, PasswordHash)
        VALUES (@username, @email, @passwordHash);

        DECLARE @UserID INT = SCOPE_IDENTITY();
        INSERT INTO dbo.UserRoles (UserID, RoleID)
        VALUES (@UserID, @ClientRoleID);

        INSERT INTO dbo.SystemLogs (UserID, ActionType, Description, IpAddress)
        VALUES (@UserID, 'REGISTER', 'New client account created successfully.', @ipAddress);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_LogBookView
    @userId INT,
    @bookId INT,
    @bookTitle VARCHAR(200),
    @ipAddress VARCHAR(45)
WITH EXECUTE AS OWNER
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.SystemLogs (UserID, ActionType, Description, IpAddress)
    VALUES (
        @userId,
        'BOOK_VIEW',
        CONCAT('Viewed book: ', @bookTitle, ' (Project Gutenberg ID: ', @bookId, ').'),
        @ipAddress
    );
END;
GO

IF DATABASE_PRINCIPAL_ID(N'AppApiRole') IS NULL
    CREATE ROLE AppApiRole;
GO

GRANT EXECUTE ON dbo.sp_GetAdminLogin TO AppApiRole;
GRANT EXECUTE ON dbo.sp_GetClientLogin TO AppApiRole;
GRANT EXECUTE ON dbo.sp_ValidateClient TO AppApiRole;
GRANT EXECUTE ON dbo.sp_RegisterClient TO AppApiRole;
GRANT EXECUTE ON dbo.sp_LogBookView TO AppApiRole;
GRANT SELECT ON dbo.vw_SystemAuditLogs TO AppApiRole;
GO
