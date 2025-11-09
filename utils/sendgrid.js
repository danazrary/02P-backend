// sendgrid.js
import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY); // Set your SendGrid API key here

export default sgMail;
