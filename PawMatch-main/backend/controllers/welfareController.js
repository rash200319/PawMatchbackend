const db = require('../config/db');
const { checkAndAwardAchievements } = require('../services/achievementService');

exports.getDashboard = async (req, res) => {
    try {
        const { adoptionId } = req.params;
        const userId = req.user.id;

        // 1. Get Adoption & Pet Details - Verify ownership & Active Status
        const adoptionRes = await db.query(`
            SELECT a.*, p.name as pet_name, p.image_url 
            FROM adoptions a 
            JOIN pets p ON a.pet_id = p.id 
            WHERE a.id = ? AND a.user_id = ? AND a.status = 'active'
        `, [adoptionId, userId]);

        const adoptionArr = adoptionRes.rows || adoptionRes;
        if (adoptionArr.length === 0) {
            return res.status(404).json({ error: "Adoption record not found, or adoption is not yet active." });
        }

        const adoption = adoptionArr[0];

        // 2. Calculate Dates/Progress
        const today = new Date();
        const adoptionDate = new Date(adoption.adoption_date);
        const diffTime = Math.abs(today - adoptionDate);
        const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

        // Tracker lasts 90 days (3 months)
        const TRACKER_DURATION = 90;
        const isCompleted = diffDays > TRACKER_DURATION;

        // 3. Get Logs
        const logsRes = await db.query(`
            SELECT * FROM welfare_logs 
            WHERE adoption_id = ? 
            ORDER BY log_date DESC 
            LIMIT 30
        `, [adoptionId]);
        const logs = logsRes.rows || logsRes;

        // 4. Calculate Streak
        const streak = logs.filter(log => {
            const logDate = new Date(log.log_date);
            const timeDiff = Math.abs(today - logDate);
            const dayDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
            return dayDiff <= 7;
        }).length;

        // 5. 3-3-3 Logic
        let currentPhase = 1;
        if (diffDays > 3) currentPhase = 2;
        if (diffDays > 21) currentPhase = 3;

        const dashboardData = {
            petName: adoption.pet_name,
            petImage: adoption.image_url,
            adoptionDate: adoption.adoption_date,
            currentDay: diffDays,
            totalDays: TRACKER_DURATION,
            overallProgress: Math.min(100, Math.round((diffDays / TRACKER_DURATION) * 100)),
            streak: streak,
            logs: logs,
            isCompleted: isCompleted,
            phaseInfo: {
                current: currentPhase,
                phaseName: currentPhase === 1 ? "Decompression" : currentPhase === 2 ? "Learning & Routine" : "Bonding & Confidence",
                daysInPhase: currentPhase === 1 ? 3 : currentPhase === 2 ? 21 : 90,
                progressInPhase: currentPhase === 1
                    ? Math.round((diffDays / 3) * 100)
                    : currentPhase === 2
                        ? Math.round(((diffDays - 3) / 18) * 100)
                        : Math.round(((diffDays - 21) / 69) * 100)
            }
        };

        res.json(dashboardData);

    } catch (error) {
        console.error("Dashboard Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

exports.postLog = async (req, res) => {
    try {
        const { adoptionId } = req.params;
        const { checklist, mood, notes } = req.body;
        const userId = req.user.id;

        // Verify Ownership
        const adoptionRes = await db.query('SELECT user_id FROM adoptions WHERE id = ?', [adoptionId]);
        const adoption = (adoptionRes.rows || adoptionRes)[0];

        if (!adoption || adoption.user_id !== userId) {
            return res.status(403).json({ error: "Access denied" });
        }

        // Insert Log
        const [insertResult] = await db.pool.query(`
            INSERT INTO welfare_logs (adoption_id, checklist, mood, notes)
            VALUES (?, ?, ?, ?)
        `, [adoptionId, JSON.stringify(checklist), mood, notes]);

        const logId = insertResult.insertId;

        // --- ENHANCED RISK DETECTION (Welfare Sentinel) ---
        let riskReason = null;
        const noteText = (notes || "").toLowerCase();

        // 1. Immediate Red Flags in Mood/Notes
        if (mood === 'lethargic') {
            riskReason = "Immediate concern: Animal reported as lethargic.";
        } else if (noteText.includes('sick') || noteText.includes('vomit') || noteText.includes('blood') || noteText.includes('injury') || noteText.includes('hurt')) {
            riskReason = `Health concern detected in notes: "${notes.substring(0, 50)}..."`;
        }

        // 2. Critical Checklist Failures (e.g., didn't eat)
        const parsedChecklist = checklist || {};
        if (parsedChecklist.morning_feed === false && parsedChecklist.evening_feed === false) {
            riskReason = "Animal has not eaten all day.";
        }

        // 3. Pattern Detection (3 days of anxiety)
        if (!riskReason) {
            const recentLogsRes = await db.query(`
                SELECT mood FROM welfare_logs 
                WHERE adoption_id = ? 
                ORDER BY created_at DESC 
                LIMIT 3
            `, [adoptionId]);

            const logs = recentLogsRes.rows || recentLogsRes;
            const moods = logs.map(r => r.mood);
            if (moods.length === 3 && moods.every(m => m === 'anxious' || m === 'withdrawn')) {
                riskReason = "Persistent anxiety: 3 consecutive days of anxious/withdrawn behavior.";
            }
        }

        if (riskReason) {
            await db.query('UPDATE welfare_logs SET risk_flagged = TRUE, risk_reason = ? WHERE id = ?', [riskReason, logId]);
            console.log(`[WELFARE SENTINEL] Risk flagged for adoption ${adoptionId}: ${riskReason}`);
        }

        // Check and award achievements
        const newAchievements = await checkAndAwardAchievements(userId);

        res.json({
            success: true,
            message: "Log saved",
            risk_detected: !!riskReason,
            achievements: newAchievements
        });

    } catch (error) {
        console.error("Log Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

exports.getShelterAlerts = async (req, res) => {
    try {
        const shelterId = req.user.id;

        const alertsRes = await db.query(`
            SELECT 
                l.*, 
                p.name as pet_name, 
                p.id as pet_id,
                u.name as adopter_name,
                u.email as adopter_email
            FROM welfare_logs l
            JOIN adoptions a ON l.adoption_id = a.id
            JOIN pets p ON a.pet_id = p.id
            JOIN users u ON a.user_id = u.id
            WHERE p.shelter_id = ? AND l.risk_flagged = TRUE
            ORDER BY l.created_at DESC
        `, [shelterId]);

        res.json({
            success: true,
            alerts: alertsRes.rows || alertsRes
        });

    } catch (error) {
        console.error("Get Alerts Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

exports.respondToAlert = async (req, res) => {
    try {
        const { logId, responseText } = req.body;
        const shelterId = req.user.id;

        // Verify that this alert belongs to a pet from this shelter
        const checkRes = await db.query(`
            SELECT l.id 
            FROM welfare_logs l
            JOIN adoptions a ON l.adoption_id = a.id
            JOIN pets p ON a.pet_id = p.id
            WHERE l.id = ? AND p.shelter_id = ?
        `, [logId, shelterId]);

        if ((checkRes.rows || checkRes).length === 0) {
            return res.status(403).json({ error: "Unauthorized or alert not found" });
        }

        await db.query(
            "UPDATE welfare_logs SET status = 'responded', response_text = ? WHERE id = ?",
            [responseText, logId]
        );

        res.json({ success: true, message: "Response submitted successfully" });

    } catch (error) {
        console.error("Respond to Alert Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};
