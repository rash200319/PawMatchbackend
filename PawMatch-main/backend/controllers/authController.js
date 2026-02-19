const crypto = require('crypto');
const db = require('../config/db');
const { logActivity } = require('../utils/logger');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const emailService = require('../services/emailService');
const nicValidator = require('../utils/nicValidator');

// Helper to generate 6 digit OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

exports.register = async (req, res) => {
    try {
        const { name, email, password, phone, nic, role, shelter_name } = req.body;

        // 1. Basic Validation
        const userRole = role === 'shelter' ? 'shelter' : 'adopter';

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Please enter all required fields' });
        }

        // 2. NIC/Registration Number Validation
        let cleanNic = null;
        if (nic) {
            if (userRole === 'adopter') {
                const nicValidation = nicValidator(nic);
                if (!nicValidation.valid) {
                    return res.status(400).json({ error: `Invalid NIC: ${nicValidation.error}` });
                }
                cleanNic = nicValidation.nic;
            } else {
                cleanNic = nic.trim();
            }
        }

        // 3. Check if user exists
        const userCheck = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // 4. Hash Password & Generate OTP
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Generate 6-digit OTP
        const otp = generateOTP();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

        // 5. Handle Pending Users
        const pendingCheck = await db.query('SELECT * FROM pending_users WHERE email = ?', [email]);

        if (pendingCheck.rows.length > 0) {
            await db.query(
                'UPDATE pending_users SET name = ?, password_hash = ?, phone_number = ?, nic = ?, role = ?, shelter_name = ?, otp_hash = ?, otp_expires_at = ? WHERE email = ?',
                [name, hashedPassword, phone || null, cleanNic, userRole, shelter_name || null, otp, otpExpiresAt, email]
            );
        } else {
            await db.query(
                'INSERT INTO pending_users (name, email, password_hash, phone_number, role, shelter_name, is_verified, nic, otp_hash, otp_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [name, email, hashedPassword, phone || null, userRole, shelter_name || null, false, cleanNic, otp, otpExpiresAt]
            );
        }

        // Send OTP via SendGrid
        await emailService.sendOTP(email, otp);

        res.status(200).json({
            success: true,
            message: 'Verification code sent to your email.',
            requiresVerification: true,
            email: email
        });

    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ error: 'Server Error' });
    }
};

exports.verifyEmail = async (req, res) => {
    // Get a dedicated connection for Transaction
    const connection = await db.pool.getConnection();

    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ error: 'Email and OTP are required' });
        }

        // 1. Find in Pending
        const [pendingUsers] = await connection.query('SELECT * FROM pending_users WHERE email = ?', [email]);
        if (pendingUsers.length === 0) {
            connection.release();
            return res.status(400).json({ error: 'Verification record not found or already verified' });
        }

        const pendingUser = pendingUsers[0];

        // 2. Check Expiry (Optional for TOTP but good for cleanup)
        if (new Date() > new Date(pendingUser.otp_expires_at)) {
            connection.release();
            return res.status(400).json({ error: 'Verification window expired' });
        }

        // 3. Verify OTP Code
        if (pendingUser.otp_hash !== otp) {
            connection.release();
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        // --- START TRANSACTION ---
        await connection.beginTransaction();

        try {
            // 4. Insert into Base Table (USERS)
            // Fix: Include name, phone, etc. for backward compatibility with controllers that still read from 'users'
            const [insertRes] = await connection.query(
                `INSERT INTO users (email, password_hash, role, is_email_verified, name, phone_number, shelter_name, nic) 
                 VALUES (?, ?, ?, TRUE, ?, ?, ?, ?)`,
                [
                    pendingUser.email,
                    pendingUser.password_hash,
                    pendingUser.role,
                    pendingUser.name,
                    pendingUser.phone_number,
                    pendingUser.role === 'shelter' ? (pendingUser.shelter_name || pendingUser.name) : null,
                    pendingUser.nic
                ]
            );

            const newUserId = insertRes.insertId;

            // 5. Insert into Profile Table based on Role
            if (pendingUser.role === 'shelter') {
                await connection.query(
                    'INSERT INTO shelters (user_id, organization_name, contact_number, registration_number, verification_status) VALUES (?, ?, ?, ?, ?)',
                    [
                        newUserId,
                        pendingUser.shelter_name || pendingUser.name,
                        pendingUser.phone_number,
                        pendingUser.nic, // Mapping NIC field to Registration Number for shelters
                        'unverified' // Default status for new shelters
                    ]
                );
            } else if (pendingUser.role === 'admin') {
                await connection.query(
                    'INSERT INTO admins (user_id, full_name, department) VALUES (?, ?, ?)',
                    [newUserId, pendingUser.name, 'General']
                );
            } else {
                // Default: Adopter
                await connection.query(
                    'INSERT INTO adopters (user_id, full_name, phone_number) VALUES (?, ?, ?)',
                    [newUserId, pendingUser.name, pendingUser.phone_number]
                );
            }

            // 6. Delete from Pending
            await connection.query('DELETE FROM pending_users WHERE id = ?', [pendingUser.id]);

            // Commit Transaction
            await connection.commit();

            // 7. Generate Token
            // We need to construct the payload carefully since we just inserted the data
            const payload = {
                user: {
                    id: newUserId,
                    email: pendingUser.email,
                    role: pendingUser.role,
                    // For convenience, add the name/shelter name to the token
                    name: pendingUser.name,
                    shelter_name: pendingUser.role === 'shelter' ? pendingUser.shelter_name : undefined,
                    verification_status: pendingUser.role === 'shelter' ? 'unverified' : undefined
                }
            };

            jwt.sign(
                payload,
                process.env.JWT_SECRET || 'secret123',
                { expiresIn: '1d' },
                (err, token) => {
                    if (err) throw err;
                    res.json({
                        success: true,
                        message: 'Email successfully verified',
                        token,
                        user: payload.user
                    });
                }
            );

        } catch (txErr) {
            // Rollback if any insert fails
            await connection.rollback();
            console.error("Transaction Error during verification:", txErr);
            throw txErr;
        }

    } catch (error) {
        console.error('Verification Error:', error);
        res.status(500).json({ error: 'Server Error' });
    } finally {
        // Always release the connection
        if (connection) connection.release();
    }
};

