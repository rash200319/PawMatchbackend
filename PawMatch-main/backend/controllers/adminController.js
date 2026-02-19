const db = require('../config/db');
const { upload, documentUpload } = require('../config/cloudinary');
const emailService = require('../services/emailService');

// Use specialized document upload (supports PDF)
exports.uploadVerificationDoc = documentUpload.single('document');

exports.submitVerification = async (req, res) => {
    try {
        const { registry_type, registration_number } = req.body;
        const idToUpdate = req.user.id;

        if (!req.file) {
            return res.status(400).json({ error: "Document is required" });
        }

        const docUrl = req.file.path;

        // Update both tables to maintain consistency
        await db.query(
            "UPDATE users SET registry_type = ?, registration_number = ?, verification_document_url = ?, verification_status = 'pending' WHERE id = ?",
            [registry_type, registration_number, docUrl, idToUpdate]
        );

        await db.query(
            "UPDATE shelters SET registry_type = ?, registration_number = ?, verification_document_url = ?, verification_status = 'pending' WHERE user_id = ?",
            [registry_type, registration_number, docUrl, idToUpdate]
        );

        res.json({ success: true, message: "Verification submitted successfully", verification_status: 'pending' });

    } catch (error) {
        console.error("Verification Submit Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

exports.getPendingShelters = async (req, res) => {
    try {
        const query = `
            SELECT 
                u.id, u.name, u.email, 
                COALESCE(s.organization_name, u.shelter_name, u.name) as shelter_name, 
                s.shelter_code, s.shelter_slug, 
                s.registry_type, s.registration_number, s.verification_document_url, 
                s.created_at 
            FROM users u
            JOIN shelters s ON u.id = s.user_id
            WHERE u.role = 'shelter' 
            AND s.verification_status = 'pending'
        `;
        const result = await db.query(query);
        res.json({ success: true, shelters: result.rows });
    } catch (error) {
        console.error("Get Pending Shelters Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

exports.verifyShelter = async (req, res) => {
    try {
        const { shelterId, action, reason } = req.body; // action: 'approve' or 'reject'

        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({ error: "Invalid action" });
        }

        const newStatus = action === 'approve' ? 'verified' : 'rejected';

        await db.query("UPDATE users SET verification_status = ? WHERE id = ?", [newStatus, shelterId]);
        await db.query("UPDATE shelters SET verification_status = ? WHERE user_id = ?", [newStatus, shelterId]);

        // Send email notification (mock)
        console.log(`Sending email to shelter ${shelterId}: Verification ${newStatus}. Reason: ${reason || 'N/A'}`);

        res.json({ success: true, message: `Shelter ${newStatus}` });

    } catch (error) {
        console.error("Verify Shelter Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

exports.getStats = async (req, res) => {
    try {
        // Mock stats for now, or real queries
        const shelterCount = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'shelter'");
        const verifiedCount = await db.query("SELECT COUNT(*) as count FROM shelters WHERE verification_status = 'verified'");
        const adoptionCount = await db.query("SELECT COUNT(*) as count FROM adoptions");

        const alertCount = await db.query("SELECT COUNT(*) as count FROM welfare_logs WHERE risk_flagged = TRUE");
        const reportCount = await db.query("SELECT COUNT(*) as count FROM animal_reports WHERE status = 'pending'");

        res.json({
            success: true,
            stats: {
                totalShelters: shelterCount.rows[0].count,
                verifiedShelters: verifiedCount.rows[0].count,
                totalAdoptions: adoptionCount.rows[0].count,
                activeAlerts: (alertCount.rows[0]?.count || 0) + (reportCount.rows[0]?.count || 0)
            }
        });
    } catch (error) {
        console.error("Get Stats Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

exports.getAllShelters = async (req, res) => {
    try {
        const query = `
            SELECT 
                u.id, u.name, u.email, 
                COALESCE(s.organization_name, u.shelter_name, u.name) as shelter_name, 
                s.shelter_code, s.shelter_slug, 
                s.verification_status, 
                s.created_at,
                (SELECT COUNT(*) FROM pets p WHERE p.shelter_id = u.id) as total_pets,
                (SELECT COUNT(*) FROM adoptions a JOIN pets p ON a.pet_id = p.id WHERE p.shelter_id = u.id AND a.status = 'active') as active_adoptions
            FROM users u
            JOIN shelters s ON u.id = s.user_id
            WHERE u.role = 'shelter'
            ORDER BY s.created_at DESC
        `;
        const result = await db.query(query);
        res.json({ success: true, shelters: result.rows });
    } catch (error) {
        console.error("Get All Shelters Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

exports.getAlerts = async (req, res) => {
    try {
        const welfareAlerts = await db.query(`
            SELECT wl.*, u.shelter_name, p.name as pet_name 
            FROM welfare_logs wl
            JOIN adoptions a ON wl.adoption_id = a.id
            JOIN pets p ON a.pet_id = p.id
            JOIN users u ON p.shelter_id = u.id
            WHERE wl.risk_flagged = TRUE
            ORDER BY wl.created_at DESC
        `);

        const animalReports = await db.query(`
            SELECT ar.*, 
            (
                SELECT JSON_OBJECT(
                    'name', u.shelter_name, 
                    'id', u.id, 
                    'email', u.email,
                    'distance', (6371 * acos(
                        cos(radians(ar.latitude)) * cos(radians(u.latitude)) * 
                        cos(radians(u.longitude) - radians(ar.longitude)) + 
                        sin(radians(ar.latitude)) * sin(radians(u.latitude))
                    ))
                )
                FROM users u 
                WHERE u.role = 'shelter' AND u.verification_status = 'verified' AND u.latitude IS NOT NULL
                ORDER BY (6371 * acos(
                    cos(radians(ar.latitude)) * cos(radians(u.latitude)) * 
                    cos(radians(u.longitude) - radians(ar.longitude)) + 
                    sin(radians(ar.latitude)) * sin(radians(u.latitude))
                )) ASC
                LIMIT 1
            ) as nearest_shelter
            FROM animal_reports ar
            WHERE ar.status != 'resolved' 
            ORDER BY ar.created_at DESC
        `);

        res.json({
            success: true,
            welfareAlerts: welfareAlerts.rows,
            animalReports: animalReports.rows.map(r => ({
                ...r,
                nearest_shelter: typeof r.nearest_shelter === 'string' ? JSON.parse(r.nearest_shelter) : (r.nearest_shelter || null)
            }))
        });
    } catch (error) {
        console.error("Get Alerts Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

exports.handleAnimalReport = async (req, res) => {
    try {
        const { reportId, action, shelterId } = req.body;

        let statusUpdate = 'pending';
        let message = '';

        if (action === 'dispatch') {
            statusUpdate = 'dispatching';
            message = 'Rescue team dispatched';
        } else if (action === 'notify') {
            statusUpdate = 'shelter_notified';
            message = 'Shelter notified';

            // Fetch report and shelter details
            const reportRes = await db.query("SELECT * FROM animal_reports WHERE id = ?", [reportId]);
            const shelterRes = await db.query("SELECT email, shelter_name FROM users WHERE id = ?", [shelterId]);

            const reportRows = reportRes.rows || [];
            const shelterRows = shelterRes.rows || [];

            if (reportRows.length > 0 && shelterRows.length > 0) {
                await emailService.sendRescueAlert(shelterRows[0].email, reportRows[0]);
                console.log(`Alert sent to ${shelterRows[0].shelter_name} (${shelterRows[0].email}) for report #${reportId}`);
            }
        } else if (action === 'resolve') {
            statusUpdate = 'resolved';
            message = 'Report resolved';
        }

        await db.query("UPDATE animal_reports SET status = ? WHERE id = ?", [statusUpdate, reportId]);

        res.json({ success: true, message, status: statusUpdate });
    } catch (error) {
        console.error("Handle Animal Report Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

exports.handleWelfareAlert = async (req, res) => {
    try {
        const { logId, status, responseText } = req.body;

        await db.query(
            "UPDATE welfare_logs SET status = ?, response_text = ? WHERE id = ?",
            [status, responseText || null, logId]
        );

        res.json({ success: true, message: "Welfare alert updated" });
    } catch (error) {
        console.error("Handle Welfare Alert Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

exports.getAdoptions = async (req, res) => {
    try {
        const query = `
            SELECT a.id, a.status, a.created_at, a.adoption_date,
                   u.name as adopter_name, u.email as adopter_email,
                   p.name as pet_name, p.image_url as pet_image,
                   s.shelter_name, s.email as shelter_email
            FROM adoptions a
            JOIN users u ON a.user_id = u.id
            JOIN pets p ON a.pet_id = p.id
            JOIN users s ON p.shelter_id = s.id
            ORDER BY a.created_at DESC
        `;
        const result = await db.query(query);
        res.json({ success: true, adoptions: result.rows });
    } catch (error) {
        console.error("Get Adoptions Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};
