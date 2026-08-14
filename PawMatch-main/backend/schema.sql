-- PawMatch database: schema + seed data
-- MySQL 8+
--
-- Usage:
--   mysql -u root -p < schema.sql
--   or: CREATE DATABASE pawmatch; then source this file after USE pawmatch;
--
-- Demo logins (password for all: password123)
--   admin@pawmatch.com
--   shelter@pawmatch.com
--   adopter@pawmatch.com

CREATE DATABASE IF NOT EXISTS pawmatch
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE pawmatch;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS welfare_logs;
DROP TABLE IF EXISTS shelter_messages;
DROP TABLE IF EXISTS shelter_visits;
DROP TABLE IF EXISTS foster_assignments;
DROP TABLE IF EXISTS pet_views;
DROP TABLE IF EXISTS adoptions;
DROP TABLE IF EXISTS pets;
DROP TABLE IF EXISTS animal_reports;
DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS user_achievements;
DROP TABLE IF EXISTS demo_requests;
DROP TABLE IF EXISTS pending_users;
DROP TABLE IF EXISTS adopters;
DROP TABLE IF EXISTS shelters;
DROP TABLE IF EXISTS admins;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- Auth and profiles
-- ---------------------------------------------------------------------------

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20),
    nic VARCHAR(20) UNIQUE,
    role ENUM('adopter', 'shelter', 'admin') NOT NULL DEFAULT 'adopter',
    is_verified TINYINT(1) DEFAULT 0,
    is_email_verified TINYINT(1) DEFAULT 0,
    pawsonality_results JSON,
    otp_hash VARCHAR(255),
    otp_expires_at DATETIME,
    reset_token_hash VARCHAR(255),
    reset_token_expires_at DATETIME,
    email_notifications TINYINT(1) DEFAULT 1,
    sms_alerts TINYINT(1) DEFAULT 0,
    shelter_name VARCHAR(255),
    verification_status VARCHAR(20) DEFAULT 'unverified',
    registry_type VARCHAR(50),
    registration_number VARCHAR(50),
    verification_document_url VARCHAR(500),
    shelter_code VARCHAR(20) UNIQUE,
    shelter_description TEXT,
    shelter_address TEXT,
    shelter_logo_url VARCHAR(500),
    shelter_banner_url VARCHAR(500),
    shelter_social_links JSON,
    shelter_website VARCHAR(255),
    shelter_slug VARCHAR(255) UNIQUE,
    shelter_tagline VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pending_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    phone_number VARCHAR(20),
    nic VARCHAR(20),
    role VARCHAR(20) DEFAULT 'adopter',
    shelter_name VARCHAR(255),
    is_verified TINYINT(1) DEFAULT 0,
    otp_hash VARCHAR(255),
    otp_expires_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE adopters (
    user_id INT PRIMARY KEY,
    full_name VARCHAR(255),
    phone_number VARCHAR(20),
    pawsonality_results JSON,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE shelters (
    user_id INT PRIMARY KEY,
    organization_name VARCHAR(255),
    contact_number VARCHAR(20),
    registry_type VARCHAR(50),
    registration_number VARCHAR(50) UNIQUE,
    verification_document_url TEXT,
    verification_status VARCHAR(20) DEFAULT 'unverified',
    shelter_code VARCHAR(20) UNIQUE,
    shelter_slug VARCHAR(255) UNIQUE,
    shelter_description TEXT,
    shelter_logo_url VARCHAR(500),
    shelter_banner_url VARCHAR(500),
    shelter_social_links JSON,
    shelter_website VARCHAR(255),
    shelter_tagline VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE admins (
    user_id INT PRIMARY KEY,
    full_name VARCHAR(255),
    department VARCHAR(100) DEFAULT 'General',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Pets, adoptions, fosters
-- ---------------------------------------------------------------------------

CREATE TABLE pets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    breed VARCHAR(100),
    age VARCHAR(50),
    gender VARCHAR(10),
    size VARCHAR(20),
    energy_level VARCHAR(20),
    temperament JSON,
    social_profile JSON,
    living_situation_match JSON,
    image_url VARCHAR(500),
    shelter_id INT,
    status VARCHAR(50) DEFAULT 'available',
    description TEXT,
    is_foster TINYINT(1) DEFAULT 0,
    weight VARCHAR(50),
    is_vaccinated TINYINT(1) DEFAULT 0,
    is_neutered TINYINT(1) DEFAULT 0,
    is_microchipped TINYINT(1) DEFAULT 0,
    is_health_checked TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shelter_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_pets_shelter (shelter_id),
    INDEX idx_pets_status (status)
);

CREATE TABLE adoptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    pet_id INT,
    adoption_date DATE DEFAULT (CURRENT_DATE),
    status VARCHAR(50) DEFAULT 'pending',
    is_status_read TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE SET NULL,
    INDEX idx_adoptions_user (user_id),
    INDEX idx_adoptions_pet (pet_id)
);

CREATE TABLE foster_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pet_id INT NOT NULL,
    user_id INT NOT NULL,
    shelter_id INT NOT NULL,
    status ENUM('active', 'completed', 'cancelled') DEFAULT 'active',
    outcome ENUM('adopted_by_foster', 'adopted_by_other', 'returned_to_shelter', 'deceased') DEFAULT NULL,
    start_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_date DATETIME DEFAULT NULL,
    notes TEXT,
    FOREIGN KEY (pet_id) REFERENCES pets(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (shelter_id) REFERENCES users(id)
);

CREATE TABLE pet_views (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pet_id INT NOT NULL,
    user_id INT,
    viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Shelter operations
-- ---------------------------------------------------------------------------

CREATE TABLE shelter_visits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    pet_id INT,
    shelter_id INT,
    visit_date DATE NOT NULL,
    visit_time TIME NOT NULL,
    status VARCHAR(50) DEFAULT 'scheduled',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE SET NULL,
    FOREIGN KEY (shelter_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE shelter_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    adoption_id INT,
    pet_id INT,
    shelter_id INT,
    subject VARCHAR(255),
    message TEXT,
    response TEXT,
    responded_at TIMESTAMP NULL,
    is_read TINYINT(1) DEFAULT 0,
    is_response_read TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (adoption_id) REFERENCES adoptions(id) ON DELETE SET NULL,
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE SET NULL,
    FOREIGN KEY (shelter_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Welfare, reports, achievements, demos
-- ---------------------------------------------------------------------------

CREATE TABLE welfare_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    adoption_id INT NOT NULL,
    checklist JSON,
    mood VARCHAR(50),
    notes TEXT,
    risk_flagged TINYINT(1) DEFAULT 0,
    risk_reason TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    response_text TEXT,
    log_date DATE DEFAULT (CURRENT_DATE),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (adoption_id) REFERENCES adoptions(id) ON DELETE CASCADE
);

CREATE TABLE animal_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    animal_type VARCHAR(50),
    condition_type VARCHAR(50),
    location VARCHAR(255),
    description TEXT,
    contact_name VARCHAR(100),
    contact_phone VARCHAR(50),
    status VARCHAR(20) DEFAULT 'pending',
    images JSON,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    action_type VARCHAR(100) NOT NULL,
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE user_achievements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    achievement_type VARCHAR(50) NOT NULL,
    achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    related_data JSON,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_achievement (user_id, achievement_type)
);

CREATE TABLE demo_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    shelter_name VARCHAR(255) NOT NULL,
    message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Seed data
-- Password for all seeded users: password123
-- Hash: $2b$10$vPHUNV0GCi.OeMp/EIBSqeSCxQLH3bhC01J1WWlxNRUIn7Pw1.U76
-- ---------------------------------------------------------------------------

INSERT INTO users (
    id, name, email, password_hash, phone_number, role,
    is_verified, is_email_verified, pawsonality_results,
    email_notifications, sms_alerts,
    shelter_name, verification_status, registration_number,
    shelter_code, shelter_slug, shelter_tagline,
    latitude, longitude
) VALUES
(
    1, 'Super Admin', 'admin@pawmatch.com',
    '$2b$10$vPHUNV0GCi.OeMp/EIBSqeSCxQLH3bhC01J1WWlxNRUIn7Pw1.U76',
    '+94 11 000 0000', 'admin', 1, 1, NULL, 1, 0,
    NULL, 'unverified', NULL, NULL, NULL, NULL, NULL, NULL
),
(
    2, 'Happy Tails Shelter', 'shelter@pawmatch.com',
    '$2b$10$vPHUNV0GCi.OeMp/EIBSqeSCxQLH3bhC01J1WWlxNRUIn7Pw1.U76',
    '+94 11 234 5678', 'shelter', 1, 1, NULL, 1, 0,
    'Happy Tails Shelter', 'verified', 'REG-HT-001',
    'HTS001', 'happy-tails', 'Every tail deserves a happy ending',
    6.92710000, 79.86120000
),
(
    3, 'Jane Adopter', 'adopter@pawmatch.com',
    '$2b$10$vPHUNV0GCi.OeMp/EIBSqeSCxQLH3bhC01J1WWlxNRUIn7Pw1.U76',
    '+94 77 123 4567', 'adopter', 1, 1,
    '{"1":"apartment","2":"moderate","3":"limited","4":"couple","5":"first","6":"none","7":"suburban"}',
    1, 0,
    NULL, 'unverified', NULL, NULL, NULL, NULL, NULL, NULL
);

INSERT INTO admins (user_id, full_name, department) VALUES
(1, 'Super Admin', 'Executive');

INSERT INTO shelters (
    user_id, organization_name, contact_number, registry_type, registration_number,
    verification_status, shelter_code, shelter_slug, shelter_tagline,
    shelter_description, latitude, longitude
) VALUES
(
    2, 'Happy Tails Shelter', '+94 11 234 5678', 'NGO_Secretariat', 'REG-HT-001',
    'verified', 'HTS001', 'happy-tails', 'Every tail deserves a happy ending',
    'A Colombo-based rescue focused on matching pets with compatible homes.',
    6.92710000, 79.86120000
);

INSERT INTO adopters (user_id, full_name, phone_number, pawsonality_results) VALUES
(
    3, 'Jane Adopter', '+94 77 123 4567',
    '{"1":"apartment","2":"moderate","3":"limited","4":"couple","5":"first","6":"none","7":"suburban"}'
);

INSERT INTO pets (
    id, name, type, breed, age, gender, size, energy_level,
    temperament, social_profile, living_situation_match, image_url,
    shelter_id, status, description, is_foster,
    is_vaccinated, is_neutered, is_microchipped, is_health_checked
) VALUES
(
    1, 'Buddy', 'Dog', 'Golden Retriever', '2 years', 'Male', 'Large', 'active',
    '["Friendly", "Playful", "Patient"]',
    '{"cats": true, "dogs": true, "kids": true}',
    '{"apartment": false, "house_large": true, "rural": true}',
    'https://images.unsplash.com/photo-1552053831-71594a27632d?q=80&w=1000',
    2, 'available',
    'Buddy is a happy-go-lucky retriever who loves swimming and belly rubs.',
    0, 1, 1, 1, 1
),
(
    2, 'Mittens', 'Cat', 'Tabby', '1 year', 'Female', 'Small', 'low',
    '["Quiet", "Independent", "Affectionate"]',
    '{"cats": true, "dogs": false, "kids": true}',
    '{"apartment": true, "house_large": true, "rural": false}',
    'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=1000',
    2, 'available',
    'Mittens is a gentle soul looking for a quiet sunny spot to nap.',
    0, 1, 1, 0, 1
),
(
    3, 'Rex', 'Dog', 'German Shepherd Mix', '3 years', 'Male', 'Large', 'athletic',
    '["Loyal", "Protective", "Smart"]',
    '{"cats": false, "dogs": true, "kids": false}',
    '{"apartment": false, "house_large": true, "rural": true}',
    'https://images.unsplash.com/photo-1589941013453-ec89f33b5e95?q=80&w=1000',
    2, 'available',
    'Rex is a smart, protective dog who needs an experienced hand.',
    1, 1, 1, 1, 1
);

INSERT INTO adoptions (id, user_id, pet_id, status, is_status_read) VALUES
(1, 3, 1, 'active', 1);

INSERT INTO foster_assignments (pet_id, user_id, shelter_id, status, notes) VALUES
(3, 3, 2, 'active', 'Rex is in a trial foster with Jane.');

INSERT INTO pet_views (pet_id, user_id) VALUES
(1, 3),
(2, 3),
(3, 3);

INSERT INTO shelter_messages (
    user_id, adoption_id, shelter_id, pet_id, subject, message, response,
    is_read, is_response_read, responded_at
) VALUES
(
    3, 1, 2, 1, 'Follow up',
    'Hi, Buddy is settling in well! Any specific food brands he likes?',
    'Great to hear! He loves any salmon-based kibble.',
    1, 1, CURRENT_TIMESTAMP
);

INSERT INTO shelter_visits (user_id, pet_id, shelter_id, visit_date, visit_time, status, notes) VALUES
(3, 2, 2, CURDATE() + INTERVAL 2 DAY, '10:30:00', 'scheduled', 'Jane wants to meet Mittens.');

INSERT INTO welfare_logs (adoption_id, mood, notes, risk_flagged, status, log_date) VALUES
(1, 'Happy', 'Eating well and playing in the garden.', 0, 'approved', CURRENT_DATE);

INSERT INTO activity_logs (user_id, action_type, details) VALUES
(3, 'ADOPTION_APPLICATION', '{"petId": 1, "adoptionId": 1}'),
(2, 'PET_ADDED', '{"petId": 1, "name": "Buddy"}');

INSERT INTO animal_reports (
    animal_type, condition_type, location, description,
    contact_name, contact_phone, status, latitude, longitude
) VALUES
(
    'Dog', 'Injured', 'Main St Junction',
    'Found a dog with an injured paw.',
    'Anonymous', '00000000', 'pending',
    6.92710000, 79.86120000
);

INSERT INTO user_achievements (user_id, achievement_type, related_data) VALUES
(3, 'first_adoption', '{"adoptionId": 1, "petId": 1}');

INSERT INTO demo_requests (name, email, shelter_name, message) VALUES
('Priya Fernando', 'priya@example.com', 'Island Paws Rescue', 'We would like a walkthrough of the matching tools.');