exports.resendOTP = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: "Email is required" });

        const pendingCheck = await db.query('SELECT * FROM pending_users WHERE email = ?', [email]);
        if (pendingCheck.rows.length === 0) {
            // Check if already verified
            const userCheck = await db.query('SELECT * FROM users WHERE email = ?', [email]);
            if (userCheck.rows.length > 0) {
                return res.status(400).json({ error: "User already verified" });
            }
            return res.status(404).json({ error: "Verification record not found" });
        }

        const pendingUser = pendingCheck.rows[0];
        const otp = generateOTP();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await db.query(
            'UPDATE pending_users SET otp_hash = ?, otp_expires_at = ? WHERE email = ?',
            [otp, otpExpiresAt, email]
        );

        // Send OTP via SendGrid
        await emailService.sendOTP(email, otp);

        res.json({
            success: true,
            message: "Verification code resent to your email."
        });

    } catch (error) {
        console.error("Resend OTP Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

exports.validateNIC = async (req, res) => {
    try {
        const { nic } = req.body;

        if (!nic) {
            return res.status(400).json({ valid: false, error: "NIC is required" });
        }

        const validation = nicValidator(nic);

        if (!validation.valid) {
            return res.json({
                valid: false,
                error: validation.error
            });
        }

        // Return validation details
        res.json({
            valid: true,
            nic: validation.nic,
            type: validation.type,
            birthYear: validation.birthYear,
            gender: validation.gender,
            dayOfYear: validation.dayOfYear,
            isLeapYear: validation.isLeapYear
        });

    } catch (error) {
        console.error("NIC Validation Error:", error);
        res.status(500).json({ valid: false, error: "Server Error" });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password, requiredRole } = req.body;

        // 1. Check User in Base Table
        const users = await db.query('SELECT * FROM users WHERE email = ?', [email]);

        if (users.rows.length === 0) {
            // Check pending
            const pending = await db.query('SELECT * FROM pending_users WHERE email = ?', [email]);
            if (pending.rows.length > 0) {
                return res.status(403).json({
                    error: 'Please verify your email before logging in.',
                    requiresVerification: true,
                    email: email
                });
            }
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const user = users.rows[0];

        // 2. Validate Role
        if (requiredRole && user.role !== requiredRole && user.role !== 'admin') {
            const roleName = requiredRole === 'shelter' ? 'shelter' : 'user';
            return res.status(401).json({
                error: `This account is not registered as a ${roleName}. Please use the correct sign-in page.`
            });
        }

        // 3. Validate Password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // 4. Fetch Profile Data (Because 'name' is no longer in 'users' table)
        let profileName = "User";
        let extraData = {};

        if (user.role === 'shelter') {
            const profileRes = await db.query('SELECT organization_name, verification_status, shelter_logo_url FROM shelters WHERE user_id = ?', [user.id]);
            const profileRows = profileRes.rows || profileRes;
            if (profileRows.length > 0) {
                const p = profileRows[0];
                profileName = p.organization_name || user.name || "Shelter";
                extraData.shelter_name = p.organization_name || user.name || "Shelter";
                extraData.verification_status = p.verification_status;
                extraData.shelter_logo_url = p.shelter_logo_url;
            }
        } else if (user.role === 'admin') {
            const profileRes = await db.query('SELECT full_name FROM admins WHERE user_id = ?', [user.id]);
            if (profileRes.rows.length > 0) {
                profileName = profileRes.rows[0].full_name;
            }
        } else {
            // Adopter
            const profileRes = await db.query('SELECT full_name FROM adopters WHERE user_id = ?', [user.id]);
            if (profileRes.rows.length > 0) {
                profileName = profileRes.rows[0].full_name;
            }
        }

        // 5. Build Token
        const payload = {
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                name: profileName,
                ...extraData
            }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET || 'secret123',
            { expiresIn: '1d' },
            (err, token) => {
                if (err) throw err;
                res.json({ success: true, token, user: payload.user });
            }
        );
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ error: 'Server Error' });
    }
};

