const sgMail = require('@sendgrid/mail');
require('dotenv').config();

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const isSendGridConfigured = process.env.SENDGRID_API_KEY;

exports.sendOTP = async (email, otp) => {
    console.log(`\n==================================================`);
    console.log(`🔐 OTP for ${email}: ${otp}`);
    console.log(`==================================================\n`);

    if (!isSendGridConfigured) {
        console.log("ℹ️ SendGrid not configured. OTP logged to console only.");
        return true;
    }

    try {
        const msg = {
            to: email,
            from: {
                email: process.env.SENDGRID_FROM_EMAIL || 'noreply@pawmatch.lk',
                name: process.env.SENDGRID_FROM_NAME || 'PawMatch'
            },
            subject: "Verify Your Account - PawMatch",
            text: `Your verification code is: ${otp}. It expires in 10 minutes.`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h2 style="color: #4F46E5; margin: 0;">Verify Your Account</h2>
                    </div>
                    <p style="font-size: 16px; line-height: 1.5;">Thank you for signing up with PawMatch!</p>
                    <p style="font-size: 16px; line-height: 1.5;">Please use the following 6-digit code to complete your registration:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <h1 style="letter-spacing: 8px; background: #f3f4f6; padding: 20px 30px; display: inline-block; border-radius: 8px; font-size: 24px; margin: 0; color: #1f2937;">${otp}</h1>
                    </div>
                    <p style="font-size: 16px; line-height: 1.5;"><strong>This code is valid for 10 minutes.</strong></p>
                    <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">If you didn't request this, please ignore this email.</p>
                </div>
            `,
        };

        await sgMail.send(msg);
        console.log("✅ OTP email sent successfully via SendGrid");
        return true;
    } catch (error) {
        console.error("❌ Error sending OTP email via SendGrid:", error.message);
        if (error.response) {
            console.error("SendGrid Response:", error.response.body);
        }
        return false;
    }
};

exports.sendPasswordReset = async (email, resetAppUrl) => {
    console.log(`\n==================================================`);
    console.log(`🔑 Reset Link for ${email}: ${resetAppUrl}`);
    console.log(`==================================================\n`);

    if (!isSendGridConfigured) {
        console.log("ℹ️ SendGrid not configured. Reset link logged to console only.");
        return true;
    }

    try {
        const msg = {
            to: email,
            from: {
                email: process.env.SENDGRID_FROM_EMAIL || 'noreply@pawmatch.lk',
                name: process.env.SENDGRID_FROM_NAME || 'PawMatch'
            },
            subject: "Reset Your Password - PawMatch",
            text: `You requested a password reset. Please use the following link: ${resetAppUrl}`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h2 style="color: #4F46E5; margin: 0;">Reset Your Password</h2>
                    </div>
                    <p style="font-size: 16px; line-height: 1.5;">You requested a password reset for your PawMatch account.</p>
                    <p style="font-size: 16px; line-height: 1.5;">Click the button below to reset it:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetAppUrl}" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; font-weight: bold;">Reset Password</a>
                    </div>
                    <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">If you didn't request this, please ignore this email.</p>
                    <p style="font-size: 12px; color: #9ca3af;">If the button doesn't work, copy and paste this link into your browser: ${resetAppUrl}</p>
                </div>
            `,
        };

        await sgMail.send(msg);
        console.log("✅ Password reset email sent successfully via SendGrid");
        return true;
    } catch (error) {
        console.error("❌ Error sending password reset email via SendGrid:", error.message);
        if (error.response) {
            console.error("SendGrid Response:", error.response.body);
        }
        return false;
    }
};

exports.sendRescueAlert = async (shelterEmail, reportDetails) => {
    console.log(`\n==================================================`);
    console.log(`🚑 RESCUE ALERT for ${shelterEmail}`);
    console.log(`Animal: ${reportDetails.animal_type}`);
    console.log(`Location: ${reportDetails.location}`);
    console.log(`==================================================\n`);

    if (!isSendGridConfigured) {
        console.log("ℹ️ SendGrid not configured. Rescue alert logged to console only.");
        return true;
    }

    try {
        const msg = {
            to: shelterEmail,
            from: {
                email: process.env.SENDGRID_FROM_EMAIL || 'noreply@pawmatch.lk',
                name: process.env.SENDGRID_FROM_NAME || 'PawMatch Admin'
            },
            subject: `🚨 EMERGENCY: ${reportDetails.animal_type} Rescue Required`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 2px solid #ef4444; border-radius: 10px; max-width: 600px; margin: 0 auto;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h2 style="color: #ef4444; margin: 0;">🚨 Emergency Rescue Request</h2>
                    </div>
                    <p style="font-size: 16px; line-height: 1.5;">An animal in distress has been reported near your area.</p>
                    <div style="background: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
                        <h3 style="margin: 0 0 15px 0; color: #991b1b;">Report Details:</h3>
                        <p style="margin: 8px 0;"><strong>Animal Type:</strong> ${reportDetails.animal_type}</p>
                        <p style="margin: 8px 0;"><strong>Condition:</strong> ${reportDetails.condition_type}</p>
                        <p style="margin: 8px 0;"><strong>Location:</strong> ${reportDetails.location}</p>
                        <p style="margin: 8px 0;"><strong>Description:</strong> ${reportDetails.description || 'No description provided'}</p>
                    </div>
                    <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
                        <p style="margin: 0;"><strong>Reporter:</strong> ${reportDetails.contact_name} (${reportDetails.contact_phone})</p>
                    </div>
                    <p style="font-size: 14px; color: #6b7280; margin-top: 20px; text-align: center;"><strong>Please take action immediately if you can assist.</strong></p>
                </div>
            `,
        };

        await sgMail.send(msg);
        console.log("✅ Rescue alert email sent successfully via SendGrid");
        return true;
    } catch (error) {
        console.error("❌ Error sending rescue alert via SendGrid:", error.message);
        if (error.response) {
            console.error("SendGrid Response:", error.response.body);
        }
        return false;
    }
};
