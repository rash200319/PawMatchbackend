const db = require('../config/db');
const { upload } = require('../config/cloudinary');

const uploadMiddleware = upload.single('image');

exports.uploadMiddleware = (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
        if (err) {
            console.error('Multer/Cloudinary Error:', err);
            return res.status(400).json({
                error: 'Image upload failed',
                details: err.message
            });
        }
        next();
    });
};

exports.addPet = async (req, res) => {
    try {
        // Check if user is a shelter and is verified
        if (req.user?.role === 'shelter') {
            const shelterCheck = await db.query(
                'SELECT verification_status FROM shelters WHERE user_id = ?',
                [req.user.id]
            );
            
            if (shelterCheck.rows.length === 0 || shelterCheck.rows[0].verification_status !== 'verified') {
                return res.status(403).json({
                    error: 'Verification Required',
                    details: 'Your shelter must be verified before you can add pets to the system.'
                });
            }
        }

        const {
            name, type, breed, age, gender, size, energy_level,
            temperament, social_profile, living_situation_match, description, shelter_id,
            weight, is_vaccinated, is_neutered, is_microchipped, is_health_checked, is_foster
        } = req.body;

        // Check if file is uploaded
        if (!req.file) {
            return res.status(400).json({ error: 'Image file is required' });
        }

        const imageUrl = req.file.path;

        // Validate required fields
        if (!name || !type) {
            return res.status(400).json({ error: 'Name and Type are required' });
        }

        // Parse JSON fields if they are sent as strings (from FormData)
        let parsedTemperament = temperament;
        let parsedSocial = social_profile;
        let parsedLiving = living_situation_match;

        try {
            if (typeof temperament === 'string') parsedTemperament = JSON.parse(temperament);
            if (typeof social_profile === 'string') parsedSocial = JSON.parse(social_profile);
            if (typeof living_situation_match === 'string') parsedLiving = JSON.parse(living_situation_match);
        } catch (e) {
            console.error("JSON Parse Error:", e);
        }

        const temperamentStr = JSON.stringify(parsedTemperament || []);
        const socialStr = JSON.stringify(parsedSocial || {});
        const livingStr = JSON.stringify(parsedLiving || {});

        const query = `
            INSERT INTO pets (
                name, type, breed, age, gender, size, energy_level, 
                temperament, social_profile, living_situation_match, 
                image_url, description, shelter_id,
                weight, is_vaccinated, is_neutered, is_microchipped, is_health_checked, is_foster
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            name, type, breed, age, gender, size, energy_level,
            temperamentStr, socialStr, livingStr,
            imageUrl, description, req.user?.id || shelter_id || 1,
            weight,
            is_vaccinated === 'true' || is_vaccinated === true ? 1 : 0,
            is_neutered === 'true' || is_neutered === true ? 1 : 0,
            is_microchipped === 'true' || is_microchipped === true ? 1 : 0,
            is_health_checked === 'true' || is_health_checked === true ? 1 : 0,
            is_foster === 'true' || is_foster === true ? 1 : 0
        ];

        const result = await db.query(query, values);

        res.status(201).json({
            success: true,
            message: 'Pet added successfully',
            pet: {
                id: result.rows.insertId,
                name,
                image_url: imageUrl
            }
        });

    } catch (error) {
        console.error('Add Pet Error:', error);
        console.error('Request Body:', req.body);
        console.error('File details:', req.file);
        res.status(500).json({ error: 'Server Error', details: error.message, code: error.code });
    }
};

exports.getAllPets = async (req, res) => {
    try {
        const { status, is_foster } = req.query;
        // Default to available if no status specified to ensure new pets show up for users
        let query = 'SELECT p.*, s.organization_name as shelter_name FROM pets p LEFT JOIN shelters s ON p.shelter_id = s.user_id WHERE 1=1';
        const params = [];

        if (status) {
            query += ' AND p.status = ?';
            params.push(status);
        } else {
            query += ' AND p.status = "available"';
        }

        if (is_foster === 'true') {
            query += ' AND p.is_foster = 1';
        } else if (is_foster === 'false') {
            query += ' AND p.is_foster = 0';
        }

        query += ' ORDER BY created_at DESC';

        const result = await db.query(query, params);
        const petsData = result.rows || [];

        // Map for frontend consistency (image_url -> profile_image_url)
        const mappedPets = petsData.map(pet => ({
            ...pet,
            profile_image_url: pet.image_url
        }));

        res.json({ success: true, count: mappedPets.length, pets: mappedPets });
    } catch (error) {
        console.error('Get All Pets Error:', error);
        res.status(500).json({ error: 'Server Error' });
    }
};
exports.getPetById = async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`Fetching pet with ID: ${id}`);
        // Join with shelters for organization name and contact, join with users for email.
        const query = `
            SELECT p.*, 
                   sh.organization_name as shelter_name, 
                   u.email as shelter_email, 
                   sh.contact_number as shelter_phone
            FROM pets p
            LEFT JOIN shelters sh ON p.shelter_id = sh.user_id
            LEFT JOIN users u ON p.shelter_id = u.id
            WHERE p.id = ?
        `;
        const pets = await db.query(query, [id]);

        if (pets.rows.length === 0) {
            console.log(`Pet not found in DB with ID: ${id}`);
            return res.status(404).json({ error: 'Pet not found' });
        }

        const pet = pets.rows[0];

        // Robust JSON parsing
        try {
            if (typeof pet.temperament === 'string' && pet.temperament.trim()) {
                pet.temperament = JSON.parse(pet.temperament);
            }
            if (typeof pet.social_profile === 'string' && pet.social_profile.trim()) {
                pet.social_profile = JSON.parse(pet.social_profile);
            }
            if (typeof pet.living_situation_match === 'string' && pet.living_situation_match.trim()) {
                pet.living_situation_match = JSON.parse(pet.living_situation_match);
            }
        } catch (parseError) {
            console.error('JSON Parse Error for pet:', id, parseError);
            // Non-fatal error for the API, but good to know
        }

        res.json({
            success: true,
            pet: {
                ...pet,
                profile_image_url: pet.image_url
            }
        });
    } catch (error) {
        console.error('getPetById Error:', error);
        res.status(500).json({ error: 'Server Error', details: error.message });
    }
};

exports.updatePet = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, type, breed, age, gender, size, energy_level,
            temperament, social_profile, living_situation_match, description,
            weight, is_vaccinated, is_neutered, is_microchipped, is_health_checked, is_foster, status
        } = req.body;

        // Start with existing pet to handle image preservation
        const existingResult = await db.query('SELECT image_url FROM pets WHERE id = ?', [id]);
        if (existingResult.rows.length === 0) {
            return res.status(404).json({ error: 'Pet not found' });
        }

        let imageUrl = existingResult.rows[0].image_url;
        if (req.file) {
            imageUrl = req.file.path;
        }

        // Parse JSON fields
        let parsedTemperament = temperament;
        let parsedSocial = social_profile;
        let parsedLiving = living_situation_match;

        try {
            if (typeof temperament === 'string') parsedTemperament = JSON.parse(temperament);
            if (typeof social_profile === 'string') parsedSocial = JSON.parse(social_profile);
            if (typeof living_situation_match === 'string') parsedLiving = JSON.parse(living_situation_match);
        } catch (e) {
            console.error("JSON Parse Error during update:", e);
        }

        const query = `
            UPDATE pets SET 
                name = ?, type = ?, breed = ?, age = ?, gender = ?, size = ?, 
                energy_level = ?, temperament = ?, social_profile = ?, 
                living_situation_match = ?, image_url = ?, description = ?,
                weight = ?, is_vaccinated = ?, is_neutered = ?, 
                is_microchipped = ?, is_health_checked = ?, is_foster = ?, status = ?
            WHERE id = ? AND shelter_id = ?
        `;

        const values = [
            name, type, breed, age, gender, size, energy_level,
            JSON.stringify(parsedTemperament || []),
            JSON.stringify(parsedSocial || {}),
            JSON.stringify(parsedLiving || {}),
            imageUrl, description,
            weight,
            is_vaccinated === 'true' || is_vaccinated === true || is_vaccinated === 1 ? 1 : 0,
            is_neutered === 'true' || is_neutered === true || is_neutered === 1 ? 1 : 0,
            is_microchipped === 'true' || is_microchipped === true || is_microchipped === 1 ? 1 : 0,
            is_health_checked === 'true' || is_health_checked === true || is_health_checked === 1 ? 1 : 0,
            is_foster === 'true' || is_foster === true || is_foster === 1 ? 1 : 0,
            status || 'available',
            id,
            req.user.id
        ];

        await db.query(query, values);

        res.json({
            success: true,
            message: 'Pet updated successfully',
            pet: { id, name, image_url: imageUrl }
        });

    } catch (error) {
        console.error('Update Pet Error:', error);
        res.status(500).json({ error: 'Server Error', details: error.message });
    }
};