exports.getMe = async (req, res) => {
    try {
        const userId = req.user.id;

        // 1. Get Base User
        const userRes = await db.query('SELECT id, email, role, is_email_verified FROM users WHERE id = ?', [userId]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const user = userRes.rows[0];

        let profile = {};

        // 2. Get Profile details from specific tables
        if (user.role === 'shelter') {
            const pRes = await db.query(`
                SELECT 
                    organization_name, contact_number, verification_status, registration_number,
                    shelter_code, shelter_slug, shelter_description,
                    shelter_logo_url, shelter_banner_url, shelter_social_links,
                    shelter_website, shelter_tagline, latitude, longitude
                FROM shelters 
                WHERE user_id = ?
            `, [userId]);
            const pRows = pRes.rows || pRes;
            if (pRows.length > 0) {
                const p = pRows[0];
                profile = {
                    name: p.organization_name || user.name || "Shelter",
                    shelter_name: p.organization_name || user.name || "Shelter",
                    phone_number: p.contact_number || user.phone_number,
                    verification_status: p.verification_status,
                    registration_number: p.registration_number,
                    shelter_code: p.shelter_code,
                    shelter_slug: p.shelter_slug,
                    shelter_description: p.shelter_description,
                    shelter_logo_url: p.shelter_logo_url,
                    shelter_banner_url: p.shelter_banner_url,
                    shelter_social_links: p.shelter_social_links,
                    shelter_website: p.shelter_website,
                    shelter_tagline: p.shelter_tagline,
                    latitude: p.latitude,
                    longitude: p.longitude
                };
            }
        } else if (user.role === 'admin') {
            const pRes = await db.query('SELECT full_name, department FROM admins WHERE user_id = ?', [userId]);
            const pRows = pRes.rows || [];
            if (pRows.length > 0) {
                profile = {
                    name: pRows[0].full_name,
                    department: pRows[0].department
                };
            }
        } else {
            // Adopter
            const pRes = await db.query('SELECT full_name, phone_number, pawsonality_results FROM adopters WHERE user_id = ?', [userId]);
            const pRows = pRes.rows || [];
            if (pRows.length > 0) {
                profile = {
                    name: pRows[0].full_name,
                    phone_number: pRows[0].phone_number,
                    pawsonality_results: pRows[0].pawsonality_results
                };
            }
        }

        res.json({
            ...user,
            ...profile
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
};

exports.updateProfile = async (req, res) => {
    const { name, phone_number } = req.body;
    const userId = req.user.id;

    try {
        const userRes = await db.query('SELECT role FROM users WHERE id = ?', [userId]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const role = userRes.rows[0].role;

        // Update BOTH tables to maintain consistency
        if (role === 'shelter') {
            await db.query(
                'UPDATE shelters SET organization_name = COALESCE(?, organization_name), contact_number = COALESCE(?, contact_number) WHERE user_id = ?',
                [name, phone_number, userId]
            );
            await db.query(
                'UPDATE users SET name = COALESCE(?, name), shelter_name = COALESCE(?, shelter_name), phone_number = COALESCE(?, phone_number) WHERE id = ?',
                [name, name, phone_number, userId]
            );
        } else if (role === 'admin') {
            await db.query(
                'UPDATE admins SET full_name = COALESCE(?, full_name) WHERE user_id = ?',
                [name, userId]
            );
            await db.query(
                'UPDATE users SET name = COALESCE(?, name) WHERE id = ?',
                [name, userId]
            );
        } else {
            // Adopter
            await db.query(
                'UPDATE adopters SET full_name = COALESCE(?, full_name), phone_number = COALESCE(?, phone_number) WHERE user_id = ?',
                [name, phone_number, userId]
            );
            await db.query(
                'UPDATE users SET name = COALESCE(?, name), phone_number = COALESCE(?, phone_number) WHERE id = ?',
                [name, phone_number, userId]
            );
        }
        await logActivity(userId, 'PROFILE_UPDATE', { name, phone_number });
        res.json({ success: true, message: 'Profile updated' });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
};

// Forgot Password - Initiate
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: "Email is required" });

        const userRes = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        // Generate Reset Token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
        const resetExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 mins

        await db.query(
            'UPDATE users SET reset_token_hash = ?, reset_token_expires_at = ? WHERE email = ?',
            [resetTokenHash, resetExpiresAt, email]
        );

        // Construct Reset URL
        const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
        const resetUrl = `${baseUrl}/reset-password?token=${resetToken}&email=${email}`;

        res.json({ success: true, message: "Password reset link sent" });

        // Fire and forget email
        emailService.sendPasswordReset(email, resetUrl);
    } catch (error) {
        console.error("Forgot Password Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

// Reset Password - Complete
exports.resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ error: "Token and new password are required" });
        }

        const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

        const userRes = await db.query(
            'SELECT * FROM users WHERE reset_token_hash = ? AND reset_token_expires_at > NOW()',
            [resetTokenHash]
        );

        if (userRes.rows.length === 0) {
            return res.status(400).json({ error: "Invalid or expired token" });
        }

        const user = userRes.rows[0];

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);

        await db.query(
            'UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_token_expires_at = NULL WHERE id = ?',
            [passwordHash, user.id]
        );

        await logActivity(user.id, 'PASSWORD_RESET', { method: 'token' });
        res.json({ success: true, message: "Password successfully reset" });

    } catch (error) {
        console.error("Reset Password Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

// Update Password (logged in)
exports.updatePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        const userRes = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });

        const user = userRes.rows[0];

        const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ error: "Incorrect current password" });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);

        await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);

        await logActivity(userId, 'PASSWORD_UPDATE', {});
        res.json({ success: true, message: "Password updated successfully" });

    } catch (error) {
        console.error("Update Password Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

// Update Notifications
exports.updateNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const { email_notifications } = req.body;

        // Assuming toggle logic or specific boolean setting
        await db.query('UPDATE users SET email_notifications = ? WHERE id = ?', [email_notifications, userId]);

        res.json({ success: true, message: "Notification preferences updated" });
    } catch (error) {
        console.error("Update Notifications Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

// Delete Account
exports.deleteAccount = async (req, res) => {
    const connection = await db.pool.getConnection();
    try {
        const userId = req.user.id;
        await connection.beginTransaction();

        // 1. Delete specialized profile data first (if FKs exist but not cascading)
        // Check role to know which table
        const userRes = await connection.query('SELECT role FROM users WHERE id = ?', [userId]);
        if (userRes.rows.length > 0) {
            const role = userRes.rows[0].role;
            if (role === 'shelter') {
                await connection.query('DELETE FROM shelters WHERE user_id = ?', [userId]);
            } else if (role === 'admin') {
                await connection.query('DELETE FROM admins WHERE user_id = ?', [userId]);
            } else {
                await connection.query('DELETE FROM adopters WHERE user_id = ?', [userId]);
            }
        }

        // 2. Delete User
        await connection.query('DELETE FROM users WHERE id = ?', [userId]);

        await connection.commit();
        res.json({ success: true, message: "Account deleted successfully" });

    } catch (error) {
        await connection.rollback();
        console.error("Delete Account Error:", error);
        res.status(500).json({ error: "Server Error" });
    } finally {
        if (connection) connection.release();
    }
};

// Get Activity Logs
exports.getActivityLogs = async (req, res) => {
    try {
        const userId = req.user.id;
        const logs = await db.query(
            'SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
            [userId]
        );
        res.json(logs.rows);
    } catch (error) {
        console.error("Get Logs Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

exports.markNotificationsRead = async (req, res) => {
    try {
        res.json({ success: true });
    } catch (error) {
        console.error("Mark Notifications Read Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};
