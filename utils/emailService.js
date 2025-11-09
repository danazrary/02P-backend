// emailService.js
import sgMail from "./sendgrid.js"; // Import the configured SendGrid

export async function sendVerificationEmail(to, verificationCode) {
  const msg = {
    to, // recipient email address
    from: "danazrary49@gmail.com", // your SendGrid verified sender email address
    subject: "Your Verification Code",
    text: `Your verification code is ${verificationCode}`,
    html: `<p>Your verification code is <strong>${verificationCode}</strong></p>`,
  };

  try {
    await sgMail.send(msg);

  } catch (error) {
    console.error("Error sending email:", error);
  }
}
